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

export type LonnType = 'fast' | 'time' | 'provisjon';

/** Det som legges inn for hver ansatt når lønnen kjøres. */
export interface LonnInput {
  ansattId: string; timer?: number; overtidTimer?: number; provisjonGrunnlag?: number; tillegg?: LonnTillegg[];
  /** Fra vaktplanen: timer fravær med lønn (betales for timelønnede) og uten lønn (trekkes for fastlønnede). */
  fravaerMedLonn?: number; fravaerUtenLonn?: number;
}

/** Det vaktplanen har godkjent for en ansatt, gjort om til felt i lønnskjøringen. */
export function fraVaktplan(lonnType: string, v: { timer: number; overtid: number; fravaerMed?: number; fravaerUten?: number }): Pick<LonnInput, 'timer' | 'overtidTimer' | 'fravaerMedLonn' | 'fravaerUtenLonn'> {
  const time = lonnType === 'time';
  return {
    timer: time ? Math.max(0, Math.round((v.timer - v.overtid) * 100) / 100) : undefined,
    overtidTimer: v.overtid || undefined,
    fravaerMedLonn: time && v.fravaerMed ? v.fravaerMed : undefined,
    fravaerUtenLonn: !time && v.fravaerUten ? v.fravaerUten : undefined,
  };
}

export interface AnsattLonn {
  id: string; navn: string; lonn_type: LonnType; manedslonn: number; timesats: number; skatteprosent: number;
  provisjon_prosent?: number; overtid_prosent?: number; faste_tillegg?: LonnTillegg[] | string | null;
}

export interface Lonnslipp {
  ansattId: string; navn: string; brutto: number; skatt: number; netto: number; feriepenger: number; aga: number;
  linjer: { tekst: string; antall?: number; sats?: number; belop: number }[];
  advarsler: string[];
}

/** Normal arbeidstid per måned ved 37,5 timers uke. Brukes for timesatsen til fastlønnede ved overtid. */
export const TIMER_PER_MANED = 162.5;

/** Timelønnen overtid regnes ut fra: timesatsen, eller månedslønnen delt på normal arbeidstid. */
export function grunntimesats(a: Pick<AnsattLonn, 'lonn_type' | 'manedslonn' | 'timesats'>): number {
  return a.lonn_type === 'time' ? a.timesats : Math.round(a.manedslonn / TIMER_PER_MANED);
}

export function fasteTillegg(a: Pick<AnsattLonn, 'faste_tillegg'>): LonnTillegg[] {
  const v = typeof a.faste_tillegg === 'string' ? JSON.parse(a.faste_tillegg) : a.faste_tillegg;
  return Array.isArray(v) ? v.filter(t => t && t.tekst && Number.isFinite(t.belop)) : [];
}

export function beregnLonnslipp(a: AnsattLonn, inn: LonnInput, feriePst: number, agaSats: number): Lonnslipp {
  const linjer: Lonnslipp['linjer'] = [];
  const advarsler: string[] = [];
  let grunnlagFerie = 0;
  // Prosenter kan komme som tekst fra databasen (numeric).
  const provPst = Number(a.provisjon_prosent ?? 0), otPst = Number(a.overtid_prosent ?? 40), skattPst = Number(a.skatteprosent);
  if (a.lonn_type === 'time') {
    const timer = inn.timer ?? 0;
    if (timer < 0) throw new RegnskapsFeil('Antall timer kan ikke være negativt.');
    if (timer > 250) advarsler.push(`${a.navn} har ${timer} timer denne måneden. Det er uvanlig mye.`);
    const belop = Math.round(timer * a.timesats);
    linjer.push({ tekst: 'Timelønn', antall: timer, sats: a.timesats, belop });
    grunnlagFerie += belop;
    const fravaer = inn.fravaerMedLonn ?? 0;
    if (fravaer < 0) throw new RegnskapsFeil('Fravær kan ikke være negativt.');
    if (fravaer > 0) {
      const f = Math.round(fravaer * a.timesats);
      linjer.push({ tekst: 'Fravær med lønn', antall: fravaer, sats: a.timesats, belop: f });
      grunnlagFerie += f;
    }
  } else if (a.manedslonn > 0) {
    linjer.push({ tekst: 'Fastlønn', belop: a.manedslonn });
    grunnlagFerie += a.manedslonn;
    const uten = inn.fravaerUtenLonn ?? 0;
    if (uten < 0) throw new RegnskapsFeil('Fravær kan ikke være negativt.');
    if (uten > 0) {
      // Trekk for fravær uten lønn: timene ganger timesatsen, aldri mer enn månedslønnen.
      const sats = grunntimesats(a);
      const trekk = Math.min(a.manedslonn, Math.round(uten * sats));
      linjer.push({ tekst: 'Trekk for fravær uten lønn', antall: uten, sats, belop: -trekk });
      grunnlagFerie -= trekk;
    }
  }
  if (a.lonn_type === 'provisjon') {
    const grunnlag = inn.provisjonGrunnlag ?? 0;
    if (grunnlag < 0) throw new RegnskapsFeil('Salget som gir provisjon kan ikke være negativt.');
    const belop = Math.round((grunnlag * provPst) / 100);
    if (belop > 0) { linjer.push({ tekst: `Provisjon ${String(provPst).replace('.', ',')} % av ${(grunnlag / 100).toLocaleString('nb-NO')} kr`, belop }); grunnlagFerie += belop; }
  }
  const ot = inn.overtidTimer ?? 0;
  if (ot < 0) throw new RegnskapsFeil('Overtidstimer kan ikke være negativt.');
  if (ot > 0) {
    const sats = Math.round(grunntimesats(a) * (1 + otPst / 100));
    const belop = Math.round(ot * sats);
    linjer.push({ tekst: `Overtid (${String(otPst).replace('.', ',')} % tillegg)`, antall: ot, sats, belop });
    grunnlagFerie += belop;
    if (ot > 50) advarsler.push(`${a.navn} har ${ot} overtidstimer denne måneden. Loven setter grenser for overtid.`);
  }
  for (const t of [...fasteTillegg(a), ...(inn.tillegg ?? [])]) {
    linjer.push({ tekst: t.tekst, belop: t.belop });
    if (t.feriepengegrunnlag !== false) grunnlagFerie += t.belop;
  }
  const brutto = linjer.reduce((s, l) => s + l.belop, 0);
  if (brutto < 0) throw new RegnskapsFeil('Lønnen kan ikke være negativ.');
  // Prosenttrekk rundes ned til hele kroner.
  const skatt = Math.floor((brutto * skattPst) / 100 / 100) * 100;
  const feriepenger = Math.round((grunnlagFerie * feriePst) / 100);
  const aga = beregnAga(brutto, agaSats);
  return { ansattId: a.id, navn: a.navn, brutto, skatt, netto: brutto - skatt, feriepenger, aga, linjer, advarsler };
}

