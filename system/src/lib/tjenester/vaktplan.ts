// Vaktplanen mot databasen. Reglene (arbeidstid, overtid, merarbeid) ligger i lib/vaktplan.ts.
// Ansatte er de samme som i Lønn. Vaktplanen fører ingenting i regnskapet; timene går til lønn via timelister.

import { randomBytes } from 'node:crypto';
import type { Sporring } from '../db';
import { RegnskapsFeil } from '../hovedbok';
import { tokenHash } from '../auth';
import {
  analyserUke, advarsler, arbeidMin, gyldigTid, isoUke, ukeDager, flyttUke, plussDager, STANDARD_MALER,
  type AnsattRegel, type VaktInn, type Tilgjengelig, type VaktMal,
} from '../vaktplan';

export interface VaktRad extends VaktInn { id: string; pauseMin: number; utlagt: boolean; interesse: string[] }
export interface VaktAnsatt extends AnsattRegel { epost: string | null; kontakt: string | null; stilling: string | null; tilgang: string; timesats: number; manedslonn: number; overtidProsent: number }
export interface FriRad { id: string; ansattId: string; navn: string; dato: string; grunn: string | null; harVakt: boolean }
export type UkeStatus = 'utkast' | 'publisert' | 'endret';

const tid = (t: string) => String(t).slice(0, 5);

export async function vaktAnsatte(t: Sporring, orgId: string): Promise<VaktAnsatt[]> {
  const r = await t.q<{ id: string; navn: string; lonn_type: string; stillingsprosent: number; epost: string | null; kontakt: string | null; stilling: string | null; tilgang: string; timesats: number; manedslonn: number; overtid_prosent: number }>(
    `select id, navn, lonn_type, stillingsprosent, epost, kontakt, stilling, tilgang, timesats, manedslonn, overtid_prosent from ansatt where organisasjon_id = $1 and aktiv order by navn`, [orgId]);
  return r.map(a => ({ id: a.id, navn: a.navn, lonnType: a.lonn_type, stillingsprosent: Number(a.stillingsprosent), epost: a.epost, kontakt: a.kontakt, stilling: a.stilling, tilgang: a.tilgang, timesats: Number(a.timesats), manedslonn: Number(a.manedslonn), overtidProsent: Number(a.overtid_prosent) }));
}

export async function vakterMellom(t: Sporring, orgId: string, fra: string, til: string): Promise<VaktRad[]> {
  const r = await t.q<{ id: string; ansatt_id: string | null; dato: string; start: string; slutt: string; pause_min: number; utlagt: boolean; interesse: string[] | null }>(
    `select v.id, v.ansatt_id, v.dato::text as dato, v.start::text as start, v.slutt::text as slutt, v.pause_min, v.utlagt,
       (select array_agg(i.ansatt_id::text order by i.tid) from vakt_interesse i where i.vakt_id = v.id) as interesse
     from vakt v where v.organisasjon_id = $1 and v.dato between $2 and $3 order by v.dato, v.start`, [orgId, fra, til]);
  return r.map(v => ({ id: v.id, ansattId: v.ansatt_id, dato: v.dato, start: tid(v.start), slutt: tid(v.slutt), pauseMin: Number(v.pause_min), utlagt: v.utlagt, interesse: v.interesse ?? [] }));
}

export async function tilgjengelighet(t: Sporring, orgId: string, fra: string, til: string): Promise<Tilgjengelig[]> {
  return (await t.q<{ ansatt_id: string; dato: string; status: 'kan' | 'kan_ikke'; grunn: string | null }>(
    `select ansatt_id, dato::text as dato, status, grunn from tilgjengelighet where organisasjon_id = $1 and dato between $2 and $3`, [orgId, fra, til]))
    .map(x => ({ ansattId: x.ansatt_id, dato: x.dato, status: x.status, grunn: x.grunn }));
}

