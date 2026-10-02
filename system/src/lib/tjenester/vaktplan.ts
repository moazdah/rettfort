// Vaktplanen mot databasen. Reglene (arbeidstid, overtid, merarbeid, hviletid) ligger i lib/vaktplan.ts,
// og innstillingene i lib/vaktplan-innstillinger.ts.
// Ansatte er de samme som i Lønn. Vaktplanen fører ingenting i regnskapet; timene går til lønn via timelister.
//
// Publisering: alt lederen endrer, merkes «ikke publisert». De ansatte ser den publiserte versjonen
// (publisert_kopi) til lederen publiserer igjen. Slettede vakter i en publisert uke ligger igjen som «slettet»
// til da, så de ansatte ikke mister en vakt de fortsatt tror de har.

import { randomBytes } from 'node:crypto';
import type { Sporring } from '../db';
import { RegnskapsFeil } from '../hovedbok';
import { tokenHash } from '../auth';
import {
  analyserUke, advarsler, arbeidMin, gyldigTid, isoUke, ukeDager, flyttUke, plussDager, avtaltMin, timerTall, ukedag, STANDARD_MALER,
  type AnsattRegel, type VaktInn, type Tilgjengelig, type VaktMal,
} from '../vaktplan';
import { lesInnstillinger, grenser, erFravaerstype, FRAVAER_LONN, type VaktInnstillinger, type Fravaerstype } from '../vaktplan-innstillinger';

export interface VaktRad extends VaktInn {
  id: string; pauseMin: number; utlagt: boolean; interesse: string[];
  type: string | null; sted: string | null; kommentar: string | null; ansattKommentar: string | null; ikkePublisert: boolean;
}
export interface VaktAnsatt extends AnsattRegel {
  epost: string | null; kontakt: string | null; mobil: string | null; stilling: string | null; tilgang: string; timesats: number; manedslonn: number;
  overtidProsent: number; brukerId: string | null; ferieDager: number; avspMin: number; sistInne: string | null;
}
export interface FriRad { id: string; ansattId: string; navn: string; dato: string; grunn: string | null; harVakt: boolean }
export type UkeStatus = 'utkast' | 'publisert' | 'endret';

const tid = (t: string | null | undefined) => (t ? String(t).slice(0, 5) : '');
const json = <T>(v: unknown, std: T): T => { if (v == null) return std; if (typeof v === 'string') { try { return JSON.parse(v) as T; } catch { return std; } } return v as T; };
const datoOk = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
const ukeAv = (dato: string) => isoUke(dato);

// ---------- Innstillinger, steder og maler ----------

export async function innstillinger(t: Sporring, orgId: string): Promise<VaktInnstillinger> {
  const r = await t.en<{ vakt_innstillinger: unknown }>('select vakt_innstillinger from organisasjon where id = $1', [orgId]);
  return lesInnstillinger(r?.vakt_innstillinger ?? null);
}

export async function lagreInnstillinger(t: Sporring, orgId: string, s: unknown): Promise<VaktInnstillinger> {
  const ren = lesInnstillinger(s);
  await t.q('update organisasjon set vakt_innstillinger = $2 where id = $1', [orgId, JSON.stringify(ren)]);
  // Overtidstillegget brukes i Lønn, som har det per ansatt.
  await t.q('update ansatt set overtid_prosent = $2 where organisasjon_id = $1', [orgId, ren.ot.add]);
  return ren;
}

export async function steder(t: Sporring, orgId: string): Promise<string[]> {
  const r = await t.en<{ vakt_steder: unknown }>('select vakt_steder from organisasjon where id = $1', [orgId]);
  const s = json<unknown[]>(r?.vakt_steder, []);
  return Array.isArray(s) ? s.filter((x): x is string => typeof x === 'string' && !!x.trim()) : [];
}

export async function lagreSteder(t: Sporring, orgId: string, liste: string[]) {
  const rene = [...new Set(liste.map(x => x.trim().slice(0, 40)).filter(Boolean))].slice(0, 12);
  await t.q('update organisasjon set vakt_steder = $2 where id = $1', [orgId, JSON.stringify(rene)]);
  return rene;
}

export async function vaktMaler(t: Sporring, orgId: string): Promise<VaktMal[]> {
  const r = await t.en<{ vakt_maler: unknown }>('select vakt_maler from organisasjon where id = $1', [orgId]);
  const m = json<VaktMal[] | null>(r?.vakt_maler, null);
  return Array.isArray(m) && m.length ? m : STANDARD_MALER;
}

export async function lagreMaler(t: Sporring, orgId: string, maler: VaktMal[]) {
  const rene = maler.filter(m => m.navn.trim() && gyldigTid(m.start) && gyldigTid(m.slutt)).slice(0, 8).map(m => ({ navn: m.navn.trim().slice(0, 20), start: m.start, slutt: m.slutt }));
  if (!rene.length) throw new RegnskapsFeil('Legg inn minst én mal med navn og klokkeslett.');
  await t.q('update organisasjon set vakt_maler = $2 where id = $1', [orgId, JSON.stringify(rene)]);
}

// ---------- Lesing ----------

/** Ansatte som er med i vaktplanen. `alle` tar med de som er fjernet fra vaktplanen (men fortsatt i Lønn). */
export async function vaktAnsatte(t: Sporring, orgId: string, alle = false): Promise<VaktAnsatt[]> {
  const r = await t.q<{ id: string; navn: string; lonn_type: string; stillingsprosent: number; epost: string | null; kontakt: string | null; mobil: string | null; stilling: string | null; tilgang: string; timesats: number; manedslonn: number; overtid_prosent: number; bruker_id: string | null; ferie_dager: number; avspasering_min: number; sist_inne: string | null }>(
    `select id, navn, lonn_type, stillingsprosent, epost, kontakt, mobil, stilling, tilgang, timesats, manedslonn, overtid_prosent, bruker_id, ferie_dager, avspasering_min, sist_inne::text as sist_inne
     from ansatt where organisasjon_id = $1 and aktiv ${alle ? '' : 'and i_vaktplan'} order by navn`, [orgId]);
  return r.map(a => ({
    id: a.id, navn: a.navn, lonnType: a.lonn_type, stillingsprosent: Number(a.stillingsprosent), epost: a.epost ?? (a.kontakt?.includes('@') ? a.kontakt : null), kontakt: a.kontakt,
    mobil: a.mobil ?? (a.kontakt && !a.kontakt.includes('@') ? a.kontakt : null), stilling: a.stilling, tilgang: a.tilgang, timesats: Number(a.timesats), manedslonn: Number(a.manedslonn),
    overtidProsent: Number(a.overtid_prosent), brukerId: a.bruker_id, ferieDager: Number(a.ferie_dager), avspMin: Number(a.avspasering_min), sistInne: a.sist_inne,
  }));
}

type VaktDb = { id: string; ansatt_id: string | null; dato: string; start: string; slutt: string; pause_min: number; utlagt: boolean; interesse: string[] | null; type: string | null; sted: string | null; kommentar: string | null; ansatt_kommentar: string | null; ikke_publisert: boolean; slettet: boolean; publisert_kopi: unknown };

const tilRad = (v: VaktDb): VaktRad => ({
  id: v.id, ansattId: v.ansatt_id, dato: v.dato, start: tid(v.start), slutt: tid(v.slutt), pauseMin: Number(v.pause_min), utlagt: v.utlagt, interesse: v.interesse ?? [],
  type: v.type, sted: v.sted, kommentar: v.kommentar, ansattKommentar: v.ansatt_kommentar, ikkePublisert: v.ikke_publisert,
});

/**
 * Vaktene mellom to datoer. Lederen ser alt slik det er nå. Den ansatte ser bare publiserte uker,
 * og der en vakt er endret etter publisering, ser hen den publiserte versjonen.
 */
export async function vakterMellom(t: Sporring, orgId: string, fra: string, til: string, visning: 'leder' | 'ansatt' = 'leder'): Promise<VaktRad[]> {
  const r = await t.q<VaktDb>(
    `select v.id, v.ansatt_id, v.dato::text as dato, v.start::text as start, v.slutt::text as slutt, v.pause_min, v.utlagt, v.type, v.sted, v.kommentar, v.ansatt_kommentar, v.ikke_publisert, v.slettet, v.publisert_kopi,
       (select array_agg(i.ansatt_id::text order by i.tid) from vakt_interesse i where i.vakt_id = v.id) as interesse
     from vakt v where v.organisasjon_id = $1 and v.dato between $2 and $3 order by v.dato, v.start`, [orgId, fra, til]);
  if (visning === 'leder') return r.filter(v => !v.slettet).map(tilRad);
  const uker = new Set((await t.q<{ aar: number; uke: number }>(`select aar, uke from vaktuke where organisasjon_id = $1 and status <> 'utkast'`, [orgId])).map(x => `${x.aar}-${x.uke}`));
  const ut: VaktRad[] = [];
  for (const v of r) {
    if (!v.ikke_publisert && !v.slettet) { const w = ukeAv(v.dato); if (uker.has(`${w.aar}-${w.uke}`)) ut.push(tilRad(v)); continue; }
    const k = json<{ ansatt_id: string | null; dato: string; start: string; slutt: string; type: string | null; sted: string | null; kommentar: string | null } | null>(v.publisert_kopi, null);
    if (!k) continue;
    const w = ukeAv(k.dato);
    if (!uker.has(`${w.aar}-${w.uke}`) || k.dato < fra || k.dato > til) continue;
    ut.push({ ...tilRad(v), ansattId: k.ansatt_id, dato: k.dato, start: tid(k.start), slutt: tid(k.slutt), type: k.type, sted: k.sted, kommentar: k.kommentar, ikkePublisert: false });
  }
  return ut.sort((a, b) => (a.dato + a.start).localeCompare(b.dato + b.start));
}

export interface TilgjRad extends Tilgjengelig { timer: Record<string, 'kan' | 'kan_ikke'> | null }

export async function tilgjengelighet(t: Sporring, orgId: string, fra: string, til: string): Promise<TilgjRad[]> {
  return (await t.q<{ ansatt_id: string; dato: string; status: 'kan' | 'kan_ikke'; grunn: string | null; timer: unknown }>(
    `select ansatt_id, dato::text as dato, status, grunn, timer from tilgjengelighet where organisasjon_id = $1 and dato between $2 and $3`, [orgId, fra, til]))
    .map(x => ({ ansattId: x.ansatt_id, dato: x.dato, status: x.status, grunn: x.grunn, timer: json(x.timer, null) }));
}

export async function ukeStatus(t: Sporring, orgId: string, aar: number, uke: number): Promise<UkeStatus> {
  return ((await t.en<{ status: UkeStatus }>('select status from vaktuke where organisasjon_id = $1 and aar = $2 and uke = $3', [orgId, aar, uke]))?.status) ?? 'utkast';
}

export interface FravaerRad { id: string; ansattId: string; navn: string; fra: string; til: string; type: string; medLonn: boolean; timerMin: number; status: 'venter' | 'godkjent' | 'avslatt'; grunn: string | null; svar: string | null; opprettet: string }

