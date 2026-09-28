// Hovedbok-motoren. Rene funksjoner som gjør hver handling om til posteringer.
// Alle beløp i øre. Hvert bilag må gå i null: sum debet = sum kredit.

import { splittBrutto, mvaAvNetto, sum, type Ore } from './penger';
import { konto as finnKonto } from './kontoplan';
import { utgaendeKode, inngaendeKode, MVA_KONTO_INNGAENDE, MVA_KONTO_UTGAENDE, MVA_KONTO_OPPGJOR, GYLDIGE_SATSER } from './mva';

export interface Postering {
  konto: number;
  debet: Ore;
  kredit: Ore;
  mvaKode?: string;
  /** Grunnlaget (netto) MVA er beregnet av, for MVA-meldingen. */
  mvaGrunnlag?: Ore;
  kontaktId?: string | null;
  beskrivelse?: string;
}

export class RegnskapsFeil extends Error {}

const D = (konto: number, belop: Ore, x: Partial<Postering> = {}): Postering => ({ konto, debet: belop, kredit: 0, ...x });
const Kr = (konto: number, belop: Ore, x: Partial<Postering> = {}): Postering => ({ konto, debet: 0, kredit: belop, ...x });

/** Snur et beløp slik at negative beløp havner på motsatt side. */
function side(konto: number, belop: Ore, debetSide: boolean, x: Partial<Postering> = {}): Postering {
  if (belop >= 0) return debetSide ? D(konto, belop, x) : Kr(konto, belop, x);
  return debetSide ? Kr(konto, -belop, x) : D(konto, -belop, x);
}

/** Kontrollerer at et bilag er gyldig. Kaster RegnskapsFeil med en forklaring på norsk. */
export function validerBilag(p: Postering[]): void {
  if (p.length < 2) throw new RegnskapsFeil('Et bilag må ha minst to posteringer.');
  for (const x of p) {
    if (!Number.isSafeInteger(x.debet) || !Number.isSafeInteger(x.kredit)) throw new RegnskapsFeil('Beløp må være hele øre.');
    if (x.debet < 0 || x.kredit < 0) throw new RegnskapsFeil('Debet og kredit kan ikke være negative.');
    if (x.debet > 0 && x.kredit > 0) throw new RegnskapsFeil('En postering kan ikke ha både debet og kredit.');
    if (!finnKonto(x.konto) && !(x.konto >= 1000 && x.konto <= 8999)) throw new RegnskapsFeil(`Konto ${x.konto} finnes ikke.`);
  }
  const d = sum(p.map(x => x.debet)), k = sum(p.map(x => x.kredit));
  if (d !== k) throw new RegnskapsFeil(`Bilaget går ikke i null: debet ${d} øre, kredit ${k} øre.`);
  if (d === 0) throw new RegnskapsFeil('Bilaget har ingen beløp.');
}

/** Slår sammen like linjer (samme konto, side, MVA-kode og kontakt) for et ryddigere bilag. */
export function komprimer(p: Postering[]): Postering[] {
  const m = new Map<string, Postering>();
  for (const x of p) {
    if (x.debet === 0 && x.kredit === 0) continue;
    const key = [x.konto, x.debet > 0 ? 'D' : 'K', x.mvaKode ?? '', x.kontaktId ?? ''].join('|');
    const e = m.get(key);
    if (e) { e.debet += x.debet; e.kredit += x.kredit; if (x.mvaGrunnlag !== undefined) e.mvaGrunnlag = (e.mvaGrunnlag ?? 0) + x.mvaGrunnlag; }
    else m.set(key, { ...x });
  }
  return [...m.values()];
}

// ---------- Kjøp (penger ut) ----------

export type BetaltMed = 'bank' | 'ubetalt' | 'privat' | 'kontant';

export interface KjopLinje {
  konto: number;
  /** Beløp med MVA for denne delen. */
  brutto: Ore;
  sats: number;
  /** Fradrag for inngående MVA. False for representasjon, leverandør uten MVA-registrering o.l. */
  fradrag?: boolean;
  beskrivelse?: string;
}

