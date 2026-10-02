'use server';

// Serverhandlinger for vaktplanen: lederen på vaktplan.rettført.no og den ansatte på /vakt.
// Lederens handlinger gir tilbake en angre-nøkkel, så meldingen nederst kan ha «Angre».

import { revalidatePath } from 'next/cache';
import { sesjon, trygt, idag, type Resultat } from '@/lib/server';
import { getDb, type Db, type Sporring } from '@/lib/db';
import { RegnskapsFeil } from '@/lib/hovedbok';
import { kanEndre } from '@/lib/auth';
import { harVaktplan, harAssistent } from '@/lib/pakker';
import { sendEpost, maler, grunnadresse } from '@/lib/epost';
import { tilVaktplan } from '@/lib/verter';
import { synkEkstraAnsatte } from '@/lib/stripe';
import * as V from '@/lib/tjenester/vaktplan';
import * as VV from '@/lib/tjenester/vaktvarsel';
import { isoUke, ukeDager, flyttUke, datoTekst, dagsvakten, timerTall, arbeidMin, analyserUke, type VaktMal } from '@/lib/vaktplan';
import { grenser, type VaktInnstillinger } from '@/lib/vaktplan-innstillinger';

async function kreverLeder() {
  const s = await sesjon();
  if (!s?.org || s.org.type !== 'selskap') throw new RegnskapsFeil('Du er ikke logget inn.');
  if (!harVaktplan(s.org.pakke)) throw new RegnskapsFeil('Vaktplan er med i Start og Selskap.');
  if (!kanEndre(s.rolle)) throw new RegnskapsFeil('Du har bare lesetilgang.');
  return s as typeof s & { org: NonNullable<typeof s.org> };
}

async function kreverAnsatt() {
  const s = await sesjon({ ansatt: true });
  if (!s?.org || s.rolle !== 'ansatt') throw new RegnskapsFeil('Logg inn med lenken du fikk.');
  const db = await getDb();
  const a = await V.ansattForBruker(db, s.org.id, s.bruker.id);
  if (!a) throw new RegnskapsFeil('Du er ikke lenger registrert som ansatt.');
  const inn = await V.innstillinger(db, s.org.id);
  return { s: s as typeof s & { org: NonNullable<typeof s.org> }, a, db, inn };
}

const oppdater = () => { revalidatePath('/vp'); revalidatePath('/vaktplan'); revalidatePath('/vakt'); revalidatePath('/hjem'); };
const fornavn = (n: string) => n.split(' ')[0];

const varsleAnsatt = async (db: Db, orgId: string, foretak: string, ansattId: string, tittel: string, linjer: string[]) => VV.varsleAnsatt(db, await grunnadresse(), orgId, foretak, ansattId, tittel, linjer, 'ans');
const varsleLeder = async (db: Db, orgId: string, foretak: string, hva: string) => VV.varsleLeder(db, await grunnadresse(), orgId, foretak, hva);

type Svar = { angre?: string; melding: string };

/** Kjører en endring i én transaksjon, med et angrepunkt tatt rett før. */
async function medAngre<T>(db: Db, orgId: string, omfang: V.AngreOmfang | ((t: Sporring) => Promise<V.AngreOmfang>), fn: (t: Sporring) => Promise<T>): Promise<{ angre: string; r: T }> {
  return db.tx(async t => {
    const o = typeof omfang === 'function' ? await omfang(t) : omfang;
    const angre = await V.angrepunkt(t, orgId, o);
    return { angre, r: await fn(t) };
  });
}

const ukerFor = (...datoer: (string | null | undefined)[]) => [...new Map(datoer.filter((d): d is string => !!d).map(d => { const u = isoUke(d); return [`${u.aar}-${u.uke}`, u]; })).values()];

async function vaktInfo(db: Sporring, orgId: string, id: string) {
  const v = await db.en<{ dato: string; start: string; slutt: string; ansatt_id: string | null; navn: string | null; utlagt: boolean }>(
    `select v.dato::text as dato, v.start::text as start, v.slutt::text as slutt, v.ansatt_id, a.navn, v.utlagt from vakt v left join ansatt a on a.id = v.ansatt_id where v.id = $1 and v.organisasjon_id = $2`, [id, orgId]);
  if (!v) throw new RegnskapsFeil('Fant ikke vakten.');
  return { ...v, start: v.start.slice(0, 5), slutt: v.slutt.slice(0, 5) };
}

async function navnPa(db: Sporring, id: string | null) {
  if (!id) return null;
  return (await db.en<{ navn: string }>('select navn from ansatt where id = $1', [id]))?.navn ?? null;
}

// ---------- Leder: vakter ----------

export async function lagreVaktHandling(v: V.NyVakt): Promise<Resultat<Svar & { id: string; advarsler: string[] }>> {
  return trygt(async () => {
    const s = await kreverLeder(); const db = await getDb();
    const for_ = v.id ? await vaktInfo(db, s.org.id, v.id) : null;
    const status = await V.ukeStatus(db, s.org.id, isoUke(v.dato).aar, isoUke(v.dato).uke);
    const { angre, r } = await medAngre(db, s.org.id, { vakter: v.id ? [v.id] : [], uker: ukerFor(v.dato, for_?.dato) }, t => V.lagreVakt(t, s.org.id, v));
    // En ny vakt angres ved å slette den (og eventuelle kopier).
    if (r.nye.length) await db.tx(t => V.leggTilAngre(t, s.org.id, angre, { vakter: r.nye }));
    const angreId = angre;
    oppdater();
    const utkast = status === 'utkast';
    const melding = v.id ? (utkast ? 'Vakten er endret i utkastet.' : 'Vakten er endret. Publiser for å varsle.')
      : (utkast ? 'Vakten er lagt til i utkastet.' : 'Vakten er lagt til. Publiser for å varsle.') + (r.kopier ? ` Den gjentas ${r.kopier} ganger til.` : '');
    return { id: r.id, advarsler: r.advarsler, angre: angreId, melding };
  });
}