export async function forhandsvisLonn(t: Sporring, orgId: string, input: LonnInput[]): Promise<Lonnslipp[]> {
  const org = await t.en<{ ferie_prosent: number; aga_sone: string }>('select ferie_prosent, aga_sone from organisasjon where id = $1', [orgId]);
  const ansatte = await t.q<AnsattLonn>('select * from ansatt where organisasjon_id = $1 and aktiv order by navn', [orgId]);
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
  // Godkjente utlegg som skal betales tilbake med lønnen: egen linje på lønnslippen, uten skatt og feriepenger.
  const utlegg = await t.q<{ id: string; ansatt_id: string; belop: number; tekst: string }>(`select i.id, l.ansatt_id, i.belop, coalesce(i.tekst, 'Utlegg') as tekst from innsending i join skannelenke l on l.id = i.lenke_id
    where i.organisasjon_id = $1 and i.type = 'utlegg' and i.status = 'godkjent' and i.tilbake = 'neste_lonn' and i.lonnskjoring_id is null and i.belop > 0 order by i.opprettet`, [orgId]);
  for (const s of slipper) {
    const mine = utlegg.filter(u => u.ansatt_id === s.ansattId);
    const sum = mine.reduce((a, u) => a + Number(u.belop), 0);
    await t.q('insert into lonnslipp (lonnskjoring_id, ansatt_id, brutto, skatt, netto, feriepenger, linjer, utlegg, utlegg_linjer) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [lk!.id, s.ansattId, s.brutto, s.skatt, s.netto, s.feriepenger, JSON.stringify(s.linjer), sum, JSON.stringify(mine.map(u => ({ tekst: u.tekst, belop: Number(u.belop) })))]);
    if (sum > 0) {
      await bokfor(t, orgId, { dato: utbetalingsdato, type: 'bank', beskrivelse: `Utlegg tilbakebetalt med lønn ${periode}, ${s.navn}`, brukerId, kilde: 'utlegg' }, [
        { konto: 2910, debet: sum, kredit: 0 }, { konto: 1920, debet: 0, kredit: sum },
      ]);
      await t.q(`update innsending set status = 'betalt', lonnskjoring_id = $2, behandlet = now() where id = any($1::uuid[])`, [mine.map(u => u.id), lk!.id]);
    }
  }
  return { id: lk!.id, bilagNr: b.nr, slipper };
}

function beregnAgaSum(s: Lonnslipp[], sats: number): number {
  return s.reduce((a, x) => a + beregnAga(x.brutto, sats) + beregnAga(x.feriepenger, sats), 0);
}

/**
 * Skattetrekk og AGA som skal betales for en termin (fra lønnskjøringene i terminen).
 * AGA er bare avgiften på utbetalt lønn (konto 2770). Avgiften på avsatte feriepenger (2785) forfaller
 * først når feriepengene utbetales, og tas ikke med her.
 */
export async function trekkOgAga(t: Sporring, orgId: string, fra: string, til: string): Promise<{ skatt: number; aga: number }> {
  const r = await t.en<{ skatt: number; aga: number }>(
    `select coalesce(sum(l.skatt),0)::bigint as skatt,
       coalesce((select sum(p.kredit - p.debet) from postering p where p.organisasjon_id = $1 and p.konto = 2770 and p.bilag_id in
         (select bilag_id from lonnskjoring where organisasjon_id = $1 and utbetalingsdato between $2 and $3 and bilag_id is not null)),0)::bigint as aga
     from lonnskjoring l where l.organisasjon_id = $1 and l.utbetalingsdato between $2 and $3`, [orgId, fra, til]);
  return r ?? { skatt: 0, aga: 0 };
}

/** AGA på utbetalt lønn for én lønnskjøring (det som skal i a-meldingen). */
export async function agaForKjoring(t: Sporring, orgId: string, periode: string): Promise<number> {
  const r = await t.en<{ aga: number }>(`select coalesce(sum(p.kredit - p.debet),0)::bigint as aga from postering p join lonnskjoring l on l.bilag_id = p.bilag_id where l.organisasjon_id = $1 and l.periode = $2 and p.konto = 2770`, [orgId, periode]);
  return r?.aga ?? 0;
}
