// Bankavstemming med kontoutskrift. Ingen bankkobling: brukeren laster opp utskriften hver måned.

import type { Sporring } from '../db';
import { parseBank } from '../motor/rettfort-motor.js';
import { matchBevegelser, type Forslag, type Bevegelse } from '../bankmatch';
import { byggBankPost, RegnskapsFeil, type BankType } from '../hovedbok';
import { bokfor, laasPeriode, hentPosteringer } from './bokforing';
import { registrerBetaling } from './faktura';
import { betalKjop } from './kjop';
import { saldobalanse } from '../rapporter';

const ore = (kr: number) => Math.round(kr * 100);

export async function importerKontoutskrift(t: Sporring, orgId: string, tekst: string, filnavn: string): Promise<{ id: string; maned: string; antall: number; nye: number }> {
  let k;
  try { k = parseBank(tekst); } catch (e) { throw new RegnskapsFeil((e as Error).message); }
  const maned = (k.closingDate || k.to || k.lines[k.lines.length - 1].date).slice(0, 7);
  const r = await t.en<{ id: string; status: string }>(`insert into kontoutskrift (organisasjon_id, konto, maned, filnavn, ib, ub) values ($1, 1920, $2, $3, $4, $5)
    on conflict (organisasjon_id, konto, maned) do update set filnavn = excluded.filnavn, ib = coalesce(excluded.ib, kontoutskrift.ib), ub = coalesce(excluded.ub, kontoutskrift.ub) returning id, status`,
    [orgId, maned, filnavn, k.opening == null ? null : ore(k.opening), k.closing == null ? null : ore(k.closing)]);
  if (r!.status === 'ferdig') throw new RegnskapsFeil(`${maned} er allerede merket som ferdig.`);
  // Samme bevegelse lastet opp to ganger (f.eks. overlappende utskrifter) legges ikke inn på nytt.
  let nye = 0;
  for (const l of k.lines) {
    const belop = ore(l.amount);
    const finnes = await t.en(`select 1 from bankbevegelse where organisasjon_id = $1 and dato = $2 and belop = $3 and tekst = $4`, [orgId, l.date, belop, l.text || '']);
    if (finnes) continue;
    await t.q('insert into bankbevegelse (organisasjon_id, kontoutskrift_id, dato, tekst, belop, referanse) values ($1,$2,$3,$4,$5,$6)', [orgId, r!.id, l.date, l.text || '', belop, l.ref || null]);
    nye++;
  }
  await foreslaAlle(t, orgId);
  return { id: r!.id, maned, antall: k.lines.length, nye };
}

/** Regner ut forslag for alle åpne bevegelser og lagrer dem. */
export async function foreslaAlle(t: Sporring, orgId: string): Promise<void> {
  const bev = await t.q<{ id: string; dato: string; tekst: string; belop: number; referanse: string | null }>(`select id, dato::text as dato, tekst, belop, referanse from bankbevegelse where organisasjon_id = $1 and status in ('apen','foreslatt')`, [orgId]);
  if (!bev.length) return;
  const org = await t.en<{ kid_metode: 'mod10' | 'mod11' }>('select kid_metode from organisasjon where id = $1', [orgId]);
  const fakturaer = await t.q<{ id: string; nr: number; kid: string | null; rest: number; kunde: string; forfall: string | null }>(
    `select f.id, f.nr, f.kid, (f.total - f.betalt - coalesce((select sum(k.total) from faktura k where k.krediterer_id = f.id and k.status <> 'utkast'),0))::bigint as rest, coalesce(c.navn,'') as kunde, f.forfall::text as forfall
     from faktura f left join kontakt c on c.id = f.kontakt_id where f.organisasjon_id = $1 and f.type = 'faktura' and f.status in ('sendt','delvis_betalt')`, [orgId]);
  const kjop = await t.q<{ id: string; total: number; leverandor: string; dato: string; forfall: string | null }>(`select id, total, leverandor_navn as leverandor, dato::text as dato, forfall::text as forfall from kjop where organisasjon_id = $1 and status = 'registrert'`, [orgId]);
  // Bokførte bankposteringer (1920) som ikke er koblet til en bevegelse ennå.
  const bokfort = await t.q<{ bilagId: string; dato: string; belop: number; tekst: string }>(
    `select b.id as "bilagId", b.dato::text as dato, sum(p.debet - p.kredit)::bigint as belop, coalesce(b.beskrivelse,'') as tekst
     from bilag b join postering p on p.bilag_id = b.id and p.konto = 1920
     where b.organisasjon_id = $1 and not exists (select 1 from bankbevegelse x where x.bilag_id = b.id)
     group by b.id, b.dato, b.beskrivelse having sum(p.debet - p.kredit) <> 0`, [orgId]);
  const m = matchBevegelser(bev.map(b => ({ id: b.id, dato: b.dato, tekst: b.tekst, belop: b.belop, ref: b.referanse })), { fakturaer: fakturaer.filter(f => f.rest > 0), kjop, bokfort, kidMetode: org?.kid_metode });
  for (const b of bev) {
    const f = m.get(b.id)!;
    await t.q(`update bankbevegelse set status = $2, forslag = $3 where id = $1`, [b.id, f.type === 'ingen' ? 'apen' : 'foreslatt', JSON.stringify(f)]);
  }
}

export type Handling = { type: 'godkjenn' } | { type: 'bankpost'; post: BankType } | { type: 'ignorer' } | { type: 'koble_bilag'; bilagId: string };