export async function sjekkVakt(v: { id?: string | null; ansattId: string | null; dato: string; start: string; slutt: string }): Promise<Resultat<string[]>> {
  return trygt(async () => { const s = await kreverLeder(); return V.advarslerFor(await getDb(), s.org.id, v); });
}

export async function slettVaktHandling(id: string): Promise<Resultat<Svar>> {
  return trygt(async () => {
    const s = await kreverLeder(); const db = await getDb();
    const v = await vaktInfo(db, s.org.id, id);
    const { angre } = await medAngre(db, s.org.id, { vakter: [id], uker: ukerFor(v.dato) }, t => V.slettVakt(t, s.org.id, id));
    oppdater();
    return { angre, melding: 'Vakten er slettet.' };
  });
}

export async function flyttVaktHandling(id: string, ansattId: string | null, dato: string): Promise<Resultat<Svar>> {
  return trygt(async () => {
    const s = await kreverLeder(); const db = await getDb();
    const v = await vaktInfo(db, s.org.id, id);
    const { angre } = await medAngre(db, s.org.id, { vakter: [id], uker: ukerFor(v.dato, dato) }, t => V.flyttVakt(t, s.org.id, id, ansattId, dato));
    oppdater();
    const hvem = ansattId ? fornavn((await navnPa(db, ansattId)) ?? '') : 'Ledige vakter';
    return { angre, melding: `Vakten er flyttet til ${hvem}, ${datoTekst(dato).split(' ')[0]}.` };
  });
}

export async function gjorLedigHandling(id: string): Promise<Resultat<Svar>> {
  return trygt(async () => {
    const s = await kreverLeder(); const db = await getDb();
    const v = await vaktInfo(db, s.org.id, id);
    const { angre, r: fra } = await medAngre(db, s.org.id, { vakter: [id], uker: ukerFor(v.dato) }, t => V.gjorLedig(t, s.org.id, id));
    if (fra && v.utlagt) await varsleAnsatt(db, s.org.id, s.org.navn, fra, 'Du slipper vakten', [`Du slipper vakten ${datoTekst(v.dato)} ${v.start}–${v.slutt}. Den er lagt ut som ledig.`]);
    oppdater();
    return { angre, melding: `${dagsvakten(v.dato)} er nå ledig.${v.navn ? ` ${fornavn(v.navn)} har fått beskjed.` : ''}` };
  });
}

/** Avslå at noen gir bort vakten: den blir hos dem. */
export async function beholdHandling(id: string): Promise<Resultat<Svar>> {
  return trygt(async () => {
    const s = await kreverLeder(); const db = await getDb();
    const v = await vaktInfo(db, s.org.id, id);
    const { angre, r: hvem } = await medAngre(db, s.org.id, { vakter: [id] }, t => V.behold(t, s.org.id, id));
    if (hvem) await varsleAnsatt(db, s.org.id, s.org.navn, hvem, 'Vakten blir på deg', [`Lederen har bestemt at du beholder vakten ${datoTekst(v.dato)} ${v.start}–${v.slutt}.`]);
    oppdater();
    return { angre, melding: `Byttet er avslått.${v.navn ? ` ${fornavn(v.navn)} har fått beskjed.` : ''}` };
  });
}

export async function tildelHandling(vaktId: string, ansattId: string): Promise<Resultat<Svar>> {
  return trygt(async () => {
    const s = await kreverLeder(); const db = await getDb();
    const v = await vaktInfo(db, s.org.id, vaktId);
    const { angre } = await medAngre(db, s.org.id, { vakter: [vaktId], uker: ukerFor(v.dato) }, t => V.tildel(t, s.org.id, vaktId, ansattId));
    const n = fornavn((await navnPa(db, ansattId)) ?? '');
    oppdater();
    return { angre, melding: `Vakten ${datoTekst(v.dato)} er gitt til ${n}. ${n} får e-post når du publiserer.` };
  });
}

export async function publiserHandling(aar: number, uke: number): Promise<Resultat<{ melding: string }>> {
  return trygt(async () => {
    const s = await kreverLeder();
    const db = await getDb();
    const n = (await V.innstillinger(db, s.org.id)).notif;
    const r = await VV.publiserOgVarsle(db, await grunnadresse(), s.org.id, s.org.navn, aar, uke);
    oppdater();
    const uten = r.uten ? ` ${r.uten} har ikke fått e-post, fordi de mangler e-post eller ikke er invitert.` : '';
    if (r.forste) return { melding: n.on && n.pub ? `Uke ${uke} er publisert. ${r.varslet} ${r.varslet === 1 ? 'ansatt har' : 'ansatte har'} fått e-post.${uten}` : `Uke ${uke} er publisert.` };
    return { melding: n.on && n.chg ? `Endringene er publisert. De som er berørt, har fått e-post.${uten}` : 'Endringene er publisert.' };
  });
}

export async function kopierUkeHandling(fra: { aar: number; uke: number }, til: { aar: number; uke: number }): Promise<Resultat<number>> {
  return trygt(async () => { const s = await kreverLeder(); const db = await getDb(); const n = await db.tx(t => V.kopierUke(t, s.org.id, fra, til)); oppdater(); return n; });
}