export async function ukeStatus(t: Sporring, orgId: string, aar: number, uke: number): Promise<UkeStatus> {
  return ((await t.en<{ status: UkeStatus }>('select status from vaktuke where organisasjon_id = $1 and aar = $2 and uke = $3', [orgId, aar, uke]))?.status) ?? 'utkast';
}

export async function vaktMaler(t: Sporring, orgId: string): Promise<VaktMal[]> {
  const r = await t.en<{ vakt_maler: VaktMal[] | string | null }>('select vakt_maler from organisasjon where id = $1', [orgId]);
  const m = typeof r?.vakt_maler === 'string' ? JSON.parse(r.vakt_maler) : r?.vakt_maler;
  return Array.isArray(m) && m.length ? m : STANDARD_MALER;
}

export async function lagreMaler(t: Sporring, orgId: string, maler: VaktMal[]) {
  const rene = maler.filter(m => m.navn.trim() && gyldigTid(m.start) && gyldigTid(m.slutt)).slice(0, 8).map(m => ({ navn: m.navn.trim().slice(0, 20), start: m.start, slutt: m.slutt }));
  if (!rene.length) throw new RegnskapsFeil('Legg inn minst én mal med navn og klokkeslett.');
  await t.q('update organisasjon set vakt_maler = $2 where id = $1', [orgId, JSON.stringify(rene)]);
}

/** Alt lederen trenger for én uke. */
export async function hentUke(t: Sporring, orgId: string, aar: number, uke: number) {
  const dager = ukeDager(aar, uke);
  const [ansatte, vakter, tilgj, status, maler] = await Promise.all([
    vaktAnsatte(t, orgId), vakterMellom(t, orgId, dager[0], dager[6]), tilgjengelighet(t, orgId, dager[0], dager[6]), ukeStatus(t, orgId, aar, uke), vaktMaler(t, orgId),
  ]);
  const a = analyserUke(vakter, ansatte);
  return {
    aar, uke, dager, status, ansatte, tilgj, maler,
    vakter: vakter.map(v => ({ ...v, ...a.perVakt.get(v)! })),
    perAnsatt: Object.fromEntries([...a.perAnsatt].map(([k, x]) => [k, x])),
  };
}

// ---------- Endringer fra lederen ----------

/** Etter publisering: uka får status «endret», og de berørte husker vi til neste varsling. */
async function merkEndret(t: Sporring, orgId: string, dato: string, ansattIder: (string | null | undefined)[]) {
  const { aar, uke } = isoUke(dato);
  const s = await t.en<{ status: UkeStatus; berorte: string[] | string }>('select status, berorte from vaktuke where organisasjon_id = $1 and aar = $2 and uke = $3', [orgId, aar, uke]);
  if (!s || s.status === 'utkast') return;
  const for_ = (typeof s.berorte === 'string' ? JSON.parse(s.berorte) : s.berorte) as string[];
  const nye = [...new Set([...for_, ...ansattIder.filter((x): x is string => !!x)])];
  await t.q(`update vaktuke set status = 'endret', berorte = $4 where organisasjon_id = $1 and aar = $2 and uke = $3`, [orgId, aar, uke, JSON.stringify(nye)]);
}

async function hentVakt(t: Sporring, orgId: string, id: string) {
  const v = await t.en<{ id: string; ansatt_id: string | null; dato: string; start: string; slutt: string }>('select id, ansatt_id, dato::text as dato, start::text as start, slutt::text as slutt from vakt where id = $1 and organisasjon_id = $2', [id, orgId]);
  if (!v) throw new RegnskapsFeil('Fant ikke vakten.');
  return v;
}

async function sjekkAnsatt(t: Sporring, orgId: string, ansattId: string | null) {
  if (!ansattId) return;
  if (!(await t.en('select 1 from ansatt where id = $1 and organisasjon_id = $2 and aktiv', [ansattId, orgId]))) throw new RegnskapsFeil('Fant ikke den ansatte.');
}