export async function fravaer(t: Sporring, orgId: string, valg: { fra?: string; til?: string; ansattId?: string; status?: string } = {}): Promise<FravaerRad[]> {
  const p: unknown[] = [orgId]; const w: string[] = ['f.organisasjon_id = $1'];
  if (valg.fra) { p.push(valg.fra); w.push(`f.til >= $${p.length}`); }
  if (valg.til) { p.push(valg.til); w.push(`f.fra <= $${p.length}`); }
  if (valg.ansattId) { p.push(valg.ansattId); w.push(`f.ansatt_id = $${p.length}`); }
  if (valg.status) { p.push(valg.status); w.push(`f.status = $${p.length}`); }
  return (await t.q<{ id: string; ansatt_id: string; navn: string; fra: string; til: string; type: string; med_lonn: boolean; timer_min: number; status: FravaerRad['status']; grunn: string | null; svar: string | null; opprettet: string }>(
    `select f.id, f.ansatt_id, a.navn, f.fra::text as fra, f.til::text as til, f.type, f.med_lonn, f.timer_min, f.status, f.grunn, f.svar, f.opprettet::text as opprettet
     from fravaer f join ansatt a on a.id = f.ansatt_id where ${w.join(' and ')} order by f.fra desc`, p))
    .map(x => ({ id: x.id, ansattId: x.ansatt_id, navn: x.navn, fra: x.fra, til: x.til, type: x.type, medLonn: x.med_lonn, timerMin: Number(x.timer_min), status: x.status, grunn: x.grunn, svar: x.svar, opprettet: x.opprettet }));
}

/** Antall endringer som ikke er publisert i en uke som har vært publisert. */
export async function antallEndringer(t: Sporring, orgId: string, aar: number, uke: number): Promise<number> {
  const d = ukeDager(aar, uke);
  return Number((await t.en<{ n: number }>(`select count(*)::int as n from vakt where organisasjon_id = $1 and dato between $2 and $3 and (ikke_publisert or slettet)`, [orgId, d[0], d[6]]))?.n ?? 0);
}

/** Alt lederen trenger for én uke. Vaktene dagen før og etter er med, så hviletid kan sjekkes. */
export async function hentUke(t: Sporring, orgId: string, aar: number, uke: number) {
  const dager = ukeDager(aar, uke);
  const s = await innstillinger(t, orgId);
  const [ansatte, rundt, tilgj, status, maler, sted, frav, endringer] = await Promise.all([
    vaktAnsatte(t, orgId), vakterMellom(t, orgId, plussDager(dager[0], -1), plussDager(dager[6], 1)), tilgjengelighet(t, orgId, dager[0], dager[6]), ukeStatus(t, orgId, aar, uke),
    vaktMaler(t, orgId), steder(t, orgId), fravaer(t, orgId, { fra: dager[0], til: dager[6], status: 'godkjent' }), antallEndringer(t, orgId, aar, uke),
  ]);
  const vakter = rundt.filter(v => v.dato >= dager[0] && v.dato <= dager[6]);
  const a = analyserUke(vakter, ansatte, grenser(s));
  return {
    aar, uke, dager, status, ansatte, tilgj, maler, steder: sted, innstillinger: s, endringer, fravaer: frav,
    rundt: rundt.filter(v => v.dato < dager[0] || v.dato > dager[6]),
    vakter: vakter.map(v => ({ ...v, ...a.perVakt.get(v)! })),
    perAnsatt: Object.fromEntries([...a.perAnsatt].map(([k, x]) => [k, x])),
  };
}

// ---------- Angre ----------

/** Det som skal kunne settes tilbake etter en handling. */
export interface AngreOmfang { vakter?: string[]; fri?: string[]; fravaer?: string[]; bytte?: string[]; tilgj?: { ansattId: string; dato: string }[]; timeliste?: { ansattId: string; aar: number; uke: number }[]; uker?: { aar: number; uke: number }[]; ansatt?: string }

type Del = { tabell: string; slett: string; p: unknown[]; rader: unknown[] };
const TABELLER = ['vaktuke', 'vakt', 'vakt_interesse', 'vakt_bytte', 'fri_foresporsel', 'fravaer', 'tilgjengelighet', 'timeliste', 'medlemskap', 'vakt_lenke', 'sesjon'] as const;

async function bilde(t: Sporring, tabell: (typeof TABELLER)[number], hvor: string, p: unknown[]): Promise<Del> {
  const r = await t.en<{ r: unknown }>(`select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as r from ${tabell} x where ${hvor}`, p);
  return { tabell, slett: hvor, p, rader: json<unknown[]>(r?.r, []) };
}

/** Tar vare på radene en handling kan endre, og gir en nøkkel som brukes til å angre. */
export async function angrepunkt(t: Sporring, orgId: string, o: AngreOmfang): Promise<string> {
  const deler: Del[] = [];
  if (o.uker?.length) for (const u of o.uker) deler.push(await bilde(t, 'vaktuke', 'organisasjon_id = $1 and aar = $2 and uke = $3', [orgId, u.aar, u.uke]));
  if (o.vakter?.length) {
    deler.push(await bilde(t, 'vakt', 'organisasjon_id = $1 and id = any($2::uuid[])', [orgId, o.vakter]));
    deler.push(await bilde(t, 'vakt_interesse', 'vakt_id = any($1::uuid[])', [o.vakter]));
    deler.push(await bilde(t, 'vakt_bytte', 'organisasjon_id = $1 and vakt_id = any($2::uuid[])', [orgId, o.vakter]));
  }
  if (o.fri?.length) deler.push(await bilde(t, 'fri_foresporsel', 'organisasjon_id = $1 and id = any($2::uuid[])', [orgId, o.fri]));
  if (o.fravaer?.length) deler.push(await bilde(t, 'fravaer', 'organisasjon_id = $1 and id = any($2::uuid[])', [orgId, o.fravaer]));
  if (o.bytte?.length) deler.push(await bilde(t, 'vakt_bytte', 'organisasjon_id = $1 and id = any($2::uuid[])', [orgId, o.bytte]));
  for (const x of o.tilgj ?? []) deler.push(await bilde(t, 'tilgjengelighet', 'organisasjon_id = $1 and ansatt_id = $2 and dato = $3', [orgId, x.ansattId, x.dato]));
  for (const x of o.timeliste ?? []) deler.push(await bilde(t, 'timeliste', 'organisasjon_id = $1 and ansatt_id = $2 and aar = $3 and uke = $4', [orgId, x.ansattId, x.aar, x.uke]));
  let ansatt: unknown = null;
  if (o.ansatt) {
    const a = await t.en<{ i_vaktplan: boolean; tilgang: string; bruker_id: string | null }>('select i_vaktplan, tilgang, bruker_id from ansatt where id = $1 and organisasjon_id = $2', [o.ansatt, orgId]);
    if (a) {
      ansatt = { id: o.ansatt, i_vaktplan: a.i_vaktplan, tilgang: a.tilgang };
      deler.push(await bilde(t, 'vakt_lenke', 'ansatt_id = $1', [o.ansatt]));
      if (a.bruker_id) {
        deler.push(await bilde(t, 'medlemskap', `bruker_id = $1 and organisasjon_id = $2 and rolle = 'ansatt'`, [a.bruker_id, orgId]));
        deler.push(await bilde(t, 'sesjon', 'bruker_id = $1 and organisasjon_id = $2', [a.bruker_id, orgId]));
      }
    }
  }
  await t.q(`delete from vakt_angre where organisasjon_id = $1 and opprettet < now() - interval '1 day'`, [orgId]);
  return (await t.en<{ id: string }>('insert into vakt_angre (organisasjon_id, data) values ($1, $2) returning id', [orgId, JSON.stringify({ deler, ansatt })]))!.id;
}

/** Rader handlingen lagde (vakter, fravær): å angre er å slette dem. */
export async function leggTilAngre(t: Sporring, orgId: string, id: string, nye: { vakter?: string[]; fravaer?: string[] }) {
  const deler: Del[] = [];
  if (nye.vakter?.length) deler.push({ tabell: 'vakt', slett: 'organisasjon_id = $1 and id = any($2::uuid[])', p: [orgId, nye.vakter], rader: [] });
  if (nye.fravaer?.length) deler.push({ tabell: 'fravaer', slett: 'organisasjon_id = $1 and id = any($2::uuid[])', p: [orgId, nye.fravaer], rader: [] });
  if (deler.length) await t.q(`update vakt_angre set data = jsonb_set(data, '{deler}', (data->'deler') || $3::jsonb) where id = $1 and organisasjon_id = $2`, [id, orgId, JSON.stringify(deler)]);
}

/** Setter tilbake alt fra angrepunktet. */
export async function angre(t: Sporring, orgId: string, id: string) {
  const r = await t.en<{ data: unknown }>('select data from vakt_angre where id = $1 and organisasjon_id = $2', [id, orgId]);
  if (!r) throw new RegnskapsFeil('Det er for sent å angre.');
  const d = json<{ deler: Del[]; ansatt: { id: string; i_vaktplan: boolean; tilgang: string } | null }>(r.data, { deler: [], ansatt: null });
  const rekkefolge = (x: Del) => TABELLER.indexOf(x.tabell as (typeof TABELLER)[number]);
  if (!d.deler.every(x => rekkefolge(x) >= 0)) throw new RegnskapsFeil('Kan ikke angre.');
  for (const x of [...d.deler].sort((a, b) => rekkefolge(b) - rekkefolge(a))) await t.q(`delete from ${x.tabell} where ${x.slett}`, x.p);
  for (const x of [...d.deler].sort((a, b) => rekkefolge(a) - rekkefolge(b))) {
    for (const rad of x.rader) await t.q(`insert into ${x.tabell} select * from jsonb_populate_record(null::${x.tabell}, $1::jsonb) on conflict do nothing`, [JSON.stringify(rad)]);
  }
  if (d.ansatt) await t.q('update ansatt set i_vaktplan = $3, tilgang = $4 where id = $1 and organisasjon_id = $2', [d.ansatt.id, orgId, d.ansatt.i_vaktplan, d.ansatt.tilgang]);
  await t.q('delete from vakt_angre where id = $1', [id]);
}

// ---------- Endringer fra lederen ----------

/** Etter publisering: uka får status «endret», og de berørte husker vi til neste varsling. */
async function merkEndret(t: Sporring, orgId: string, dato: string, ansattIder: (string | null | undefined)[]) {
  const { aar, uke } = isoUke(dato);
  const s = await t.en<{ status: UkeStatus; berorte: unknown }>('select status, berorte from vaktuke where organisasjon_id = $1 and aar = $2 and uke = $3', [orgId, aar, uke]);
  if (!s || s.status === 'utkast') return;
  const for_ = json<string[]>(s.berorte, []);
  const nye = [...new Set([...for_, ...ansattIder.filter((x): x is string => !!x)])];
  await t.q(`update vaktuke set status = 'endret', berorte = $4 where organisasjon_id = $1 and aar = $2 and uke = $3`, [orgId, aar, uke, JSON.stringify(nye)]);
}

/** Endringen er ikke publisert før lederen publiserer. */
async function upublisert(t: Sporring, id: string) {
  await t.q('update vakt set ikke_publisert = true where id = $1', [id]);
}

