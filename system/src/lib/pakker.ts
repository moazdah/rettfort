// Hva pakkene inneholder, og hvem som får teste alle pakkene uten betaling.

export const harAssistent = (pakke: string) => pakke === 'selskap' || pakke === 'byra';

/** Testbrukere settes i RETTFORT_TESTBRUKERE (kommaseparerte e-postadresser). */
export function erTestbruker(epost: string): boolean {
  const liste = (process.env.RETTFORT_TESTBRUKERE || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  return liste.includes(epost.trim().toLowerCase());
}
