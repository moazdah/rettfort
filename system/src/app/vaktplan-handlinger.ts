'use server';

// Serverhandlinger for vaktplanen: lederen på /vaktplan og den ansatte på /vakt.

import { revalidatePath } from 'next/cache';
import { sesjon, trygt, idag, type Resultat } from '@/lib/server';
import { getDb, type Db } from '@/lib/db';
import { RegnskapsFeil } from '@/lib/hovedbok';
import { kanEndre } from '@/lib/auth';
import { harVaktplan } from '@/lib/pakker';
import { sendEpost, maler, grunnadresse } from '@/lib/epost';
import { tilVaktplan } from '@/lib/verter';
import * as V from '@/lib/tjenester/vaktplan';
import * as VV from '@/lib/tjenester/vaktvarsel';
import { kortTid, type VaktMal } from '@/lib/vaktplan';


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
  return { s: s as typeof s & { org: NonNullable<typeof s.org> }, a, db };
}

const oppdater = () => { revalidatePath('/vaktplan'); revalidatePath('/vakt'); revalidatePath('/hjem'); };

const varsleAnsatt = async (db: Db, orgId: string, foretak: string, ansattId: string, tittel: string, linjer: string[]) => VV.varsleAnsatt(db, await grunnadresse(), orgId, foretak, ansattId, tittel, linjer);
const varsleLeder = async (db: Db, orgId: string, foretak: string, hva: string) => VV.varsleLeder(db, await grunnadresse(), orgId, foretak, hva);
const dagTekst = VV.dagTekst;

// ---------- Leder ----------

export async function lagreVaktHandling(v: { id?: string | null; ansattId: string | null; dato: string; start: string; slutt: string }): Promise<Resultat<{ id: string; advarsler: string[] }>> {
  return trygt(async () => { const s = await kreverLeder(); const db = await getDb(); const r = await db.tx(t => V.lagreVakt(t, s.org.id, v)); oppdater(); return r; });
}

export async function sjekkVakt(v: { id?: string | null; ansattId: string | null; dato: string; start: string; slutt: string }): Promise<Resultat<string[]>> {
  return trygt(async () => { const s = await kreverLeder(); return V.advarslerFor(await getDb(), s.org.id, v); });
}

export async function slettVaktHandling(id: string): Promise<Resultat> {
  return trygt(async () => { const s = await kreverLeder(); const db = await getDb(); await db.tx(t => V.slettVakt(t, s.org.id, id)); oppdater(); }, 'Vakten er slettet.');
}

export async function gjorLedigHandling(id: string): Promise<Resultat> {
  return trygt(async () => {
    const s = await kreverLeder(); const db = await getDb();
    const v = (await db.en<{ dato: string; start: string; slutt: string; ansatt_id: string | null; utlagt: boolean }>('select dato::text as dato, start::text as start, slutt::text as slutt, ansatt_id, utlagt from vakt where id = $1 and organisasjon_id = $2', [id, s.org.id]));
    const fra = await db.tx(t => V.gjorLedig(t, s.org.id, id));
    if (fra && v?.utlagt) await varsleAnsatt(db, s.org.id, s.org.navn, fra, 'Byttet ditt er godkjent', [`Du slipper vakten ${dagTekst(v.dato)} ${kortTid(v.start, v.slutt)}. Den er lagt ut som ledig.`]);
    oppdater();
  }, 'Vakten er ledig.');
}

export async function beholdHandling(id: string): Promise<Resultat> {
  return trygt(async () => {
    const s = await kreverLeder(); const db = await getDb();
    const v = await db.en<{ dato: string; start: string; slutt: string }>('select dato::text as dato, start::text as start, slutt::text as slutt from vakt where id = $1 and organisasjon_id = $2', [id, s.org.id]);
    const hvem = await db.tx(t => V.behold(t, s.org.id, id));
    if (hvem && v) await varsleAnsatt(db, s.org.id, s.org.navn, hvem, 'Vakten blir på deg', [`Lederen har bestemt at du beholder vakten ${dagTekst(v.dato)} ${kortTid(v.start, v.slutt)}.`]);
    oppdater();
  }, 'Vakten beholdes.');
}

export async function tildelHandling(vaktId: string, ansattId: string): Promise<Resultat> {
  return trygt(async () => {
    const s = await kreverLeder(); const db = await getDb();
    const r = await db.tx(t => V.tildel(t, s.org.id, vaktId, ansattId));
    await varsleAnsatt(db, s.org.id, s.org.navn, ansattId, 'Du fikk vakten', [`Du har fått vakten ${dagTekst(r.dato)} ${kortTid(r.start, r.slutt)}.`]);
    oppdater();
  }, 'Vakten er gitt bort.');
}

export async function publiserHandling(aar: number, uke: number): Promise<Resultat<{ varslet: number; uten: number }>> {
  return trygt(async () => {
    const s = await kreverLeder();
    const r = await VV.publiserOgVarsle(await getDb(), await grunnadresse(), s.org.id, s.org.navn, aar, uke);
    oppdater();
    return r;
  });
}