/** Lagrer en ny eller endret vakt og gir advarslene tilbake. Advarsler stopper ikke lagringen. */
export async function lagreVakt(t: Sporring, orgId: string, v: { id?: string | null; ansattId: string | null; dato: string; start: string; slutt: string }): Promise<{ id: string; advarsler: string[] }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.dato)) throw new RegnskapsFeil('Velg en dag.');
  if (!gyldigTid(v.start) || !gyldigTid(v.slutt)) throw new RegnskapsFeil('Skriv klokkeslett som 07:00.');
  if (v.start === v.slutt) throw new RegnskapsFeil('Vakten må vare minst ett minutt.');
  await sjekkAnsatt(t, orgId, v.ansattId);
  const varsel = await advarslerFor(t, orgId, v);
  let id = v.id ?? null, gammel: string | null = null;
  if (id) {
    const f = await hentVakt(t, orgId, id);
    gammel = f.ansatt_id;
    await t.q('update vakt set ansatt_id = $3, dato = $4, start = $5, slutt = $6, utlagt = case when ansatt_id is distinct from $3 then false else utlagt end where id = $1 and organisasjon_id = $2', [id, orgId, v.ansattId, v.dato, v.start, v.slutt]);
    if (gammel !== v.ansattId) await t.q('delete from vakt_interesse where vakt_id = $1', [id]);
    if (f.dato !== v.dato) await merkEndret(t, orgId, f.dato, [gammel]);
  } else {
    id = (await t.en<{ id: string }>('insert into vakt (organisasjon_id, ansatt_id, dato, start, slutt) values ($1,$2,$3,$4,$5) returning id', [orgId, v.ansattId, v.dato, v.start, v.slutt]))!.id;
  }
  await merkEndret(t, orgId, v.dato, [gammel, v.ansattId]);
  return { id: id!, advarsler: varsel };
}

export async function advarslerFor(t: Sporring, orgId: string, v: { id?: string | null; ansattId: string | null; dato: string; start: string; slutt: string }): Promise<string[]> {
  const dager = ukeDager(isoUke(v.dato).aar, isoUke(v.dato).uke);
  const [ansatte, vakter, tilgj] = await Promise.all([vaktAnsatte(t, orgId), vakterMellom(t, orgId, dager[0], dager[6]), tilgjengelighet(t, orgId, v.dato, v.dato)]);
  return advarsler({ ansattId: v.ansattId, dato: v.dato, start: v.start, slutt: v.slutt }, vakter.filter(x => x.id !== v.id), ansatte.find(a => a.id === v.ansattId) ?? null, tilgj);
}

export async function slettVakt(t: Sporring, orgId: string, id: string) {
  const v = await hentVakt(t, orgId, id);
  await t.q('delete from vakt where id = $1', [id]);
  await merkEndret(t, orgId, v.dato, [v.ansatt_id]);
}

/** Gjør vakten ledig (ingen på den). Brukes også når lederen sier ja til et bytte. */
export async function gjorLedig(t: Sporring, orgId: string, id: string) {
  const v = await hentVakt(t, orgId, id);
  await t.q('update vakt set ansatt_id = null, utlagt = false where id = $1', [id]);
  await t.q('delete from vakt_interesse where vakt_id = $1 and ansatt_id = $2', [id, v.ansatt_id]);
  await merkEndret(t, orgId, v.dato, [v.ansatt_id]);
  return v.ansatt_id;
}

/** Lederen sier nei til et bytte: vakten blir hos den ansatte. */
export async function behold(t: Sporring, orgId: string, id: string) {
  const v = await hentVakt(t, orgId, id);
  await t.q('update vakt set utlagt = false where id = $1', [id]);
  return v.ansatt_id;
}

/** Gir en ledig (eller utlagt) vakt til en ansatt. Interessen tømmes. */
export async function tildel(t: Sporring, orgId: string, id: string, ansattId: string) {
  await sjekkAnsatt(t, orgId, ansattId);
  const v = await hentVakt(t, orgId, id);
  await t.q('update vakt set ansatt_id = $2, utlagt = false where id = $1', [id, ansattId]);
  await t.q('delete from vakt_interesse where vakt_id = $1', [id]);
  await merkEndret(t, orgId, v.dato, [v.ansatt_id, ansattId]);
  return { dato: v.dato, start: tid(v.start), slutt: tid(v.slutt), fra: v.ansatt_id };
}

