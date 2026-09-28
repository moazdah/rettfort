// Oppslag i Enhetsregisteret (Brønnøysundregistrene). Åpent API, ingen nøkkel.

export interface Enhet {
  orgnr: string;
  navn: string;
  orgform: string; // kode, f.eks. AS, ENK
  orgformNavn: string;
  adresse: string;
  postnr: string;
  poststed: string;
  kommunenr: string;
  mvaRegistrert: boolean;
  stiftet: string | null;
  nace: string | null;
  naceNavn: string | null;
  konkurs: boolean;
  slettet: boolean;
}

const BASE = 'https://data.brreg.no/enhetsregisteret/api';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function tilEnhet(e: any): Enhet {
  const a = e.forretningsadresse ?? e.postadresse ?? {};
  return {
    orgnr: String(e.organisasjonsnummer),
    navn: String(e.navn ?? ''),
    orgform: String(e.organisasjonsform?.kode ?? ''),
    orgformNavn: String(e.organisasjonsform?.beskrivelse ?? ''),
    adresse: (a.adresse ?? []).filter(Boolean).join(', '),
    postnr: String(a.postnummer ?? ''),
    poststed: String(a.poststed ?? ''),
    kommunenr: String(a.kommunenummer ?? ''),
    mvaRegistrert: Boolean(e.registrertIMvaregisteret),
    stiftet: e.stiftelsesdato ?? e.registreringsdatoEnhetsregisteret ?? null,
    nace: e.naeringskode1?.kode ?? null,
    naceNavn: e.naeringskode1?.beskrivelse ?? null,
    konkurs: Boolean(e.konkurs),
    slettet: Boolean(e.slettedato),
  };
}

/** Gyldig org.nr etter MOD11 med vekter 3,2,7,6,5,4,3,2. */
export function gyldigOrgnr(orgnr: string): boolean {
  const s = orgnr.replace(/\s/g, '');
  if (!/^\d{9}$/.test(s)) return false;
  const v = [3, 2, 7, 6, 5, 4, 3, 2];
  const sum = v.reduce((acc, w, i) => acc + w * Number(s[i]), 0);
  const r = 11 - (sum % 11);
  const k = r === 11 ? 0 : r;
  return k !== 10 && k === Number(s[8]);
}

export function formaterOrgnr(orgnr: string | null | undefined): string {
  const s = (orgnr ?? '').replace(/\s/g, '');
  return /^\d{9}$/.test(s) ? `${s.slice(0, 3)} ${s.slice(3, 6)} ${s.slice(6)}` : s;
}

async function hent(url: string): Promise<unknown> {
  const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(6000), next: { revalidate: 3600 } } as RequestInit);
  if (r.status === 404 || r.status === 410) return null;
  if (!r.ok) throw new Error(`Brønnøysund svarte ${r.status}`);
  return r.json();
}

/** Søk på navn eller org.nr. Minst 2 tegn. */
export async function sokEnheter(q: string, maks = 8): Promise<Enhet[]> {
  const s = q.trim();
  if (s.length < 2) return [];
  const siffer = s.replace(/\s/g, '');
  if (/^\d{9}$/.test(siffer)) {
    const e = await hentEnhet(siffer);
    return e ? [e] : [];
  }
  if (/^\d+$/.test(siffer)) {
    // Delvis org.nr: Enhetsregisteret støtter ikke prefikssøk, så søk på navn gir ingenting. Returner tomt.
    return [];
  }
  const data = (await hent(`${BASE}/enheter?navn=${encodeURIComponent(s)}&size=${maks}`)) as { _embedded?: { enheter?: unknown[] } } | null;
  return (data?._embedded?.enheter ?? []).map(tilEnhet).filter(e => !e.slettet);
}

export async function hentEnhet(orgnr: string): Promise<Enhet | null> {
  const s = orgnr.replace(/\s/g, '');
  if (!/^\d{9}$/.test(s)) return null;
  const data = await hent(`${BASE}/enheter/${s}`);
  return data ? tilEnhet(data) : null;
}

/** Virksomhetsnummer (underenhet) der de ansatte jobber. */
export async function hentUnderenhet(orgnr: string): Promise<{ orgnr: string; navn: string; kommunenr: string } | null> {
  const data = (await hent(`${BASE}/underenheter?overordnetEnhet=${orgnr.replace(/\s/g, '')}&size=1`)) as { _embedded?: { underenheter?: { organisasjonsnummer: string; navn: string; beliggenhetsadresse?: { kommunenummer?: string } }[] } } | null;
  const u = data?._embedded?.underenheter?.[0];
  return u ? { orgnr: u.organisasjonsnummer, navn: u.navn, kommunenr: u.beliggenhetsadresse?.kommunenummer ?? '' } : null;
}
