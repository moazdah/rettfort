// Hva pakkene inneholder, og hvem som får teste alle pakkene uten betaling.

export const harAssistent = (pakke: string) => pakke === 'selskap' || pakke === 'byra';

/** Vaktplan er med i alle betalte pakker. */
export const harVaktplan = (pakke: string) => pakke !== 'gratis';

/** Testbrukere settes i RETTFORT_TESTBRUKERE (kommaseparerte e-postadresser). */
export function erTestbruker(epost: string): boolean {
  const liste = (process.env.RETTFORT_TESTBRUKERE || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  return liste.includes(epost.trim().toLowerCase());
}

export type BetaltPakke = 'start' | 'selskap';

/**
 * Byrå-tjenesten (regnskapsførere med mange kunder) er ikke i salg ennå. Regnskapsførere som blir invitert
 * av en kunde, kommer fortsatt inn. Sett til true for å åpne for registrering som regnskapsfører igjen.
 */
export const BYRA_I_SALG = false;

/** Ansatte som er med i prisen for vaktplanen. Ansatte utover dette koster EKSTRA_ANSATT per måned. */
export const VAKTPLAN_ANSATTE: Record<string, number> = { start: 5, selskap: 15 };
/** Pris per ekstra ansatt per måned, i øre uten MVA. */
export const EKSTRA_ANSATT = 2900;

export const inkluderteAnsatte = (pakke: string) => VAKTPLAN_ANSATTE[pakke] ?? 0;
/** Hvor mange ansatte over det som er med i pakken. Gratis har ikke vaktplan, og betaler derfor ikke for ansatte. */
export const ekstraAnsatte = (pakke: string, antall: number) => (harVaktplan(pakke) ? Math.max(0, antall - inkluderteAnsatte(pakke)) : 0);

/** Pakkene for foretak. Prisene er i øre per måned, uten MVA. */
export const PAKKER = [
  { k: 'gratis', n: 'Gratis', pris: 0, d: 'Faktura, kjøp med kvitteringslesing, bank, MVA-melding, frister, rapporter og lønn.' },
  { k: 'start', n: 'Start', pris: 17900, d: 'Alt i Gratis, pluss vaktplan for 5 ansatte. Ekstra ansatte koster 29 kr i måneden.' },
  { k: 'selskap', n: 'Selskap', pris: 24900, d: 'Alt i Start, pluss assistenten som fører for deg, og vaktplan for 15 ansatte.' },
] as const;

/**
 * Introduksjonspris frem til alle tjenestene er på plass. Stripe krever minst 3 kr per trekk i NOK.
 * Sett til null for å ta ordinær pris.
 */
export const INTROPRIS: number | null = 300;

/** I introduksjonsperioden tar vi ikke betalt for ekstra ansatte. */
export const tarBetaltForEkstra = () => INTROPRIS === null;

export const prisFor = (pakke: BetaltPakke) => INTROPRIS ?? PAKKER.find(p => p.k === pakke)!.pris;
