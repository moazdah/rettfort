// Kjøp (penger ut): registrering med kontroll før bokføring.

import type { Sporring } from '../db';
import { byggKjop, byggBetalingLeverandor, RegnskapsFeil, type BetaltMed, type KjopLinje } from '../hovedbok';
import { bokfor } from './bokforing';
import { sjekkMvaMotTotal } from '../mva';
import { konto as finnKonto } from '../kontoplan';
import { kr } from '../penger';
import { hentOrg } from './faktura';

export interface KjopInput {
  id?: string;
  leverandorNavn: string;
  leverandorOrgnr?: string | null;
  kontaktId?: string | null;
  dato: string;
  forfall?: string | null;
  tekst?: string | null;
  /** Beløp med MVA. */
  total: number;
  /** MVA-beløp slik det står på kvitteringen. */
  mva: number;
  sats: number;
  konto: number;
  /** Deling på flere typer kjøp. Summen må bli totalen. */
  deler?: { konto: number; brutto: number; sats: number }[];
  betaltMed: BetaltMed;
  /** False når leverandøren ikke er i MVA-registeret eller brukeren har satt MVA til 0. */
  fradrag?: boolean;
  vedleggId?: string | null;
  viderefakturerKontaktId?: string | null;
  kilde?: string;
  /** Tallene ble lest automatisk fra kvitteringen eller fakturaen. */
  lestAutomatisk?: boolean;
  /** Brukeren har krysset av for at tallene er sjekket mot kvitteringen. */
  bekreftetAvBruker?: boolean;
}

export interface Funn { kode: string; alvor: 'hoy' | 'middels' | 'info'; tekst: string; handling?: string }

/** Kontrollen som kjøres før registrering (og live mens brukeren skriver). */
export function kontrollerKjop(k: KjopInput, ctx: { mvaRegistrertLeverandor?: boolean | null; finnesLeverandor?: boolean; duplikat?: { nr: number; dato: string } | null; orgMvaRegistrert: boolean }): Funn[] {
  const f: Funn[] = [];
  if (!k.leverandorNavn.trim()) f.push({ kode: 'leverandor', alvor: 'hoy', tekst: 'Skriv hvem du har kjøpt fra.' });
  if (!(k.total > 0)) f.push({ kode: 'total', alvor: 'hoy', tekst: 'Skriv beløpet med MVA.' });
  if (k.deler?.length) {
    const s = k.deler.reduce((a, d) => a + d.brutto, 0);
    if (s !== k.total) f.push({ kode: 'deling', alvor: 'hoy', tekst: `${kr(k.total - s)} kr gjenstår å fordele.` });
  } else if (ctx.orgMvaRegistrert && k.total > 0 && k.fradrag !== false && k.sats > 0) {
    const s = sjekkMvaMotTotal(k.total, k.mva, k.sats);
    if (!s.ok) f.push({ kode: 'mva_sum', alvor: 'middels', tekst: `MVA ${kr(k.mva)} kr passer ikke med ${k.sats} % av ${kr(k.total)} kr. Det skulle vært ${kr(s.forventet)} kr.`, handling: 'Bruk riktig MVA' });
  }
  const def = finnKonto(k.konto);
  if (def?.ikkeFradrag && k.mva > 0 && ctx.orgMvaRegistrert) f.push({ kode: 'ikke_fradrag', alvor: 'info', tekst: `${def.navn} gir ikke fradrag for MVA. Hele beløpet føres som kostnad.` });
  if (ctx.mvaRegistrertLeverandor === false && k.mva > 0 && k.fradrag !== false) f.push({ kode: 'ikke_mva_reg', alvor: 'hoy', tekst: `Fant ikke ${k.leverandorNavn} i MVA-registeret. Du får ikke fradrag for MVA de har tatt.`, handling: 'Sett MVA til 0' });
  if (ctx.duplikat) f.push({ kode: 'duplikat', alvor: 'hoy', tekst: `Et kjøp fra ${k.leverandorNavn} på ${kr(k.total)} kr er allerede ført ${ctx.duplikat.dato.split('-').reverse().join('.')} (bilag ${ctx.duplikat.nr}).` });
  if (ctx.finnesLeverandor === false && k.leverandorNavn.trim()) f.push({ kode: 'ny_leverandor', alvor: 'info', tekst: `${k.leverandorNavn} er ny leverandør.`, handling: 'Legg til' });
  if (!k.vedleggId && k.kilde !== 'uten_kvittering') f.push({ kode: 'kvittering', alvor: 'info', tekst: 'Kvitteringen er ikke lagt ved. Du kan legge den ved senere.' });
  return f;
}