/** Publiserer uka. Første gang varsles alle med vakt; etter endringer bare de berørte. */
export async function publiser(t: Sporring, orgId: string, aar: number, uke: number): Promise<{ varsle: string[]; forste: boolean }> {
  const dager = ukeDager(aar, uke);
  const s = await t.en<{ status: UkeStatus; berorte: string[] | string }>('select status, berorte from vaktuke where organisasjon_id = $1 and aar = $2 and uke = $3', [orgId, aar, uke]);
  const forste = !s || s.status === 'utkast';
  const medVakt = (await t.q<{ ansatt_id: string }>('select distinct ansatt_id from vakt where organisasjon_id = $1 and dato between $2 and $3 and ansatt_id is not null', [orgId, dager[0], dager[6]])).map(x => x.ansatt_id);
  if (forste && !medVakt.length) throw new RegnskapsFeil('Uka har ingen vakter å publisere.');
  if (!forste && s!.status === 'publisert') throw new RegnskapsFeil('Uka er allerede publisert, og ingenting er endret.');
  const berorte = s ? ((typeof s.berorte === 'string' ? JSON.parse(s.berorte) : s.berorte) as string[]) : [];
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
    await t.q('insert into vakt (organisasjon_id, ansatt_id, dato, start, slutt, pause_min) values ($1,$2,$3,$4,$5,$6)',
      [orgId, v.ansattId && aktive.has(v.ansattId) ? v.ansattId : null, b[a.indexOf(v.dato)], v.start, v.slutt, v.pauseMin]);
  }
  return kilde.length;
}

/**
 * Forslag til en uke (for assistenten): forrige ukes vakter flyttes én uke frem. Kan noen ikke den dagen,
 * eller gir vakten overtid, blir den ledig i stedet. Ingenting lagres her.
 */
export async function forslagUke(t: Sporring, orgId: string, aar: number, uke: number) {
  const forrige = flyttUke(aar, uke, -1);
  const a = ukeDager(forrige.aar, forrige.uke), b = ukeDager(aar, uke);
  const [ansatte, kilde, tilgj, finnes] = await Promise.all([vaktAnsatte(t, orgId), vakterMellom(t, orgId, a[0], a[6]), tilgjengelighet(t, orgId, b[0], b[6]), vakterMellom(t, orgId, b[0], b[6])]);
  const valgt: VaktInn[] = [];
  const hensyn: string[] = [];
  for (const v of kilde) {
    const dato = b[a.indexOf(v.dato)];
    let ansattId = v.ansattId && ansatte.some(x => x.id === v.ansattId) ? v.ansattId : null;
    const an = ansatte.find(x => x.id === ansattId);
    if (an) {
      const ti = tilgj.find(x => x.ansattId === an.id && x.dato === dato);
      if (ti?.status === 'kan_ikke') { hensyn.push(`${an.navn.split(' ')[0]} kan ikke ${dato.split('-').reverse().slice(0, 2).join('.')}${ti.grunn ? ` (${ti.grunn})` : ''}`); ansattId = null; }
      else {
        const for_ = analyserUke(valgt, [an]).perAnsatt.get(an.id)!;
        const etter = analyserUke([...valgt, { ansattId: an.id, dato, start: v.start, slutt: v.slutt }], [an]).perAnsatt.get(an.id)!;
        if (etter.overtid > for_.overtid) { hensyn.push(`${an.navn.split(' ')[0]} ville fått overtid ${dato.split('-').reverse().slice(0, 2).join('.')}`); ansattId = null; }
      }
    }
    valgt.push({ ansattId, dato, start: v.start, slutt: v.slutt });
  }
  const r = analyserUke(valgt, ansatte);
  return {
    aar, uke, finnes: finnes.length, vakter: valgt.map(v => ({ ...v, navn: ansatte.find(x => x.id === v.ansattId)?.navn ?? null })),
    ledige: valgt.filter(v => !v.ansattId).length, overtidMin: [...r.perAnsatt.values()].reduce((s, x) => s + x.overtid, 0), hensyn,
  };
}

