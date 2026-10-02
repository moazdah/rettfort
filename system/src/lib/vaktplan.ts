// Regler for vaktplanen. Rene funksjoner uten database, så de kan testes og brukes både på server og i nettleseren.
//
// Arbeidstid: slutt − start, minus pause når vakten er over 5,5 timer. Vakter over midnatt støttes.
// Overtid (arbeidsmiljøloven § 10-6): timer over 9 per dag eller 40 per uke. Uka regnes kronologisk,
// så det er vakten som passerer 40 timer som får overtiden.
// Merarbeid: deltidsansatte som jobber mer enn avtalt, men under 40 timer. Vanlig sats, ikke overtid.
// Alt regnes i minutter.

export const DAG_GRENSE = 9 * 60;
export const UKE_GRENSE = 40 * 60;
export const PAUSE_ETTER = 5.5 * 60;
export const FULL_STILLING = 37.5 * 60;

export interface VaktInn { id?: string; ansattId: string | null; dato: string; start: string; slutt: string; pauseMin?: number; utlagt?: boolean }
export interface AnsattRegel { id: string; navn: string; lonnType: string; stillingsprosent: number }
export interface Tilgjengelig { ansattId: string; dato: string; status: 'kan' | 'kan_ikke'; grunn?: string | null }

const tilMin = (t: string) => { const [h, m] = t.slice(0, 5).split(':').map(Number); return h * 60 + (m || 0); };

/** Gyldig klokkeslett «HH:MM». */
export const gyldigTid = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

/** Hvor lenge vakten varer, før pause. Slutt før start betyr over midnatt. */
export function varighetMin(start: string, slutt: string): number {
  const a = tilMin(start), b = tilMin(slutt);
  return b > a ? b - a : b + 24 * 60 - a;
}

/** Pausen som trekkes fra: bare når vakten er over 5,5 timer. */
export function pauseMin(start: string, slutt: string, pause = 30): number {
  return varighetMin(start, slutt) > PAUSE_ETTER ? pause : 0;
}

export function arbeidMin(v: Pick<VaktInn, 'start' | 'slutt' | 'pauseMin'>): number {
  return varighetMin(v.start, v.slutt) - pauseMin(v.start, v.slutt, v.pauseMin ?? 30);
}

/** Avtalt arbeidstid per uke: 37,5 t × stillingsprosent. Timelønnede har ingen avtalt tid. */
export function avtaltMin(a: Pick<AnsattRegel, 'lonnType' | 'stillingsprosent'>): number | null {
  if (a.lonnType === 'time') return null;
  return Math.round(FULL_STILLING * (Number(a.stillingsprosent) || 100) / 100);
}

// ---------- Uker og datoer ----------

const iso = (d: Date) => d.toISOString().slice(0, 10);
const dag = (s: string) => new Date(`${s}T12:00:00Z`);

/** ISO-uke for en dato (uka starter mandag). */
export function isoUke(dato: string): { aar: number; uke: number } {
  const d = dag(dato);
  const ukedag = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - ukedag + 3); // torsdag i samme uke
  const aar = d.getUTCFullYear();
  const forsteTorsdag = new Date(Date.UTC(aar, 0, 4));
  const uke = 1 + Math.round(((d.getTime() - forsteTorsdag.getTime()) / 86400000 - 3 + ((forsteTorsdag.getUTCDay() + 6) % 7)) / 7);
  return { aar, uke };
}

/** De sju datoene (mandag–søndag) i en ISO-uke. */
export function ukeDager(aar: number, uke: number): string[] {
  const jan4 = new Date(Date.UTC(aar, 0, 4));
  const man = new Date(jan4);
  man.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + (uke - 1) * 7);
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(man); d.setUTCDate(man.getUTCDate() + i); return iso(d); });
}

/** Neste eller forrige uke. */
export function flyttUke(aar: number, uke: number, n: number): { aar: number; uke: number } {
  const d = dag(ukeDager(aar, uke)[0]);
  d.setUTCDate(d.getUTCDate() + n * 7);
  return isoUke(iso(d));
}