export async function finnDuplikat(t: Sporring, orgId: string, navn: string, total: number, dato: string, unntak?: string): Promise<{ nr: number; dato: string } | null> {
  return t.en<{ nr: number; dato: string }>(
    `select b.nr, k.dato::text as dato from kjop k join bilag b on b.id = k.bilag_id
     where k.organisasjon_id = $1 and lower(k.leverandor_navn) = lower($2) and k.total = $3 and k.dato = $4 and k.status <> 'utkast' ${unntak ? 'and k.id <> $5' : ''} limit 1`,
    unntak ? [orgId, navn.trim(), total, dato, unntak] : [orgId, navn.trim(), total, dato]);
}

export async function finnEllerLagKontakt(t: Sporring, orgId: string, type: 'kunde' | 'leverandor', navn: string, orgnr?: string | null, ekstra: { adresse?: string; postnr?: string; poststed?: string; epost?: string; mvaRegistrert?: boolean | null } = {}): Promise<string> {
  const o = orgnr?.replace(/\s/g, '') || null;
  const e = o
    ? await t.en<{ id: string; type: string }>('select id, type from kontakt where organisasjon_id = $1 and orgnr = $2', [orgId, o])
    : await t.en<{ id: string; type: string }>('select id, type from kontakt where organisasjon_id = $1 and lower(navn) = lower($2) and orgnr is null', [orgId, navn.trim()]);
  if (e) {
    if (e.type !== type && e.type !== 'begge') await t.q(`update kontakt set type = 'begge' where id = $1`, [e.id]);
    return e.id;
  }
  const r = await t.en<{ id: string }>('insert into kontakt (organisasjon_id, type, navn, orgnr, adresse, postnr, poststed, epost, mva_registrert) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id',
    [orgId, type, navn.trim(), o, ekstra.adresse ?? null, ekstra.postnr ?? null, ekstra.poststed ?? null, ekstra.epost ?? null, ekstra.mvaRegistrert ?? null]);
  return r!.id;
}

export function kjopLinjer(k: KjopInput): KjopLinje[] {
  if (k.deler?.length) return k.deler.map(d => ({ konto: d.konto, brutto: d.brutto, sats: d.sats, fradrag: k.fradrag }));
  return [{ konto: k.konto, brutto: k.total, sats: k.sats, fradrag: k.fradrag }];
}

/** Lagrer utkast (uten bokføring). */
export async function lagreKjopUtkast(t: Sporring, orgId: string, k: KjopInput): Promise<string> {
  const felt = [k.leverandorNavn, k.leverandorOrgnr ?? null, k.dato || null, k.forfall ?? null, k.tekst ?? null, k.total, k.mva, k.sats, k.konto, k.deler ? JSON.stringify(k.deler) : null, k.betaltMed, k.vedleggId ?? null, k.kilde ?? null];
  if (k.id) {
    await t.q(`update kjop set leverandor_navn=$3, leverandor_orgnr=$4, dato=$5, forfall=$6, tekst=$7, total=$8, mva=$9, sats=$10, konto=$11, linjer=$12, betalt_med=$13, vedlegg_id=$14, kilde=$15 where id=$1 and organisasjon_id=$2 and status='utkast'`, [k.id, orgId, ...felt]);
    return k.id;
  }
  const r = await t.en<{ id: string }>(`insert into kjop (organisasjon_id, leverandor_navn, leverandor_orgnr, dato, forfall, tekst, total, mva, sats, konto, linjer, betalt_med, vedlegg_id, kilde) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id`, [orgId, ...felt]);
  return r!.id;
}