/** Lagrer forslaget som utkast (uka må være tom). */
export async function lagreForslagUke(t: Sporring, orgId: string, aar: number, uke: number, vakter: VaktInn[]): Promise<number> {
  const b = ukeDager(aar, uke);
  if ((await vakterMellom(t, orgId, b[0], b[6])).length) throw new RegnskapsFeil(`Uke ${uke} har allerede vakter. Tøm uka eller endre dem selv.`);
  for (const v of vakter) {
    if (!b.includes(v.dato)) continue;
    await t.q('insert into vakt (organisasjon_id, ansatt_id, dato, start, slutt) values ($1,$2,$3,$4,$5)', [orgId, v.ansattId, v.dato, v.start, v.slutt]);
  }
  return vakter.length;
}

// ---------- Forespørsler ----------

export async function friForesporsler(t: Sporring, orgId: string): Promise<FriRad[]> {
  return (await t.q<{ id: string; ansatt_id: string; navn: string; dato: string; grunn: string | null; har_vakt: boolean }>(
    `select f.id, f.ansatt_id, a.navn, f.dato::text as dato, f.grunn,
       exists (select 1 from vakt v where v.ansatt_id = f.ansatt_id and v.dato = f.dato) as har_vakt
     from fri_foresporsel f join ansatt a on a.id = f.ansatt_id where f.organisasjon_id = $1 and f.status = 'venter' order by f.dato`, [orgId]))
    .map(x => ({ id: x.id, ansattId: x.ansatt_id, navn: x.navn, dato: x.dato, grunn: x.grunn, harVakt: x.har_vakt }));
}

/** Godkjent fri: dagen merkes «kan ikke», og vakten den dagen blir ledig. */
export async function svarFri(t: Sporring, orgId: string, id: string, godkjenn: boolean) {
  const f = await t.en<{ ansatt_id: string; dato: string; grunn: string | null }>(`select ansatt_id, dato::text as dato, grunn from fri_foresporsel where id = $1 and organisasjon_id = $2 and status = 'venter'`, [id, orgId]);
  if (!f) throw new RegnskapsFeil('Forespørselen er allerede besvart.');
  await t.q('update fri_foresporsel set status = $2 where id = $1', [id, godkjenn ? 'godkjent' : 'avslatt']);
  if (godkjenn) {
    await t.q(`insert into tilgjengelighet (organisasjon_id, ansatt_id, dato, status, grunn) values ($1,$2,$3,'kan_ikke',$4)
      on conflict (ansatt_id, dato) do update set status = 'kan_ikke', grunn = coalesce(excluded.grunn, tilgjengelighet.grunn)`, [orgId, f.ansatt_id, f.dato, f.grunn]);
    const v = await t.q<{ id: string }>('select id from vakt where organisasjon_id = $1 and ansatt_id = $2 and dato = $3', [orgId, f.ansatt_id, f.dato]);
    for (const x of v) await t.q('update vakt set ansatt_id = null, utlagt = false where id = $1', [x.id]);
    if (v.length) await merkEndret(t, orgId, f.dato, [f.ansatt_id]);
  }
  return f;
}

/** Hvor mange ting lederen må svare på: fri, bytteønsker og ledige vakter noen vil ta. */
export async function antallForesporsler(t: Sporring, orgId: string, idag: string): Promise<number> {
  const r = await t.en<{ n: number }>(
    `select ((select count(*) from fri_foresporsel where organisasjon_id = $1 and status = 'venter')
      + (select count(*) from vakt where organisasjon_id = $1 and utlagt and ansatt_id is not null and dato >= $2)
      + (select count(*) from vakt v where v.organisasjon_id = $1 and v.ansatt_id is null and v.dato >= $2 and exists (select 1 from vakt_interesse i where i.vakt_id = v.id)))::int as n`, [orgId, idag]);
  return Number(r?.n ?? 0);
}

