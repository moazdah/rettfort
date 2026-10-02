'use client';

import { createContext, useContext } from 'react';
import type { LederData } from './data';
import type { Behandling } from '@/lib/tjenester/vaktplan';

export type Skjerm = 'uke' | 'foresp' | 'ansatte' | 'innst' | 'asst';
export type Overlegg =
  | { k: 'vakt'; id?: string | null; ansattId: string | null; dato: string }
  | { k: 'person'; id: string }
  | { k: 'fravaer'; b: Behandling & { avslag?: boolean } }
  | { k: 'inviter' }
  | { k: 'admin'; id: string }
  | { k: 'fjern'; id: string }
  | { k: 'asst' };

export type Vakt = LederData['vakter'][number];
export type Ansatt = LederData['ansatte'][number];
type Res<T = unknown> = { ok: true; data?: T; melding?: string } | { ok: false; feil: string };

export interface LederCtx {
  d: LederData;
  apne: (o: Overlegg | null) => void;
  gaTil: (s: Skjerm, ekstra?: { fane?: 'req' | 'timer' }) => void;
  vis: (t: string, angre?: (() => void | Promise<void>) | null, feil?: boolean) => void;
  opptatt: string;
  kjor: <T>(navn: string, fn: () => Promise<Res<T>>, ok?: (d: T | undefined, melding?: string) => void) => Promise<boolean>;
  /** Kjører en handling som gir { angre, melding } og viser meldingen med Angre. */
  endre: (navn: string, fn: () => Promise<Res<{ angre?: string; melding: string }>>, etter?: () => void) => Promise<boolean>;
}

export const Ctx = createContext<LederCtx | null>(null);
export const useLeder = () => useContext(Ctx)!;

/** Statusen til en vakt slik lederen ser den: farge, kant og merke. */
export function utseende(d: LederData, v: Vakt) {
  const friSokt = d.foresp.fri.some(f => f.ansattId === v.ansattId && f.dato === v.dato);
  const bytte = v.utlagt || d.foresp.bytteKollega.some(b => b.vaktId === v.id);
  let art = 'vanlig', merke = '';
  if (!v.ansattId) { art = 'ledig'; const n = v.interesse.length; merke = n ? `${n} interessert${n > 1 ? 'e' : ''}` : 'Ingen interesse ennå'; }
  else if (friSokt) { art = 'fri'; merke = 'Fri søkt'; }
  else if (bytte) { art = 'bytte'; merke = 'Vil bytte bort'; }
  else if (d.innstillinger.ot.on && v.overtid > 0) { art = 'overtid'; merke = 'Overtid'; }
  const utkast = d.status === 'utkast' || v.ikkePublisert;
  if (utkast && !merke && d.status !== 'utkast') merke = 'Ikke publisert';
  return { art, merke, utkast, merkeArt: !v.ansattId ? (v.interesse.length ? 'gul' : 'hvit') : art === 'vanlig' ? 'gra' : art };
}

export function aria(d: LederData, v: Vakt, merke: string) {
  const navn = d.ansatte.find(a => a.id === v.ansattId)?.navn ?? 'Ledig vakt';
  return `${navn}, ${v.dato}, ${v.start} til ${v.slutt}${v.type ? `, ${v.type}` : ''}${v.sted ? `, ${v.sted}` : ''}${merke ? `, ${merke}` : ''}. Trykk for å endre.`;
}

/** Fravær som gjelder en ansatt en dag. */
export const fravaerPa = (d: LederData, ansattId: string, dato: string) => d.fravaer.filter(f => f.ansattId === ansattId && f.fra <= dato && f.til >= dato);

/** «10–18» fra tidsrommene en ansatt har sagt at hen kan (detaljert tilgjengelighet). */
export function tidsrom(timer: Record<string, string> | null | undefined, status: 'kan' | 'kan_ikke') {
  if (!timer) return '';
  const h = Object.entries(timer).filter(([, s]) => s === status).map(([k]) => Number(k)).sort((a, b) => a - b);
  if (!h.length) return '';
  const deler: string[] = [];
  let start = h[0], forrige = h[0];
  for (const x of [...h.slice(1), -1]) {
    if (x === forrige + 1) { forrige = x; continue; }
    deler.push(`${String(start).padStart(2, '0')}–${String(forrige + 1).padStart(2, '0')}`);
    start = forrige = x;
  }
  return deler.join(', ');
}