/** Angre den siste endringen lederen gjorde. */
export async function angreHandling(id: string): Promise<Resultat> {
  return trygt(async () => {
    const s = await kreverLeder(); const db = await getDb();
    await db.tx(t => V.angre(t, s.org.id, id));
    oppdater(); revalidatePath('/lonn');
  }, 'Angret.');
}

// ---------- Leder: forespørsler, fravær og bytter ----------

/** Godkjenn eller avslå fri og fravær, eller registrer fravær. */
export async function behandleFravaerHandling(b: V.Behandling): Promise<Resultat<Svar>> {
  return trygt(async () => {
    const s = await kreverLeder(); const db = await getDb();
    const omfang = async (t: Sporring): Promise<V.AngreOmfang> => {
      let ansattId = b.ansattId ?? null, fra = b.fra ?? '', til = b.til ?? b.fra ?? '';
      if (b.kilde === 'fri') { const f = await t.en<{ ansatt_id: string; dato: string }>('select ansatt_id, dato::text as dato from fri_foresporsel where id = $1', [b.id]); ansattId = f?.ansatt_id ?? null; fra = til = f?.dato ?? ''; }
      if (b.kilde === 'fravaer') { const f = await t.en<{ ansatt_id: string; fra: string; til: string }>('select ansatt_id, fra::text as fra, til::text as til from fravaer where id = $1', [b.id]); ansattId = f?.ansatt_id ?? null; fra = f?.fra ?? ''; til = f?.til ?? ''; }
      const vakter = ansattId && fra ? (await t.q<{ id: string }>('select id from vakt where organisasjon_id = $1 and ansatt_id = $2 and dato between $3 and $4', [s.org.id, ansattId, fra, til])).map(x => x.id) : [];
      const dager: { ansattId: string; dato: string }[] = [];
      if (ansattId && fra) for (let d = fra; d <= til && dager.length < 62; d = new Date(Date.parse(`${d}T12:00:00Z`) + 86400000).toISOString().slice(0, 10)) dager.push({ ansattId, dato: d });
      return { vakter, fri: b.kilde === 'fri' && b.id ? [b.id] : [], fravaer: b.kilde === 'fravaer' && b.id ? [b.id] : [], tilgj: dager, uker: ukerFor(fra, til) };
    };
    const { angre, r } = await medAngre(db, s.org.id, omfang, t => V.behandleFravaer(t, s.org.id, b));
    if (r.nyttFravaer) await db.tx(t => V.leggTilAngre(t, s.org.id, angre, { fravaer: [r.nyttFravaer!] }));
    const n = fornavn(r.navn);
    if (b.avslag) {
      const grunn = b.kommentar?.trim();
      await varsleAnsatt(db, s.org.id, s.org.navn, r.ansattId, 'Forespørselen ble ikke godkjent', [`Lederen har avslått forespørselen din for ${datoTekst(r.fra)}${r.til !== r.fra ? ` – ${datoTekst(r.til)}` : ''}.`, ...(grunn ? [`Grunn: ${grunn}`] : [])]);
      oppdater();
      return { angre, melding: `Forespørselen er avslått. ${n} har fått beskjed${grunn ? ' med grunnen din' : ''}.` };
    }
    const vakt = !r.vakter ? '' : r.handling === 'gi' ? ` Vakten er gitt til ${fornavn(r.giTilNavn ?? '')}.` : r.handling === 'slett' ? ' Vakten er slettet.' : ' Vakten er nå ledig.';
    await varsleAnsatt(db, s.org.id, s.org.navn, r.ansattId, `${r.type} er registrert`, [`${r.type} ${datoTekst(r.fra)}${r.til !== r.fra ? ` – ${datoTekst(r.til)}` : ''}, ${r.medLonn ? 'med' : 'uten'} lønn.`, ...(b.kommentar?.trim() ? [b.kommentar.trim()] : [])]);
    oppdater(); revalidatePath('/lonn');
    return { angre, melding: `${r.type} er registrert for ${n}, ${r.medLonn ? 'med' : 'uten'} lønn.${vakt} ${n} har fått beskjed.` };
  });
}

export async function lederByttHandling(id: string, godkjenn: boolean): Promise<Resultat<Svar>> {
  return trygt(async () => {
    const s = await kreverLeder(); const db = await getDb();
    const b = (await V.bytter(db, s.org.id, { status: ['venter_leder'] })).find(x => x.id === id);
    if (!b) throw new RegnskapsFeil('Byttet er allerede besvart.');
    const { angre } = await medAngre(db, s.org.id, { vakter: [b.vaktId], bytte: [id], uker: ukerFor(b.dato) }, t => V.lederBytte(t, s.org.id, id, godkjenn));
    for (const hvem of [b.fraId, b.tilId]) await varsleAnsatt(db, s.org.id, s.org.navn, hvem, godkjenn ? 'Byttet er godkjent' : 'Byttet ble ikke godkjent', [`Vakten ${datoTekst(b.dato)} ${b.start}–${b.slutt}: ${godkjenn ? `${fornavn(b.tilNavn)} tar den.` : `${fornavn(b.fraNavn)} beholder den.`}`]);
    oppdater();
    return { angre, melding: godkjenn ? `Byttet er godkjent. ${fornavn(b.tilNavn)} tar ${datoTekst(b.dato).split(' ')[0]}svakten.` : `Byttet er avslått. ${fornavn(b.fraNavn)} og ${fornavn(b.tilNavn)} har fått beskjed.` };
  });
}

