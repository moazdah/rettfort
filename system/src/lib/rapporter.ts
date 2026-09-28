// Rapporter regnes alltid ut fra posteringene i hovedboken.

import { kontoType, konto as finnKonto, erResultatkonto } from './kontoplan';
import { MVA_KODER } from './mva';
import { sum, type Ore } from './penger';

export interface PostRad {
  dato: string; // YYYY-MM-DD
  konto: number;
  debet: Ore;
  kredit: Ore;
  mvaKode?: string | null;
  mvaGrunnlag?: Ore | null;
  kontaktId?: string | null;
  bilagId?: string;
  bilagNr?: number;
  beskrivelse?: string | null;
}

export function iPeriode(r: { dato: string }, fra: string, til: string): boolean {
  return r.dato >= fra && r.dato <= til;
}

/** Saldo per konto (debet − kredit). */
export function saldobalanse(rader: PostRad[], fra?: string, til?: string): Map<number, { debet: Ore; kredit: Ore; saldo: Ore }> {
  const m = new Map<number, { debet: Ore; kredit: Ore; saldo: Ore }>();
  for (const r of rader) {
    if (fra && r.dato < fra) continue;
    if (til && r.dato > til) continue;
    const e = m.get(r.konto) ?? { debet: 0, kredit: 0, saldo: 0 };
    e.debet += r.debet; e.kredit += r.kredit; e.saldo = e.debet - e.kredit;
    m.set(r.konto, e);
  }
  return new Map([...m.entries()].sort((a, b) => a[0] - b[0]));
}

export interface Resultat {
  inntekter: Ore; // positivt tall
  kostnader: Ore; // positivt tall
  finans: Ore; // netto, positivt = inntekt
  skatt: Ore;
  resultat: Ore; // før disponering
  linjer: { konto: number; navn: string; belop: Ore; type: string }[];
}

export function resultatregnskap(rader: PostRad[], fra: string, til: string): Resultat {
  const sb = saldobalanse(rader, fra, til);
  let inntekter = 0, kostnader = 0, finans = 0, skatt = 0;
  const linjer: Resultat['linjer'] = [];
  for (const [nr, s] of sb) {
    if (!erResultatkonto(nr)) continue;
    const t = kontoType(nr);
    if (t === 'disponering') continue;
    const navn = finnKonto(nr)?.navn ?? String(nr);
    if (t === 'inntekt') { inntekter += -s.saldo; linjer.push({ konto: nr, navn, belop: -s.saldo, type: t }); }
    else if (t === 'kostnad') { kostnader += s.saldo; linjer.push({ konto: nr, navn, belop: s.saldo, type: t }); }
    else if (t === 'finansinntekt' || t === 'finanskostnad') { finans += -s.saldo; linjer.push({ konto: nr, navn, belop: -s.saldo, type: t }); }
    else if (t === 'skatt') { skatt += s.saldo; linjer.push({ konto: nr, navn, belop: s.saldo, type: t }); }
  }
  return { inntekter, kostnader, finans, skatt, resultat: inntekter - kostnader + finans - skatt, linjer };
}

export interface Balanse {
  eiendeler: Ore;
  egenkapital: Ore; // inkl. udisponert resultat
  gjeld: Ore;
  udisponertResultat: Ore;
  linjer: { konto: number; navn: string; belop: Ore; type: 'eiendel' | 'egenkapital' | 'gjeld' }[];
  /** Eiendeler − (egenkapital + gjeld). Skal alltid være 0. */
  differanse: Ore;
}

