// Hva pakkene inneholder, og hvem som får teste alle pakkene uten betaling.

export const harAssistent = (pakke: string) => pakke === 'selskap' || pakke === 'byra';

/** Testbrukere settes i RETTFORT_TESTBRUKERE (kommaseparerte e-postadresser). */
export function erTestbruker(epost: string): boolean {
  const liste = (process.env.RETTFORT_TESTBRUKERE || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  return liste.includes(epost.trim().toLowerCase());
}

export type BetaltPakke = 'start' | 'selskap';

/** Pakkene for foretak. Prisene er i øre per måned, uten MVA. */
export const PAKKER = [
  { k: 'gratis', n: 'Gratis', pris: 0, d: 'Faktura, kjøp, MVA-melding, frister og lønn. Du fyller ut kvitteringer selv.' },
  { k: 'start', n: 'Start', pris: 14900, d: 'Alt i Gratis, pluss automatisk lesing av kvitteringer og nattlig kontroll av regnskapet.' },
  { k: 'selskap', n: 'Selskap', pris: 24900, d: 'Alt i Start, pluss bankavstemming med automatisk lesing og assistent.' },
] as const;

/**
 * Introduksjonspris frem til alle tjenestene er på plass. Stripe krever minst 3 kr per trekk i NOK.
 * Sett til null for å ta ordinær pris.
 */
export const INTROPRIS: number | null = 300;

export const prisFor = (pakke: BetaltPakke) => INTROPRIS ?? PAKKER.find(p => p.k === pakke)!.pris;
