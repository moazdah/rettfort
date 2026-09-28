// MVA-koder etter SAF-T standard (Skatteetaten) og hvordan de posteres.

export type MvaRetning = 'inngaende' | 'utgaende' | 'ingen' | 'omvendt';

export interface MvaKode {
  kode: string;
  sats: number; // prosent
  retning: MvaRetning;
  navn: string;
  /** Linje i MVA-meldingen (forenklet gruppering). */
  melding: string;
}

export const MVA_KODER: Record<string, MvaKode> = {
  '0': { kode: '0', sats: 0, retning: 'ingen', navn: 'Ingen MVA', melding: '' },
  '1': { kode: '1', sats: 25, retning: 'inngaende', navn: 'Fradrag inngående MVA, 25 %', melding: 'Fradrag for inngående MVA, 25 %' },
  '11': { kode: '11', sats: 15, retning: 'inngaende', navn: 'Fradrag inngående MVA, 15 %', melding: 'Fradrag for inngående MVA, 15 %' },
  '13': { kode: '13', sats: 12, retning: 'inngaende', navn: 'Fradrag inngående MVA, 12 %', melding: 'Fradrag for inngående MVA, 12 %' },
  '3': { kode: '3', sats: 25, retning: 'utgaende', navn: 'Utgående MVA, 25 %', melding: 'Innenlandsk omsetning og uttak, 25 %' },
  '31': { kode: '31', sats: 15, retning: 'utgaende', navn: 'Utgående MVA, 15 %', melding: 'Innenlandsk omsetning og uttak, 15 %' },
  '33': { kode: '33', sats: 12, retning: 'utgaende', navn: 'Utgående MVA, 12 %', melding: 'Innenlandsk omsetning og uttak, 12 %' },
  '5': { kode: '5', sats: 0, retning: 'utgaende', navn: 'Omsetning fritatt for MVA', melding: 'Innenlandsk omsetning fritatt for MVA' },
  '52': { kode: '52', sats: 0, retning: 'utgaende', navn: 'Utførsel (eksport)', melding: 'Utførsel av varer og tjenester' },
  '6': { kode: '6', sats: 0, retning: 'ingen', navn: 'Omsetning utenfor MVA-loven', melding: 'Omsetning utenfor MVA-loven' },
  '86': { kode: '86', sats: 25, retning: 'omvendt', navn: 'Tjenester kjøpt fra utlandet, 25 %', melding: 'Tjenester kjøpt fra utlandet med fradragsrett, 25 %' },
};

export const MVA_KONTO_UTGAENDE = 2700;
export const MVA_KONTO_INNGAENDE = 2710;
export const MVA_KONTO_OPPGJOR = 2740;

/** Utgående MVA-kode for en fakturasats. 0 % → fritatt (5) når foretaket er MVA-registrert. */
export function utgaendeKode(sats: number): string {
  switch (sats) {
    case 25: return '3';
    case 15: return '31';
    case 12: return '33';
    case 0: return '5';
    default: throw new Error(`Ukjent MVA-sats ${sats} %. Gyldige satser er 25, 15, 12 og 0.`);
  }
}

/** Inngående MVA-kode for en kjøpssats. */
export function inngaendeKode(sats: number): string {
  switch (sats) {
    case 25: return '1';
    case 15: return '11';
    case 12: return '13';
    case 0: return '0';
    default: throw new Error(`Ukjent MVA-sats ${sats} %. Gyldige satser er 25, 15, 12 og 0.`);
  }
}

export function kode(k: string): MvaKode {
  const m = MVA_KODER[k];
  if (!m) throw new Error(`Ukjent MVA-kode ${k}.`);
  return m;
}

export const GYLDIGE_SATSER = [25, 15, 12, 0] as const;

/**
 * Sjekker at MVA-beløpet passer med totalen for en sats. Tillater 1 kr avvik for avrunding
 * på kvitteringer med flere linjer. Returnerer forventet MVA i øre.
 */
export function sjekkMvaMotTotal(totalOre: number, mvaOre: number, sats: number): { ok: boolean; forventet: number; avvik: number } {
  const forventet = sats === 0 ? 0 : Math.round((totalOre * sats) / (100 + sats));
  const avvik = mvaOre - forventet;
  return { ok: Math.abs(avvik) <= 100, forventet, avvik };
}

/** Finner hvilken sats et MVA-beløp mest sannsynlig hører til (for kvitteringer der satsen ikke står). */
export function gjettSats(totalOre: number, mvaOre: number): number | null {
  if (mvaOre === 0) return 0;
  let best: number | null = null, minst = Infinity;
  for (const s of [25, 15, 12]) {
    const f = Math.round((totalOre * s) / (100 + s));
    const d = Math.abs(f - mvaOre);
    if (d < minst) { minst = d; best = s; }
  }
  return minst <= Math.max(100, Math.abs(mvaOre) * 0.02) ? best : null;
}