export async function godkjennTimerHandling(aar: number, uke: number, hvem: string[] | 'stemmer' | 'alle' = 'alle'): Promise<Resultat<Svar & { antall: number }>> {
  return trygt(async () => {
    const s = await kreverLeder(); const db = await getDb();
    const rader = (await V.timerForUke(db, s.org.id, aar, uke)).filter(r => r.status === 'venter');
    const { angre, r: n } = await medAngre(db, s.org.id, { timeliste: rader.map(r => ({ ansattId: r.ansattId, aar, uke })) }, t => V.godkjennTimeliste(t, s.org.id, aar, uke, hvem));
    revalidatePath('/lonn'); oppdater();
    const en = Array.isArray(hvem) && hvem.length === 1 ? rader.find(r => r.ansattId === hvem[0]) : null;
    const tilLonn = (await V.innstillinger(db, s.org.id)).lonn.on ? ' og sendt til Lønn' : '';
    return { angre, antall: n, melding: en ? `${timerTall(en.arbeid + en.fravaer)} t for ${fornavn(en.navn)} er godkjent${tilLonn}.` : `${n} ${n === 1 ? 'timeliste er' : 'timelister er'} godkjent${tilLonn}.` };
  });
}

/** Godkjenn alt som er i orden: fravær uten vakter i perioden og timelister uten avvik. */
export async function godkjennAlleHandling(): Promise<Resultat<Svar>> {
  return trygt(async () => {
    const s = await kreverLeder(); const db = await getDb();
    const dag = idag();
    const f = await V.foresporsler(db, s.org.id, dag);
    const fravOk = f.fravaer.filter(x => x.vakter === 0);
    const lister = await V.ventendeTimelister(db, s.org.id, dag);
    const tl = lister.flatMap(l => l.rader.filter(r => !r.avvik.length).map(r => ({ ansattId: r.ansattId, aar: l.aar, uke: l.uke })));
    if (!fravOk.length && !tl.length) throw new RegnskapsFeil('Ingenting er klart til å godkjennes uten at du ser på det.');
    const inn = await V.innstillinger(db, s.org.id);
    const { angre } = await medAngre(db, s.org.id, { fravaer: fravOk.map(x => x.id), timeliste: tl, tilgj: fravOk.flatMap(x => [{ ansattId: x.ansattId, dato: x.fra }]) }, async t => {
      for (const x of fravOk) await V.behandleFravaer(t, s.org.id, { kilde: 'fravaer', id: x.id, type: x.type, medLonn: inn.absence.cfg[x.type as keyof typeof inn.absence.cfg]?.pay ?? x.medLonn });
      for (const l of lister) if (l.rader.some(r => !r.avvik.length)) await V.godkjennTimeliste(t, s.org.id, l.aar, l.uke, 'stemmer');
    });
    for (const x of fravOk) await varsleAnsatt(db, s.org.id, s.org.navn, x.ansattId, `${x.type} er godkjent`, [`${x.type} ${datoTekst(x.fra)}${x.til !== x.fra ? ` – ${datoTekst(x.til)}` : ''} er godkjent.`]);
    oppdater(); revalidatePath('/lonn');
    const deler = [fravOk.length && `${fravOk.length} fravær`, tl.length && `${tl.length} ${tl.length === 1 ? 'timeliste' : 'timelister'}`].filter(Boolean).join(' og ');
    return { angre, melding: `Godkjent: ${deler}. Resten trenger at du ser på dem.` };
  });
}

// ---------- Leder: innstillinger ----------

export async function lagreInnstillingerHandling(inn: VaktInnstillinger): Promise<Resultat<VaktInnstillinger>> {
  return trygt(async () => { const s = await kreverLeder(); const r = await V.lagreInnstillinger(await getDb(), s.org.id, inn); oppdater(); revalidatePath('/lonn'); return r; },
    'Innstillingene er lagret. De ansatte ser endringene med en gang.');
}

export async function lagreStederHandling(liste: string[]): Promise<Resultat<string[]>> {
  return trygt(async () => { const s = await kreverLeder(); const r = await V.lagreSteder(await getDb(), s.org.id, liste); oppdater(); return r; }, 'Stedene er lagret.');
}

export async function lagreMalerHandling(m: VaktMal[]): Promise<Resultat> {
  return trygt(async () => { const s = await kreverLeder(); await V.lagreMaler(await getDb(), s.org.id, m); oppdater(); }, 'Vakttypene er lagret.');
}

export async function settOvertidHandling(prosent: number): Promise<Resultat> {
  return trygt(async () => { const s = await kreverLeder(); await V.settOvertid(await getDb(), s.org.id, prosent); oppdater(); revalidatePath('/lonn'); }, 'Overtidstillegget er lagret.');
}

// ---------- Leder: ansatte ----------

async function sendInvitasjon(db: Db, orgId: string, foretak: string, leder: string, ansattId: string) {
  const i = await db.tx(t => V.inviterAnsatt(t, orgId, ansattId));
  const lenke = `${tilVaktplan(await grunnadresse())}/vakt/inn/${i.token}`;
  const sendt = i.epost ? await sendEpost({ til: i.epost, ...maler.vakt({ navn: i.navn, foretak, tittel: 'Du er invitert til vaktplanen', linjer: [`${leder} har invitert deg til vaktplanen for ${foretak}.`, 'Lenken gjelder i 7 dager. Du trenger ikke passord.'], knappTekst: 'Logg inn på vaktplanen', lenke }) }) : false;
  return { lenke, sendt, epost: i.epost, navn: i.navn };
}