export function motkontoFor(betaltMed: BetaltMed): number {
  switch (betaltMed) {
    case 'bank': return 1920;
    case 'ubetalt': return 2400;
    case 'privat': return 2910;
    case 'kontant': return 1900;
  }
}

export function byggKjop(opts: { linjer: KjopLinje[]; betaltMed: BetaltMed; kontaktId?: string | null; mvaRegistrert: boolean; tekst?: string }): Postering[] {
  const { linjer, betaltMed, kontaktId = null, mvaRegistrert, tekst } = opts;
  if (!linjer.length) throw new RegnskapsFeil('Kjøpet har ingen linjer.');
  const ut: Postering[] = [];
  let total = 0;
  for (const l of linjer) {
    if (!GYLDIGE_SATSER.includes(l.sats as 25)) throw new RegnskapsFeil(`Ugyldig MVA-sats ${l.sats} %.`);
    if (l.brutto === 0) continue;
    total += l.brutto;
    const k = finnKonto(l.konto);
    const fradrag = mvaRegistrert && (l.fradrag ?? true) && !(k?.ikkeFradrag) && l.sats > 0;
    if (fradrag) {
      const { netto, mva } = splittBrutto(l.brutto, l.sats);
      const kode = inngaendeKode(l.sats);
      ut.push(side(l.konto, netto, true, { mvaKode: kode, mvaGrunnlag: netto, beskrivelse: l.beskrivelse ?? tekst }));
      ut.push(side(MVA_KONTO_INNGAENDE, mva, true, { mvaKode: kode, mvaGrunnlag: netto, beskrivelse: l.beskrivelse ?? tekst }));
    } else {
      ut.push(side(l.konto, l.brutto, true, { mvaKode: '0', beskrivelse: l.beskrivelse ?? tekst }));
    }
  }
  const motkonto = motkontoFor(betaltMed);
  ut.push(side(motkonto, total, false, { kontaktId: motkonto === 2400 ? kontaktId : null, beskrivelse: tekst }));
  const p = komprimer(ut.map(x => (x.konto === 2400 ? x : { ...x, kontaktId: x.kontaktId ?? null })));
  validerBilag(p);
  return p;
}

// ---------- Faktura (penger inn) ----------

export interface FakturaLinje {
  beskrivelse: string;
  /** Antall i tusendeler (1,5 timer = 1500) for å unngå flyttall. */
  antallMilli: number;
  /** Pris per enhet uten MVA, i øre. */
  pris: Ore;
  sats: number;
  konto?: number;
}

export function linjeNetto(l: FakturaLinje): Ore {
  return Math.round((l.antallMilli * l.pris) / 1000);
}

export interface FakturaSummer {
  netto: Ore;
  mva: Ore;
  total: Ore;
  perSats: { sats: number; grunnlag: Ore; mva: Ore }[];
}

/** MVA regnes per sats av summen av linjene (ikke per linje), rundet til øre. */
export function fakturaSummer(linjer: FakturaLinje[], mvaRegistrert: boolean): FakturaSummer {
  const grupper = new Map<number, Ore>();
  for (const l of linjer) {
    const sats = mvaRegistrert ? l.sats : 0;
    if (!GYLDIGE_SATSER.includes(sats as 25)) throw new RegnskapsFeil(`Ugyldig MVA-sats ${l.sats} %.`);
    grupper.set(sats, (grupper.get(sats) ?? 0) + linjeNetto(l));
  }
  const perSats = [...grupper.entries()].sort((a, b) => b[0] - a[0]).map(([sats, grunnlag]) => ({ sats, grunnlag, mva: mvaAvNetto(grunnlag, sats) }));
  const netto = sum(perSats.map(x => x.grunnlag));
  const mva = sum(perSats.map(x => x.mva));
  return { netto, mva, total: netto + mva, perSats };
}