export interface Trenger { fri: FriRad[]; bytte: (VaktRad & { navn: string })[]; ledigeMedInteresse: (VaktRad & { interessenter: { id: string; navn: string; merknad: string | null }[] })[] }

/** Det som venter på lederen, med beskjed om overtid/merarbeid for hver interessent. */
export async function trengerSvar(t: Sporring, orgId: string, idag: string): Promise<Trenger> {
  const til = plussDager(idag, 60);
  const [fri, vakter, ansatte] = await Promise.all([friForesporsler(t, orgId), vakterMellom(t, orgId, idag, til), vaktAnsatte(t, orgId)]);
  const navn = (id: string | null) => ansatte.find(a => a.id === id)?.navn ?? 'Ukjent';
  const merknad = async (v: VaktRad, ansattId: string) => {
    const a = ansatte.find(x => x.id === ansattId);
    if (!a) return null;
    const d = ukeDager(isoUke(v.dato).aar, isoUke(v.dato).uke);
    const uka = (await vakterMellom(t, orgId, d[0], d[6])).filter(x => x.id !== v.id);
    const w = advarsler({ ansattId, dato: v.dato, start: v.start, slutt: v.slutt }, uka, a, await tilgjengelighet(t, orgId, v.dato, v.dato));
    return w.find(x => /overtid|merarbeid|allerede/.test(x)) ?? null;
  };
  const ledige = [];
  for (const v of vakter.filter(x => !x.ansattId && x.interesse.length)) {
    ledige.push({ ...v, interessenter: await Promise.all(v.interesse.map(async id => ({ id, navn: navn(id), merknad: await merknad(v, id) }))) });
  }
  return { fri, bytte: vakter.filter(x => x.utlagt && x.ansattId).map(x => ({ ...x, navn: navn(x.ansattId) })), ledigeMedInteresse: ledige };
}

// ---------- Den ansatte ----------

export async function ansattForBruker(t: Sporring, orgId: string, brukerId: string) {
  return t.en<{ id: string; navn: string; lonn_type: string; stillingsprosent: number }>('select id, navn, lonn_type, stillingsprosent from ansatt where organisasjon_id = $1 and bruker_id = $2 and aktiv', [orgId, brukerId]);
}

export async function settInteresse(t: Sporring, orgId: string, ansattId: string, vaktId: string, pa: boolean) {
  const v = await t.en<{ ansatt_id: string | null; utlagt: boolean }>('select ansatt_id, utlagt from vakt where id = $1 and organisasjon_id = $2', [vaktId, orgId]);
  if (!v || (v.ansatt_id && !v.utlagt) || v.ansatt_id === ansattId) throw new RegnskapsFeil('Vakten er ikke ledig lenger.');
  if (pa) await t.q('insert into vakt_interesse (vakt_id, ansatt_id) values ($1,$2) on conflict do nothing', [vaktId, ansattId]);
  else await t.q('delete from vakt_interesse where vakt_id = $1 and ansatt_id = $2', [vaktId, ansattId]);
}

export async function byttBort(t: Sporring, orgId: string, ansattId: string, vaktId: string, pa: boolean) {
  const r = await t.en<{ id: string }>('update vakt set utlagt = $4 where id = $1 and organisasjon_id = $2 and ansatt_id = $3 returning id', [vaktId, orgId, ansattId, pa]);
  if (!r) throw new RegnskapsFeil('Fant ikke vakten din.');
  if (!pa) await t.q('delete from vakt_interesse where vakt_id = $1', [vaktId]);
}