async function hentVakt(t: Sporring, orgId: string, id: string) {
  const v = await t.en<{ id: string; ansatt_id: string | null; dato: string; start: string; slutt: string; type: string | null; sted: string | null; utlagt: boolean; publisert_kopi: unknown }>(
    'select id, ansatt_id, dato::text as dato, start::text as start, slutt::text as slutt, type, sted, utlagt, publisert_kopi from vakt where id = $1 and organisasjon_id = $2 and not slettet', [id, orgId]);
  if (!v) throw new RegnskapsFeil('Fant ikke vakten.');
  return { ...v, start: tid(v.start), slutt: tid(v.slutt) };
}

async function sjekkAnsatt(t: Sporring, orgId: string, ansattId: string | null) {
  if (!ansattId) return;
  if (!(await t.en('select 1 from ansatt where id = $1 and organisasjon_id = $2 and aktiv and i_vaktplan', [ansattId, orgId]))) throw new RegnskapsFeil('Fant ikke den ansatte.');
}

export interface NyVakt { id?: string | null; ansattId: string | null; dato: string; start: string; slutt: string; type?: string | null; sted?: string | null; kommentar?: string | null; gjenta?: 'aldri' | 'uke' | 'annenhver' }

/** Lagrer en ny eller endret vakt og gir advarslene tilbake. Advarsler stopper ikke lagringen. */
export async function lagreVakt(t: Sporring, orgId: string, v: NyVakt): Promise<{ id: string; advarsler: string[]; kopier: number; nye: string[] }> {
  if (!datoOk(v.dato)) throw new RegnskapsFeil('Velg en dag.');
  if (!gyldigTid(v.start) || !gyldigTid(v.slutt)) throw new RegnskapsFeil('Skriv klokkeslett som 07:00.');
  if (v.start === v.slutt) throw new RegnskapsFeil('Vakten må vare minst ett minutt.');
  await sjekkAnsatt(t, orgId, v.ansattId);
  const varsel = await advarslerFor(t, orgId, v);
  const type = v.type?.trim().slice(0, 30) || null, sted = v.sted?.trim().slice(0, 40) || null, kommentar = v.kommentar?.trim().slice(0, 500) || null;
  let id = v.id ?? null;
  if (id) {
    const f = await hentVakt(t, orgId, id);
    await t.q(`update vakt set ansatt_id = $3, dato = $4, start = $5, slutt = $6, type = $7, sted = $8, kommentar = $9, ikke_publisert = true,
      utlagt = case when ansatt_id is distinct from $3 then false else utlagt end where id = $1 and organisasjon_id = $2`, [id, orgId, v.ansattId, v.dato, v.start, v.slutt, type, sted, kommentar]);
    if (f.ansatt_id !== v.ansattId) {
      // Ny person på vakten: fri, bytte og interesse gjelder ikke lenger.
      await t.q('delete from vakt_interesse where vakt_id = $1', [id]);
      await t.q(`update vakt_bytte set status = 'avslatt' where vakt_id = $1 and status in ('venter_kollega','venter_leder')`, [id]);
      if (f.ansatt_id) await t.q(`delete from fri_foresporsel where ansatt_id = $1 and dato = $2 and status = 'venter'`, [f.ansatt_id, f.dato]);
    }
    if (f.dato !== v.dato) await merkEndret(t, orgId, f.dato, [f.ansatt_id]);
    await merkEndret(t, orgId, v.dato, [f.ansatt_id, v.ansattId]);
    return { id, advarsler: varsel, kopier: 0, nye: [] };
  }
  const sett = (dato: string) => t.en<{ id: string }>('insert into vakt (organisasjon_id, ansatt_id, dato, start, slutt, type, sted, kommentar, ikke_publisert) values ($1,$2,$3,$4,$5,$6,$7,$8,true) returning id',
    [orgId, v.ansattId, dato, v.start, v.slutt, type, sted, kommentar]);
  id = (await sett(v.dato))!.id;
  await merkEndret(t, orgId, v.dato, [v.ansattId]);
  let kopier = 0;
  const nye = [id];
  // Gjenta: åtte uker frem.
  if (v.gjenta === 'uke' || v.gjenta === 'annenhver') {
    const steg = v.gjenta === 'uke' ? 7 : 14;
    for (let d = steg; d <= 56; d += steg) { const dato = plussDager(v.dato, d); nye.push((await sett(dato))!.id); await merkEndret(t, orgId, dato, [v.ansattId]); kopier++; }
  }
  return { id, advarsler: varsel, kopier, nye };
}

export async function advarslerFor(t: Sporring, orgId: string, v: { id?: string | null; ansattId: string | null; dato: string; start: string; slutt: string }): Promise<string[]> {
  const dager = ukeDager(isoUke(v.dato).aar, isoUke(v.dato).uke);
  const [ansatte, vakter, tilgj, s] = await Promise.all([vaktAnsatte(t, orgId), vakterMellom(t, orgId, plussDager(dager[0], -1), plussDager(dager[6], 1)), tilgjengelighet(t, orgId, v.dato, v.dato), innstillinger(t, orgId)]);
  return advarsler({ ansattId: v.ansattId, dato: v.dato, start: v.start, slutt: v.slutt }, vakter.filter(x => x.id !== v.id), ansatte.find(a => a.id === v.ansattId) ?? null, tilgj,
    { grenser: grenser(s), overtid: s.ot.on, hviletid: s.rest.on });
}

/** Sletter vakten. Er den publisert, ligger den igjen for de ansatte til neste publisering. */
export async function slettVakt(t: Sporring, orgId: string, id: string) {
  const v = await hentVakt(t, orgId, id);
  if (v.publisert_kopi) await t.q('update vakt set slettet = true, ikke_publisert = true, utlagt = false where id = $1', [id]);
  else await t.q('delete from vakt where id = $1', [id]);
  await t.q(`update vakt_bytte set status = 'avslatt' where vakt_id = $1 and status in ('venter_kollega','venter_leder')`, [id]);
  await merkEndret(t, orgId, v.dato, [v.ansatt_id]);
  return v;
}

/** Gjør vakten ledig (ingen på den). Brukes også når lederen sier ja til at noen gir bort vakten. */
export async function gjorLedig(t: Sporring, orgId: string, id: string) {
  const v = await hentVakt(t, orgId, id);
  await t.q('update vakt set ansatt_id = null, utlagt = false where id = $1', [id]);
  await upublisert(t, id);
  await t.q('delete from vakt_interesse where vakt_id = $1 and ansatt_id = $2', [id, v.ansatt_id]);
  await t.q(`update vakt_bytte set status = 'avslatt' where vakt_id = $1 and status in ('venter_kollega','venter_leder')`, [id]);
  await merkEndret(t, orgId, v.dato, [v.ansatt_id]);
  return v.ansatt_id;
}

/** Lederen sier nei til å gi bort: vakten blir hos den ansatte. */
export async function behold(t: Sporring, orgId: string, id: string) {
  const v = await hentVakt(t, orgId, id);
  await t.q('update vakt set utlagt = false where id = $1', [id]);
  await t.q('delete from vakt_interesse where vakt_id = $1', [id]);
  return v.ansatt_id;
}

/** Gir en ledig (eller utlagt) vakt til en ansatt. Interessen tømmes. */
export async function tildel(t: Sporring, orgId: string, id: string, ansattId: string | null) {
  await sjekkAnsatt(t, orgId, ansattId);
  const v = await hentVakt(t, orgId, id);
  await t.q('update vakt set ansatt_id = $2, utlagt = false where id = $1', [id, ansattId]);
  await upublisert(t, id);
  await t.q('delete from vakt_interesse where vakt_id = $1', [id]);
  await merkEndret(t, orgId, v.dato, [v.ansatt_id, ansattId]);
  return { dato: v.dato, start: v.start, slutt: v.slutt, fra: v.ansatt_id };
}

/** Flytter en vakt til en annen dag eller ansatt (dra og slipp). */
export async function flyttVakt(t: Sporring, orgId: string, id: string, ansattId: string | null, dato: string) {
  const v = await hentVakt(t, orgId, id);
  const r = await t.en<{ kommentar: string | null }>('select kommentar from vakt where id = $1', [id]);
  return lagreVakt(t, orgId, { id, ansattId, dato, start: v.start, slutt: v.slutt, type: v.type, sted: v.sted, kommentar: r?.kommentar ?? null });
}

/** Publiserer uka. Første gang varsles alle med vakt; etter endringer bare de berørte. */
export async function publiser(t: Sporring, orgId: string, aar: number, uke: number): Promise<{ varsle: string[]; forste: boolean }> {
  const dager = ukeDager(aar, uke);
  const s = await t.en<{ status: UkeStatus; berorte: unknown }>('select status, berorte from vaktuke where organisasjon_id = $1 and aar = $2 and uke = $3', [orgId, aar, uke]);
  const forste = !s || s.status === 'utkast';
  const medVakt = (await t.q<{ ansatt_id: string }>('select distinct ansatt_id from vakt where organisasjon_id = $1 and dato between $2 and $3 and ansatt_id is not null and not slettet', [orgId, dager[0], dager[6]])).map(x => x.ansatt_id);
  if (forste && !medVakt.length) throw new RegnskapsFeil('Uka har ingen vakter å publisere.');
  if (!forste && s!.status === 'publisert') throw new RegnskapsFeil('Uka er allerede publisert, og ingenting er endret.');
  const berorte = s ? json<string[]>(s.berorte, []) : [];
  await t.q('delete from vakt where organisasjon_id = $1 and dato between $2 and $3 and slettet', [orgId, dager[0], dager[6]]);
  await t.q(`update vakt set ikke_publisert = false,
      publisert_kopi = jsonb_build_object('ansatt_id', ansatt_id, 'dato', dato::text, 'start', start::text, 'slutt', slutt::text, 'type', type, 'sted', sted, 'kommentar', kommentar)
    where organisasjon_id = $1 and dato between $2 and $3`, [orgId, dager[0], dager[6]]);
  await t.q(`insert into vaktuke (organisasjon_id, aar, uke, status, publisert, berorte) values ($1,$2,$3,'publisert', now(), '[]')
    on conflict (organisasjon_id, aar, uke) do update set status = 'publisert', publisert = now(), berorte = '[]'`, [orgId, aar, uke]);
  return { varsle: forste ? medVakt : berorte, forste };
}

/** Kopierer vaktene fra en uke til en annen (samme ukedag og tid). Bare aktive ansatte; ellers blir vakten ledig. */
export async function kopierUke(t: Sporring, orgId: string, fra: { aar: number; uke: number }, til: { aar: number; uke: number }): Promise<number> {
  const a = ukeDager(fra.aar, fra.uke), b = ukeDager(til.aar, til.uke);
  if ((await vakterMellom(t, orgId, b[0], b[6])).length) throw new RegnskapsFeil(`Uke ${til.uke} har allerede vakter.`);
  const aktive = new Set((await vaktAnsatte(t, orgId)).map(x => x.id));
  const kilde = await vakterMellom(t, orgId, a[0], a[6]);
  for (const v of kilde) {
    await t.q('insert into vakt (organisasjon_id, ansatt_id, dato, start, slutt, pause_min, type, sted, ikke_publisert) values ($1,$2,$3,$4,$5,$6,$7,$8,true)',
      [orgId, v.ansattId && aktive.has(v.ansattId) ? v.ansattId : null, b[a.indexOf(v.dato)], v.start, v.slutt, v.pauseMin, v.type, v.sted]);
  }
  return kilde.length;
}