export function byggFaktura(opts: { linjer: FakturaLinje[]; mvaRegistrert: boolean; kontaktId: string | null; betaltNa?: boolean; tekst?: string; kreditnota?: boolean }): Postering[] {
  const { linjer, mvaRegistrert, kontaktId, betaltNa = false, tekst, kreditnota = false } = opts;
  if (!linjer.length) throw new RegnskapsFeil('Fakturaen har ingen linjer.');
  const s = fakturaSummer(linjer, mvaRegistrert);
  if (s.total === 0) throw new RegnskapsFeil('Fakturaen har ingen beløp.');
  const fortegn = kreditnota ? -1 : 1;
  const ut: Postering[] = [];
  // Inntekt per konto og sats
  const inntekt = new Map<string, { konto: number; sats: number; netto: Ore }>();
  for (const l of linjer) {
    const sats = mvaRegistrert ? l.sats : 0;
    const konto = l.konto ?? (mvaRegistrert ? (sats === 0 ? 3100 : 3000) : 3200);
    const key = `${konto}|${sats}`;
    const e = inntekt.get(key) ?? { konto, sats, netto: 0 };
    e.netto += linjeNetto(l);
    inntekt.set(key, e);
  }
  for (const e of inntekt.values()) {
    const kode = mvaRegistrert ? utgaendeKode(e.sats) : '6';
    ut.push(side(e.konto, fortegn * e.netto, false, { mvaKode: kode, mvaGrunnlag: fortegn * e.netto, beskrivelse: tekst }));
  }
  for (const g of s.perSats) {
    if (g.mva === 0) continue;
    ut.push(side(MVA_KONTO_UTGAENDE, fortegn * g.mva, false, { mvaKode: utgaendeKode(g.sats), mvaGrunnlag: fortegn * g.grunnlag, beskrivelse: tekst }));
  }
  ut.push(side(betaltNa ? 1920 : 1500, fortegn * s.total, true, { kontaktId: betaltNa ? null : kontaktId, beskrivelse: tekst }));
  const p = komprimer(ut);
  validerBilag(p);
  return p;
}

// ---------- Betalinger ----------

export function byggInnbetaling(belop: Ore, kontaktId: string | null, tekst?: string): Postering[] {
  if (belop <= 0) throw new RegnskapsFeil('Innbetalingen må være større enn 0.');
  const p = [D(1920, belop, { beskrivelse: tekst }), Kr(1500, belop, { kontaktId, beskrivelse: tekst })];
  validerBilag(p);
  return p;
}

export function byggBetalingLeverandor(belop: Ore, kontaktId: string | null, tekst?: string): Postering[] {
  if (belop <= 0) throw new RegnskapsFeil('Betalingen må være større enn 0.');
  const p = [D(2400, belop, { kontaktId, beskrivelse: tekst }), Kr(1920, belop, { beskrivelse: tekst })];
  validerBilag(p);
  return p;
}

export type BankType = 'gebyr' | 'renteinntekt' | 'rentekostnad' | 'uttak' | 'innskudd_eier' | 'overforing';

/** Bankbevegelser uten bilag. Beløp er fortegnet slik det står i banken (ut = negativt). */
export function byggBankPost(type: BankType, belop: Ore, orgform: string, tekst?: string): Postering[] {
  const a = Math.abs(belop);
  if (a === 0) throw new RegnskapsFeil('Beløpet kan ikke være 0.');
  const enk = orgform === 'ENK';
  let p: Postering[];
  switch (type) {
    case 'gebyr': p = [D(7770, a, { mvaKode: '0' }), Kr(1920, a)]; break;
    case 'rentekostnad': p = [D(8140, a, { mvaKode: '0' }), Kr(1920, a)]; break;
    case 'renteinntekt': p = [D(1920, a), Kr(8040, a, { mvaKode: '0' })]; break;
    // AS: uttak til eier føres som fordring på eier (lån), ENK: privatuttak mot egenkapital.
    case 'uttak': p = [D(enk ? 2050 : 1570, a), Kr(1920, a)]; break;
    case 'innskudd_eier': p = [D(1920, a), Kr(enk ? 2050 : 2910, a)]; break;
    case 'overforing': p = belop < 0 ? [D(1921, a), Kr(1920, a)] : [D(1920, a), Kr(1921, a)]; break;
  }
  p = p.map(x => ({ ...x, beskrivelse: tekst }));
  validerBilag(p);
  return p;
}

