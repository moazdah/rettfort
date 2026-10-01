import 'server-only';
import { redirect } from 'next/navigation';
import { getDb, type Db } from './db';
import { lesSesjon, kanEndre, type Sesjon } from './auth';
import { oktToken } from './okt';
import { RegnskapsFeil } from './hovedbok';

export async function db(): Promise<Db> {
  return getDb();
}

/**
 * Innlogget bruker. En ansatt (rollen «ansatt») ser bare sin egen vaktplan: foretaket skjules her,
 * så regnskapssider, API-er og handlinger avviser dem. /vakt bruker { ansatt: true }.
 */
export async function sesjon(o: { ansatt?: boolean } = {}): Promise<Sesjon | null> {
  const d = await getDb();
  const s = await lesSesjon(d, await oktToken());
  if (s && s.rolle === 'ansatt' && !o.ansatt) return { ...s, org: null };
  return s;
}

/** Krever innlogget bruker med et selskap valgt. Sender til innlogging eller velkomst ellers. */
export async function kreverSelskap(): Promise<Sesjon & { org: NonNullable<Sesjon['org']> }> {
  const s = await sesjon();
  if (!s) redirect('/logg-inn');
  if (s.rolle === 'ansatt') redirect('/vakt');
  if (!s.org) redirect('/velkommen');
  if (s.org.type === 'byra') redirect('/byra');
  return s as Sesjon & { org: NonNullable<Sesjon['org']> };
}

export async function kreverByra(): Promise<Sesjon & { org: NonNullable<Sesjon['org']> }> {
  const s = await sesjon();
  if (!s) redirect('/logg-inn');
  if (s.rolle === 'ansatt') redirect('/vakt');
  const byra = s.medlemskap.find(m => m.type === 'byra');
  if (!byra) redirect('/hjem');
  return s as Sesjon & { org: NonNullable<Sesjon['org']> };
}

export function sjekkSkrivetilgang(s: Sesjon) {
  if (!kanEndre(s.rolle)) throw new RegnskapsFeil('Du har bare lesetilgang.');
}

/** Dagens dato i Norge (YYYY-MM-DD). Kan overstyres med RETTFORT_IDAG for demo og tester. */
export function idag(): string {
  if (process.env.RETTFORT_IDAG) return process.env.RETTFORT_IDAG;
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' }).format(new Date());
}

export type Resultat<T = unknown> = { ok: true; data?: T; melding?: string } | { ok: false; feil: string };

/** Pakker en handling slik at regnskapsfeil blir en melding til brukeren i stedet for et krasj. */
export async function trygt<T>(fn: () => Promise<T>, melding?: string): Promise<Resultat<T>> {
  try {
    const data = await fn();
    return { ok: true, data, melding };
  } catch (e) {
    if (e instanceof RegnskapsFeil) return { ok: false, feil: e.message };
    const m = (e as Error)?.message ?? String(e);
    // Feil fra databasens regnskapsregler (triggere) er skrevet for brukeren.
    if (/låst|går ikke i null|kan ikke endres/.test(m)) return { ok: false, feil: m.replace(/^.*?ERROR:\s*/, '') };
    // Next.js bruker kastede feil til redirect; de må slippe gjennom.
    if ((e as { digest?: string })?.digest?.startsWith('NEXT_')) throw e;
    console.error(e);
    return { ok: false, feil: 'Noe gikk galt. Prøv igjen, eller kontakt oss hvis det skjer igjen.' };
  }
}