/**
 * Forslag til en uke (for assistenten): forrige ukes vakter flyttes én uke frem. Kan noen ikke den dagen,
 * eller gir vakten overtid, prøver vi en annen som har sagt at hen kan, og ellers blir den ledig. Ingenting lagres her.
 */
export async function forslagUke(t: Sporring, orgId: string, aar: number, uke: number) {
  const forrige = flyttUke(aar, uke, -1);
  const a = ukeDager(forrige.aar, forrige.uke), b = ukeDager(aar, uke);
  const [ansatte, kilde, tilgj, finnes, s] = await Promise.all([vaktAnsatte(t, orgId), vakterMellom(t, orgId, a[0], a[6]), tilgjengelighet(t, orgId, b[0], b[6]), vakterMellom(t, orgId, b[0], b[6]), innstillinger(t, orgId)]);
  const g = grenser(s);
  const valgt: (VaktInn & { type?: string | null; sted?: string | null })[] = [];
  const hensyn: string[] = [];
  const dm = (d: string) => d.split('-').reverse().slice(0, 2).join('.');
  const gir = (an: AnsattRegel, v: VaktInn) => {
    const for_ = analyserUke(valgt, [an], g).perAnsatt.get(an.id)!;
    const etter = analyserUke([...valgt, { ...v, ansattId: an.id }], [an], g).perAnsatt.get(an.id)!;
    return etter.overtid > for_.overtid;
  };
  for (const v of kilde) {
    const dato = b[a.indexOf(v.dato)];
    const ny = { ansattId: null as string | null, dato, start: v.start, slutt: v.slutt, type: v.type, sted: v.sted };
    const an = ansatte.find(x => x.id === v.ansattId);
    let hvem: string | null = an?.id ?? null;
    if (an) {
      const ti = tilgj.find(x => x.ansattId === an.id && x.dato === dato);
      if (ti?.status === 'kan_ikke') { hensyn.push(`${an.navn.split(' ')[0]} kan ikke ${dm(dato)}${ti.grunn ? ` (${ti.grunn})` : ''}`); hvem = null; }
      else if (s.ot.on && gir(an, ny)) { hensyn.push(`${an.navn.split(' ')[0]} ville fått overtid ${dm(dato)}`); hvem = null; }
    }
    if (!hvem && an) {
      // Noen andre som har sagt at de kan, og ikke får overtid eller allerede har vakt den dagen.
      const alt = ansatte.find(x => x.id !== an.id && tilgj.some(ti => ti.ansattId === x.id && ti.dato === dato && ti.status === 'kan') && !valgt.some(y => y.ansattId === x.id && y.dato === dato) && !(s.ot.on && gir(x, ny)));
      if (alt) { hvem = alt.id; hensyn.push(`${alt.navn.split(' ')[0]} tar ${ukedag(dato)} i stedet, og har sagt at hen kan`); }
    }
    valgt.push({ ...ny, ansattId: hvem });
  }
  const r = analyserUke(valgt, ansatte, g);
  return {
    aar, uke, finnes: finnes.length, vakter: valgt.map(v => ({ ...v, navn: ansatte.find(x => x.id === v.ansattId)?.navn ?? null })),
    ledige: valgt.filter(v => !v.ansattId).length, overtidMin: [...r.perAnsatt.values()].reduce((sum, x) => sum + x.overtid, 0),
    timerMin: valgt.reduce((sum, v) => sum + arbeidMin(v), 0), hensyn,
  };
}

/** Lagrer forslaget som utkast (uka må være tom). */
export async function lagreForslagUke(t: Sporring, orgId: string, aar: number, uke: number, vakter: (VaktInn & { type?: string | null; sted?: string | null })[]): Promise<number> {
  const b = ukeDager(aar, uke);
  if ((await vakterMellom(t, orgId, b[0], b[6])).length) throw new RegnskapsFeil(`Uke ${uke} har allerede vakter. Tøm uka eller endre dem selv.`);
  for (const v of vakter) {
    if (!b.includes(v.dato)) continue;
    await t.q('insert into vakt (organisasjon_id, ansatt_id, dato, start, slutt, type, sted, ikke_publisert) values ($1,$2,$3,$4,$5,$6,$7,true)', [orgId, v.ansattId, v.dato, v.start, v.slutt, v.type ?? null, v.sted ?? null]);
  }
  return vakter.length;
}

// ---------- Forespørsler ----------

export async function friForesporsler(t: Sporring, orgId: string): Promise<FriRad[]> {
  return (await t.q<{ id: string; ansatt_id: string; navn: string; dato: string; grunn: string | null; har_vakt: boolean }>(
    `select f.id, f.ansatt_id, a.navn, f.dato::text as dato, f.grunn,
       exists (select 1 from vakt v where v.ansatt_id = f.ansatt_id and v.dato = f.dato and not v.slettet) as har_vakt
     from fri_foresporsel f join ansatt a on a.id = f.ansatt_id where f.organisasjon_id = $1 and f.status = 'venter' order by f.dato`, [orgId]))
    .map(x => ({ id: x.id, ansattId: x.ansatt_id, navn: x.navn, dato: x.dato, grunn: x.grunn, harVakt: x.har_vakt }));
}

/** Svar på «kan ikke» (fri) uten å registrere fravær: godkjent gjør vakten ledig. */
export async function svarFri(t: Sporring, orgId: string, id: string, godkjenn: boolean) {
  const f = await t.en<{ ansatt_id: string; dato: string; grunn: string | null }>(`select ansatt_id, dato::text as dato, grunn from fri_foresporsel where id = $1 and organisasjon_id = $2 and status = 'venter'`, [id, orgId]);
  if (!f) throw new RegnskapsFeil('Forespørselen er allerede besvart.');
  await t.q('update fri_foresporsel set status = $2 where id = $1', [id, godkjenn ? 'godkjent' : 'avslatt']);
  if (godkjenn) {
    await t.q(`insert into tilgjengelighet (organisasjon_id, ansatt_id, dato, status, grunn) values ($1,$2,$3,'kan_ikke',$4)
      on conflict (ansatt_id, dato) do update set status = 'kan_ikke', grunn = coalesce(excluded.grunn, tilgjengelighet.grunn)`, [orgId, f.ansatt_id, f.dato, f.grunn]);
    const v = await t.q<{ id: string }>('select id from vakt where organisasjon_id = $1 and ansatt_id = $2 and dato = $3 and not slettet', [orgId, f.ansatt_id, f.dato]);
    for (const x of v) { await t.q('update vakt set ansatt_id = null, utlagt = false where id = $1', [x.id]); await upublisert(t, x.id); }
    if (v.length) await merkEndret(t, orgId, f.dato, [f.ansatt_id]);
  }
  return f;
}

/** Hvor mange ting lederen må svare på: fri, fravær, bytter, vakter noen vil gi bort, og ledige vakter noen vil ta. */
export async function antallForesporsler(t: Sporring, orgId: string, idag: string): Promise<number> {
  const r = await t.en<{ n: number }>(
    `select ((select count(*) from fri_foresporsel where organisasjon_id = $1 and status = 'venter')
      + (select count(*) from fravaer where organisasjon_id = $1 and status = 'venter')
      + (select count(*) from vakt_bytte where organisasjon_id = $1 and status = 'venter_leder')
      + (select count(*) from vakt where organisasjon_id = $1 and utlagt and ansatt_id is not null and dato >= $2 and not slettet)
      + (select count(*) from vakt v where v.organisasjon_id = $1 and v.ansatt_id is null and v.dato >= $2 and not v.slettet and exists (select 1 from vakt_interesse i where i.vakt_id = v.id)))::int as n`, [orgId, idag]);
  return Number(r?.n ?? 0);
}

export interface Interessent { id: string; navn: string; merknad: 'overtid' | 'merarbeid' | 'har vakt' | null; kan: boolean }
export interface Trenger { fri: FriRad[]; bytte: (VaktRad & { navn: string; interessenter: Interessent[] })[]; ledigeMedInteresse: (VaktRad & { interessenter: Interessent[] })[] }

/** Hva det betyr for en ansatt å få en vakt: overtid, merarbeid eller dobbel vakt. */
async function merknadFor(t: Sporring, orgId: string, v: VaktRad, a: VaktAnsatt, s: VaktInnstillinger): Promise<Interessent> {
  const d = ukeDager(isoUke(v.dato).aar, isoUke(v.dato).uke);
  const uka = (await vakterMellom(t, orgId, d[0], d[6])).filter(x => x.id !== v.id);
  const tj = await tilgjengelighet(t, orgId, v.dato, v.dato);
  const w = advarsler({ ansattId: a.id, dato: v.dato, start: v.start, slutt: v.slutt }, uka, a, tj, { grenser: grenser(s), overtid: s.ot.on, hviletid: false });
  const merknad = w.some(x => /overtid/.test(x)) ? 'overtid' : w.some(x => /merarbeid/.test(x)) ? 'merarbeid' : w.some(x => /allerede/.test(x)) ? 'har vakt' : null;
  return { id: a.id, navn: a.navn, merknad, kan: tj.some(x => x.ansattId === a.id && x.status === 'kan') };
}

/** Det som venter på lederen, med beskjed om overtid/merarbeid for hver interessent. */
export async function trengerSvar(t: Sporring, orgId: string, idag: string): Promise<Trenger> {
  const til = plussDager(idag, 60);
  const [fri, vakter, ansatte, s] = await Promise.all([friForesporsler(t, orgId), vakterMellom(t, orgId, idag, til), vaktAnsatte(t, orgId), innstillinger(t, orgId)]);
  const navn = (id: string | null) => ansatte.find(a => a.id === id)?.navn ?? 'Ukjent';
  const interessenter = async (v: VaktRad) => {
    const ut: Interessent[] = [];
    for (const id of v.interesse) { const a = ansatte.find(x => x.id === id); if (a) ut.push(await merknadFor(t, orgId, v, a, s)); }
    return ut;
  };
  const ledige = [];
  for (const v of vakter.filter(x => !x.ansattId && x.interesse.length)) ledige.push({ ...v, interessenter: await interessenter(v) });
  const bytte = [];
  for (const v of vakter.filter(x => x.utlagt && x.ansattId)) bytte.push({ ...v, navn: navn(v.ansattId), interessenter: await interessenter(v) });
  return { fri, bytte, ledigeMedInteresse: ledige };
}

export interface ByttRad { id: string; vaktId: string; fraId: string; fraNavn: string; tilId: string; tilNavn: string; status: 'venter_kollega' | 'venter_leder' | 'godkjent' | 'avslatt'; dato: string; start: string; slutt: string; type: string | null; sted: string | null; opprettet: string }

