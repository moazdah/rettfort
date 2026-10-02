// Bokføring mot databasen. Alt som lager posteringer går gjennom bokfor().

import type { Sporring, Db } from '../db';
import { validerBilag, reverser, RegnskapsFeil, type Postering } from '../hovedbok';
import type { PostRad } from '../rapporter';

export interface BilagInfo {
  dato: string;
  type: string;
  beskrivelse?: string;
  kilde?: string;
  kontaktId?: string | null;
  korrigererId?: string | null;
  brukerId?: string | null;
}

export async function laastTil(t: Sporring, orgId: string): Promise<string | null> {
  const r = await t.en<{ d: string | null }>('select max(til_dato)::text as d from periode_laas where organisasjon_id = $1', [orgId]);
  return r?.d ?? null;
}

/** Fører et bilag. Må kalles inne i en transaksjon. Returnerer bilagets id og nummer. */
export async function bokfor(t: Sporring, orgId: string, info: BilagInfo, posteringer: Postering[]): Promise<{ id: string; nr: number }> {
  validerBilag(posteringer);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(info.dato)) throw new RegnskapsFeil('Ugyldig dato.');
  const laast = await laastTil(t, orgId);
  if (laast && info.dato <= laast) {
    const [y, m, d] = laast.split('-');
    throw new RegnskapsFeil(`Perioden til og med ${d}.${m}.${y} er låst. Før rettelsen i en åpen periode.`);
  }
  const nr = await t.en<{ nr: number }>('update organisasjon set neste_bilagsnr = neste_bilagsnr + 1 where id = $1 returning neste_bilagsnr - 1 as nr', [orgId]);
  if (!nr) throw new RegnskapsFeil('Fant ikke foretaket.');
  const b = await t.en<{ id: string }>(
    'insert into bilag (organisasjon_id, nr, dato, type, beskrivelse, kilde, kontakt_id, korrigerer_id, opprettet_av) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id',
    [orgId, nr.nr, info.dato, info.type, info.beskrivelse ?? null, info.kilde ?? null, info.kontaktId ?? null, info.korrigererId ?? null, info.brukerId ?? null],
  );
  let linje = 0;
  for (const p of posteringer) {
    linje++;
    await t.q(
      'insert into postering (bilag_id, organisasjon_id, linje, dato, konto, debet, kredit, mva_kode, mva_grunnlag, kontakt_id, beskrivelse) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
      [b!.id, orgId, linje, info.dato, p.konto, p.debet, p.kredit, p.mvaKode ?? null, p.mvaGrunnlag ?? null, p.kontaktId ?? null, p.beskrivelse ?? info.beskrivelse ?? null],
    );
  }
  await t.q('insert into logg (organisasjon_id, bruker_id, handling, ref) values ($1,$2,$3,$4)', [orgId, info.brukerId ?? null, `Bilag ${nr.nr} ført (${info.type})`, b!.id]);
  return { id: b!.id, nr: nr.nr };
}

export async function hentBilagPosteringer(t: Sporring, orgId: string, bilagId: string): Promise<Postering[]> {
  const r = await t.q<{ konto: number; debet: number; kredit: number; mva_kode: string | null; mva_grunnlag: number | null; kontakt_id: string | null; beskrivelse: string | null }>(
    'select konto, debet, kredit, mva_kode, mva_grunnlag, kontakt_id, beskrivelse from postering where organisasjon_id = $1 and bilag_id = $2 order by linje', [orgId, bilagId]);
  return r.map(x => ({ konto: x.konto, debet: x.debet, kredit: x.kredit, mvaKode: x.mva_kode ?? undefined, mvaGrunnlag: x.mva_grunnlag ?? undefined, kontaktId: x.kontakt_id, beskrivelse: x.beskrivelse ?? undefined }));
}

/** Korrigerer et bilag med motpostering (det opprinnelige bilaget står urørt). Dato må være i åpen periode. */
export async function korriger(t: Sporring, orgId: string, bilagId: string, dato: string, brukerId?: string | null, grunn = 'Korrigering'): Promise<{ id: string; nr: number }> {
  const orig = await t.en<{ nr: number; type: string; kontakt_id: string | null }>('select nr, type, kontakt_id from bilag where id = $1 and organisasjon_id = $2', [bilagId, orgId]);
  if (!orig) throw new RegnskapsFeil('Fant ikke bilaget.');
  const finnes = await t.en('select 1 from bilag where korrigerer_id = $1 and type = $2', [bilagId, 'korrigering']);
  if (finnes) throw new RegnskapsFeil(`Bilag ${orig.nr} er allerede korrigert.`);
  const p = await hentBilagPosteringer(t, orgId, bilagId);
  const r = await bokfor(t, orgId, { dato, type: 'korrigering', beskrivelse: `${grunn} av bilag ${orig.nr}`, korrigererId: bilagId, kontaktId: orig.kontakt_id, brukerId }, reverser(p));
  // Bankbevegelser som var koblet til det korrigerte bilaget må kobles på nytt (til det nye bilaget).
  await t.q(`update bankbevegelse set status = 'apen', bilag_id = null, match_type = null, match_id = null where organisasjon_id = $1 and bilag_id = $2`, [orgId, bilagId]);
  return r;
}

export async function hentPosteringer(db: Sporring, orgId: string, fra?: string, til?: string): Promise<PostRad[]> {
  const where = ['p.organisasjon_id = $1'];
  const params: unknown[] = [orgId];
  if (fra) { params.push(fra); where.push(`p.dato >= $${params.length}`); }
  if (til) { params.push(til); where.push(`p.dato <= $${params.length}`); }
  const r = await db.q<{ dato: string; konto: number; debet: number; kredit: number; mva_kode: string | null; mva_grunnlag: number | null; kontakt_id: string | null; bilag_id: string; nr: number; beskrivelse: string | null }>(
    `select p.dato::text as dato, p.konto, p.debet, p.kredit, p.mva_kode, p.mva_grunnlag, p.kontakt_id, p.bilag_id, b.nr, p.beskrivelse from postering p join bilag b on b.id = p.bilag_id where ${where.join(' and ')} order by p.dato, b.nr, p.linje`, params);
  return r.map(x => ({ dato: x.dato, konto: x.konto, debet: x.debet, kredit: x.kredit, mvaKode: x.mva_kode, mvaGrunnlag: x.mva_grunnlag, kontaktId: x.kontakt_id, bilagId: x.bilag_id, bilagNr: x.nr, beskrivelse: x.beskrivelse }));
}

export async function laasPeriode(t: Sporring, orgId: string, tilDato: string, grunn: string, brukerId?: string | null): Promise<void> {
  const laast = await laastTil(t, orgId);
  if (laast && tilDato <= laast) return;
  await t.q('insert into periode_laas (organisasjon_id, til_dato, grunn, laast_av) values ($1,$2,$3,$4)', [orgId, tilDato, grunn, brukerId ?? null]);
  await t.q('insert into logg (organisasjon_id, bruker_id, handling) values ($1,$2,$3)', [orgId, brukerId ?? null, `Regnskapet er låst til og med ${tilDato}: ${grunn}`]);
}

export type { Db };
