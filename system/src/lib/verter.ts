// Adressene systemet svarer på. Regnskapet ligger på min.rettført.no, vaktplanen på vaktplan.rettført.no.
// Begge er det samme systemet og den samme databasen; innloggingen deles mellom dem.
// Ren modul (ingen server-only), så den kan brukes i proxy.ts.

export const DOMENE = 'xn--rettfrt-u1a.no';
export const MIN_VERT = (process.env.RETTFORT_MIN_VERT || `min.${DOMENE}`).toLowerCase();
export const VP_VERT = (process.env.RETTFORT_VAKTPLAN_VERT || `vaktplan.${DOMENE}`).toLowerCase();

/** Den nye innloggingskaken gjelder for hele rettført.no. Den gamle (rf_sesjon) gjaldt bare min. */
export const OKT_COOKIE = 'rf_okt';

export const vertAv = (h: Headers) => (h.get('x-forwarded-host') || h.get('host') || '').toLowerCase();
export const erVaktplanVert = (vert: string) => vert === VP_VERT;
export const erMinVert = (vert: string) => vert === MIN_VERT;
const lokal = (vert: string) => /^(localhost|127\.0\.0\.1|[\w.-]+\.localhost)(:\d+)?$/.test(vert);
export const adresse = (vert: string) => `${lokal(vert) ? 'http' : 'https'}://${vert}`;
export const minAdresse = () => adresse(MIN_VERT);
export const vaktplanAdresse = () => adresse(VP_VERT);

/** Domenet kaken settes på, så den deles mellom min. og vaktplan. Ingen domene på andre adresser (forhåndsvisning, lokalt). */
export function oktDomene(vert: string): string | undefined {
  if (process.env.RETTFORT_COOKIE_DOMENE) return process.env.RETTFORT_COOKIE_DOMENE;
  const navn = vert.split(':')[0];
  return navn.endsWith(`.${DOMENE}`) ? `.${DOMENE}` : undefined;
}

/**
 * Slås på med RETTFORT_VAKTPLAN_ADRESSE=1 når vaktplan.rettført.no svarer (DNS-oppføringen er lagt inn).
 * Før det blir vaktplanen liggende på min.rettført.no, så ingen lenker peker til en adresse som ikke finnes.
 */
export const egenVaktplanAdresse = () => process.env.RETTFORT_VAKTPLAN_ADRESSE === '1';

/** Lenker til vaktplanen i e-post går til vaktplan.rettført.no når systemet kjører på min.rettført.no. */
export const tilVaktplan = (base: string) => (egenVaktplanAdresse() && base === minAdresse() ? vaktplanAdresse() : base);