export async function bytter(t: Sporring, orgId: string, valg: { status?: string[]; ansattId?: string } = {}): Promise<ByttRad[]> {
  const p: unknown[] = [orgId]; const w = ['b.organisasjon_id = $1'];
  if (valg.status?.length) { p.push(valg.status); w.push(`b.status = any($${p.length}::text[])`); }
  if (valg.ansattId) { p.push(valg.ansattId); w.push(`(b.fra_ansatt = $${p.length} or b.til_ansatt = $${p.length})`); }
  return (await t.q<{ id: string; vakt_id: string; fra_ansatt: string; fra_navn: string; til_ansatt: string; til_navn: string; status: ByttRad['status']; dato: string; start: string; slutt: string; type: string | null; sted: string | null; opprettet: string }>(
    `select b.id, b.vakt_id, b.fra_ansatt, fa.navn as fra_navn, b.til_ansatt, ta.navn as til_navn, b.status, v.dato::text as dato, v.start::text as start, v.slutt::text as slutt, v.type, v.sted, b.opprettet::text as opprettet
     from vakt_bytte b join vakt v on v.id = b.vakt_id join ansatt fa on fa.id = b.fra_ansatt join ansatt ta on ta.id = b.til_ansatt
     where ${w.join(' and ')} order by b.opprettet desc limit 50`, p))
    .map(x => ({ id: x.id, vaktId: x.vakt_id, fraId: x.fra_ansatt, fraNavn: x.fra_navn, tilId: x.til_ansatt, tilNavn: x.til_navn, status: x.status, dato: x.dato, start: tid(x.start), slutt: tid(x.slutt), type: x.type, sted: x.sted, opprettet: x.opprettet }));
}

/** Det som venter på lederen, samlet (Trenger svar og Forespørsler). */
export async function foresporsler(t: Sporring, orgId: string, idag: string) {
  const [tr, frav, byt] = await Promise.all([trengerSvar(t, orgId, idag), fravaer(t, orgId, { status: 'venter' }), bytter(t, orgId, { status: ['venter_leder'] })]);
  // Fravær «i orden»: ingen vakter i perioden. Da kan det godkjennes uten at noe annet må bestemmes.
  const fravMed = [];
  for (const f of frav) {
    const n = Number((await t.en<{ n: number }>('select count(*)::int as n from vakt where ansatt_id = $1 and dato between $2 and $3 and not slettet', [f.ansattId, f.fra, f.til]))?.n ?? 0);
    fravMed.push({ ...f, vakter: n });
  }
  return { ...tr, fravaer: fravMed, bytteKollega: byt };
}

// ---------- Fravær ----------

const dagerMellom = (fra: string, til: string) => { const ut: string[] = []; for (let d = fra; d <= til && ut.length < 400; d = plussDager(d, 1)) ut.push(d); return ut; };
const hverdager = (fra: string, til: string) => dagerMellom(fra, til).filter(d => { const u = new Date(`${d}T12:00:00Z`).getUTCDay(); return u !== 0 && u !== 6; }).length;

export interface Saldo { ferieTotal: number; ferieBrukt: number; ferieIgjen: number; avspMin: number; egenBrukt: number }

/** Feriedager igjen i år, avspasering til gode og egenmeldingsdager brukt de siste tolv månedene. */
export async function saldo(t: Sporring, orgId: string, ansattId: string, idag: string): Promise<Saldo> {
  const a = await t.en<{ ferie_dager: number; avspasering_min: number }>('select ferie_dager, avspasering_min from ansatt where id = $1 and organisasjon_id = $2', [ansattId, orgId]);
  const aar = idag.slice(0, 4);
  const f = await fravaer(t, orgId, { ansattId, status: 'godkjent' });
  const ferieBrukt = f.filter(x => x.type === 'Ferie' && x.fra.startsWith(aar)).reduce((s, x) => s + hverdager(x.fra, x.til), 0);
  const avspBrukt = f.filter(x => x.type === 'Avspasering').reduce((s, x) => s + x.timerMin, 0);
  const etAar = plussDager(idag, -365);
  const egenBrukt = f.filter(x => x.type === 'Egenmelding' && x.til >= etAar).reduce((s, x) => s + dagerMellom(x.fra < etAar ? etAar : x.fra, x.til).length, 0);
  const total = Number(a?.ferie_dager ?? 25);
  return { ferieTotal: total, ferieBrukt, ferieIgjen: total - ferieBrukt, avspMin: Number(a?.avspasering_min ?? 0) - avspBrukt, egenBrukt };
}

/** Planlagte timer for den ansatte i perioden (det fraværet erstatter). */
async function planlagtMin(t: Sporring, orgId: string, ansattId: string, fra: string, til: string) {
  return (await vakterMellom(t, orgId, fra, til)).filter(v => v.ansattId === ansattId).reduce((s, v) => s + arbeidMin(v), 0);
}