/** Utfører forslaget (eller brukerens valg) for én bevegelse. */
export async function behandleBevegelse(t: Sporring, orgId: string, id: string, h: Handling, brukerId?: string | null): Promise<string> {
  // Regnskapet kan ha endret seg siden forslaget ble laget (f.eks. en ny kvittering). Regn ut på nytt.
  if (h.type === 'godkjenn') await foreslaAlle(t, orgId);
  const b = await t.en<{ id: string; dato: string; tekst: string; belop: number; status: string; forslag: string | null }>(`select id, dato::text as dato, tekst, belop, status, forslag from bankbevegelse where id = $1 and organisasjon_id = $2`, [id, orgId]);
  if (!b) throw new RegnskapsFeil('Fant ikke bevegelsen.');
  if (b.status === 'matchet') throw new RegnskapsFeil('Bevegelsen er allerede avstemt.');
  const org = await t.en<{ orgform: string }>('select orgform from organisasjon where id = $1', [orgId]);
  let bilagId: string | null = null, type = '', matchId: string | null = null, melding = '';
  if (h.type === 'godkjenn') {
    const f = (typeof b.forslag === 'string' ? JSON.parse(b.forslag) : b.forslag) as Forslag | null;
    if (!f || f.type === 'ingen') throw new RegnskapsFeil('Det finnes ikke noe forslag å godkjenne.');
    if (f.type === 'faktura') {
      bilagId = (await registrerBetaling(t, orgId, f.fakturaId, f.belop, b.dato, brukerId, 'bank')).bilagId; type = 'faktura'; matchId = f.fakturaId; melding = 'Innbetalingen er ført og fakturaen oppdatert.';
    } else if (f.type === 'kjop') {
      bilagId = (await betalKjop(t, orgId, f.kjopId, b.dato, brukerId)).id; type = 'kjop'; matchId = f.kjopId; melding = 'Betalingen er ført.';
    } else if (f.type === 'bokfort') {
      bilagId = f.bilagId; type = 'bokfort'; melding = 'Koblet til posteringen i regnskapet.';
    } else if (f.type === 'bankpost') {
      const r = await bokfor(t, orgId, { dato: b.dato, type: 'bank', beskrivelse: b.tekst, brukerId, kilde: 'bank' }, byggBankPost(f.post, b.belop, org!.orgform, b.tekst));
      bilagId = r.id; type = f.post; melding = 'Ført automatisk.';
    }
  } else if (h.type === 'bankpost') {
    const r = await bokfor(t, orgId, { dato: b.dato, type: 'bank', beskrivelse: b.tekst, brukerId, kilde: 'bank' }, byggBankPost(h.post, b.belop, org!.orgform, b.tekst));
    bilagId = r.id; type = h.post; melding = 'Ført.';
  } else if (h.type === 'koble_bilag') {
    const s = await t.en<{ belop: number }>(`select sum(debet - kredit)::bigint as belop from postering where bilag_id = $1 and organisasjon_id = $2 and konto = 1920`, [h.bilagId, orgId]);
    if (!s || s.belop !== b.belop) throw new RegnskapsFeil('Beløpet i regnskapet er ikke det samme som i banken.');
    bilagId = h.bilagId; type = 'bokfort'; melding = 'Koblet til.';
  } else if (h.type === 'ignorer') {
    await t.q(`update bankbevegelse set status = 'ignorert' where id = $1`, [id]);
    return 'Ignorert.';
  }
  await t.q(`update bankbevegelse set status = 'matchet', match_type = $2, match_id = $3, bilag_id = $4 where id = $1`, [id, type, matchId, bilagId]);
  await foreslaAlle(t, orgId);
  return melding;
}

/** Saldo i banken mot saldo på 1920 i regnskapet per siste dag i måneden. */
export async function avstemming(t: Sporring, orgId: string, maned: string) {
  const ku = await t.en<{ id: string; ib: number | null; ub: number | null; status: string }>('select id, ib, ub, status from kontoutskrift where organisasjon_id = $1 and konto = 1920 and maned = $2', [orgId, maned]);
  const [y, m] = maned.split('-').map(Number);
  const sisteDag = `${maned}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
  const sb = saldobalanse(await hentPosteringer(t, orgId, undefined, sisteDag));
  const regnskap = sb.get(1920)?.saldo ?? 0;
  const bev = ku ? await t.q<{ status: string }>(`select status from bankbevegelse where kontoutskrift_id = $1`, [ku.id]) : [];
  const apne = bev.filter(b => b.status !== 'matchet' && b.status !== 'ignorert').length;
  return { finnes: !!ku, status: ku?.status ?? 'mangler', bank: ku?.ub ?? null, regnskap, stemmer: ku?.ub != null && ku.ub === regnskap && apne === 0, apne, sisteDag };
}

export async function merkManedFerdig(t: Sporring, orgId: string, maned: string, brukerId?: string | null): Promise<void> {
  const a = await avstemming(t, orgId, maned);
  if (!a.finnes) throw new RegnskapsFeil('Last opp kontoutskriften først.');
  if (a.apne) throw new RegnskapsFeil(`${a.apne} bevegelser er ikke avstemt ennå.`);
  if (a.bank != null && a.bank !== a.regnskap) throw new RegnskapsFeil(`Saldoen stemmer ikke: banken viser ${a.bank / 100} kr, regnskapet ${a.regnskap / 100} kr.`);
  await t.q(`update kontoutskrift set status = 'ferdig' where organisasjon_id = $1 and maned = $2 and konto = 1920`, [orgId, maned]);
  await laasPeriode(t, orgId, a.sisteDag, `Bank avstemt for ${maned}`, brukerId);
}

export type { Bevegelse };
