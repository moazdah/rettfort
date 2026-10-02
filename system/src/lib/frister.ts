// Frister etter norske regler. Faller en frist på helg eller helligdag,
// flyttes den til neste virkedag.

export type MvaTermin = 'tomnd' | 'aar' | 'ingen';
export type Orgform = 'AS' | 'ENK' | 'ANS' | 'DA' | 'ASA' | 'SA' | 'NUF' | 'ANNET';

export interface Frist {
  id: string;
  dato: string; // YYYY-MM-DD (etter flytting)
  opprinnelig: string;
  type: 'mva' | 'amelding' | 'skattetrekk' | 'forskuddsskatt' | 'skattemelding' | 'arsregnskap' | 'aksjonaer';
  tittel: string;
  beskrivelse: string;
  periodeFra?: string;
  periodeTil?: string;
}

const iso = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
const lag = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const leggTil = (d: Date, dager: number) => new Date(d.getTime() + dager * 86400000);

/** Første påskedag (gregoriansk, Meeus/Jones/Butcher). */
export function paskedag(ar: number): Date {
  const a = ar % 19, b = Math.floor(ar / 100), c = ar % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const maned = Math.floor((h + l - 7 * m + 114) / 31), dag = ((h + l - 7 * m + 114) % 31) + 1;
  return lag(ar, maned, dag);
}

export function helligdager(ar: number): Set<string> {
  const p = paskedag(ar);
  return new Set([
    iso(lag(ar, 1, 1)), iso(lag(ar, 5, 1)), iso(lag(ar, 5, 17)), iso(lag(ar, 12, 25)), iso(lag(ar, 12, 26)),
    iso(leggTil(p, -3)), iso(leggTil(p, -2)), iso(p), iso(leggTil(p, 1)), // skjærtorsdag, langfredag, påske
    iso(leggTil(p, 39)), iso(leggTil(p, 49)), iso(leggTil(p, 50)), // Kristi himmelfart, pinse
  ]);
}

export function erVirkedag(d: Date): boolean {
  const u = d.getUTCDay();
  if (u === 0 || u === 6) return false;
  return !helligdager(d.getUTCFullYear()).has(iso(d));
}

export function nesteVirkedag(d: Date): Date {
  let x = d;
  while (!erVirkedag(x)) x = leggTil(x, 1);
  return x;
}

function frist(id: string, y: number, m: number, d: number, rest: Omit<Frist, 'id' | 'dato' | 'opprinnelig'>): Frist {
  const o = lag(y, m, d);
  return { id, dato: iso(nesteVirkedag(o)), opprinnelig: iso(o), ...rest };
}

const MND = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const sisteDag = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** MVA-terminer for et år med frister (annenhver måned). */
export function mvaTerminer(ar: number): Frist[] {
  // Termin 1 jan–feb: 10. april, 2: 10. juni, 3: 31. august, 4: 10. oktober, 5: 10. desember, 6: 10. februar året etter
  const frister: [number, number, number][] = [[ar, 4, 10], [ar, 6, 10], [ar, 8, 31], [ar, 10, 10], [ar, 12, 10], [ar + 1, 2, 10]];
  return frister.map(([y, m, d], i) => {
    const m1 = i * 2 + 1, m2 = m1 + 1;
    return frist(`mva-${ar}-${i + 1}`, y, m, d, {
      type: 'mva', tittel: `MVA for ${MND[m1 - 1]}–${MND[m2 - 1]}`, beskrivelse: 'MVA-melding til Skatteetaten',
      periodeFra: `${ar}-${String(m1).padStart(2, '0')}-01`, periodeTil: `${ar}-${String(m2).padStart(2, '0')}-${sisteDag(ar, m2)}`,
    });
  });
}