/** Den ansatte søker om fravær. */
export async function soknadFravaer(t: Sporring, orgId: string, ansattId: string, f: { type: string; fra: string; til: string; grunn?: string | null; start?: string | null; slutt?: string | null }, s: VaktInnstillinger) {
  if (!erFravaerstype(f.type) || !s.absence.cfg[f.type].on) throw new RegnskapsFeil('Velg en type fravær.');
  if (!datoOk(f.fra) || !datoOk(f.til) || f.til < f.fra) throw new RegnskapsFeil('Velg fra og til.');
  if (dagerMellom(f.fra, f.til).length > 366) throw new RegnskapsFeil('Perioden er for lang.');
  let timerMin = 0;
  if (f.start && f.slutt && f.fra === f.til) { if (!gyldigTid(f.start) || !gyldigTid(f.slutt)) throw new RegnskapsFeil('Skriv klokkeslett som 08:00.'); timerMin = arbeidMin({ start: f.start, slutt: f.slutt }); }
  return (await t.en<{ id: string }>(`insert into fravaer (organisasjon_id, ansatt_id, fra, til, type, med_lonn, timer_min, grunn) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
    [orgId, ansattId, f.fra, f.til, f.type, s.absence.cfg[f.type].pay, timerMin, f.grunn?.trim().slice(0, 200) || null]))!.id;
}

export interface Behandling {
  kilde: 'fri' | 'fravaer' | 'ny'; id?: string | null; ansattId?: string | null; fra?: string; til?: string;
  avslag?: boolean; type?: string; medLonn?: boolean; handling?: 'ledig' | 'gi' | 'slett'; giTil?: string | null; kommentar?: string | null;
}

/**
 * Lederen godkjenner eller avslår fri eller fravær, eller registrerer fravær selv.
 * Godkjent: fraværet lagres med type, lønn og timer, og vaktene i perioden blir ledige, gis bort eller slettes.
 */
export async function behandleFravaer(t: Sporring, orgId: string, b: Behandling): Promise<{ ansattId: string; navn: string; type: string; medLonn: boolean; vakter: number; handling: string; giTilNavn: string | null; fra: string; til: string; nyttFravaer: string | null }> {
  let ansattId: string, fra: string, til: string, friId: string | null = null, fravId: string | null = null, grunn: string | null = null;
  if (b.kilde === 'fri') {
    const f = await t.en<{ ansatt_id: string; dato: string; grunn: string | null }>(`select ansatt_id, dato::text as dato, grunn from fri_foresporsel where id = $1 and organisasjon_id = $2 and status = 'venter'`, [b.id, orgId]);
    if (!f) throw new RegnskapsFeil('Forespørselen er allerede besvart.');
    ansattId = f.ansatt_id; fra = til = f.dato; friId = b.id!; grunn = f.grunn;
  } else if (b.kilde === 'fravaer') {
    const f = await t.en<{ ansatt_id: string; fra: string; til: string; grunn: string | null }>(`select ansatt_id, fra::text as fra, til::text as til, grunn from fravaer where id = $1 and organisasjon_id = $2 and status = 'venter'`, [b.id, orgId]);
    if (!f) throw new RegnskapsFeil('Forespørselen er allerede besvart.');
    ansattId = f.ansatt_id; fra = f.fra; til = f.til; fravId = b.id!; grunn = f.grunn;
  } else {
    if (!b.ansattId || !b.fra || !datoOk(b.fra)) throw new RegnskapsFeil('Velg ansatt og dato.');
    ansattId = b.ansattId; fra = b.fra; til = b.til && datoOk(b.til) && b.til >= b.fra ? b.til : b.fra;
    await sjekkAnsatt(t, orgId, ansattId);
  }
  const navn = (await t.en<{ navn: string }>('select navn from ansatt where id = $1', [ansattId]))!.navn;
  const svar = b.kommentar?.trim().slice(0, 300) || null;
  if (b.avslag) {
    if (friId) await t.q(`update fri_foresporsel set status = 'avslatt' where id = $1`, [friId]);
    if (fravId) await t.q(`update fravaer set status = 'avslatt', svar = $2 where id = $1`, [fravId, svar]);
    return { ansattId, navn, type: 'avslag', medLonn: false, vakter: 0, handling: 'avslag', giTilNavn: null, fra, til, nyttFravaer: null };
  }
  const type = b.type && erFravaerstype(b.type) ? b.type : 'Fri uten lønn';
  const medLonn = typeof b.medLonn === 'boolean' ? b.medLonn : FRAVAER_LONN[type as Fravaerstype];
  const timerMin = await planlagtMin(t, orgId, ansattId, fra, til);
  const vakter = (await vakterMellom(t, orgId, fra, til)).filter(v => v.ansattId === ansattId);
  const handling = b.handling ?? 'ledig';
  if (handling === 'gi' && vakter.length && !b.giTil) throw new RegnskapsFeil('Velg hvem som skal ta vakten.');
  let nyttFravaer: string | null = null;
  if (fravId) await t.q(`update fravaer set status = 'godkjent', type = $2, med_lonn = $3, timer_min = $4, svar = $5 where id = $1`, [fravId, type, medLonn, timerMin, svar]);
  else fravId = nyttFravaer = (await t.en<{ id: string }>(`insert into fravaer (organisasjon_id, ansatt_id, fra, til, type, med_lonn, timer_min, status, grunn, svar, fri_id) values ($1,$2,$3,$4,$5,$6,$7,'godkjent',$8,$9,$10) returning id`,
    [orgId, ansattId, fra, til, type, medLonn, timerMin, grunn, svar, friId]))!.id;
  if (friId) await t.q(`update fri_foresporsel set status = 'godkjent' where id = $1`, [friId]);
  for (const d of dagerMellom(fra, til)) {
    await t.q(`insert into tilgjengelighet (organisasjon_id, ansatt_id, dato, status, grunn) values ($1,$2,$3,'kan_ikke',$4)
      on conflict (ansatt_id, dato) do update set status = 'kan_ikke', grunn = excluded.grunn, timer = null`, [orgId, ansattId, d, type]);
  }
  let giTilNavn: string | null = null;
  if (handling === 'gi' && b.giTil) { await sjekkAnsatt(t, orgId, b.giTil); giTilNavn = (await t.en<{ navn: string }>('select navn from ansatt where id = $1', [b.giTil]))!.navn; }
  for (const v of vakter) {
    if (handling === 'slett') await slettVakt(t, orgId, v.id);
    else if (handling === 'gi' && b.giTil) await tildel(t, orgId, v.id, b.giTil);
    else await gjorLedig(t, orgId, v.id);
  }
  return { ansattId, navn, type, medLonn, vakter: vakter.length, handling, giTilNavn, fra, til, nyttFravaer };
}

// ---------- Bytter mellom kolleger ----------

/** Den ansatte vil bytte en vakt med en bestemt kollega. Kollegaen svarer først. */
export async function byttMed(t: Sporring, orgId: string, ansattId: string, vaktId: string, tilAnsatt: string) {
  const v = await t.en<{ id: string }>('select id from vakt where id = $1 and organisasjon_id = $2 and ansatt_id = $3 and not slettet', [vaktId, orgId, ansattId]);
  if (!v) throw new RegnskapsFeil('Fant ikke vakten din.');
  if (tilAnsatt === ansattId) throw new RegnskapsFeil('Velg en kollega.');
  await sjekkAnsatt(t, orgId, tilAnsatt);
  await t.q(`update vakt_bytte set status = 'avslatt' where vakt_id = $1 and status in ('venter_kollega','venter_leder')`, [vaktId]);
  return (await t.en<{ id: string }>('insert into vakt_bytte (organisasjon_id, vakt_id, fra_ansatt, til_ansatt) values ($1,$2,$3,$4) returning id', [orgId, vaktId, ansattId, tilAnsatt]))!.id;
}

async function overfor(t: Sporring, orgId: string, byttId: string) {
  const b = await t.en<{ vakt_id: string; til_ansatt: string; fra_ansatt: string }>('select vakt_id, til_ansatt, fra_ansatt from vakt_bytte where id = $1', [byttId]);
  if (!b) throw new RegnskapsFeil('Fant ikke byttet.');
  const v = await hentVakt(t, orgId, b.vakt_id);
  await t.q('update vakt set ansatt_id = $2, utlagt = false where id = $1', [b.vakt_id, b.til_ansatt]);
  await upublisert(t, b.vakt_id);
  await t.q('delete from vakt_interesse where vakt_id = $1', [b.vakt_id]);
  await t.q(`update vakt_bytte set status = 'godkjent' where id = $1`, [byttId]);
  await merkEndret(t, orgId, v.dato, [b.fra_ansatt, b.til_ansatt]);
}

/** Kollegaen svarer ja eller nei. Ja går til lederen hvis lederen må godkjenne, ellers byttes vakten med en gang. */
export async function svarBytte(t: Sporring, orgId: string, ansattId: string, byttId: string, ja: boolean, maGodkjennes: boolean): Promise<'venter_leder' | 'godkjent' | 'avslatt'> {
  const b = await t.en<{ id: string }>(`select id from vakt_bytte where id = $1 and organisasjon_id = $2 and til_ansatt = $3 and status = 'venter_kollega'`, [byttId, orgId, ansattId]);
  if (!b) throw new RegnskapsFeil('Byttet er allerede besvart.');
  if (!ja) { await t.q(`update vakt_bytte set status = 'avslatt' where id = $1`, [byttId]); return 'avslatt'; }
  if (maGodkjennes) { await t.q(`update vakt_bytte set status = 'venter_leder' where id = $1`, [byttId]); return 'venter_leder'; }
  await overfor(t, orgId, byttId);
  return 'godkjent';
}

export async function lederBytte(t: Sporring, orgId: string, byttId: string, godkjenn: boolean) {
  const b = await t.en<{ id: string }>(`select id from vakt_bytte where id = $1 and organisasjon_id = $2 and status = 'venter_leder'`, [byttId, orgId]);
  if (!b) throw new RegnskapsFeil('Byttet er allerede besvart.');
  if (godkjenn) await overfor(t, orgId, byttId);
  else await t.q(`update vakt_bytte set status = 'avslatt' where id = $1`, [byttId]);
}

// ---------- Den ansatte ----------

export async function ansattForBruker(t: Sporring, orgId: string, brukerId: string) {
  return t.en<{ id: string; navn: string; lonn_type: string; stillingsprosent: number }>('select id, navn, lonn_type, stillingsprosent from ansatt where organisasjon_id = $1 and bruker_id = $2 and aktiv and i_vaktplan', [orgId, brukerId]);
}

export async function settInteresse(t: Sporring, orgId: string, ansattId: string, vaktId: string, pa: boolean) {
  const v = await t.en<{ ansatt_id: string | null; utlagt: boolean }>('select ansatt_id, utlagt from vakt where id = $1 and organisasjon_id = $2 and not slettet', [vaktId, orgId]);
  if (!v || (v.ansatt_id && !v.utlagt) || v.ansatt_id === ansattId) throw new RegnskapsFeil('Vakten er ikke ledig lenger.');
  if (pa) await t.q('insert into vakt_interesse (vakt_id, ansatt_id) values ($1,$2) on conflict do nothing', [vaktId, ansattId]);
  else await t.q('delete from vakt_interesse where vakt_id = $1 and ansatt_id = $2', [vaktId, ansattId]);
}

/** Gi bort en vakt: den legges ut, og kolleger kan melde interesse. Fristen kommer fra innstillingene. */
export async function byttBort(t: Sporring, orgId: string, ansattId: string, vaktId: string, pa: boolean, fristTimer = 0, naa = new Date()) {
  if (pa && fristTimer > 0) {
    const v = await t.en<{ dato: string; start: string }>('select dato::text as dato, start::text as start from vakt where id = $1 and organisasjon_id = $2', [vaktId, orgId]);
    if (v && new Date(`${v.dato}T${tid(v.start)}:00`).getTime() - naa.getTime() < fristTimer * 3600000) throw new RegnskapsFeil(`Vakten må gis bort minst ${fristTimer} timer før den starter. Snakk med lederen.`);
  }
  const r = await t.en<{ id: string }>('update vakt set utlagt = $4 where id = $1 and organisasjon_id = $2 and ansatt_id = $3 and not slettet returning id', [vaktId, orgId, ansattId, pa]);
  if (!r) throw new RegnskapsFeil('Fant ikke vakten din.');
  if (!pa) await t.q('delete from vakt_interesse where vakt_id = $1', [vaktId]);
}

/** Kan / kan ikke / ikke satt. «Kan ikke» på en dag med vakt blir en forespørsel om fri. */
export async function settTilgjengelig(t: Sporring, orgId: string, ansattId: string, dato: string, status: 'kan' | 'kan_ikke' | null, grunn?: string | null, timer?: Record<string, 'kan' | 'kan_ikke'> | null): Promise<{ friForesporsel: boolean }> {
  if (!datoOk(dato)) throw new RegnskapsFeil('Ugyldig dato.');
  const g = grunn?.trim().slice(0, 120) || null;
  const tm = timer && Object.keys(timer).length ? JSON.stringify(timer) : null;
  if (!status) await t.q('delete from tilgjengelighet where ansatt_id = $1 and dato = $2', [ansattId, dato]);
  else await t.q(`insert into tilgjengelighet (organisasjon_id, ansatt_id, dato, status, grunn, timer) values ($1,$2,$3,$4,$5,$6) on conflict (ansatt_id, dato) do update set status = excluded.status, grunn = excluded.grunn, timer = excluded.timer`, [orgId, ansattId, dato, status, g, tm]);
  // Ombestemt seg: trekk ventende forespørsel.
  if (status !== 'kan_ikke' || tm) { await t.q(`delete from fri_foresporsel where ansatt_id = $1 and dato = $2 and status = 'venter'`, [ansattId, dato]); if (status !== 'kan_ikke') return { friForesporsel: false }; }
  const harVakt = await t.en('select 1 from vakt where ansatt_id = $1 and dato = $2 and not slettet', [ansattId, dato]);
  if (!harVakt || tm) return { friForesporsel: false };
  const finnes = await t.en<{ id: string }>(`select id from fri_foresporsel where ansatt_id = $1 and dato = $2 and status = 'venter'`, [ansattId, dato]);
  if (finnes) await t.q('update fri_foresporsel set grunn = $2 where id = $1', [finnes.id, g]);
  else await t.q('insert into fri_foresporsel (organisasjon_id, ansatt_id, dato, grunn) values ($1,$2,$3,$4)', [orgId, ansattId, dato, g]);
  return { friForesporsel: true };
}

/** Den ansatte skriver en kommentar på sin egen vakt. */
export async function kommenter(t: Sporring, orgId: string, ansattId: string, vaktId: string, tekst: string) {
  const r = await t.en<{ id: string }>('update vakt set ansatt_kommentar = $4 where id = $1 and organisasjon_id = $2 and ansatt_id = $3 returning id', [vaktId, orgId, ansattId, tekst.trim().slice(0, 500) || null]);
  if (!r) throw new RegnskapsFeil('Fant ikke vakten din.');
}

export async function lagreOversikt(t: Sporring, orgId: string, ansattId: string, blokker: unknown) {
  const ok = Array.isArray(blokker) ? blokker.filter(b => b && typeof b === 'object').slice(0, 6).map(b => ({ id: String((b as { id: unknown }).id).slice(0, 20), visible: !!(b as { visible: unknown }).visible, count: (b as { count?: unknown }).count == null ? undefined : Math.min(5, Math.max(1, Number((b as { count: unknown }).count) || 3)) })) : [];
  await t.q('update ansatt set oversikt = $3 where id = $1 and organisasjon_id = $2', [ansattId, orgId, JSON.stringify(ok)]);
}

// ---------- Ansatte og tilgang ----------

export interface NyAnsatt { id?: string; navn: string; kontakt?: string | null; stilling?: string | null; lonnType: 'fast' | 'time'; stillingsprosent: number; sats: number }

/** Legger til eller endrer en ansatt fra vaktplanen. Den samme raden brukes i Lønn. */
export async function lagreVaktAnsatt(t: Sporring, orgId: string, a: NyAnsatt): Promise<string> {
  const navn = a.navn.trim();
  if (navn.length < 2) throw new RegnskapsFeil('Skriv navnet.');
  const kontakt = a.kontakt?.trim() || null;
  const epost = kontakt && kontakt.includes('@') ? kontakt.toLowerCase() : null;
  if (epost && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(epost)) throw new RegnskapsFeil('E-postadressen ser ikke riktig ut.');
  if (kontakt && !epost && !/^\+?[\d ]{8,15}$/.test(kontakt)) throw new RegnskapsFeil('Skriv et mobilnummer eller en e-postadresse.');
  const pst = Math.min(100, Math.max(1, Math.round(Number(a.stillingsprosent) || 100)));
  const sats = Math.max(0, Math.round(Number(a.sats) || 0));
  if (a.id) {
    const r = await t.en<{ id: string }>(`update ansatt set navn = $3, kontakt = $4, epost = coalesce($5, epost), stilling = $6, lonn_type = $7, stillingsprosent = $8,
      manedslonn = case when $7 = 'fast' then $9 else manedslonn end, timesats = case when $7 = 'time' then $9 else timesats end where id = $1 and organisasjon_id = $2 returning id`,
      [a.id, orgId, navn, kontakt, epost, a.stilling?.trim() || null, a.lonnType, pst, sats]);
    if (!r) throw new RegnskapsFeil('Fant ikke den ansatte.');
    return r.id;
  }
  return (await t.en<{ id: string }>(`insert into ansatt (organisasjon_id, navn, kontakt, epost, mobil, stilling, lonn_type, stillingsprosent, manedslonn, timesats) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
    [orgId, navn, kontakt, epost, kontakt && !epost ? kontakt : null, a.stilling?.trim() || null, a.lonnType, pst, a.lonnType === 'fast' ? sats : 0, a.lonnType === 'time' ? sats : 0]))!.id;
}

