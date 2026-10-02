// Brukerens egne data: last ned alt vi har om deg, og slett kontoen.
// Regnskapet tilhører foretaket og må oppbevares i 5 år (bokføringsloven § 13), så det slettes ikke sammen med kontoen.

import type { Db, Sporring } from '../db';
import { RegnskapsFeil } from '../hovedbok';
import { randomBytes } from 'node:crypto';
import { hashPassord, passordFeil, tokenHash } from '../auth';

/** Alt vi har lagret om brukeren som person, som JSON. Regnskapet lastes ned som SAF-T for hvert foretak. */
export async function mineData(db: Db, brukerId: string) {
  const bruker = await db.en<Record<string, unknown>>(`select id, epost, navn, epost_bekreftet, opprettet::text as opprettet, totp_hemmelig is not null as totrinn from bruker where id = $1`, [brukerId]);
  if (!bruker) throw new RegnskapsFeil('Fant ikke brukeren.');
  const tilganger = await db.q(`select o.navn as foretak, o.orgnr, o.type, m.rolle, m.opprettet::text as siden from medlemskap m join organisasjon o on o.id = m.organisasjon_id where m.bruker_id = $1 order by m.opprettet`, [brukerId]);
  const innlogginger = await db.q(`select opprettet::text as opprettet, utloper::text as utloper from sesjon where bruker_id = $1 order by opprettet desc`, [brukerId]).catch(() => []);
  const samtaler = await db.q(`select s.tittel, o.navn as foretak, s.opprettet::text as opprettet, s.oppdatert::text as oppdatert, s.meldinger from ai_samtale s join organisasjon o on o.id = s.organisasjon_id where s.bruker_id = $1 order by s.opprettet`, [brukerId]);
  const handlinger = await db.q(`select l.handling, l.ref, l.tid::text as tid, o.navn as foretak from logg l left join organisasjon o on o.id = l.organisasjon_id where l.bruker_id = $1 order by l.tid desc limit 5000`, [brukerId]).catch(() => []);
  return {
    laget: new Date().toISOString(),
    forklaring: 'Dette er personopplysningene Rettført har lagret om deg. Regnskapet til foretakene du har tilgang til, lastes ned som SAF-T under Rapporter.',
    bruker, tilganger, innlogginger, samtaler_med_assistenten: samtaler, handlinger_du_har_gjort: handlinger,
  };
}

export interface SlettPlan { kanSlette: boolean; hindring: string | null; foretakAlene: { id: string; navn: string }[] }

/** Hva skjer om brukeren sletter kontoen? Eier man et foretak sammen med andre, må eierskapet gis videre først. */
export async function slettPlan(t: Sporring, brukerId: string): Promise<SlettPlan> {
  const rader = await t.q<{ id: string; navn: string; rolle: string; andre: number; andre_eiere: number }>(
    `select o.id, o.navn, m.rolle,
       (select count(*)::int from medlemskap x where x.organisasjon_id = o.id and x.bruker_id <> $1) as andre,
       (select count(*)::int from medlemskap x where x.organisasjon_id = o.id and x.bruker_id <> $1 and x.rolle = 'eier') as andre_eiere
     from medlemskap m join organisasjon o on o.id = m.organisasjon_id where m.bruker_id = $1`, [brukerId]);
  const lasende = rader.filter(r => r.rolle === 'eier' && Number(r.andre) > 0 && Number(r.andre_eiere) === 0);
  return {
    kanSlette: lasende.length === 0,
    hindring: lasende.length ? `Du er eneste eier av ${lasende.map(r => r.navn).join(', ')}, og andre har tilgang. Gi en av dem rollen Eier under Brukere først, eller fjern dem.` : null,
    foretakAlene: rader.filter(r => Number(r.andre) === 0).map(r => ({ id: r.id, navn: r.navn })),
  };
}

/**
 * Sletter kontoen: navn, e-post, passord, innlogginger, samtaler og tilganger fjernes.
 * Brukerraden blir stående som «Slettet bruker», så historikken i regnskapet (hvem som førte hva) fortsatt henger sammen.
 * Foretak der brukeren var alene, låses og merkes for sletting når oppbevaringsplikten er ute.
 */
