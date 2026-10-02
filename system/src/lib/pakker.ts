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
  { k: 'gratis', n: 'Gratis', pris: 0, d: '5 fakturaer og 5 kvitteringer som leses av i måneden, kjøp, resultat og balanse.' },
  { k: 'start', n: 'Start', pris: 17900, d: 'Hele regnskapet uten grenser: bank, MVA-melding, lønn, regnskapsfører og årsoppgjør. Vaktplan for 5 ansatte.' },
  { k: 'selskap', n: 'Selskap', pris: 24900, d: 'Alt i Start, pluss assistenten som fører for deg, og vaktplan for 15 ansatte.' },
] as const;

/**
 * Introduksjonspris. Avsluttet 2. oktober 2026: nye kunder betaler ordinær pris. Sett et beløp i øre (minst 300)
 * for å ta den i bruk igjen.
 */
export const INTROPRIS: number | null = null;

/** I introduksjonsperioden tar vi ikke betalt for ekstra ansatte. */
export const tarBetaltForEkstra = () => INTROPRIS === null;

export const prisFor = (pakke: BetaltPakke) => INTROPRIS ?? PAKKER.find(p => p.k === pakke)!.pris;

// ---------- Gratis ----------
// Gratis er en smakebit: kom i gang med fakturaer og kjøp. Når bedriften trenger bank, MVA-melding, lønn eller
// regnskapsfører, er det Start. Ingenting som er ført blir borte eller låst; du kan alltid se og laste ned alt.

/** Hvor mye som er med i Gratis per kalendermåned. */
export const GRATIS_GRENSE = { faktura: 5, kvittering: 5 } as const;

export type Betalt = 'bank' | 'mva' | 'lonn' | 'regnskapsforer' | 'saft' | 'aarsoppgjor';
export const BETALT_NAVN: Record<Betalt, string> = {
  bank: 'Bankavstemming', mva: 'MVA-meldingen', lonn: 'Lønn', regnskapsforer: 'Tilgang for regnskapsfører', saft: 'SAF-T', aarsoppgjor: 'Årsoppgjøret',
};

/** Alt i regnskapet uten grenser. Byrå regnes som betalt. */
export const harFulltRegnskap = (pakke: string) => pakke !== 'gratis';

/** Feilmeldingen når noe krever Start eller Selskap. */
export const betaltTekst = (hva: Betalt) => `${BETALT_NAVN[hva]} er med i Start og Selskap. Oppgrader under Innstillinger → Abonnement.`;
