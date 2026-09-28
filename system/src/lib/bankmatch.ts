// Matching av bankbevegelser mot regnskapet. Rene funksjoner, testbare.
// Rekkefølge: KID først, så beløp + dato ± 5 dager + navn, så kjente bankposter (gebyr, renter).

import { gyldigKid, fakturanrFraKid } from './kid';

export interface Bevegelse { id: string; dato: string; tekst: string; belop: number; kid?: string | null; ref?: string | null }

export interface ApenFaktura { id: string; nr: number; kid: string | null; rest: number; kunde: string; forfall: string | null }
export interface UbetaltKjop { id: string; total: number; leverandor: string; dato: string; forfall: string | null }
/** Bankposteringer (konto 1920) som allerede er ført, men ikke koblet til en bankbevegelse. */
export interface BokfortBank { bilagId: string; dato: string; belop: number; tekst: string }

export type Forslag =
  | { type: 'faktura'; fakturaId: string; belop: number; sikker: boolean; grunn: string }
  | { type: 'kjop'; kjopId: string; sikker: boolean; grunn: string }
  | { type: 'bokfort'; bilagId: string; sikker: boolean; grunn: string }
  | { type: 'bankpost'; post: 'gebyr' | 'renteinntekt' | 'rentekostnad'; sikker: boolean; grunn: string }
  | { type: 'ingen'; grunn: string };

export function normNavn(s: string): string[] {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(as|asa|ab|da|ans|enk|norge|norway|nuf|ltd|gmbh|the|og|and)\b/g, ' ')
    .replace(/[^a-z0-9æøå]+/g, ' ').trim().split(' ').filter(w => w.length > 1);
}

/** Likhet 0–1 mellom et navn og en banktekst (andel av navnets ord som finnes i teksten). */
export function navneLikhet(navn: string, tekst: string): number {
  const a = normNavn(navn), b = new Set(normNavn(tekst));
  if (!a.length) return 0;
  const treff = a.filter(w => b.has(w) || [...b].some(x => x.length >= 4 && (x.startsWith(w) || w.startsWith(x)))).length;
  return treff / a.length;
}

export function dagerMellom(a: string, b: string): number {
  return Math.round(Math.abs(Date.parse(a) - Date.parse(b)) / 86400000);
}

/** Finner KID i banktekst eller referanse. */
export function finnKid(b: Bevegelse, metode: 'mod10' | 'mod11' = 'mod10'): string | null {
  const kandidater = [b.kid, b.ref, ...(b.tekst.match(/\b\d{6,25}\b/g) ?? [])].filter(Boolean) as string[];
  for (const k of kandidater) { const s = k.replace(/\s/g, ''); if (gyldigKid(s, metode)) return s; }
  return null;
}

export function klassifiserBankpost(tekst: string, belop: number): 'gebyr' | 'renteinntekt' | 'rentekostnad' | null {
  const t = tekst.toLowerCase();
  if (/gebyr|omkostn|årspris|arspris|kortavgift|transaksjonskostnad|fee\b/.test(t) && belop < 0) return 'gebyr';
  if (/rente|interest/.test(t)) return belop > 0 ? 'renteinntekt' : 'rentekostnad';
  return null;
}

/**
 * Lager ett forslag per bevegelse. Hver faktura, hvert kjøp og hver bokførte bankpost brukes bare én gang.
 * «sikker» betyr at forslaget kan godkjennes automatisk (KID-treff eller entydig beløp + navn + dato).
 */