export async function kopierUkeHandling(fra: { aar: number; uke: number }, til: { aar: number; uke: number }): Promise<Resultat<number>> {
  return trygt(async () => { const s = await kreverLeder(); const db = await getDb(); const n = await db.tx(t => V.kopierUke(t, s.org.id, fra, til)); oppdater(); return n; });
}

export async function svarFriHandling(id: string, godkjenn: boolean): Promise<Resultat> {
  return trygt(async () => {
    const s = await kreverLeder(); const db = await getDb();
    const f = await db.tx(t => V.svarFri(t, s.org.id, id, godkjenn));
    await varsleAnsatt(db, s.org.id, s.org.navn, f.ansatt_id, godkjenn ? 'Du har fått fri' : 'Fri ble ikke godkjent', [godkjenn ? `Du har fri ${dagTekst(f.dato)}. Vakten din er lagt ut som ledig.` : `Du har fortsatt vakten ${dagTekst(f.dato)}. Snakk med lederen om det haster.`]);
    oppdater();
  }, godkjenn ? 'Godkjent. Vakten er ledig.' : 'Avslått.');
}

export async function lagreVaktAnsattHandling(a: V.NyAnsatt & { inviter?: boolean }): Promise<Resultat<{ id: string; lenke: string | null; sendt: boolean }>> {
  return trygt(async () => {
    const s = await kreverLeder(); const db = await getDb();
    const id = await db.tx(t => V.lagreVaktAnsatt(t, s.org.id, a));
    let lenke: string | null = null, sendt = false;
    if (a.inviter) ({ lenke, sendt } = await inviter(db, s.org.id, s.org.navn, id));
    oppdater(); revalidatePath('/lonn');
    return { id, lenke, sendt };
  });
}

async function inviter(db: Db, orgId: string, foretak: string, ansattId: string) {
  const i = await db.tx(t => V.inviterAnsatt(t, orgId, ansattId));
  const lenke = `${tilVaktplan(await grunnadresse())}/vakt/inn/${i.token}`;
  const sendt = i.epost ? await sendEpost({ til: i.epost, ...maler.vakt({ navn: i.navn, foretak, tittel: 'Du er lagt til i vaktplanen', linjer: [`${foretak} bruker Rettført til vaktplanen.`, 'Her ser du vaktene dine, tar ledige vakter, ber om fri og sier når du kan jobbe. Du ser ikke regnskapet.'], knappTekst: 'Åpne vaktplanen', lenke }) }) : false;
  return { lenke, sendt };
}

export async function inviterAnsattHandling(ansattId: string): Promise<Resultat<{ lenke: string; sendt: boolean }>> {
  return trygt(async () => { const s = await kreverLeder(); const db = await getDb(); const r = await inviter(db, s.org.id, s.org.navn, ansattId); oppdater(); return r; });
}

export async function settOvertidHandling(prosent: number): Promise<Resultat> {
  return trygt(async () => { const s = await kreverLeder(); await V.settOvertid(await getDb(), s.org.id, prosent); oppdater(); revalidatePath('/lonn'); }, 'Overtidstillegget er lagret.');
}

export async function lagreMalerHandling(m: VaktMal[]): Promise<Resultat> {
  return trygt(async () => { const s = await kreverLeder(); await V.lagreMaler(await getDb(), s.org.id, m); oppdater(); }, 'Malene er lagret.');
}

export async function godkjennTimerHandling(aar: number, uke: number): Promise<Resultat<number>> {
  return trygt(async () => { const s = await kreverLeder(); const db = await getDb(); const n = await db.tx(t => V.godkjennTimeliste(t, s.org.id, aar, uke)); revalidatePath('/lonn'); return n; });
}

// ---------- Ansatt ----------

export async function interesseHandling(vaktId: string, pa: boolean): Promise<Resultat> {
  return trygt(async () => {
    const { s, a, db } = await kreverAnsatt();
    await V.settInteresse(db, s.org.id, a.id, vaktId, pa);
    if (pa) await varsleLeder(db, s.org.id, s.org.navn, `${a.navn} vil ta en ledig vakt.`);
    oppdater();
  }, pa ? 'Lederen får beskjed.' : 'Trukket.');
}

export async function byttBortHandling(vaktId: string, pa: boolean): Promise<Resultat> {
  return trygt(async () => {
    const { s, a, db } = await kreverAnsatt();
    await V.byttBort(db, s.org.id, a.id, vaktId, pa);
    if (pa) await varsleLeder(db, s.org.id, s.org.navn, `${a.navn} vil bytte bort en vakt.`);
    oppdater();
  }, pa ? 'Lederen får beskjed.' : 'Angret.');
}

export async function tilgjengeligHandling(dato: string, status: 'kan' | 'kan_ikke' | null, grunn?: string): Promise<Resultat<{ friForesporsel: boolean }>> {
  return trygt(async () => {
    const { s, a, db } = await kreverAnsatt();
    if (dato < idag()) throw new RegnskapsFeil('Dagen har vært.');
    const r = await db.tx(t => V.settTilgjengelig(t, s.org.id, a.id, dato, status, grunn));
    if (r.friForesporsel) await varsleLeder(db, s.org.id, s.org.navn, `${a.navn} ber om fri ${dagTekst(dato)}.`);
    oppdater();
    return r;
  });
}

