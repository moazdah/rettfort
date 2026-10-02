import 'server-only';
import type { Db } from '@/lib/db';
import { kanEndre, type Sesjon } from '@/lib/auth';
import { harAssistent, inkluderteAnsatte, EKSTRA_ANSATT, tarBetaltForEkstra } from '@/lib/pakker';
import * as V from '@/lib/tjenester/vaktplan';
import { isoUke, flyttUke, ukeDager, plussDager } from '@/lib/vaktplan';

/** Alt ledervisningen trenger for én uke, samlet på serveren. */
export async function hentLederData(d: Db, s: Sesjon & { org: NonNullable<Sesjon['org']> }, idag: string, valgt: { aar: number; uke: number }, regnskap: string) {
  const org = s.org.id;
  const inn = await V.innstillinger(d, org);
  if (inn.hours.on && inn.hours.auto && kanEndre(s.rolle)) await d.tx(t => V.autoGodkjenn(t, org, idag)).catch(() => undefined);
  const uke = await V.hentUke(d, org, valgt.aar, valgt.uke);
  // Måneden uka ligger i (torsdagen avgjør), som rutenett fra mandag.
  const mndDato = uke.dager[3];
  const forste = `${mndDato.slice(0, 7)}-01`;
  const sisteDag = new Date(Date.UTC(Number(mndDato.slice(0, 4)), Number(mndDato.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const mStart = ukeDager(isoUke(forste).aar, isoUke(forste).uke)[0];
  const mSlutt = ukeDager(isoUke(sisteDag).aar, isoUke(sisteDag).uke)[6];
  const [foresp, mndVakter, ventende, alleFravaer, timerMnd, statusUker] = await Promise.all([
    V.foresporsler(d, org, idag), V.vakterMellom(d, org, mStart, mSlutt), V.ventendeTimelister(d, org, idag),
    V.fravaer(d, org, { fra: plussDager(idag, -365) }), V.timerIMaaned(d, org, idag.slice(0, 7)),
    d.q<{ aar: number; uke: number; status: string }>('select aar, uke, status from vaktuke where organisasjon_id = $1', [org]),
  ]);
  const saldo: Record<string, V.Saldo> = {};
  for (const a of uke.ansatte) saldo[a.id] = await V.saldo(d, org, a.id, idag);
  // Timer: ukene som venter, ellers forrige uke.
  const forrigeUke = flyttUke(isoUke(idag).aar, isoUke(idag).uke, -1);
  const timerUker = ventende.length ? ventende.map(l => ({ aar: l.aar, uke: l.uke })) : [forrigeUke];
  const timer = [];
  for (const u of timerUker.slice(0, 4)) timer.push({ ...u, dager: ukeDager(u.aar, u.uke), rader: (await V.timerForUke(d, org, u.aar, u.uke)).map(r => ({ ...r, avvikTekst: r.avvik.map(V.avvikTekst) })) });
  const maaned: Record<string, { n: number; ledige: number }> = {};
  for (const v of mndVakter) { const m = (maaned[v.dato] ??= { n: 0, ledige: 0 }); if (v.ansattId) m.n++; else m.ledige++; }
  return {
    org: { navn: s.org.navn, pakke: s.org.pakke },
    leder: { navn: s.bruker.navn, epost: s.bruker.epost },
    regnskap, idag, endre: kanEndre(s.rolle),
    ...uke,
    forrige: flyttUke(valgt.aar, valgt.uke, -1), neste: flyttUke(valgt.aar, valgt.uke, 1),
    foresp, timer, saldo, timerMnd,
    alleFravaer: alleFravaer.filter(f => f.status === 'godkjent'),
    maaned: { fra: mStart, til: mSlutt, mnd: mndDato.slice(0, 7), dager: maaned },
    ukestatus: Object.fromEntries(statusUker.map(x => [`${x.aar}-${x.uke}`, x.status])),
    plass: { pakke: s.org.pakke, inkludert: inkluderteAnsatte(s.org.pakke), ekstraKr: EKSTRA_ANSATT / 100, intro: !tarBetaltForEkstra() },
    selskap: harAssistent(s.org.pakke),
  };
}

export type LederData = Awaited<ReturnType<typeof hentLederData>>;