export const plussDager = (dato: string, n: number) => { const d = dag(dato); d.setUTCDate(d.getUTCDate() + n); return iso(d); };

// ---------- Analyse av en uke ----------

export interface VaktResultat { arbeid: number; overtid: number; merarbeid: number }
export interface AnsattUke { arbeid: number; overtid: number; merarbeid: number; avtalt: number | null }
export interface Grenser { dag: number; uke: number }
export const STANDARD_GRENSER: Grenser = { dag: DAG_GRENSE, uke: UKE_GRENSE };

const sorter = <T extends VaktInn>(v: T[]) => [...v].sort((a, b) => (a.dato + a.start).localeCompare(b.dato + b.start));

/**
 * Går gjennom alle vaktene i en uke og fordeler overtid og merarbeid på vaktene.
 * Overtid per dag (over 9 t) havner på den vakten som passerer grensen. Det samme gjelder uka (over 40 t).
 * Grensene kan endres av lederen under Innstillinger.
 */
export function analyserUke<T extends VaktInn>(vakter: T[], ansatte: AnsattRegel[], g: Grenser = STANDARD_GRENSER): { perVakt: Map<T, VaktResultat>; perAnsatt: Map<string, AnsattUke> } {
  const perVakt = new Map<T, VaktResultat>();
  const perAnsatt = new Map<string, AnsattUke>();
  for (const a of ansatte) {
    const avtalt = avtaltMin(a);
    const mine = sorter(vakter.filter(v => v.ansattId === a.id));
    const perDag = new Map<string, number>();
    let uke = 0, sumOver = 0, sumMer = 0, sumArbeid = 0;
    for (const v of mine) {
      const arbeid = arbeidMin(v);
      sumArbeid += arbeid;
      const forDag = perDag.get(v.dato) ?? 0;
      // Dag: det som går over grensen den dagen.
      const dagOver = Math.max(0, forDag + arbeid - g.dag) - Math.max(0, forDag - g.dag);
      perDag.set(v.dato, forDag + arbeid);
      // Uke: av resten (det som ikke alt er overtid), det som passerer ukegrensen.
      const vanlig = arbeid - dagOver;
      const ukeOver = Math.max(0, uke + vanlig - g.uke) - Math.max(0, uke - g.uke);
      const innenfor = vanlig - ukeOver;
      // Merarbeid: deltid over avtalt, men innenfor ukegrensen.
      let mer = 0;
      if (avtalt != null && avtalt < FULL_STILLING) mer = Math.max(0, Math.min(uke + innenfor, g.uke) - Math.max(uke, avtalt));
      uke += vanlig;
      sumOver += dagOver + ukeOver; sumMer += mer;
      perVakt.set(v, { arbeid, overtid: dagOver + ukeOver, merarbeid: mer });
    }
    perAnsatt.set(a.id, { arbeid: sumArbeid, overtid: sumOver, merarbeid: sumMer, avtalt });
  }
  for (const v of vakter) if (!perVakt.has(v)) perVakt.set(v, { arbeid: arbeidMin(v), overtid: 0, merarbeid: 0 });
  return { perVakt, perAnsatt };
}

const UKEDAG = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
/** «fredag» */
export const ukedag = (dato: string) => UKEDAG[dag(dato).getUTCDay()];

/** Minutter fra midnatt den første dagen, for å regne hvile mellom vakter (også over midnatt). */
const absStart = (v: Pick<VaktInn, 'dato' | 'start'>) => Math.round(dag(v.dato).getTime() / 60000) + tilMin(v.start);
const absSlutt = (v: Pick<VaktInn, 'dato' | 'start' | 'slutt'>) => absStart(v) + varighetMin(v.start, v.slutt);

export interface AdvarselValg { grenser?: Grenser; overtid?: boolean; hviletid?: boolean }

/**
 * Advarsler når en vakt lagres. De stopper ingenting; lederen bestemmer («Lagre likevel»).
 * `andre` er de andre vaktene rundt (uka, og helst dagen før og etter), uten den som endres.
 */