const EPOST = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Ny ansatt fra «Inviter ansatt». E-post er påkrevd, for det er dit lenken sendes. */
export async function nyAnsatt(t: Sporring, orgId: string, a: { navn: string; epost: string; mobil?: string | null; stilling?: string | null; lonnType: 'fast' | 'time'; stillingsprosent: number }): Promise<string> {
  const navn = a.navn.trim(), epost = a.epost.trim().toLowerCase(), mobil = a.mobil?.trim() || null;
  if (!navn) throw new RegnskapsFeil('Skriv inn navnet til den ansatte.');
  if (!EPOST.test(epost)) throw new RegnskapsFeil('Skriv inn en gyldig e-postadresse.');
  if (mobil && !/^\+?[\d ]{8,15}$/.test(mobil)) throw new RegnskapsFeil('Mobilnummeret ser ikke riktig ut.');
  if (await t.en(`select 1 from ansatt where organisasjon_id = $1 and aktiv and i_vaktplan and lower(coalesce(epost, kontakt, '')) = $2`, [orgId, epost])) throw new RegnskapsFeil('Denne e-postadressen er allerede i bruk.');
  const pst = a.lonnType === 'time' ? 100 : Math.min(100, Math.max(10, Math.round((Number(a.stillingsprosent) || 100) / 10) * 10));
  // Er personen her fra før (fjernet fra vaktplanen, men fortsatt i Lønn), tas den samme raden i bruk igjen.
  const gammel = await t.en<{ id: string }>(`select id from ansatt where organisasjon_id = $1 and aktiv and not i_vaktplan and lower(coalesce(epost, kontakt, '')) = $2`, [orgId, epost]);
  if (gammel) {
    await t.q('update ansatt set i_vaktplan = true, navn = $3, mobil = coalesce($4, mobil), stilling = coalesce($5, stilling), lonn_type = $6, stillingsprosent = $7 where id = $1 and organisasjon_id = $2', [gammel.id, orgId, navn, mobil, a.stilling?.trim() || null, a.lonnType, pst]);
    return gammel.id;
  }
  return (await t.en<{ id: string }>(`insert into ansatt (organisasjon_id, navn, kontakt, epost, mobil, stilling, lonn_type, stillingsprosent) values ($1,$2,$3,$3,$4,$5,$6,$7) returning id`,
    [orgId, navn, epost, mobil, a.stilling?.trim().slice(0, 40) || null, a.lonnType, pst]))!.id;
}

/** Administrer ansatt: stilling, avtale, kontakt og saldo. */
export async function oppdaterAnsatt(t: Sporring, orgId: string, id: string, a: { stilling?: string | null; lonnType: 'fast' | 'time'; stillingsprosent: number; epost?: string | null; mobil?: string | null; ferieDager?: number; avspTimer?: number }) {
  const epost = a.epost?.trim().toLowerCase() || null, mobil = a.mobil?.trim() || null;
  if (epost && !EPOST.test(epost)) throw new RegnskapsFeil('Skriv inn en gyldig e-postadresse.');
  if (mobil && !/^\+?[\d ]{8,15}$/.test(mobil)) throw new RegnskapsFeil('Mobilnummeret ser ikke riktig ut.');
  if (epost && await t.en(`select 1 from ansatt where organisasjon_id = $1 and id <> $2 and aktiv and i_vaktplan and lower(coalesce(epost, kontakt, '')) = $3`, [orgId, id, epost])) throw new RegnskapsFeil('Denne e-postadressen er allerede i bruk.');
  const pst = a.lonnType === 'time' ? 100 : Math.min(100, Math.max(1, Math.round(Number(a.stillingsprosent) || 100)));
  const r = await t.en<{ id: string }>(`update ansatt set stilling = $3, lonn_type = $4, stillingsprosent = $5, epost = coalesce($6, epost), kontakt = case when $6::text is not null then $6 else kontakt end, mobil = $7,
      ferie_dager = coalesce($8, ferie_dager), avspasering_min = coalesce($9, avspasering_min) where id = $1 and organisasjon_id = $2 returning id`,
    [id, orgId, a.stilling?.trim().slice(0, 40) || null, a.lonnType, pst, epost, mobil, a.ferieDager == null ? null : Math.max(0, Math.min(60, Number(a.ferieDager) || 0)), a.avspTimer == null ? null : Math.round(Number(a.avspTimer) * 60) || 0]);
  if (!r) throw new RegnskapsFeil('Fant ikke den ansatte.');
}

/**
 * Gir den ansatte en innloggingslenke til vaktplanen (uten passord).
 * Den ansatte får en egen bruker med rollen «ansatt», som bare ser vaktplanen sin.
 */
export async function inviterAnsatt(t: Sporring, orgId: string, ansattId: string): Promise<{ token: string; epost: string | null; navn: string; kontakt: string | null }> {
  const a = await t.en<{ id: string; navn: string; epost: string | null; kontakt: string | null; bruker_id: string | null }>('select id, navn, epost, kontakt, bruker_id from ansatt where id = $1 and organisasjon_id = $2 and aktiv', [ansattId, orgId]);
  if (!a) throw new RegnskapsFeil('Fant ikke den ansatte.');
  const epost = a.epost ?? (a.kontakt?.includes('@') ? a.kontakt.toLowerCase() : null);
  let brukerId = a.bruker_id;
  if (!brukerId) {
    // Finnes det allerede en bruker med e-posten (f.eks. i et annet firma), gjenbrukes den.
    const finnes = epost ? await t.en<{ id: string }>('select id from bruker where epost = $1', [epost]) : null;
    brukerId = finnes?.id ?? (await t.en<{ id: string }>(`insert into bruker (epost, navn, passord_hash, epost_bekreftet) values ($1,$2,'!',true) returning id`, [epost ?? `ansatt-${a.id}@vakt.invalid`, a.navn]))!.id;
  }
  await t.q(`insert into medlemskap (bruker_id, organisasjon_id, rolle) values ($1,$2,'ansatt') on conflict (bruker_id, organisasjon_id) do nothing`, [brukerId, orgId]);
  await t.q(`update ansatt set bruker_id = $3, i_vaktplan = true, tilgang = case when tilgang = 'aktiv' then 'aktiv' else 'invitert' end where id = $1 and organisasjon_id = $2`, [a.id, orgId, brukerId]);
  return { token: await nyLenke(t, a.id), epost, navn: a.navn, kontakt: a.kontakt };
}

/** Ny innloggingslenke til vaktplanen. Eldre lenker virker til de er 7 dager gamle. */
export async function nyLenke(t: Sporring, ansattId: string): Promise<string> {
  const token = randomBytes(24).toString('base64url');
  await t.q('insert into vakt_lenke (token_hash, ansatt_id) values ($1,$2)', [tokenHash(token), ansattId]);
  return token;
}

/** Lenken fra e-posten: finn den ansatte og marker at hen har logget inn. Lenken gjelder i 7 dager. */
export async function apneLenke(t: Sporring, token: string): Promise<{ brukerId: string; orgId: string } | null> {
  const a = await t.en<{ id: string; bruker_id: string; organisasjon_id: string }>(
    `select a.id, a.bruker_id, a.organisasjon_id from vakt_lenke l join ansatt a on a.id = l.ansatt_id
     where l.token_hash = $1 and a.aktiv and a.i_vaktplan and a.bruker_id is not null and l.opprettet > now() - interval '7 days'`, [tokenHash(token)]);
  if (!a) return null;
  await t.q(`update ansatt set tilgang = 'aktiv', sist_inne = now() where id = $1`, [a.id]);
  return { brukerId: a.bruker_id, orgId: a.organisasjon_id };
}

/** Tilbakestill innlogging: gamle lenker slutter å virke, og den ansatte logges ut overalt. Gir en ny lenke. */
export async function tilbakestillInnlogging(t: Sporring, orgId: string, ansattId: string): Promise<string> {
  const a = await t.en<{ bruker_id: string | null }>('select bruker_id from ansatt where id = $1 and organisasjon_id = $2 and aktiv', [ansattId, orgId]);
  if (!a) throw new RegnskapsFeil('Fant ikke den ansatte.');
  await t.q('delete from vakt_lenke where ansatt_id = $1', [ansattId]);
  if (!a.bruker_id) return (await inviterAnsatt(t, orgId, ansattId)).token;
  await t.q('delete from sesjon where bruker_id = $1 and organisasjon_id = $2', [a.bruker_id, orgId]);
  return nyLenke(t, ansattId);
}

/** Fjerner den ansatte fra vaktplanen. Kommende vakter blir ledige og upubliserte. Timer, fravær og lønn blir liggende. */
export async function fjernFraVaktplan(t: Sporring, orgId: string, ansattId: string, idag: string): Promise<{ ledige: string[] }> {
  const a = await t.en<{ bruker_id: string | null }>('select bruker_id from ansatt where id = $1 and organisasjon_id = $2 and aktiv and i_vaktplan', [ansattId, orgId]);
  if (!a) throw new RegnskapsFeil('Fant ikke den ansatte.');
  const vakter = await t.q<{ id: string; dato: string }>('select id, dato::text as dato from vakt where organisasjon_id = $1 and ansatt_id = $2 and dato >= $3 and not slettet', [orgId, ansattId, idag]);
  for (const v of vakter) {
    await t.q('update vakt set ansatt_id = null, utlagt = false, ikke_publisert = true where id = $1', [v.id]);
    await t.q('delete from vakt_interesse where vakt_id = $1', [v.id]);
    await merkEndret(t, orgId, v.dato, [ansattId]);
  }
  await t.q('delete from vakt_interesse where ansatt_id = $1', [ansattId]);
  await t.q(`update vakt_bytte set status = 'avslatt' where (fra_ansatt = $1 or til_ansatt = $1) and status in ('venter_kollega','venter_leder')`, [ansattId]);
  await t.q('delete from vakt_lenke where ansatt_id = $1', [ansattId]);
  if (a.bruker_id) {
    await t.q('delete from sesjon where bruker_id = $1 and organisasjon_id = $2', [a.bruker_id, orgId]);
    await t.q(`delete from medlemskap where bruker_id = $1 and organisasjon_id = $2 and rolle = 'ansatt'`, [a.bruker_id, orgId]);
  }
  await t.q(`update ansatt set i_vaktplan = false, tilgang = 'ingen' where id = $1`, [ansattId]);
  return { ledige: vakter.map(v => v.id) };
}

/** Overtidstillegg for hele firmaet (40, 50 eller 100 %). */
export async function settOvertid(t: Sporring, orgId: string, prosent: number) {
  if (![40, 50, 100].includes(prosent)) throw new RegnskapsFeil('Velg 40, 50 eller 100 %.');
  await t.q('update ansatt set overtid_prosent = $2 where organisasjon_id = $1', [orgId, prosent]);
  const s = await innstillinger(t, orgId);
  await t.q('update organisasjon set vakt_innstillinger = $2 where id = $1', [orgId, JSON.stringify({ ...s, ot: { ...s.ot, add: prosent } })]);
}

// ---------- Timer og avvik ----------

export interface AvvikRad { id: string; ansattId: string; vaktId: string | null; dato: string; start: string | null; slutt: string | null; tekst: string | null; diffMin: number }