export async function inviterNyHandling(a: { navn: string; epost: string; mobil?: string | null; stilling?: string | null; lonnType: 'fast' | 'time'; stillingsprosent: number }): Promise<Resultat<Svar & { id: string; lenke: string; sendt: boolean }>> {
  return trygt(async () => {
    const s = await kreverLeder(); const db = await getDb();
    const id = await db.tx(t => V.nyAnsatt(t, s.org.id, a));
    await synkEkstraAnsatte(db, s.org.id).catch(e => console.error('Ekstra ansatte i Stripe:', e));
    const r = await sendInvitasjon(db, s.org.id, s.org.navn, s.bruker.navn, id);
    oppdater(); revalidatePath('/lonn');
    if (!r.sendt) return { id, lenke: r.lenke, sendt: false, melding: `${fornavn(r.navn)} er lagt til, men e-posten ble ikke sendt. Send lenken selv.` };
    return { id, lenke: r.lenke, sendt: true, melding: `Invitasjonen er sendt til ${r.epost}. ${fornavn(r.navn)} logger inn med lenken i e-posten.` };
  });
}

/** Send invitasjonen (på nytt). */
export async function inviterAnsattHandling(ansattId: string): Promise<Resultat<Svar & { lenke: string; sendt: boolean }>> {
  return trygt(async () => {
    const s = await kreverLeder(); const db = await getDb();
    const r = await sendInvitasjon(db, s.org.id, s.org.navn, s.bruker.navn, ansattId);
    oppdater();
    if (!r.epost) return { lenke: r.lenke, sendt: false, melding: `${fornavn(r.navn)} har ingen e-postadresse. Legg den inn under Endre, eller send lenken selv.` };
    if (!r.sendt) return { lenke: r.lenke, sendt: false, melding: `E-posten ble ikke sendt. Send lenken til ${fornavn(r.navn)} selv.` };
    return { lenke: r.lenke, sendt: r.sendt, melding: `Invitasjonen er sendt til ${r.epost}. ${fornavn(r.navn)} logger inn med lenken i e-posten.` };
  });
}

export async function oppdaterAnsattHandling(id: string, a: Parameters<typeof V.oppdaterAnsatt>[3]): Promise<Resultat<Svar>> {
  return trygt(async () => {
    const s = await kreverLeder(); const db = await getDb();
    await V.oppdaterAnsatt(db, s.org.id, id, a);
    oppdater(); revalidatePath('/lonn');
    return { melding: `Endringene for ${fornavn((await navnPa(db, id)) ?? '')} er lagret.` };
  });
}

export async function tilbakestillInnloggingHandling(id: string): Promise<Resultat<Svar & { lenke: string; sendt: boolean }>> {
  return trygt(async () => {
    const s = await kreverLeder(); const db = await getDb();
    const token = await db.tx(t => V.tilbakestillInnlogging(t, s.org.id, id));
    const a = (await V.vaktAnsatte(db, s.org.id)).find(x => x.id === id)!;
    const lenke = `${tilVaktplan(await grunnadresse())}/vakt/inn/${token}`;
    const sendt = a.epost ? await sendEpost({ til: a.epost, ...maler.vakt({ navn: a.navn, foretak: s.org.navn, tittel: 'Ny innloggingslenke', linjer: ['Her er en ny lenke til vaktplanen. De gamle lenkene virker ikke lenger.', 'Lenken gjelder i 7 dager. Du trenger ikke passord.'], knappTekst: 'Logg inn på vaktplanen', lenke }) }) : false;
    oppdater();
    if (!sendt) return { lenke, sendt, melding: `De gamle lenkene virker ikke lenger, og ${fornavn(a.navn)} er logget ut på alle enheter. E-posten ble ikke sendt, så send den nye lenken selv.` };
    return { lenke, sendt, melding: `Ny innloggingslenke er sendt til ${a.epost ?? 'den ansatte'}. De gamle lenkene virker ikke lenger, og ${fornavn(a.navn)} er logget ut på alle enheter.` };
  });
}

export async function fjernAnsattHandling(id: string): Promise<Resultat<Svar>> {
  return trygt(async () => {
    const s = await kreverLeder(); const db = await getDb();
    const navn = (await navnPa(db, id)) ?? '';
    const dag = idag();
    const { angre, r } = await medAngre(db, s.org.id, async t => {
      const vakter = await t.q<{ id: string; dato: string }>('select id, dato::text as dato from vakt where organisasjon_id = $1 and ansatt_id = $2 and dato >= $3', [s.org.id, id, dag]);
      const interesse = await t.q<{ vakt_id: string }>('select vakt_id from vakt_interesse where ansatt_id = $1', [id]);
      return { ansatt: id, vakter: [...new Set([...vakter.map(v => v.id), ...interesse.map(x => x.vakt_id)])], uker: ukerFor(...vakter.map(v => v.dato)) };
    }, t => V.fjernFraVaktplan(t, s.org.id, id, dag));
    await synkEkstraAnsatte(db, s.org.id).catch(e => console.error('Ekstra ansatte i Stripe:', e));
    oppdater();
    const n = r.ledige.length;
    return { angre, melding: `${navn} er fjernet fra vaktplanen.${n ? ` ${n} ${n === 1 ? 'vakt er' : 'vakter er'} nå ledige.` : ''}` };
  });
}

/** Den gamle «Legg til ansatt» fra regnskapet (Lønn). */
export async function lagreVaktAnsattHandling(a: V.NyAnsatt & { inviter?: boolean }): Promise<Resultat<{ id: string; lenke: string | null; sendt: boolean }>> {
  return trygt(async () => {
    const s = await kreverLeder(); const db = await getDb();
    const id = await db.tx(t => V.lagreVaktAnsatt(t, s.org.id, a));
    if (!a.id) await synkEkstraAnsatte(db, s.org.id).catch(e => console.error('Ekstra ansatte i Stripe:', e));
    let lenke: string | null = null, sendt = false;
    if (a.inviter) ({ lenke, sendt } = await sendInvitasjon(db, s.org.id, s.org.navn, s.bruker.navn, id));
    oppdater(); revalidatePath('/lonn');
    return { id, lenke, sendt };
  });
}

