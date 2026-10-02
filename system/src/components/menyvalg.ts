// Menyvalgene. Egen fil så de kan brukes både i server- og klientkomponenter.
// Toppmeny: Hjem · Penger inn · Penger ut · Bank · Ansatte ▾ · Regnskap ▾ (design: runde 2, Rettfort Toppmeny).

/** kreverBetalt: med i Start og Selskap. I Gratis vises valget med lås, og siden forklarer hva du får ved å oppgradere. */
export interface MenyPunkt { href: string; navn: string; tekst?: string; aktivPa: string[]; kreverBetalt?: boolean }
export interface MenyGruppe { navn: string; under: MenyPunkt[] }
export type MenyValg = MenyPunkt | MenyGruppe;

export const MENY: MenyValg[] = [
  { href: '/hjem', navn: 'Hjem', aktivPa: ['/hjem'] },
  { href: '/salg/ny', navn: 'Penger inn', aktivPa: ['/salg'] },
  { href: '/kjop/ny', navn: 'Penger ut', aktivPa: ['/kjop'] },
  { href: '/bank', navn: 'Bank', aktivPa: ['/bank'], kreverBetalt: true },
  { navn: 'Ansatte', under: [
    { href: '/lonn', navn: 'Lønn', tekst: 'Lønnskjøring og lønnsslipper', aktivPa: ['/lonn'], kreverBetalt: true },
    { href: '/vaktplan', navn: 'Vaktplan', tekst: 'Vakter, bytter og tilgjengelighet', aktivPa: ['/vaktplan'], kreverBetalt: true },
  ] },
  { navn: 'Regnskap', under: [
    { href: '/mva', navn: 'MVA', tekst: 'Melding og betaling', aktivPa: ['/mva'], kreverBetalt: true },
    { href: '/rapporter', navn: 'Rapporter', tekst: 'Resultat, balanse og hovedbok', aktivPa: ['/rapporter'] },
    { href: '/frister', navn: 'Frister', tekst: 'Alt som skal leveres', aktivPa: ['/frister'] },
    { href: '/aarsavslutning', navn: 'Årsavslutning', tekst: 'Årsregnskap og skattemelding', aktivPa: ['/aarsavslutning'], kreverBetalt: true },
    { href: '/regnskapsforer', navn: 'Regnskapsfører', tekst: 'Gi tilgang til regnskapsføreren', aktivPa: ['/regnskapsforer'], kreverBetalt: true },
  ] },
];

/** «Mer»-arket på mobil: det som ikke står i bunnmenyen. */
export const MER: { navn: string; under: MenyPunkt[] }[] = [
  { navn: 'Penger', under: [{ href: '/bank', navn: 'Bank', aktivPa: ['/bank'], kreverBetalt: true }] },
  { navn: 'Ansatte', under: (MENY[4] as MenyGruppe).under },
  { navn: 'Regnskap', under: (MENY[5] as MenyGruppe).under },
  { navn: 'Konto', under: [{ href: '/innstillinger', navn: 'Innstillinger', aktivPa: ['/innstillinger'] }] },
];

export const erGruppe = (m: MenyValg): m is MenyGruppe => 'under' in m;
export const aktivPa = (m: MenyPunkt, sti: string) => m.aktivPa.some(p => sti === p || sti.startsWith(p + '/'));