// ---------- MVA-oppgjør ----------

/** Nuller ut 2700 og 2710 for en termin mot oppgjørskontoen 2740. Saldoene er fortegnet: debet − kredit. */
export function byggMvaOppgjor(saldo2700: Ore, saldo2710: Ore): Postering[] {
  const p: Postering[] = [];
  if (saldo2700 !== 0) p.push(side(MVA_KONTO_UTGAENDE, -saldo2700, true));
  if (saldo2710 !== 0) p.push(side(MVA_KONTO_INNGAENDE, -saldo2710, true));
  const netto = saldo2700 + saldo2710; // negativt = skyldig
  if (netto !== 0) p.push(side(MVA_KONTO_OPPGJOR, netto, true));
  if (p.length < 2) throw new RegnskapsFeil('Det er ingen MVA å gjøre opp for terminen.');
  validerBilag(p);
  return p;
}

// ---------- Korrigering ----------

/** Lager motposteringen til et bilag: samme linjer med debet og kredit byttet. Posteringer endres aldri. */
export function reverser(p: Postering[]): Postering[] {
  const r = p.map(x => ({ ...x, debet: x.kredit, kredit: x.debet, mvaGrunnlag: x.mvaGrunnlag !== undefined ? -x.mvaGrunnlag : undefined }));
  validerBilag(r);
  return r;
}

// ---------- Lønn ----------

export interface LonnsGrunnlag {
  brutto: Ore;
  skattetrekk: Ore;
  feriepenger: Ore; // opptjent denne perioden
  agaSats: number; // prosent, f.eks. 14.1
}

export function beregnAga(grunnlag: Ore, sats: number): Ore {
  return Math.round((grunnlag * Math.round(sats * 10)) / 1000);
}

/** Lønnskjøring for én eller flere ansatte samlet. */
export function byggLonn(ansatte: LonnsGrunnlag[], tekst = 'Lønn'): Postering[] {
  if (!ansatte.length) throw new RegnskapsFeil('Ingen ansatte i lønnskjøringen.');
  const brutto = sum(ansatte.map(a => a.brutto));
  const skatt = sum(ansatte.map(a => a.skattetrekk));
  const ferie = sum(ansatte.map(a => a.feriepenger));
  const aga = sum(ansatte.map(a => beregnAga(a.brutto, a.agaSats)));
  const agaFerie = sum(ansatte.map(a => beregnAga(a.feriepenger, a.agaSats)));
  if (skatt > brutto) throw new RegnskapsFeil('Skattetrekket er større enn lønnen.');
  const p: Postering[] = [
    D(5000, brutto), Kr(2600, skatt), Kr(1920, brutto - skatt),
    D(5020, ferie), Kr(2940, ferie),
    D(5400, aga), Kr(2770, aga),
    D(5405, agaFerie), Kr(2785, agaFerie),
  ].filter(x => x.debet > 0 || x.kredit > 0).map(x => ({ ...x, beskrivelse: tekst }));
  validerBilag(p);
  return p;
}

// ---------- Åpningsbalanse ----------

/** Inngående saldoer. Positive tall = debet. Differansen føres mot annen egenkapital (2050). */
export function byggApningsbalanse(saldoer: { konto: number; saldo: Ore }[]): Postering[] {
  const p: Postering[] = [];
  let diff = 0;
  for (const s of saldoer) {
    if (s.saldo === 0) continue;
    if (s.konto >= 3000) throw new RegnskapsFeil('Åpningsbalansen kan bare ha balansekontoer (1000–2999).');
    p.push(side(s.konto, s.saldo, true));
    diff += s.saldo;
  }
  if (diff !== 0) p.push(side(2050, -diff, true));
  validerBilag(p);
  return p;
}