export async function slettKonto(t: Sporring, brukerId: string, idag: string): Promise<{ foretak: string[] }> {
  const plan = await slettPlan(t, brukerId);
  if (!plan.kanSlette) throw new RegnskapsFeil(plan.hindring!);
  const slettesEtter = `${Number(idag.slice(0, 4)) + 6}-01-01`;
  for (const f of plan.foretakAlene) await t.q('update organisasjon set slettes_etter = $2 where id = $1', [f.id, slettesEtter]);
  await t.q('delete from ai_samtale where bruker_id = $1', [brukerId]);
  await t.q('delete from sesjon where bruker_id = $1', [brukerId]);
  await t.q('delete from medlemskap where bruker_id = $1', [brukerId]);
  await t.q(`update bruker set epost = 'slettet-' || id || '@slettet.invalid', navn = 'Slettet bruker', passord_hash = '!', bekreftkode = null, epost_bekreftet = false,
    totp_hemmelig = null, totp_ny = null, slettet = now() where id = $1`, [brukerId]);
  return { foretak: plan.foretakAlene.map(f => f.navn) };
}

// ---------- Glemt passord ----------
// Lenken sendes på e-post, gjelder i én time og kan bare brukes én gang. Bare hashen av tokenet lagres.

const LENKE_MINUTTER = 60;
const MAKS_LENKER_PER_TIME = 3;

/** Lager en lenke for å sette nytt passord. Gir null hvis e-posten ikke finnes, eller hvis det er bedt om for mange lenker. */
export async function bestillNyttPassord(t: Sporring, epost: string): Promise<{ token: string; navn: string } | null> {
  const b = await t.en<{ id: string; navn: string }>('select id, navn from bruker where epost = $1 and slettet is null', [epost.trim().toLowerCase()]);
  if (!b) return null;
  const n = await t.en<{ n: number }>(`select count(*)::int as n from passord_lenke where bruker_id = $1 and opprettet > now() - interval '1 hour'`, [b.id]);
  if ((n?.n ?? 0) >= MAKS_LENKER_PER_TIME) return null;
  const token = randomBytes(32).toString('base64url');
  await t.q(`insert into passord_lenke (token_hash, bruker_id, utloper) values ($1, $2, now() + interval '${LENKE_MINUTTER} minutes')`, [tokenHash(token), b.id]);
  return { token, navn: b.navn.split(' ')[0] || b.navn };
}

/** E-posten lenken gjelder, eller null hvis lenken er ugyldig, brukt eller utløpt. */
export async function lesPassordLenke(t: Sporring, token: string): Promise<{ epost: string } | null> {
  return t.en<{ epost: string }>('select b.epost from passord_lenke l join bruker b on b.id = l.bruker_id where l.token_hash = $1 and l.utloper > now() and b.slettet is null', [tokenHash(token)]);
}

/** Setter nytt passord, bruker opp lenken og logger ut overalt. E-posten regnes som bekreftet, siden lenken kom dit. */
export async function settNyttPassord(t: Sporring, token: string, passord: string): Promise<{ brukerId: string }> {
  const pf = passordFeil(passord); if (pf) throw new RegnskapsFeil(pf);
  const l = await t.en<{ bruker_id: string }>('delete from passord_lenke where token_hash = $1 and utloper > now() returning bruker_id', [tokenHash(token)]);
  if (!l) throw new RegnskapsFeil('Lenken er brukt eller utløpt. Be om en ny lenke.');
  await t.q('update bruker set passord_hash = $2, epost_bekreftet = true, bekreftkode = null, totp_feil = 0, totp_sperret_til = null where id = $1', [l.bruker_id, await hashPassord(passord)]);
  await t.q('delete from passord_lenke where bruker_id = $1', [l.bruker_id]);
  await t.q('delete from sesjon where bruker_id = $1', [l.bruker_id]);
  return { brukerId: l.bruker_id };
}
