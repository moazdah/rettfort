// Innstillingene for vaktplanen. Lederen bestemmer hva de ansatte kan gjøre; det som er slått av, forsvinner for dem.
// Rene funksjoner, så de brukes både på serveren og i nettleseren.

export const FRAVAERSTYPER = ['Fri uten lønn', 'Ferie', 'Avspasering', 'Egenmelding', 'Sykmelding', 'Permisjon med lønn', 'Permisjon uten lønn', 'Velferdspermisjon'] as const;
export type Fravaerstype = (typeof FRAVAERSTYPER)[number];

/** Med eller uten lønn som standard per type. */
export const FRAVAER_LONN: Record<Fravaerstype, boolean> = {
  'Fri uten lønn': false, 'Ferie': true, 'Avspasering': true, 'Egenmelding': true, 'Sykmelding': true,
  'Permisjon med lønn': true, 'Permisjon uten lønn': false, 'Velferdspermisjon': true,
};

export const FRAVAER_KORT: Record<Fravaerstype, string> = {
  'Fri uten lønn': 'Fri', 'Ferie': 'Ferie', 'Avspasering': 'Avsp.', 'Egenmelding': 'Egenm.', 'Sykmelding': 'Sykm.',
  'Permisjon med lønn': 'Perm.', 'Permisjon uten lønn': 'Perm.', 'Velferdspermisjon': 'Velferd',
};

export const erFravaerstype = (t: string): t is Fravaerstype => (FRAVAERSTYPER as readonly string[]).includes(t);

export interface VaktInnstillinger {
  colleagues: { on: boolean; mode: 'navn' | 'opptatt' };
  open: { on: boolean; who: 'leder' | 'forst'; warn: boolean };
  swap: { on: boolean; approve: boolean; sameType: boolean };
  give: { on: boolean; hours: number };
  avail: { on: boolean; mode: 'enkel' | 'detaljert'; days: number };
  absence: { on: boolean; cfg: Record<Fravaerstype, { on: boolean; pay: boolean }>; saldo: boolean };
  hours: { on: boolean; dev: boolean; auto: boolean };
  ot: { on: boolean; add: 40 | 50 | 100; day: number; week: number };
  rest: { on: boolean };
  comments: { on: boolean };
  notif: { on: boolean; pub: boolean; chg: boolean; ans: boolean };
  assistant: { on: boolean };
  lonn: { on: boolean; fravaer: boolean };
}

export const STANDARD_INNSTILLINGER: VaktInnstillinger = {
  colleagues: { on: true, mode: 'navn' },
  open: { on: true, who: 'leder', warn: true },
  swap: { on: true, approve: true, sameType: false },
  give: { on: true, hours: 24 },
  avail: { on: true, mode: 'enkel', days: 7 },
  absence: { on: true, cfg: Object.fromEntries(FRAVAERSTYPER.map(t => [t, { on: true, pay: FRAVAER_LONN[t] }])) as VaktInnstillinger['absence']['cfg'], saldo: true },
  hours: { on: true, dev: true, auto: false },
  ot: { on: true, add: 40, day: 9, week: 40 },
  rest: { on: true },
  comments: { on: true },
  notif: { on: true, pub: true, chg: true, ans: true },
  assistant: { on: true },
  lonn: { on: true, fravaer: true },
};

const tall = (v: unknown, std: number, min: number, max: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : std; };
const bool = (v: unknown, std: boolean) => (typeof v === 'boolean' ? v : std);
const valg = <T extends string | number>(v: unknown, lov: readonly T[], std: T): T => (lov.includes(v as T) ? (v as T) : std);

/** Lagrede innstillinger (kan mangle felt eller være fra en eldre versjon) slått sammen med standarden og sjekket. */
export function lesInnstillinger(raa: unknown): VaktInnstillinger {
  const r = (typeof raa === 'string' ? safeJson(raa) : raa) as Record<string, Record<string, unknown>> | null;
  const S = STANDARD_INNSTILLINGER;
  const g = (k: keyof VaktInnstillinger) => (r && typeof r[k] === 'object' && r[k]) || {};
  const c = g('colleagues'), o = g('open'), sw = g('swap'), gi = g('give'), av = g('avail'), ab = g('absence'), h = g('hours'), ot = g('ot'), n = g('notif');
  const cfgInn = (ab.cfg && typeof ab.cfg === 'object' ? ab.cfg : {}) as Record<string, { on?: unknown; pay?: unknown }>;
  return {
    colleagues: { on: bool(c.on, S.colleagues.on), mode: valg(c.mode, ['navn', 'opptatt'] as const, 'navn') },
    open: { on: bool(o.on, true), who: valg(o.who, ['leder', 'forst'] as const, 'leder'), warn: bool(o.warn, true) },
    swap: { on: bool(sw.on, true), approve: bool(sw.approve, true), sameType: bool(sw.sameType, false) },
    give: { on: bool(gi.on, true), hours: tall(gi.hours, 24, 0, 168) },
    avail: { on: bool(av.on, true), mode: valg(av.mode, ['enkel', 'detaljert'] as const, 'enkel'), days: tall(av.days, 7, 0, 30) },
    absence: {
      on: bool(ab.on, true), saldo: bool(ab.saldo, true),
      cfg: Object.fromEntries(FRAVAERSTYPER.map(t => [t, { on: bool(cfgInn[t]?.on, true), pay: bool(cfgInn[t]?.pay, FRAVAER_LONN[t]) }])) as VaktInnstillinger['absence']['cfg'],
    },
    hours: { on: bool(h.on, true), dev: bool(h.dev, true), auto: bool(h.auto, false) },
    ot: { on: bool(ot.on, true), add: valg(Number(ot.add), [40, 50, 100] as const, 40), day: tall(ot.day, 9, 6, 13), week: tall(ot.week, 40, 30, 48) },
    rest: { on: bool(g('rest').on, true) },
    comments: { on: bool(g('comments').on, true) },
    notif: { on: bool(n.on, true), pub: bool(n.pub, true), chg: bool(n.chg, true), ans: bool(n.ans, true) },
    assistant: { on: bool(g('assistant').on, true) },
    lonn: { on: bool(g('lonn').on, true), fravaer: bool(g('lonn').fravaer, true) },
  };
}

function safeJson(s: string) { try { return JSON.parse(s); } catch { return null; } }

/** Like innstillinger, uansett rekkefølge på feltene. */
export const like = (a: unknown, b: unknown) => JSON.stringify(lesInnstillinger(a)) === JSON.stringify(lesInnstillinger(b));
export const erStandard = (s: VaktInnstillinger) => like(s, STANDARD_INNSTILLINGER);

/** Grensene for overtid i minutter, fra innstillingene. */
export const grenser = (s: VaktInnstillinger) => ({ dag: Math.round(s.ot.day * 60), uke: Math.round(s.ot.week * 60) });

/** Navnet på knappen for å gi bort eller bytte, etter hva som er slått på. */
export function byttKnapp(s: VaktInnstillinger): string | null {
  if (s.swap.on && s.give.on) return 'Gi bort / bytt vakt';
  if (s.swap.on) return 'Bytt vakt';
  if (s.give.on) return 'Gi bort vakt';
  return null;
}

/** Fraværstypene de ansatte kan søke om. */
export const aktiveTyper = (s: VaktInnstillinger) => FRAVAERSTYPER.filter(t => s.absence.cfg[t].on);