export function matchBevegelser(bev: Bevegelse[], data: { fakturaer: ApenFaktura[]; kjop: UbetaltKjop[]; bokfort: BokfortBank[]; kidMetode?: 'mod10' | 'mod11' }): Map<string, Forslag> {
  const ut = new Map<string, Forslag>();
  const bruktF = new Set<string>(), bruktK = new Set<string>(), bruktB = new Set<string>();
  const sortert = [...bev].sort((a, b) => a.dato.localeCompare(b.dato) || a.id.localeCompare(b.id));

  // 1) KID
  for (const b of sortert) {
    if (b.belop <= 0) continue;
    const kid = finnKid(b, data.kidMetode);
    if (!kid) continue;
    const f = data.fakturaer.find(x => !bruktF.has(x.id) && (x.kid === kid || (x.kid == null && fakturanrFraKid(kid, data.kidMetode) === x.nr)));
    if (!f) continue;
    bruktF.add(f.id);
    const hele = b.belop === f.rest;
    ut.set(b.id, { type: 'faktura', fakturaId: f.id, belop: Math.min(b.belop, f.rest), sikker: b.belop <= f.rest, grunn: hele ? `Funnet i banken med KID ${kid}.` : b.belop < f.rest ? `Delbetaling med KID ${kid}. ${f.rest - b.belop > 0 ? 'Resten er fortsatt ubetalt.' : ''}` : `Betalt ${(b.belop - f.rest) / 100} kr for mye med KID ${kid}.` });
  }

  // 2) Allerede bokførte bankposter (samme beløp, dato ± 5 dager). Nærmest dato vinner.
  for (const b of sortert) {
    if (ut.has(b.id)) continue;
    const kand = data.bokfort.filter(x => !bruktB.has(x.bilagId) && x.belop === b.belop && dagerMellom(x.dato, b.dato) <= 5)
      .sort((x, y) => dagerMellom(x.dato, b.dato) - dagerMellom(y.dato, b.dato) || navneLikhet(y.tekst, b.tekst) - navneLikhet(x.tekst, b.tekst));
    if (!kand.length) continue;
    const k = kand[0];
    bruktB.add(k.bilagId);
    ut.set(b.id, { type: 'bokfort', bilagId: k.bilagId, sikker: true, grunn: `Finnes i regnskapet: ${k.tekst}.` });
  }

  // 3) Innbetaling uten KID: beløp = rest på åpen faktura og kundenavnet i teksten
  for (const b of sortert) {
    if (ut.has(b.id) || b.belop <= 0) continue;
    const kand = data.fakturaer.filter(x => !bruktF.has(x.id) && x.rest === b.belop).map(x => ({ x, l: navneLikhet(x.kunde, b.tekst) })).sort((p, q) => q.l - p.l);
    if (!kand.length) continue;
    const beste = kand[0];
    const entydig = kand.length === 1 || beste.l > (kand[1]?.l ?? 0);
    if (beste.l === 0 && kand.length > 1) continue;
    bruktF.add(beste.x.id);
    ut.set(b.id, { type: 'faktura', fakturaId: beste.x.id, belop: b.belop, sikker: false, grunn: `Betalt uten KID. Beløpet passer med faktura ${beste.x.nr} til ${beste.x.kunde}${entydig ? '' : ' (flere mulige)'}. Stemmer det?` });
  }

  // 4) Utbetaling til ubetalt leverandørfaktura: beløp + navn
  for (const b of sortert) {
    if (ut.has(b.id) || b.belop >= 0) continue;
    const kand = data.kjop.filter(x => !bruktK.has(x.id) && x.total === -b.belop).map(x => ({ x, l: navneLikhet(x.leverandor, b.tekst) })).sort((p, q) => q.l - p.l || dagerMellom(p.x.forfall ?? p.x.dato, b.dato) - dagerMellom(q.x.forfall ?? q.x.dato, b.dato));
    if (!kand.length) continue;
    const beste = kand[0];
    if (beste.l === 0 && kand.length > 1) continue;
    bruktK.add(beste.x.id);
    ut.set(b.id, { type: 'kjop', kjopId: beste.x.id, sikker: beste.l >= 0.5, grunn: `Betaling av kjøp fra ${beste.x.leverandor}.` });
  }

  // 5) Gebyr og renter
  for (const b of sortert) {
    if (ut.has(b.id)) continue;
    const k = klassifiserBankpost(b.tekst, b.belop);
    if (k) ut.set(b.id, { type: 'bankpost', post: k, sikker: true, grunn: k === 'gebyr' ? 'Bankgebyr. Føres automatisk.' : k === 'renteinntekt' ? 'Renter fra banken. Føres automatisk.' : 'Rentekostnad. Føres automatisk.' });
  }

  for (const b of sortert) if (!ut.has(b.id)) ut.set(b.id, { type: 'ingen', grunn: b.belop < 0 ? 'Finner ikke kjøpet i regnskapet.' : 'Finner ikke hva innbetalingen gjelder.' });
  return ut;
}
