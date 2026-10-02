import 'server-only';
import type { Db } from '@/lib/db';
import * as V from '@/lib/tjenester/vaktplan';
import { analyserUke, isoUke, ukeDager, flyttUke, plussDager, avtaltMin, arbeidMin } from '@/lib/vaktplan';
import { grenser } from '@/lib/vaktplan-innstillinger';

/**
 * Det den ansatte ser: publiserte vakter (egne og, hvis lederen tillater det, kollegers), ledige vakter,
 * bytter, tilgjengelighet, fravær og timer. Alt er filtrert etter lederens innstillinger.
 */
export async function hentAnsattData(d: Db, orgId: string, foretak: string, ansattId: string, idag: string) {
  const inn = await V.innstillinger(d, orgId);
  const g = grenser(inn);
  const naa = isoUke(idag);
  const uker = Array.from({ length: 6 }, (_, i) => { const u = flyttUke(naa.aar, naa.uke, i); return { ...u, dager: ukeDager(u.aar, u.uke) }; });
  const fra = uker[0].dager[0], til = uker[5].dager[6];
  const histFra = ukeDager(flyttUke(naa.aar, naa.uke, -4).aar, flyttUke(naa.aar, naa.uke, -4).uke)[0];
  const [alleAnsatte, vakterRaa, tilgj, egneFri, fravaer, bytter, saldo, hist, avvik, godkjent, me] = await Promise.all([
    V.vaktAnsatte(d, orgId), V.vakterMellom(d, orgId, fra, til, 'ansatt'), V.tilgjengelighet(d, orgId, fra, til),
    d.q<{ dato: string; status: string; grunn: string | null }>(`select dato::text as dato, status, grunn from fri_foresporsel where ansatt_id = $1 and dato >= $2 order by opprettet`, [ansattId, fra]),
    V.fravaer(d, orgId, { ansattId, fra: plussDager(idag, -365) }), V.bytter(d, orgId, { ansattId }), V.saldo(d, orgId, ansattId, idag),
    V.vakterMellom(d, orgId, histFra, plussDager(fra, -1), 'ansatt'), V.avvik(d, orgId, histFra, til, ansattId),
    d.q<{ aar: number; uke: number }>('select aar, uke from timeliste where ansatt_id = $1', [ansattId]),
    d.en<{ oversikt: unknown; varsel_epost: boolean }>('select oversikt, varsel_epost from ansatt where id = $1', [ansattId]),
  ]);
  const meg = alleAnsatte.find(a => a.id === ansattId)!;
  const visNavn = inn.colleagues.on && inn.colleagues.mode === 'navn';
  // Kolleger: bare det lederen tillater. Med «bare opptatt» vises ikke navnet.
  const kolleger = alleAnsatte.filter(a => a.id !== ansattId).map(a => ({ id: a.id, navn: visNavn ? a.navn : 'Opptatt', stilling: visNavn ? a.stilling : null, avtale: visNavn ? (a.lonnType === 'time' ? 'Timelønn' : `Fast ${a.stillingsprosent} %`) : null, mobil: visNavn ? a.mobil : null }));
  const vakter = vakterRaa.filter(v => v.ansattId === ansattId || !v.ansattId || inn.colleagues.on).map(v => ({
    id: v.id, ansattId: v.ansattId, dato: v.dato, start: v.start, slutt: v.slutt, type: v.type, sted: v.sted,
    kommentar: inn.comments.on ? v.kommentar : null, ansattKommentar: inn.comments.on && v.ansattId === ansattId ? v.ansattKommentar : null,
    utlagt: v.utlagt, interessert: v.interesse.includes(ansattId), andreInteressert: v.interesse.filter(i => i !== ansattId).length,
    arbeid: arbeidMin(v),
  })).filter(v => inn.open.on || v.ansattId);
  // Hva en ledig vakt betyr for meg: merarbeid eller overtid den uka.
  const egneUke = (dato: string) => { const w = isoUke(dato); const dd = ukeDager(w.aar, w.uke); return vakterRaa.filter(v => v.ansattId === ansattId && v.dato >= dd[0] && v.dato <= dd[6]); };
  const merknad = (v: (typeof vakterRaa)[number]) => {
    const mine = egneUke(v.dato);
    const for_ = analyserUke(mine, [meg], g).perAnsatt.get(ansattId)!;
    const etter = analyserUke([...mine, { ...v, ansattId }], [meg], g).perAnsatt.get(ansattId)!;
    const harVakt = mine.some(x => x.dato === v.dato);
    return { overtid: inn.ot.on && etter.overtid > for_.overtid, merarbeid: inn.ot.on && etter.merarbeid > for_.merarbeid, totalEtter: etter.arbeid, forUka: for_.arbeid, harVakt };
  };
  const ledige = vakterRaa.filter(v => v.dato >= idag && (!v.ansattId || (v.utlagt && v.ansattId !== ansattId))).map(v => ({ id: v.id, ...merknad(v) }));
  const ukeAnalyse = analyserUke(egneUke(idag), [meg], g).perAnsatt.get(ansattId)!;
  const timerUker = [];
  for (let i = 4; i >= 1; i--) {
    const u = flyttUke(naa.aar, naa.uke, -i);
    const dd = ukeDager(u.aar, u.uke);
    const mine = hist.filter(v => v.ansattId === ansattId && v.dato >= dd[0] && v.dato <= dd[6]);
    if (!mine.length) continue;
    timerUker.push({
      ...u, dager: dd, godkjent: godkjent.some(x => x.aar === u.aar && x.uke === u.uke),
      vakter: mine.map(v => { const a = avvik.find(x => x.vaktId === v.id); const faktisk = a && (a.start || a.slutt) ? { start: a.start ?? v.start, slutt: a.slutt ?? v.slutt } : null; return { id: v.id, dato: v.dato, start: v.start, slutt: v.slutt, arbeid: arbeidMin(faktisk ?? v), avvik: a ? { tekst: a.tekst, diffMin: a.diffMin, start: a.start, slutt: a.slutt } : null }; }),
    });
  }
  // Ukene som er publisert (resten vises ikke).
  const pub = new Set((await d.q<{ aar: number; uke: number }>(`select aar, uke from vaktuke where organisasjon_id = $1 and status <> 'utkast'`, [orgId])).map(x => `${x.aar}-${x.uke}`));
  return {
    foretak, idag, inn,
    meg: { id: meg.id, navn: meg.navn, stilling: meg.stilling, lonnType: meg.lonnType, stillingsprosent: meg.stillingsprosent, epost: meg.epost, mobil: meg.mobil, avtalt: avtaltMin(meg) },
    oversikt: Array.isArray(me?.oversikt) ? (me!.oversikt as { id: string; visible: boolean; count?: number }[]) : null,
    varselEpost: me?.varsel_epost ?? true,
    uker: uker.map(u => ({ ...u, publisert: pub.has(`${u.aar}-${u.uke}`) })),
    vakter, kolleger,
    // Til «Bytt med kollega»: navn, og hvilke dager og vakttyper de har (uten å vise vaktene ellers).
    byttKolleger: inn.swap.on ? alleAnsatte.filter(a => a.id !== ansattId).map(a => {
      const v = vakterRaa.filter(x => x.ansattId === a.id);
      return { id: a.id, navn: a.navn, dager: [...new Set(v.map(x => x.dato))], typer: [...new Set(v.map(x => `${x.dato}|${x.type ?? ''}`))] };
    }) : [],
    tilgj: tilgj.filter(t => t.ansattId === ansattId),
    fri: egneFri,
    fravaer: fravaer.map(f => ({ id: f.id, type: f.type, fra: f.fra, til: f.til, status: f.status, timerMin: f.timerMin, grunn: f.grunn, svar: f.svar })),
    saldo, ledige,
    bytter: bytter.filter(b => b.vaktId),
    uka: { arbeid: ukeAnalyse.arbeid, overtid: ukeAnalyse.overtid, avtalt: avtaltMin(meg) },
    timer: timerUker,
  };
}

export type AnsattData = Awaited<ReturnType<typeof hentAnsattData>>;
