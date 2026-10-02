// Abonnementet: hva som er med i pakkene, og hva det koster per måned med ekstra ansatte og MVA.
// Beløp i øre. Stripe trekker beløpet med MVA.

import { PAKKER, EKSTRA_ANSATT, VAKTPLAN_ANSATTE, ekstraAnsatte, prisFor, tarBetaltForEkstra, type BetaltPakke } from '../pakker';

export const PAKKE_NAVN: Record<string, string> = { gratis: 'Gratis', start: 'Start', selskap: 'Selskap', byra: 'Byrå' };
export const RANG: Record<string, number> = { gratis: 0, start: 1, selskap: 2, byra: 3 };

/** «Med i …» på Bekreft pakken. */
export const MED: Record<BetaltPakke, string[]> = {
  start: ['Hele regnskapet uten grenser: faktura, kjøp, bank og MVA-melding', 'Lønn, lønnsslipper og A-melding', 'Regnskapsfører, SAF-T og årsoppgjør', 'Vaktplan for 5 ansatte, med timer rett til lønn'],
  selskap: ['Alt i Start', 'Assistenten som fører for deg', 'Vaktplan for 15 ansatte', 'Timer fra vaktplanen rett til lønn'],
};

/** Det som låses opp, med snarvei, til takk-siden. */
export const LAST_OPP: Record<BetaltPakke, { t: string; d: string; knapp: string; href: string }[]> = {
  start: [
    { t: 'Bank og MVA-melding', d: 'Last opp kontoutskriften og lag MVA-meldingen av det du har ført.', knapp: 'Åpne banken', href: '/bank' },
    { t: 'Lønn', d: 'Kjør lønn med skattetrekk, feriepenger og A-melding.', knapp: 'Se lønn', href: '/lonn' },
    { t: 'Vaktplan for 5 ansatte', d: 'Lag uka, svar på bytter og fri.', knapp: 'Åpne vaktplanen', href: '/vaktplan' },
  ],
  selskap: [
    { t: 'Assistenten', d: 'Fører for deg og spør når noe er uklart.', knapp: 'Prøv assistenten', href: '/hjem?assistent=1' },
    { t: 'Vaktplan for 15 ansatte', d: 'Lag uka, svar på bytter og fri.', knapp: 'Åpne vaktplanen', href: '/vaktplan' },
    { t: 'Timer rett til lønn', d: 'Godkjente timer fra vaktplanen går rett til lønnskjøringen.', knapp: 'Se lønn', href: '/lonn' },
  ],
};

export interface Prisregning { pakke: number; ekstra: number; ekstraAntall: number; netto: number; mva: number; sum: number; ordinaer: number }

/** Månedsprisen for en pakke med et gitt antall ansatte i vaktplanen. */
export function prisregning(pakke: BetaltPakke, ansatte: number): Prisregning {
  const ekstraAntall = ekstraAnsatte(pakke, ansatte);
  const ekstra = tarBetaltForEkstra() ? ekstraAntall * EKSTRA_ANSATT : 0;
  const p = prisFor(pakke), netto = p + ekstra, mva = Math.round(netto * 0.25);
  return { pakke: p, ekstra, ekstraAntall, netto, mva, sum: netto + mva, ordinaer: PAKKER.find(x => x.k === pakke)!.pris };
}

export const inkludert = (pakke: string) => VAKTPLAN_ANSATTE[pakke] ?? 0;

/** Samme dag neste måned (siste dag i måneden hvis den ikke finnes). */
export function omEnManed(dato: string): string {
  const [y, m, d] = dato.split('-').map(Number);
  const ny = new Date(Date.UTC(y, m, 1)); const siste = new Date(Date.UTC(ny.getUTCFullYear(), ny.getUTCMonth() + 1, 0)).getUTCDate();
  ny.setUTCDate(Math.min(d, siste));
  return ny.toISOString().slice(0, 10);
}

/** 124900 → «1 249 kr», 22375 → «223,75 kr». Øre vises bare når de ikke er 00. */
export function belop(ore: number): string {
  const kr = Math.floor(Math.abs(ore) / 100), o = Math.abs(ore) % 100;
  return `${ore < 0 ? '−' : ''}${String(kr).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}${o ? ',' + String(o).padStart(2, '0') : ''} kr`;
}

const MND = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
/** 2026-11-05 → «5. november 2026» */
export function datoTekst(d: string, medAr = true): string {
  const [y, m, dd] = d.slice(0, 10).split('-').map(Number);
  return `${dd}. ${MND[m - 1]}${medAr ? ' ' + y : ''}`;
}
