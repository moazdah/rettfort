// Alle beløp lagres og regnes i øre (heltall). Aldri flyttall for penger.

export type Ore = number;

/** Tolker norsk beløp: «1 234,50», «1234.5», «-12,00», «kr 99». Returnerer øre, eller null ved ugyldig tekst. */
export function tilOre(tekst: string | number | null | undefined): Ore | null {
  if (tekst === null || tekst === undefined) return null;
  if (typeof tekst === 'number') {
    if (!Number.isFinite(tekst)) return null;
    return Math.round(tekst * 100);
  }
  let s = String(tekst).trim().replace(/kr\.?/gi, '').replace(/\s| | /g, '');
  if (!s) return null;
  let neg = false;
  if (s.startsWith('(') && s.endsWith(')')) { neg = true; s = s.slice(1, -1); }
  if (s.startsWith('-') || s.startsWith('−')) { neg = !neg; s = s.slice(1); }
  if (s.endsWith('-')) { neg = !neg; s = s.slice(0, -1); }
  if (!/^[\d.,']+$/.test(s)) return null;
  s = s.replace(/'/g, '');
  const siste = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  let heltall = s, desimal = '';
  if (siste >= 0) {
    const etter = s.slice(siste + 1);
    // Én eller to sifre etter siste skilletegn = desimaler. Tre sifre = tusenskille.
    if (etter.length <= 2) { heltall = s.slice(0, siste); desimal = etter; }
  }
  heltall = heltall.replace(/[.,]/g, '');
  if (heltall === '' && desimal === '') return null;
  if (!/^\d*$/.test(heltall) || !/^\d*$/.test(desimal)) return null;
  const ore = Number(heltall || '0') * 100 + Number((desimal + '00').slice(0, 2));
  if (!Number.isSafeInteger(ore)) return null;
  return neg ? -ore : ore;
}

/** 123456 → «1 234,56» (norsk format, hardt mellomrom som tusenskille er erstattet med vanlig mellomrom). */
export function kr(ore: Ore, opts: { desimaler?: boolean; fortegn?: boolean } = {}): string {
  const { desimaler = true, fortegn = false } = opts;
  const neg = ore < 0;
  const abs = Math.abs(Math.round(ore));
  const hel = Math.floor(abs / 100);
  const des = abs % 100;
  const helTekst = String(hel).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const ut = desimaler ? `${helTekst},${String(des).padStart(2, '0')}` : String(Math.round(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  if (neg) return `−${ut}`;
  return fortegn ? `+${ut}` : ut;
}

/** Runder til nærmeste øre fra en brøk (halv opp, bort fra null ved negative). */
export function rund(x: number): Ore {
  return x < 0 ? -Math.round(-x) : Math.round(x);
}

/**
 * Fordeler et bruttobeløp i netto og MVA for en sats i prosent.
 * MVA = brutto × sats / (100 + sats), rundet til øre. Netto = brutto − MVA, så summen alltid går opp.
 */
export function splittBrutto(brutto: Ore, sats: number): { netto: Ore; mva: Ore } {
  if (sats === 0) return { netto: brutto, mva: 0 };
  const mva = rund((brutto * sats) / (100 + sats));
  return { netto: brutto - mva, mva };
}

/** MVA av netto for en sats, rundet til øre. */
export function mvaAvNetto(netto: Ore, sats: number): Ore {
  return rund((netto * sats) / 100);
}

/** Summerer en liste av øre trygt. */
export function sum(liste: Ore[]): Ore {
  let s = 0;
  for (const v of liste) s += v;
  if (!Number.isSafeInteger(s)) throw new Error('Beløpet er for stort.');
  return s;
}