export function fristerForAr(ar: number, opts: { orgform: Orgform; mvaTermin: MvaTermin; harAnsatte: boolean }): Frist[] {
  const ut: Frist[] = [];
  if (opts.mvaTermin === 'tomnd') ut.push(...mvaTerminer(ar));
  if (opts.mvaTermin === 'aar') ut.push(frist(`mva-${ar}-aar`, ar + 1, 3, 10, { type: 'mva', tittel: `MVA for ${ar}`, beskrivelse: 'Årlig MVA-melding', periodeFra: `${ar}-01-01`, periodeTil: `${ar}-12-31` }));
  if (opts.harAnsatte) {
    for (let m = 1; m <= 12; m++) {
      const y = m === 12 ? ar + 1 : ar, fm = m === 12 ? 1 : m + 1;
      ut.push(frist(`amelding-${ar}-${m}`, y, fm, 5, { type: 'amelding', tittel: `A-melding ${MND[m - 1]}`, beskrivelse: 'Lønn og skattetrekk til Skatteetaten', periodeFra: `${ar}-${String(m).padStart(2, '0')}-01`, periodeTil: `${ar}-${String(m).padStart(2, '0')}-${sisteDag(ar, m)}` }));
    }
    // Skattetrekk og arbeidsgiveravgift: 15. i måneden etter hver termin (jan–feb → 15. mars osv.)
    for (let t = 0; t < 6; t++) {
      const m1 = t * 2 + 1, m2 = m1 + 1;
      const y = t === 5 ? ar + 1 : ar, fm = t === 5 ? 1 : m2 + 1;
      ut.push(frist(`trekk-${ar}-${t + 1}`, y, fm, 15, { type: 'skattetrekk', tittel: 'Skattetrekk og arbeidsgiveravgift', beskrivelse: `For ${MND[m1 - 1]} og ${MND[m2 - 1]}`, periodeFra: `${ar}-${String(m1).padStart(2, '0')}-01`, periodeTil: `${ar}-${String(m2).padStart(2, '0')}-${sisteDag(ar, m2)}` }));
    }
  }
  if (opts.orgform === 'AS' || opts.orgform === 'ASA') {
    ut.push(frist(`fskatt-${ar}-1`, ar, 2, 15, { type: 'forskuddsskatt', tittel: 'Forskuddsskatt', beskrivelse: 'Første termin for selskapet' }));
    ut.push(frist(`fskatt-${ar}-2`, ar, 4, 15, { type: 'forskuddsskatt', tittel: 'Forskuddsskatt', beskrivelse: 'Andre termin for selskapet' }));
    ut.push(frist(`aksjonaer-${ar}`, ar, 1, 31, { type: 'aksjonaer', tittel: 'Aksjonærregisteroppgaven', beskrivelse: `For ${ar - 1}` }));
    ut.push(frist(`arsregnskap-${ar}`, ar, 7, 31, { type: 'arsregnskap', tittel: 'Årsregnskapet', beskrivelse: `For ${ar - 1}, til Regnskapsregisteret` }));
  } else if (opts.orgform === 'ENK') {
    for (const [m, n] of [[3, 1], [5, 2], [9, 3], [11, 4]] as const) ut.push(frist(`fskatt-${ar}-${n}`, ar, m, 15, { type: 'forskuddsskatt', tittel: 'Forskuddsskatt', beskrivelse: `${n}. termin` }));
  }
  ut.push(frist(`skattemelding-${ar}`, ar, 5, 31, { type: 'skattemelding', tittel: 'Skattemeldingen', beskrivelse: `For ${ar - 1}` }));
  return ut.sort((a, b) => a.dato.localeCompare(b.dato));
}

/** Frister fra og med en dato, et visst antall måneder frem. */
export function kommendeFrister(fra: string, maneder: number, opts: { orgform: Orgform; mvaTermin: MvaTermin; harAnsatte: boolean }): Frist[] {
  const ar = Number(fra.slice(0, 4));
  const til = iso(new Date(Date.UTC(ar, Number(fra.slice(5, 7)) - 1 + maneder, Number(fra.slice(8, 10)))));
  const alle = [...fristerForAr(ar - 1, opts), ...fristerForAr(ar, opts), ...fristerForAr(ar + 1, opts)];
  const sett = new Set<string>();
  return alle.filter(f => f.dato >= fra && f.dato <= til && !sett.has(f.id) && sett.add(f.id)).sort((a, b) => a.dato.localeCompare(b.dato));
}

export function dagerTil(fra: string, til: string): number {
  return Math.round((Date.parse(til) - Date.parse(fra)) / 86400000);
}

export function norskDato(d: string, medAr = true): string {
  const x = new Date(d + 'T00:00:00Z');
  return `${x.getUTCDate()}. ${MND[x.getUTCMonth()]}${medAr ? ' ' + x.getUTCFullYear() : ''}`;
}
