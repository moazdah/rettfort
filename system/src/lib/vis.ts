// Små hjelpere for visning. Brukes både på server og i nettleseren.

export { kr, tilOre } from './penger';

export const MANEDER = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const DAGER = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];

/** 2026-10-05 → 05.10.2026 */
export function nd(d: string | null | undefined): string {
  if (!d) return '';
  const [y, m, dd] = d.slice(0, 10).split('-');
  return `${dd}.${m}.${y}`;
}

/** 2026-10-05 → Mandag 5. oktober 2026 */
export function langDato(d: string): string {
  const x = new Date(d.slice(0, 10) + 'T00:00:00Z');
  const s = `${DAGER[x.getUTCDay()]} ${x.getUTCDate()}. ${MANEDER[x.getUTCMonth()]} ${x.getUTCFullYear()}`;
  return s[0].toUpperCase() + s.slice(1);
}

/** 2026-08 → august 2026 */
export function manedNavn(m: string, medAr = true): string {
  const [y, mm] = m.split('-').map(Number);
  return `${MANEDER[mm - 1]}${medAr ? ' ' + y : ''}`;
}

export function kortManed(d: string): string {
  return MANEDER[Number(d.slice(5, 7)) - 1].slice(0, 3).toUpperCase();
}

export const SALG_STATUS: Record<string, [string, string]> = {
  utkast: ['Utkast', ''],
  sendt: ['Sendt', 'gul'],
  delvis_betalt: ['Delvis betalt', 'gul'],
  betalt: ['Betalt', 'gronn'],
  kreditert: ['Kreditert', ''],
  akseptert: ['Akseptert', 'gronn'],
};

export const KJOP_STATUS: Record<string, [string, string]> = {
  utkast: ['Utkast', ''],
  registrert: ['Ikke betalt', 'gul'],
  betalt: ['Betalt', 'gronn'],
  trenger_titt: ['Trenger en titt', 'rod'],
};

export const SALG_TYPE: Record<string, string> = { faktura: 'Faktura', tilbud: 'Tilbud', kvittering: 'Kvittering', kreditnota: 'Kreditnota' };

/** Antall (tusendeler) som tekst: 1500 → "1,5" */
export function antallTekst(milli: number): string {
  return (milli / 1000).toLocaleString('nb-NO', { maximumFractionDigits: 3 });
}

export function tilMilli(t: string): number {
  const n = Number(String(t).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 1000) : 0;
}