export function advarsler(ny: VaktInn, andre: VaktInn[], ansatt: AnsattRegel | null, tilgj: Tilgjengelig[], valg: AdvarselValg = {}): string[] {
  const g = valg.grenser ?? STANDARD_GRENSER, medOt = valg.overtid !== false, medHvile = valg.hviletid !== false;
  const ut: string[] = [];
  if (!ansatt || !ny.ansattId) {
    if (medOt && varighetMin(ny.start, ny.slutt) > g.dag) ut.push(`Over ${timerTall(g.dag)} t på én dag`);
    return ut;
  }
  const fornavn = ansatt.navn.split(' ')[0];
  const { aar, uke } = isoUke(ny.dato);
  const iUka = andre.filter(v => v.ansattId === ansatt.id && isoUke(v.dato).aar === aar && isoUke(v.dato).uke === uke);
  if (medOt) {
    const etter = analyserUke([...iUka, ny], [ansatt], g).perAnsatt.get(ansatt.id)!;
    const for_ = analyserUke(iUka, [ansatt], g).perAnsatt.get(ansatt.id)!;
    if (etter.overtid > for_.overtid) ut.push(`Gir ${fornavn} ${timerTall(etter.overtid)} t overtid (${timerTall(etter.arbeid)} t denne uka)`);
    else if (etter.merarbeid > for_.merarbeid && etter.avtalt != null) ut.push(`Gir ${fornavn} merarbeid: ${timerTall(etter.arbeid)} t, avtalen er ${timerTall(etter.avtalt)} t`);
    if (varighetMin(ny.start, ny.slutt) > g.dag) ut.push(`Over ${timerTall(g.dag)} t på én dag`);
  }
  if (iUka.some(v => v.dato === ny.dato)) ut.push(`${fornavn} har allerede en vakt ${ukedag(ny.dato)}`);
  const t = tilgj.find(x => x.ansattId === ansatt.id && x.dato === ny.dato);
  if (t?.status === 'kan_ikke') ut.push(`${fornavn} har sagt at hen ikke kan${t.grunn ? ` («${t.grunn}»)` : ''}`);
  if (medHvile) {
    const mine = andre.filter(v => v.ansattId === ansatt.id && v.dato !== ny.dato);
    const s = absStart(ny), e = absSlutt(ny);
    const for_ = mine.filter(v => absSlutt(v) <= s).sort((a, b) => absSlutt(b) - absSlutt(a))[0];
    const etter = mine.filter(v => absStart(v) >= e).sort((a, b) => absStart(a) - absStart(b))[0];
    if (for_ && s - absSlutt(for_) < 11 * 60) ut.push(`Under 11 t hvile (${timerTall(s - absSlutt(for_))} t etter vakten ${ukedag(for_.dato)})`);
    if (etter && absStart(etter) - e < 11 * 60) ut.push(`Under 11 t hvile (${timerTall(absStart(etter) - e)} t før vakten ${ukedag(etter.dato)})`);
  }
  return ut;
}

/** «7,5» og «45», uten unødvendige desimaler. */
export function timerTall(min: number): string {
  const t = Math.round((min / 60) * 10) / 10;
  return String(t).replace('.', ',');
}

/** «7,5 t» */
export function timer(min: number): string {
  const t = Math.round((min / 60) * 10) / 10;
  return `${String(t).replace('.', ',')} t`;
}

/** «07–15» eller «07:30–15». */
export function kortTid(start: string, slutt: string): string {
  const k = (x: string) => (x.slice(3, 5) === '00' ? x.slice(0, 2) : x.slice(0, 5));
  return `${k(start)}–${k(slutt)}`;
}

export interface VaktMal { navn: string; start: string; slutt: string }
export const STANDARD_MALER: VaktMal[] = [
  { navn: 'Åpning', start: '07:00', slutt: '15:00' },
  { navn: 'Midt', start: '10:00', slutt: '18:00' },
  { navn: 'Kveld', start: '13:00', slutt: '21:00' },
  { navn: 'Natt/rydd', start: '21:00', slutt: '23:30' },
];