/** Kan / kan ikke / ikke satt. «Kan ikke» på en dag med vakt blir en forespørsel om fri. */
export async function settTilgjengelig(t: Sporring, orgId: string, ansattId: string, dato: string, status: 'kan' | 'kan_ikke' | null, grunn?: string | null): Promise<{ friForesporsel: boolean }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dato)) throw new RegnskapsFeil('Ugyldig dato.');
  const g = grunn?.trim().slice(0, 120) || null;
  if (!status) await t.q('delete from tilgjengelighet where ansatt_id = $1 and dato = $2', [ansattId, dato]);
  else await t.q(`insert into tilgjengelighet (organisasjon_id, ansatt_id, dato, status, grunn) values ($1,$2,$3,$4,$5) on conflict (ansatt_id, dato) do update set status = excluded.status, grunn = excluded.grunn`, [orgId, ansattId, dato, status, g]);
  // Ombestemt seg: trekk ventende forespørsel.
  if (status !== 'kan_ikke') { await t.q(`delete from fri_foresporsel where ansatt_id = $1 and dato = $2 and status = 'venter'`, [ansattId, dato]); return { friForesporsel: false }; }
  const harVakt = await t.en('select 1 from vakt where ansatt_id = $1 and dato = $2', [ansattId, dato]);
  if (!harVakt) return { friForesporsel: false };
  if (!(await t.en(`select 1 from fri_foresporsel where ansatt_id = $1 and dato = $2 and status = 'venter'`, [ansattId, dato])))
    await t.q('insert into fri_foresporsel (organisasjon_id, ansatt_id, dato, grunn) values ($1,$2,$3,$4)', [orgId, ansattId, dato, g]);
  return { friForesporsel: true };
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
  return (await t.en<{ id: string }>(`insert into ansatt (organisasjon_id, navn, kontakt, epost, stilling, lonn_type, stillingsprosent, manedslonn, timesats) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
    [orgId, navn, kontakt, epost, a.stilling?.trim() || null, a.lonnType, pst, a.lonnType === 'fast' ? sats : 0, a.lonnType === 'time' ? sats : 0]))!.id;
}

/**
 * Gir den ansatte en innloggingslenke til vaktplanen (uten passord i testfasen).
 * Den ansatte får en egen bruker med rollen «ansatt», som bare ser /vakt.
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
  await t.q(`update ansatt set bruker_id = $3, tilgang = case when tilgang = 'aktiv' then 'aktiv' else 'invitert' end where id = $1 and organisasjon_id = $2`, [a.id, orgId, brukerId]);
  return { token: await nyLenke(t, a.id), epost, navn: a.navn, kontakt: a.kontakt };
}

/** Ny innloggingslenke til vaktplanen. Gamle lenker virker fortsatt, så en eldre SMS/e-post ikke slutter å fungere. */
export async function nyLenke(t: Sporring, ansattId: string): Promise<string> {
  const token = randomBytes(24).toString('base64url');
  await t.q('insert into vakt_lenke (token_hash, ansatt_id) values ($1,$2)', [tokenHash(token), ansattId]);
  return token;
}

/** Lenken fra SMS/e-post: finn den ansatte og marker at hen har logget inn. */
export async function apneLenke(t: Sporring, token: string): Promise<{ brukerId: string; orgId: string } | null> {
  const a = await t.en<{ id: string; bruker_id: string; organisasjon_id: string }>('select a.id, a.bruker_id, a.organisasjon_id from vakt_lenke l join ansatt a on a.id = l.ansatt_id where l.token_hash = $1 and a.aktiv and a.bruker_id is not null', [tokenHash(token)]);
  if (!a) return null;
  await t.q(`update ansatt set tilgang = 'aktiv' where id = $1`, [a.id]);
  return { brukerId: a.bruker_id, orgId: a.organisasjon_id };
}

/** Overtidstillegg for hele firmaet (40, 50 eller 100 %). */
export async function settOvertid(t: Sporring, orgId: string, prosent: number) {
  if (![40, 50, 100].includes(prosent)) throw new RegnskapsFeil('Velg 40, 50 eller 100 %.');
  await t.q('update ansatt set overtid_prosent = $2 where organisasjon_id = $1', [orgId, prosent]);
}

// ---------- Timer til lønn ----------

export interface Timeliste { aar: number; uke: number; rader: { ansattId: string; navn: string; lonnType: string; arbeid: number; overtid: number }[] }

/** Ferdige uker med vakter som ikke er godkjent til lønn ennå (de siste åtte ukene). */
export async function ventendeTimelister(t: Sporring, orgId: string, idag: string): Promise<Timeliste[]> {
  const ut: Timeliste[] = [];
  const ansatte = await vaktAnsatte(t, orgId);
  let u = flyttUke(isoUke(idag).aar, isoUke(idag).uke, -1);
  for (let i = 0; i < 8; i++, u = flyttUke(u.aar, u.uke, -1)) {
    const d = ukeDager(u.aar, u.uke);
    const vakter = (await vakterMellom(t, orgId, d[0], d[6])).filter(v => v.ansattId);
    if (!vakter.length) continue;
    const godkjent = new Set((await t.q<{ ansatt_id: string }>('select ansatt_id from timeliste where organisasjon_id = $1 and aar = $2 and uke = $3', [orgId, u.aar, u.uke])).map(x => x.ansatt_id));
    const r = analyserUke(vakter, ansatte);
    const rader = ansatte.filter(a => !godkjent.has(a.id) && (r.perAnsatt.get(a.id)?.arbeid ?? 0) > 0)
      .map(a => ({ ansattId: a.id, navn: a.navn, lonnType: a.lonnType, arbeid: r.perAnsatt.get(a.id)!.arbeid, overtid: r.perAnsatt.get(a.id)!.overtid }));
    if (rader.length) ut.push({ aar: u.aar, uke: u.uke, rader });
  }
  return ut;
}

export async function godkjennTimeliste(t: Sporring, orgId: string, aar: number, uke: number): Promise<number> {
  const liste = (await ventendeTimelister(t, orgId, plussDager(ukeDager(aar, uke)[6], 1))).find(x => x.aar === aar && x.uke === uke);
  if (!liste) throw new RegnskapsFeil('Ingen timer å godkjenne for denne uka.');
  for (const r of liste.rader) await t.q('insert into timeliste (organisasjon_id, ansatt_id, aar, uke, arbeid_min, overtid_min) values ($1,$2,$3,$4,$5,$6) on conflict do nothing', [orgId, r.ansattId, aar, uke, r.arbeid, r.overtid]);
  return liste.rader.length;
}

/** Godkjente timer som ikke er brukt i en lønnskjøring: forslag til timer og overtid i Kjør lønn. */
export async function godkjenteTimer(t: Sporring, orgId: string): Promise<Record<string, { timer: number; overtid: number; uker: number[] }>> {
  const r = await t.q<{ ansatt_id: string; arbeid_min: number; overtid_min: number; uke: number }>(`select ansatt_id, arbeid_min, overtid_min, uke from timeliste where organisasjon_id = $1 and status = 'godkjent' order by aar, uke`, [orgId]);
  const ut: Record<string, { timer: number; overtid: number; uker: number[] }> = {};
  for (const x of r) {
    const e = ut[x.ansatt_id] ??= { timer: 0, overtid: 0, uker: [] };
    e.timer += Number(x.arbeid_min) / 60; e.overtid += Number(x.overtid_min) / 60; e.uker.push(Number(x.uke));
  }
  for (const k of Object.keys(ut)) { ut[k].timer = Math.round(ut[k].timer * 100) / 100; ut[k].overtid = Math.round(ut[k].overtid * 100) / 100; }
  return ut;
}

/** Etter lønnskjøring: timelistene er brukt. */
export async function merkTimerBrukt(t: Sporring, orgId: string, lonnskjoringId: string, ansattIder: string[]) {
  if (!ansattIder.length) return;
  await t.q(`update timeliste set status = 'brukt', lonnskjoring_id = $2 where organisasjon_id = $1 and status = 'godkjent' and ansatt_id = any($3::uuid[])`, [orgId, lonnskjoringId, ansattIder]);
}

export { arbeidMin };