// ---------- Leder: assistenten ----------

export interface Forslag { tittel: string; tekst: string; punkter: string[]; handling: { tekst: string; art: 'uke' | 'gi' | 'flytt'; data: Record<string, unknown> } | null }

/** Forslag-kort fra assistenten. Den lager bare forslag; lederen godkjenner, og ingenting publiseres. */
export async function assistentForslag(art: 'uke' | 'ledig' | 'overtid', aar: number, uke: number): Promise<Resultat<Forslag>> {
  return trygt(async () => {
    const s = await kreverLeder();
    if (!harAssistent(s.org.pakke)) throw new RegnskapsFeil('Assistenten er med i Selskap.');
    const db = await getDb();
    const inn = await V.innstillinger(db, s.org.id);
    if (art === 'uke') {
      const neste = flyttUke(aar, uke, 1);
      const f = await V.forslagUke(db, s.org.id, neste.aar, neste.uke);
      const d = ukeDager(neste.aar, neste.uke);
      if (f.finnes) return { tittel: `Uke ${neste.uke} har allerede vakter`, tekst: 'Jeg lager bare forslag for tomme uker. Endre vaktene selv, eller tøm uka først.', punkter: [], handling: null };
      if (!f.vakter.length) return { tittel: `Ingen vakter å bygge på`, tekst: `Uke ${uke} har ingen vakter jeg kan bruke som mal. Lag den første uka selv, så foreslår jeg neste.`, punkter: [], handling: null };
      return {
        tittel: `Uke ${neste.uke}, ${Number(d[0].slice(8))}.–${datoTekst(d[6]).split(' ').slice(1).join(' ')}`,
        tekst: `Samme oppsett som uke ${uke}, tilpasset det de ansatte har sagt om tilgjengelighet.`,
        punkter: [`${f.vakter.length} vakter, ${timerTall(f.timerMin)} t til sammen`, f.overtidMin ? `${timerTall(f.overtidMin)} t overtid` : 'Ingen får overtid', ...(f.ledige ? [`${f.ledige} ${f.ledige === 1 ? 'vakt blir ledig' : 'vakter blir ledige'}`] : []), ...f.hensyn.slice(0, 4)],
        handling: { tekst: 'Lagre som utkast', art: 'uke', data: { aar: neste.aar, uke: neste.uke, vakter: f.vakter } },
      };
    }
    const d = ukeDager(aar, uke);
    const u = await V.hentUke(db, s.org.id, aar, uke);
    const vurder = (v: V.VaktRad, a: V.VaktAnsatt) => {
      const andre = u.vakter.filter(x => x.id !== v.id);
      const for_ = analyserUke(andre, [a], grenser(inn)).perAnsatt.get(a.id)!;
      const etter = analyserUke([...andre, { ...v, ansattId: a.id }], [a], grenser(inn)).perAnsatt.get(a.id)!;
      const kan = u.tilgj.some(x => x.ansattId === a.id && x.dato === v.dato && x.status === 'kan');
      const kanIkke = u.tilgj.some(x => x.ansattId === a.id && x.dato === v.dato && x.status === 'kan_ikke');
      const harVakt = andre.some(x => x.ansattId === a.id && x.dato === v.dato);
      return { a, kan, kanIkke, harVakt, overtid: etter.overtid > for_.overtid, merarbeid: etter.merarbeid > for_.merarbeid, timer: etter.arbeid, avtalt: etter.avtalt, interessert: v.interesse.includes(a.id) };
    };
    if (art === 'ledig') {
      const ledig = u.vakter.find(v => !v.ansattId && v.dato >= idag()) ?? u.vakter.find(v => !v.ansattId);
      if (!ledig) return { tittel: `Ingen ledige vakter i uke ${uke}`, tekst: 'Alle vaktene denne uka har en ansatt.', punkter: [], handling: null };
      const k = u.ansatte.map(a => vurder(ledig, a)).filter(x => !x.kanIkke && !x.harVakt)
        .sort((p, q) => Number(q.kan) - Number(p.kan) || Number(p.overtid) - Number(q.overtid) || Number(p.merarbeid) - Number(q.merarbeid) || Number(q.interessert) - Number(p.interessert) || p.timer - q.timer);
      const beste = k[0];
      if (!beste) return { tittel: `Ingen kan ta ${datoTekst(ledig.dato)}`, tekst: 'Alle har enten vakt den dagen eller har sagt at de ikke kan.', punkter: [], handling: null };
      const grunn = [beste.kan ? 'har sagt at hen kan jobbe' : beste.interessert ? 'har meldt interesse' : 'har ikke vakt den dagen', beste.overtid ? 'men får overtid' : 'og får ikke overtid'].join(', ');
      const andre = k.slice(1, 3).map(x => `${fornavn(x.a.navn)}${x.interessert ? ' har også meldt interesse, men' : ''} ${x.overtid ? 'får overtid' : x.merarbeid ? `får merarbeid (${timerTall(x.timer)} t, avtalen er ${timerTall(x.avtalt ?? 0)} t)` : 'kan også'}`);
      return {
        tittel: `${beste.a.navn} bør ta ${datoTekst(ledig.dato)}`, tekst: `${fornavn(beste.a.navn)} ${grunn}.${andre.length ? ` ${andre.join('. ')}.` : ''}`, punkter: [],
        handling: { tekst: `Gi ${datoTekst(ledig.dato).split(' ')[0]} til ${fornavn(beste.a.navn)}`, art: 'gi', data: { vaktId: ledig.id, ansattId: beste.a.id } },
      };
    }
    // Overtid
    const over = u.ansatte.filter(a => (u.perAnsatt[a.id]?.overtid ?? 0) > 0);
    if (!over.length) return { tittel: 'Nei, ingen får overtid denne uka', tekst: `Alle er under ${timerTall(grenser(inn).uke)} t.`, punkter: [], handling: null };
    const tittel = over.map(a => `${a.navn} får ${timerTall(u.perAnsatt[a.id].overtid)} t overtid`).join(', ');
    // Finn én vakt som kan flyttes til noen som kan, uten at de får overtid.
    for (const a of over) {
      const mine = u.vakter.filter(v => v.ansattId === a.id).sort((p, q) => (q.dato + q.start).localeCompare(p.dato + p.start));
      for (const v of mine) {
        const k = u.ansatte.filter(x => x.id !== a.id).map(x => vurder(v, x)).find(x => x.kan && !x.overtid && !x.harVakt);
        if (k) return {
          tittel, tekst: `${fornavn(a.navn)} har ${timerTall(u.perAnsatt[a.id].arbeid)} t denne uka, og grensen er ${timerTall(grenser(inn).uke)} t. ${fornavn(k.a.navn)} har sagt at hen kan jobbe ${ukedagAv(v.dato)}, så ${fornavn(k.a.navn)} kan ta ${fornavn(a.navn)}s ${ukedagAv(v.dato)}svakt.`, punkter: [],
          handling: { tekst: `Flytt ${fornavn(a.navn)}s ${ukedagAv(v.dato)} til ${fornavn(k.a.navn)}`, art: 'flytt', data: { vaktId: v.id, ansattId: k.a.id, fra: a.navn, til: k.a.navn, dato: v.dato } },
        };
      }
    }
    void d;
    return { tittel, tekst: 'Se over vaktene til de som får overtid. Ingen andre har sagt at de kan ta noen av dem.', punkter: [], handling: null };
  });
}

