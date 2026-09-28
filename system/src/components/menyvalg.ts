// Menyvalgene. Egen fil så de kan brukes både i server- og klientkomponenter.

export const MENY: { href: string; navn: string; ikon: string; aktivPa: string[] }[] = [
  { href: '/hjem', navn: 'Hjem', ikon: 'Hj', aktivPa: ['/hjem'] },
  { href: '/kjop/ny', navn: 'Penger ut', ikon: 'Ut', aktivPa: ['/kjop'] },
  { href: '/salg/ny', navn: 'Penger inn', ikon: 'Inn', aktivPa: ['/salg'] },
  { href: '/bank', navn: 'Bank', ikon: 'Ba', aktivPa: ['/bank'] },
  { href: '/lonn', navn: 'Lønn', ikon: 'Lø', aktivPa: ['/lonn'] },
  { href: '/rapporter', navn: 'Rapporter', ikon: 'Ra', aktivPa: ['/rapporter'] },
  { href: '/mva', navn: 'MVA', ikon: 'Mv', aktivPa: ['/mva'] },
  { href: '/frister', navn: 'Frister', ikon: 'Fr', aktivPa: ['/frister'] },
  { href: '/aarsavslutning', navn: 'Årsavslutning', ikon: 'År', aktivPa: ['/aarsavslutning'] },
  { href: '/regnskapsforer', navn: 'Regnskapsfører', ikon: 'Rf', aktivPa: ['/regnskapsforer'] },
  { href: '/innstillinger', navn: 'Innstillinger', ikon: 'In', aktivPa: ['/innstillinger'] },
];