export async function avvik(t: Sporring, orgId: string, fra: string, til: string, ansattId?: string): Promise<AvvikRad[]> {
  const r = await t.q<{ id: string; ansatt_id: string; vakt_id: string | null; dato: string; start: string | null; slutt: string | null; tekst: string | null; vstart: string | null; vslutt: string | null }>(
    `select a.id, a.ansatt_id, a.vakt_id, a.dato::text as dato, a.start::text as start, a.slutt::text as slutt, a.tekst, v.start::text as vstart, v.slutt::text as vslutt
     from timeavvik a left join vakt v on v.id = a.vakt_id where a.organisasjon_id = $1 and a.dato between $2 and $3 ${ansattId ? 'and a.ansatt_id = $4' : ''} order by a.dato`,
    ansattId ? [orgId, fra, til, ansattId] : [orgId, fra, til]);
  return r.map(x => {
    const diff = x.start && x.slutt && x.vstart && x.vslutt ? arbeidMin({ start: tid(x.start), slutt: tid(x.slutt) }) - arbeidMin({ start: tid(x.vstart), slutt: tid(x.vslutt) }) : 0;
    return { id: x.id, ansattId: x.ansatt_id, vaktId: x.vakt_id, dato: x.dato, start: x.start ? tid(x.start) : null, slutt: x.slutt ? tid(x.slutt) : null, tekst: x.tekst, diffMin: diff };
  });
}

/** Den ansatte melder at timene ble annerledes enn planlagt. */
export async function meldAvvik(t: Sporring, orgId: string, ansattId: string, a: { vaktId: string; start?: string | null; slutt?: string | null; tekst?: string | null }) {
  const v = await t.en<{ dato: string }>('select dato::text as dato from vakt where id = $1 and organisasjon_id = $2 and ansatt_id = $3', [a.vaktId, orgId, ansattId]);
  if (!v) throw new RegnskapsFeil('Velg en av vaktene dine.');
  if ((a.start && !gyldigTid(a.start)) || (a.slutt && !gyldigTid(a.slutt))) throw new RegnskapsFeil('Skriv klokkeslett som 17:00.');
  const u = isoUke(v.dato);
  if (await t.en('select 1 from timeliste where ansatt_id = $1 and aar = $2 and uke = $3', [ansattId, u.aar, u.uke])) throw new RegnskapsFeil('Timene for den uka er allerede godkjent. Snakk med lederen.');
  if (!a.start && !a.slutt && !a.tekst?.trim()) throw new RegnskapsFeil('Skriv hva som var annerledes.');
  await t.q('delete from timeavvik where vakt_id = $1 and ansatt_id = $2', [a.vaktId, ansattId]);
  await t.q('insert into timeavvik (organisasjon_id, ansatt_id, vakt_id, dato, start, slutt, tekst) values ($1,$2,$3,$4,$5,$6,$7)', [orgId, ansattId, a.vaktId, v.dato, a.start || null, a.slutt || null, a.tekst?.trim().slice(0, 300) || null]);
}

/** «Fredag 2. okt: 30 min lenger enn planlagt» */
export function avvikTekst(a: AvvikRad): string {
  const x = new Date(`${a.dato}T12:00:00Z`);
  const mnd = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'][x.getUTCMonth()];
  const dag = ukedag(a.dato);
  const hva = a.diffMin > 0 ? `${a.diffMin} min lenger enn planlagt` : a.diffMin < 0 ? `${-a.diffMin} min kortere enn planlagt` : (a.tekst ?? 'avvik');
  return `${dag[0].toUpperCase()}${dag.slice(1)} ${x.getUTCDate()}. ${mnd}: ${hva}`;
}

export interface TimeRad { ansattId: string; navn: string; lonnType: string; arbeid: number; overtid: number; fravaer: number; fravaerUten: number; avvik: AvvikRad[]; status: 'venter' | 'godkjent' }
export interface Timeliste { aar: number; uke: number; rader: TimeRad[] }

/** Timene for en uke per ansatt: planlagt, justert for avvik, pluss fravær med lønn (ikke ferie). */
export async function timerForUke(t: Sporring, orgId: string, aar: number, uke: number): Promise<TimeRad[]> {
  const d = ukeDager(aar, uke);
  const [ansatte, vakter, av, frav, godkjent, s] = await Promise.all([
    vaktAnsatte(t, orgId, true), vakterMellom(t, orgId, d[0], d[6]), avvik(t, orgId, d[0], d[6]), fravaer(t, orgId, { fra: d[0], til: d[6], status: 'godkjent' }),
    t.q<{ ansatt_id: string; arbeid_min: number; overtid_min: number; fravaer_min: number; fravaer_uten_min: number }>('select ansatt_id, arbeid_min, overtid_min, fravaer_min, fravaer_uten_min from timeliste where organisasjon_id = $1 and aar = $2 and uke = $3', [orgId, aar, uke]),
    innstillinger(t, orgId),
  ]);
  // Faktiske tider der den ansatte har meldt avvik.
  const faktisk = vakter.filter(v => v.ansattId).map(v => { const a = av.find(x => x.vaktId === v.id && (x.start || x.slutt)); return a ? { ...v, start: a.start ?? v.start, slutt: a.slutt ?? v.slutt } : v; });
  const r = analyserUke(faktisk, ansatte, grenser(s));
  const ut: TimeRad[] = [];
  for (const a of ansatte) {
    const g = godkjent.find(x => x.ansatt_id === a.id);
    // Fravær med lønn (ikke ferie, som dekkes av feriepenger) betales som timer. Fravær uten lønn trekkes for fastlønnede.
    const fravaerMin = frav.filter(f => f.ansattId === a.id && f.medLonn && f.type !== 'Ferie').reduce((sum, f) => sum + f.timerMin, 0);
    const utenMin = frav.filter(f => f.ansattId === a.id && !f.medLonn).reduce((sum, f) => sum + f.timerMin, 0);
    if (g) { ut.push({ ansattId: a.id, navn: a.navn, lonnType: a.lonnType, arbeid: Number(g.arbeid_min), overtid: Number(g.overtid_min), fravaer: Number(g.fravaer_min), fravaerUten: Number(g.fravaer_uten_min ?? 0), avvik: av.filter(x => x.ansattId === a.id), status: 'godkjent' }); continue; }
    const p = r.perAnsatt.get(a.id)!;
    if (p.arbeid <= 0 && fravaerMin <= 0 && utenMin <= 0) continue;
    ut.push({ ansattId: a.id, navn: a.navn, lonnType: a.lonnType, arbeid: p.arbeid, overtid: p.overtid, fravaer: fravaerMin, fravaerUten: utenMin, avvik: av.filter(x => x.ansattId === a.id), status: 'venter' });
  }
  return ut;
}

/** Ferdige uker med timer som ikke er godkjent til lønn ennå (de siste åtte ukene). */
export async function ventendeTimelister(t: Sporring, orgId: string, idag: string): Promise<Timeliste[]> {
  const ut: Timeliste[] = [];
  let u = flyttUke(isoUke(idag).aar, isoUke(idag).uke, -1);
  for (let i = 0; i < 8; i++, u = flyttUke(u.aar, u.uke, -1)) {
    const rader = (await timerForUke(t, orgId, u.aar, u.uke)).filter(r => r.status === 'venter');
    if (rader.length) ut.push({ aar: u.aar, uke: u.uke, rader });
  }
  return ut;
}

/**
 * Godkjenner timene for en uke. `hvem`: bestemte ansatte, «stemmer» (de uten avvik) eller alle.
 * Godkjente timer går til Lønn.
 */
export async function godkjennTimeliste(t: Sporring, orgId: string, aar: number, uke: number, hvem: string[] | 'stemmer' | 'alle' = 'alle'): Promise<number> {
  const rader = (await timerForUke(t, orgId, aar, uke)).filter(r => r.status === 'venter' && (hvem === 'alle' || (hvem === 'stemmer' ? !r.avvik.length : hvem.includes(r.ansattId))));
  if (!rader.length) throw new RegnskapsFeil('Ingen timer å godkjenne for denne uka.');
  for (const r of rader) await t.q('insert into timeliste (organisasjon_id, ansatt_id, aar, uke, arbeid_min, overtid_min, fravaer_min, fravaer_uten_min) values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict do nothing', [orgId, r.ansattId, aar, uke, r.arbeid, r.overtid, r.fravaer, r.fravaerUten]);
  return rader.length;
}

/** Godkjenn automatisk timer som stemmer med vaktene (når lederen har slått det på). */
export async function autoGodkjenn(t: Sporring, orgId: string, idag: string) {
  for (const l of await ventendeTimelister(t, orgId, idag)) {
    if (l.rader.some(r => !r.avvik.length)) await godkjennTimeliste(t, orgId, l.aar, l.uke, 'stemmer').catch(() => 0);
  }
}

export interface TimerTilLonn { timer: number; overtid: number; fravaerMed: number; fravaerUten: number; uker: number[] }

/**
 * Godkjente timer som ikke er brukt i en lønnskjøring: forslag i Kjør lønn.
 * timer = arbeidede timer (overtiden er med), fravaerMed = fravær med lønn (ikke ferie), fravaerUten = fravær uten lønn.
 * Tom når lederen har slått av koblingen til Lønn under Innstillinger i vaktplanen.
 */
export async function godkjenteTimer(t: Sporring, orgId: string): Promise<Record<string, TimerTilLonn>> {
  const inn = await innstillinger(t, orgId);
  if (!inn.lonn.on) return {};
  const r = await t.q<{ ansatt_id: string; arbeid_min: number; overtid_min: number; fravaer_min: number; fravaer_uten_min: number; uke: number }>(`select ansatt_id, arbeid_min, overtid_min, fravaer_min, fravaer_uten_min, uke from timeliste where organisasjon_id = $1 and status = 'godkjent' order by aar, uke`, [orgId]);
  const ut: Record<string, TimerTilLonn> = {};
  const h = (min: unknown) => Number(min ?? 0) / 60;
  for (const x of r) {
    const e = ut[x.ansatt_id] ??= { timer: 0, overtid: 0, fravaerMed: 0, fravaerUten: 0, uker: [] };
    e.timer += h(x.arbeid_min); e.overtid += h(x.overtid_min);
    if (inn.lonn.fravaer) { e.fravaerMed += h(x.fravaer_min); e.fravaerUten += h(x.fravaer_uten_min); }
    e.uker.push(Number(x.uke));
  }
  const rund = (n: number) => Math.round(n * 100) / 100;
  for (const e of Object.values(ut)) { e.timer = rund(e.timer); e.overtid = rund(e.overtid); e.fravaerMed = rund(e.fravaerMed); e.fravaerUten = rund(e.fravaerUten); }
  return ut;
}

/** Etter lønnskjøring: timelistene er brukt. */
export async function merkTimerBrukt(t: Sporring, orgId: string, lonnskjoringId: string, ansattIder: string[]) {
  if (!ansattIder.length) return;
  await t.q(`update timeliste set status = 'brukt', lonnskjoring_id = $2 where organisasjon_id = $1 and status = 'godkjent' and ansatt_id = any($3::uuid[])`, [orgId, lonnskjoringId, ansattIder]);
}

/** Timer en ansatt har i en måned (fra vaktene), til «Timer okt.» under Ansatte. */
export async function timerIMaaned(t: Sporring, orgId: string, maaned: string): Promise<Record<string, number>> {
  const [y, m] = maaned.split('-').map(Number);
  const fra = `${maaned}-01`, til = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const ut: Record<string, number> = {};
  for (const v of await vakterMellom(t, orgId, fra, til)) if (v.ansattId) ut[v.ansattId] = (ut[v.ansattId] ?? 0) + arbeidMin(v);
  return ut;
}

export { arbeidMin, avtaltMin, timerTall };