const ukedagAv = (d: string) => datoTekst(d).split(' ')[0];

export async function assistentUtfor(art: 'uke' | 'gi' | 'flytt', data: Record<string, unknown>): Promise<Resultat<Svar>> {
  return trygt(async () => {
    const s = await kreverLeder();
    if (!harAssistent(s.org.pakke)) throw new RegnskapsFeil('Assistenten er med i Selskap.');
    const db = await getDb();
    if (art === 'uke') {
      await db.tx(t => V.lagreForslagUke(t, s.org.id, Number(data.aar), Number(data.uke), data.vakter as V.VaktRad[]));
      oppdater();
      return { melding: `Uke ${data.uke} er lagret som utkast. De ansatte ser den ikke ennå.` };
    }
    const vaktId = String(data.vaktId), ansattId = String(data.ansattId);
    const v = await vaktInfo(db, s.org.id, vaktId);
    const { angre } = await medAngre(db, s.org.id, { vakter: [vaktId], uker: ukerFor(v.dato) }, t => V.tildel(t, s.org.id, vaktId, ansattId));
    oppdater();
    const n = fornavn((await navnPa(db, ansattId)) ?? '');
    if (art === 'flytt') return { angre, melding: `${fornavn(String(data.fra))}s ${ukedagAv(v.dato)}svakt er flyttet til ${n}. Publiser for å varsle.` };
    return { angre, melding: `Vakten ${datoTekst(v.dato)} er gitt til ${n}. ${n} får e-post når du publiserer.` };
  });
}

// ---------- Ansatt ----------

export async function interesseHandling(vaktId: string, pa: boolean): Promise<Resultat<{ melding: string; fikk?: boolean }>> {
  return trygt(async () => {
    const { s, a, db, inn } = await kreverAnsatt();
    if (!inn.open.on) throw new RegnskapsFeil('Ledige vakter er slått av.');
    const v = await vaktInfo(db, s.org.id, vaktId);
    const dag = datoTekst(v.dato).split(' ')[0];
    // Først til mølla: en helt ledig vakt blir din med en gang.
    if (pa && inn.open.who === 'forst' && !v.ansatt_id) {
      await db.tx(t => V.tildel(t, s.org.id, vaktId, a.id));
      await varsleLeder(db, s.org.id, s.org.navn, `${a.navn} tok den ledige vakten ${datoTekst(v.dato)}.`);
      oppdater();
      return { melding: `Vakten ${dag} er din. Den vises når lederen publiserer.`, fikk: true };
    }
    await V.settInteresse(db, s.org.id, a.id, vaktId, pa);
    if (pa) await varsleLeder(db, s.org.id, s.org.navn, `${a.navn} vil ta en ledig vakt.`);
    oppdater();
    return { melding: pa ? (v.utlagt ? 'Du har sagt ja. Lederen må godkjenne byttet.' : `Du har meldt interesse for ${dag}.`) : `Du har trukket deg fra ${dag}.` };
  });
}

export async function byttBortHandling(vaktId: string, pa: boolean): Promise<Resultat> {
  return trygt(async () => {
    const { s, a, db, inn } = await kreverAnsatt();
    if (!inn.give.on) throw new RegnskapsFeil('Å gi bort vakter er slått av.');
    await V.byttBort(db, s.org.id, a.id, vaktId, pa, inn.give.hours);
    if (pa) await varsleLeder(db, s.org.id, s.org.navn, `${a.navn} vil gi bort en vakt.`);
    oppdater();
  }, pa ? 'Forespørselen er sendt.' : 'Angret.');
}