/** Registrerer kjøpet: fører i regnskapet. */
export async function registrerKjop(t: Sporring, orgId: string, k: KjopInput, brukerId?: string | null): Promise<{ id: string; bilagNr: number }> {
  const org = await hentOrg(t, orgId);
  if (!k.leverandorNavn.trim()) throw new RegnskapsFeil('Skriv hvem du har kjøpt fra.');
  if (!(k.total > 0)) throw new RegnskapsFeil('Skriv beløpet med MVA.');
  if (!k.dato) throw new RegnskapsFeil('Dato mangler.');
  if ((k.lestAutomatisk || k.kilde === 'kvittering') && !k.bekreftetAvBruker) throw new RegnskapsFeil('Sjekk tallene mot kvitteringen og kryss av før du registrerer.');
  if (k.deler?.length && k.deler.reduce((a, d) => a + d.brutto, 0) !== k.total) throw new RegnskapsFeil('Delene summerer ikke til totalen.');
  const kontaktId = k.kontaktId ?? await finnEllerLagKontakt(t, orgId, 'leverandor', k.leverandorNavn, k.leverandorOrgnr);
  const tekst = `${k.leverandorNavn}${k.tekst ? ' · ' + k.tekst : ''}`;
  const p = byggKjop({ linjer: kjopLinjer(k), betaltMed: k.betaltMed, kontaktId, mvaRegistrert: org.mva_registrert, tekst });
  const b = await bokfor(t, orgId, { dato: k.dato, type: 'kjop', beskrivelse: tekst, kontaktId, brukerId, kilde: k.kilde ?? 'manuell' }, p);
  const faktiskMva = p.filter(x => x.konto === 2710).reduce((a, x) => a + x.debet - x.kredit, 0);
  const status = k.betaltMed === 'ubetalt' ? 'registrert' : 'betalt';
  const id = k.id ?? await lagreKjopUtkast(t, orgId, k);
  await t.q(`update kjop set status=$3, kontakt_id=$4, bilag_id=$5, mva=$6, leverandor_navn=$7, leverandor_orgnr=$8, dato=$9, total=$10, sats=$11, konto=$12, linjer=$13, betalt_med=$14, videre_kontakt_id=$15, vedlegg_id=$16, tekst=$17, forfall=$18 where id=$1 and organisasjon_id=$2`,
    [id, orgId, status, kontaktId, b.id, faktiskMva, k.leverandorNavn.trim(), k.leverandorOrgnr?.replace(/\s/g, '') || null, k.dato, k.total, k.sats, k.konto, k.deler ? JSON.stringify(k.deler) : null, k.betaltMed, k.viderefakturerKontaktId ?? null, k.vedleggId ?? null, k.tekst ?? null, k.forfall ?? null]);
  return { id, bilagNr: b.nr };
}

/** Betaler et ubetalt kjøp (leverandørfaktura). */
export async function betalKjop(t: Sporring, orgId: string, id: string, dato: string, brukerId?: string | null): Promise<{ nr: number; id: string }> {
  const k = await t.en<{ status: string; total: number; kontakt_id: string; leverandor_navn: string }>('select status, total, kontakt_id, leverandor_navn from kjop where id = $1 and organisasjon_id = $2', [id, orgId]);
  if (!k) throw new RegnskapsFeil('Fant ikke kjøpet.');
  if (k.status !== 'registrert') throw new RegnskapsFeil(k.status === 'betalt' ? 'Kjøpet er allerede betalt.' : 'Kjøpet er ikke registrert ennå.');
  const b = await bokfor(t, orgId, { dato, type: 'utbetaling', beskrivelse: `Betaling ${k.leverandor_navn}`, kontaktId: k.kontakt_id, brukerId }, byggBetalingLeverandor(k.total, k.kontakt_id, `Betaling ${k.leverandor_navn}`));
  await t.q(`update kjop set status = 'betalt' where id = $1`, [id]);
  return b;
}
