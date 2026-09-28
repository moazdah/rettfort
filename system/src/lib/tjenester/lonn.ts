// Lønn. Forenklet som i prototypen: prosenttrekk fra skattekortet. Tabelltrekk, OTP og
// feriepengeutbetaling kommer når skattekort hentes fra Skatteetaten (krever Maskinporten).

import type { Sporring } from '../db';
import { byggLonn, beregnAga, RegnskapsFeil } from '../hovedbok';
import { bokfor } from './bokforing';

/** Arbeidsgiveravgift per sone (2026). Sone 1a har redusert sats til fribeløpet er brukt opp. */
export const AGA_SONER: Record<string, { navn: string; sats: number }> = {
  '1': { navn: 'Sone 1', sats: 14.1 },
  '1a': { navn: 'Sone 1a', sats: 10.6 },
  '2': { navn: 'Sone 2', sats: 10.6 },
  '3': { navn: 'Sone 3', sats: 6.4 },
  '4': { navn: 'Sone 4', sats: 5.1 },
  '4a': { navn: 'Sone 4a', sats: 7.9 },
  '5': { navn: 'Sone 5', sats: 0 },
};

export interface LonnTillegg { tekst: string; belop: number; feriepengegrunnlag?: boolean }

export interface LonnInput { ansattId: string; timer?: number; tillegg?: LonnTillegg[] }

export interface Lonnslipp {
  ansattId: string; navn: string; brutto: number; skatt: number; netto: number; feriepenger: number; aga: number;
  linjer: { tekst: string; antall?: number; sats?: number; belop: number }[];
  advarsler: string[];
}

export function beregnLonnslipp(a: { id: string; navn: string; lonn_type: 'fast' | 'time'; manedslonn: number; timesats: number; skatteprosent: number }, inn: LonnInput, feriePst: number, agaSats: number): Lonnslipp {
  const linjer: Lonnslipp['linjer'] = [];
  const advarsler: string[] = [];
  let grunnlagFerie = 0;
  if (a.lonn_type === 'fast') {
    linjer.push({ tekst: 'Fastlønn', belop: a.manedslonn });
    grunnlagFerie += a.manedslonn;
  } else {
    const timer = inn.timer ?? 0;
    if (timer < 0) throw new RegnskapsFeil('Antall timer kan ikke være negativt.');
    if (timer > 250) advarsler.push(`${a.navn} har ${timer} timer denne måneden. Det er uvanlig mye.`);
    const belop = Math.round(timer * a.timesats);
    linjer.push({ tekst: 'Timelønn', antall: timer, sats: a.timesats, belop });
    grunnlagFerie += belop;
  }
  for (const t of inn.tillegg ?? []) {
    linjer.push({ tekst: t.tekst, belop: t.belop });
    if (t.feriepengegrunnlag !== false) grunnlagFerie += t.belop;
  }
  const brutto = linjer.reduce((s, l) => s + l.belop, 0);
  if (brutto < 0) throw new RegnskapsFeil('Lønnen kan ikke være negativ.');
  // Prosenttrekk rundes ned til hele kroner.
  const skatt = Math.floor((brutto * a.skatteprosent) / 100 / 100) * 100;
  const feriepenger = Math.round((grunnlagFerie * feriePst) / 100);
  const aga = beregnAga(brutto, agaSats);
  return { ansattId: a.id, navn: a.navn, brutto, skatt, netto: brutto - skatt, feriepenger, aga, linjer, advarsler };
}

export async function forhandsvisLonn(t: Sporring, orgId: string, input: LonnInput[]): Promise<Lonnslipp[]> {
  const org = await t.en<{ ferie_prosent: number; aga_sone: string }>('select ferie_prosent, aga_sone from organisasjon where id = $1', [orgId]);
  const ansatte = await t.q<{ id: string; navn: string; lonn_type: 'fast' | 'time'; manedslonn: number; timesats: number; skatteprosent: number }>('select * from ansatt where organisasjon_id = $1 and aktiv order by navn', [orgId]);
  const sats = AGA_SONER[org!.aga_sone]?.sats ?? 14.1;
  return ansatte.map(a => beregnLonnslipp(a, input.find(i => i.ansattId === a.id) ?? { ansattId: a.id }, org!.ferie_prosent, sats));
}

export async function kjorLonn(t: Sporring, orgId: string, periode: string, utbetalingsdato: string, input: LonnInput[], brukerId?: string | null) {
  if (!/^\d{4}-\d{2}$/.test(periode)) throw new RegnskapsFeil('Ugyldig periode.');
  const finnes = await t.en('select 1 from lonnskjoring where organisasjon_id = $1 and periode = $2', [orgId, periode]);
  if (finnes) throw new RegnskapsFeil(`Lønn for ${periode} er allerede kjørt.`);
  const slipper = (await forhandsvisLonn(t, orgId, input)).filter(s => s.brutto > 0);
  if (!slipper.length) throw new RegnskapsFeil('Ingen ansatte har lønn denne måneden.');
  const org = await t.en<{ aga_sone: string }>('select aga_sone from organisasjon where id = $1', [orgId]);
  const sats = AGA_SONER[org!.aga_sone]?.sats ?? 14.1;
  const p = byggLonn(slipper.map(s => ({ brutto: s.brutto, skattetrekk: s.skatt, feriepenger: s.feriepenger, agaSats: sats })), `Lønn ${periode}`);
  const b = await bokfor(t, orgId, { dato: utbetalingsdato, type: 'lonn', beskrivelse: `Lønn ${periode}`, brukerId, kilde: 'lonn' }, p);
  const sum = (k: keyof Lonnslipp) => slipper.reduce((s, x) => s + (x[k] as number), 0);
  const aga = beregnAgaSum(slipper, sats);
  const lk = await t.en<{ id: string }>('insert into lonnskjoring (organisasjon_id, periode, utbetalingsdato, bilag_id, brutto, skatt, netto, aga, feriepenger) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id',
    [orgId, periode, utbetalingsdato, b.id, sum('brutto'), sum('skatt'), sum('netto'), aga, sum('feriepenger')]);
  for (const s of slipper) await t.q('insert into lonnslipp (lonnskjoring_id, ansatt_id, brutto, skatt, netto, feriepenger, linjer) values ($1,$2,$3,$4,$5,$6,$7)', [lk!.id, s.ansattId, s.brutto, s.skatt, s.netto, s.feriepenger, JSON.stringify(s.linjer)]);
  return { id: lk!.id, bilagNr: b.nr, slipper };
}

function beregnAgaSum(s: Lonnslipp[], sats: number): number {
  return s.reduce((a, x) => a + beregnAga(x.brutto, sats) + beregnAga(x.feriepenger, sats), 0);
}

/** Skattetrekk og AGA som skal betales for en termin (fra lønnskjøringene i terminen). */
export async function trekkOgAga(t: Sporring, orgId: string, fra: string, til: string): Promise<{ skatt: number; aga: number }> {
  const r = await t.en<{ skatt: number; aga: number }>(`select coalesce(sum(skatt),0)::bigint as skatt, coalesce(sum(aga),0)::bigint as aga from lonnskjoring where organisasjon_id = $1 and utbetalingsdato between $2 and $3`, [orgId, fra, til]);
  return r ?? { skatt: 0, aga: 0 };
}