export async function byttMedHandling(vaktId: string, tilAnsatt: string): Promise<Resultat> {
  return trygt(async () => {
    const { s, a, db, inn } = await kreverAnsatt();
    if (!inn.swap.on) throw new RegnskapsFeil('Bytte vakter er slått av.');
    await V.byttMed(db, s.org.id, a.id, vaktId, tilAnsatt);
    const v = await vaktInfo(db, s.org.id, vaktId);
    await varsleAnsatt(db, s.org.id, s.org.navn, tilAnsatt, `${fornavn(a.navn)} vil bytte en vakt med deg`, [`${a.navn} spør om du vil ta vakten ${datoTekst(v.dato)} ${v.start}–${v.slutt}.`, 'Svar under Bytter i vaktplanen.']);
    oppdater();
  }, 'Forespørselen er sendt.');
}

export async function svarByttHandling(byttId: string, ja: boolean): Promise<Resultat<{ melding: string }>> {
  return trygt(async () => {
    const { s, a, db, inn } = await kreverAnsatt();
    const r = await db.tx(t => V.svarBytte(t, s.org.id, a.id, byttId, ja, inn.swap.approve));
    const b = (await V.bytter(db, s.org.id, { ansattId: a.id })).find(x => x.id === byttId);
    if (b) {
      if (r === 'venter_leder') await varsleLeder(db, s.org.id, s.org.navn, `${b.fraNavn} og ${b.tilNavn} vil bytte en vakt.`);
      else await varsleAnsatt(db, s.org.id, s.org.navn, b.fraId, ja ? 'Byttet er klart' : 'Byttet ble ikke noe av', [ja ? `${a.navn} tar vakten din ${datoTekst(b.dato)}.` : `${a.navn} kan ikke ta vakten din ${datoTekst(b.dato)}.`]);
    }
    oppdater();
    return { melding: !ja ? 'Du har sagt nei takk.' : r === 'venter_leder' ? 'Du har sagt ja. Lederen må godkjenne byttet.' : 'Du har tatt vakten.' };
  });
}

export async function tilgjengeligHandling(dato: string, status: 'kan' | 'kan_ikke' | null, grunn?: string, timer?: Record<string, 'kan' | 'kan_ikke'> | null): Promise<Resultat<{ friForesporsel: boolean }>> {
  return trygt(async () => {
    const { s, a, db, inn } = await kreverAnsatt();
    if (dato < idag()) throw new RegnskapsFeil('Dagen har vært.');
    if (!inn.avail.on && !(inn.absence.on && status === 'kan_ikke') && status !== null) throw new RegnskapsFeil('Tilgjengelighet er slått av.');
    const r = await db.tx(t => V.settTilgjengelig(t, s.org.id, a.id, dato, status, grunn, timer));
    if (r.friForesporsel) await varsleLeder(db, s.org.id, s.org.navn, `${a.navn} ber om fri ${datoTekst(dato)}.`);
    oppdater();
    return r;
  });
}

export async function soknadHandling(f: { type: string; fra: string; til: string; grunn?: string | null; start?: string | null; slutt?: string | null }): Promise<Resultat> {
  return trygt(async () => {
    const { s, a, db, inn } = await kreverAnsatt();
    if (!inn.absence.on) throw new RegnskapsFeil('Fravær er slått av.');
    await V.soknadFravaer(db, s.org.id, a.id, f, inn);
    await varsleLeder(db, s.org.id, s.org.navn, `${a.navn} søker om ${f.type.toLowerCase()}.`);
    oppdater();
  }, 'Søknaden er sendt til lederen.');
}

export async function kommentarHandling(vaktId: string, tekst: string): Promise<Resultat> {
  return trygt(async () => {
    const { s, a, db, inn } = await kreverAnsatt();
    if (!inn.comments.on) throw new RegnskapsFeil('Kommentarer er slått av.');
    await V.kommenter(db, s.org.id, a.id, vaktId, tekst);
    oppdater();
  }, 'Kommentaren er lagret.');
}

export async function avvikHandling(x: { vaktId: string; start?: string | null; slutt?: string | null; tekst?: string | null }): Promise<Resultat> {
  return trygt(async () => {
    const { s, a, db, inn } = await kreverAnsatt();
    if (!inn.hours.on || !inn.hours.dev) throw new RegnskapsFeil('Avvik er slått av.');
    await V.meldAvvik(db, s.org.id, a.id, x);
    oppdater();
  }, 'Timene er sendt til lederen.');
}

export async function oversiktHandling(blokker: unknown): Promise<Resultat> {
  return trygt(async () => { const { s, a, db } = await kreverAnsatt(); await V.lagreOversikt(db, s.org.id, a.id, blokker); oppdater(); }, 'Oversikten er lagret.');
}

export async function varselEpostHandling(pa: boolean): Promise<Resultat> {
  return trygt(async () => { const { s, a, db } = await kreverAnsatt(); await db.q('update ansatt set varsel_epost = $3 where id = $1 and organisasjon_id = $2', [a.id, s.org.id, pa]); oppdater(); }, pa ? 'Du får varsler på e-post.' : 'Du får ikke varsler på e-post.');
}

void arbeidMin;

/** Rask godkjenning fra Hjem i regnskapet: fri uten lønn, og vakten blir ledig. */
export async function svarFriHandling(id: string, godkjenn: boolean): Promise<Resultat<Svar>> {
  return behandleFravaerHandling({ kilde: 'fri', id, avslag: !godkjenn, type: 'Fri uten lønn', handling: 'ledig' });
}