/** Balanse per dato. Alle posteringer til og med datoen, inkludert resultat som ikke er disponert. */
export function balanse(rader: PostRad[], perDato: string): Balanse {
  const sb = saldobalanse(rader, undefined, perDato);
  let eiendeler = 0, ek = 0, gjeld = 0, res = 0;
  const linjer: Balanse['linjer'] = [];
  for (const [nr, s] of sb) {
    const navn = finnKonto(nr)?.navn ?? String(nr);
    if (nr < 2000) { eiendeler += s.saldo; linjer.push({ konto: nr, navn, belop: s.saldo, type: 'eiendel' }); }
    else if (nr < 2100) { ek += -s.saldo; linjer.push({ konto: nr, navn, belop: -s.saldo, type: 'egenkapital' }); }
    else if (nr < 3000) { gjeld += -s.saldo; linjer.push({ konto: nr, navn, belop: -s.saldo, type: 'gjeld' }); }
    else res += -s.saldo; // resultatkontoer: inntekt − kostnad
  }
  return { eiendeler, egenkapital: ek + res, gjeld, udisponertResultat: res, linjer, differanse: eiendeler - (ek + res + gjeld) };
}

// ---------- MVA-melding ----------

export interface MvaLinje { kode: string; navn: string; grunnlag: Ore; mva: Ore }
export interface MvaMelding {
  fra: string;
  til: string;
  linjer: MvaLinje[];
  utgaende: Ore;
  inngaende: Ore;
  /** Positivt = å betale, negativt = til gode. */
  aBetale: Ore;
}

/**
 * Regner MVA-meldingen ut fra posteringene i perioden. Grunnlaget hentes fra inntekts-/kostnadslinjene
 * (ikke fra MVA-kontoene) for å unngå dobbelttelling. MVA-beløpet hentes fra 2700/2710.
 */
export function mvaMelding(rader: PostRad[], fra: string, til: string): MvaMelding {
  const g = new Map<string, MvaLinje>();
  const hent = (kode: string) => {
    let e = g.get(kode);
    if (!e) { e = { kode, navn: MVA_KODER[kode]?.melding || MVA_KODER[kode]?.navn || kode, grunnlag: 0, mva: 0 }; g.set(kode, e); }
    return e;
  };
  for (const r of rader) {
    if (!iPeriode(r, fra, til)) continue;
    const kode = r.mvaKode;
    if (!kode || kode === '0') continue;
    const def = MVA_KODER[kode];
    if (!def) continue;
    const erMvaKonto = r.konto === 2700 || r.konto === 2710;
    if (erMvaKonto) {
      const belop = r.konto === 2700 ? r.kredit - r.debet : r.debet - r.kredit;
      hent(kode).mva += belop;
    } else if (def.retning !== 'ingen' || kode === '6') {
      // Grunnlag: salg føres i kredit, kjøp i debet.
      const grunnlag = def.retning === 'utgaende' || kode === '6' ? r.kredit - r.debet : r.debet - r.kredit;
      hent(kode).grunnlag += grunnlag;
    }
  }
  const linjer = [...g.values()].filter(l => l.grunnlag !== 0 || l.mva !== 0).sort((a, b) => Number(a.kode) - Number(b.kode));
  const utgaende = sum(linjer.filter(l => MVA_KODER[l.kode]?.retning === 'utgaende').map(l => l.mva));
  const inngaende = sum(linjer.filter(l => MVA_KODER[l.kode]?.retning === 'inngaende').map(l => l.mva));
  return { fra, til, linjer, utgaende, inngaende, aBetale: utgaende - inngaende };
}

/** Månedlige inn/ut-tall for grafen «Måned for måned». */
export function manedForManed(rader: PostRad[], ar: number): { maned: number; inn: Ore; ut: Ore }[] {
  const m = Array.from({ length: 12 }, (_, i) => ({ maned: i + 1, inn: 0, ut: 0 }));
  for (const r of rader) {
    if (!r.dato.startsWith(String(ar))) continue;
    const i = Number(r.dato.slice(5, 7)) - 1;
    if (!erResultatkonto(r.konto) || r.konto >= 8300) continue;
    const t = kontoType(r.konto);
    if (t === 'inntekt' || t === 'finansinntekt') m[i].inn += r.kredit - r.debet;
    else m[i].ut += r.debet - r.kredit;
  }
  return m;
}
