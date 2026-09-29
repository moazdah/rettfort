// Lønnslipp på e-post. Er den beskyttet med passord (fødselsnummer eller eget), sendes bare en lenke:
// den ansatte åpner lønnslippen på nettsiden med passordet. Ellers sendes PDF-en som vedlegg.
// Arbeidsgiveren velger når de sendes: med en gang, på utbetalingsdagen eller ikke i det hele tatt.

import { randomBytes } from 'node:crypto';
import type { Sporring, Db } from '../db';
import { RegnskapsFeil } from '../hovedbok';
import { sjekkPassord } from '../auth';
import { lagLonnslippPdf, type LonnslippPdfData } from '../pdf';
import { sendEpost, maler } from '../epost';
import { kr } from '../penger';
import { manedNavn } from '../vis';

export type SendNar = 'na' | 'utbetaling' | 'ingen';

/** Fødselsnummer (og D-nummer): 11 siffer med to kontrollsiffer (mod 11). */
export function gyldigFnr(fnr: string): boolean {
  const s = fnr.replace(/\s/g, '');
  if (!/^\d{11}$/.test(s)) return false;
  const d = s.split('').map(Number);
  const k = (v: number[]) => { const r = 11 - (v.reduce((a, w, i) => a + w * d[i], 0) % 11); return r === 11 ? 0 : r; };
  const k1 = k([3, 7, 6, 1, 8, 9, 4, 5, 2]), k2 = k([5, 4, 3, 2, 7, 6, 5, 4, 3, 2]);
  return k1 !== 10 && k2 !== 10 && k1 === d[9] && k2 === d[10];
}

export const PASSORD_TEKST: Record<string, string> = { fnr: 'fødselsnummeret ditt (11 siffer)', eget: 'passordet du har fått av arbeidsgiveren' };

type Rad = {
  id: string; brutto: number; skatt: number; netto: number; feriepenger: number; linjer: LonnslippPdfData['linjer'] | string; utlegg: number; utlegg_linjer: { tekst: string; belop: number }[] | string; token: string | null; feil: number; sperret: boolean;
  periode: string; utbetalingsdato: string; organisasjon_id: string;
  anavn: string; stilling: string | null; akonto: string | null; epost: string | null; skatteprosent: number; slipp_passord_hash: string | null; slipp_passord_type: string | null;
  onavn: string; orgnr: string | null; adresse: string | null; postnr: string | null; poststed: string | null; oepost: string | null; ferie_prosent: number;
};

const HENT = `select s.id, s.brutto, s.skatt, s.netto, s.feriepenger, s.linjer, s.utlegg, s.utlegg_linjer, s.token, s.feil, coalesce(s.sperret_til > now(), false) as sperret,
  l.periode, l.utbetalingsdato::text as utbetalingsdato, l.organisasjon_id,
  a.navn as anavn, a.stilling, a.kontonr as akonto, a.epost, a.skatteprosent, a.slipp_passord_hash, a.slipp_passord_type,
  o.navn as onavn, o.orgnr, o.adresse, o.postnr, o.poststed, o.epost as oepost, o.ferie_prosent
  from lonnslipp s join lonnskjoring l on l.id = s.lonnskjoring_id join ansatt a on a.id = s.ansatt_id join organisasjon o on o.id = l.organisasjon_id`;

const dato = (d: string) => d.split('-').reverse().join('.');

function pdfData(r: Rad): LonnslippPdfData {
  return {
    foretak: { navn: r.onavn, orgnr: r.orgnr, adresse: r.adresse, postnr: r.postnr, poststed: r.poststed },
    ansatt: { navn: r.anavn, stilling: r.stilling, kontonr: r.akonto },
    periodeTekst: manedNavn(r.periode), utbetalt: r.utbetalingsdato, skatteprosent: Number(r.skatteprosent),
    linjer: typeof r.linjer === 'string' ? JSON.parse(r.linjer) : r.linjer,
    brutto: Number(r.brutto), skatt: Number(r.skatt), netto: Number(r.netto), feriepenger: Number(r.feriepenger), feriePst: Number(r.ferie_prosent),
    utlegg: typeof r.utlegg_linjer === 'string' ? JSON.parse(r.utlegg_linjer) : (r.utlegg_linjer ?? []),
  };
}

/** Lønnslippen som PDF, for arbeidsgiveren (nedlasting i systemet). */
export async function lonnslippPdf(t: Sporring, orgId: string, periode: string, ansattId: string) {
  const r = await t.en<Rad>(`${HENT} where l.organisasjon_id = $1 and l.periode = $2 and s.ansatt_id = $3`, [orgId, periode, ansattId]);
  if (!r) return null;
  return { pdf: await lagLonnslippPdf(pdfData(r)), filnavn: `lonnslipp-${periode}-${r.anavn.toLowerCase().replace(/[^a-z0-9æøå]+/g, '-')}.pdf` };
}

/** Bestemmer når lønnslippene for en lønnskjøring sendes. Bare ansatte med e-post får den. */
export async function planleggUtsending(t: Sporring, kjoringId: string, nar: SendNar, utbetalingsdato: string) {
  // På utbetalingsdagen: kl. 06 norsk tid (04 UTC om sommeren, 05 om vinteren; 04 UTC er trygt før arbeidsdagen).
  const tid = nar === 'na' ? new Date().toISOString() : nar === 'utbetaling' ? `${utbetalingsdato}T04:00:00Z` : null;
  await t.q(`update lonnslipp s set send_etter = $2 from ansatt a where s.ansatt_id = a.id and s.lonnskjoring_id = $1 and a.epost is not null and a.epost <> ''`, [kjoringId, tid]);
}

/** Sender lønnslipper som er klare. Hver slipp sendes bare én gang, også om flere kjører samtidig. */
export async function sendForfalte(db: Db, grunnadresse: string, orgId?: string): Promise<{ sendt: string[]; feilet: string[] }> {
  const rader = await db.q<Rad>(`${HENT} where s.send_etter <= now() and s.sendt_tid is null${orgId ? ' and l.organisasjon_id = $1' : ''} limit 200`, orgId ? [orgId] : []);
  const sendt: string[] = [], feilet: string[] = [];
  for (const r of rader) {
    const tatt = await db.en(`update lonnslipp set sendt_tid = now() where id = $1 and sendt_tid is null returning id`, [r.id]);
    if (!tatt || !r.epost) continue;
    const beskyttet = !!r.slipp_passord_hash;
    let lenke: string | null = null;
    if (beskyttet) {
      const token = r.token ?? randomBytes(24).toString('base64url');
      if (!r.token) await db.q('update lonnslipp set token = $2 where id = $1', [r.id, token]);
      lenke = `${grunnadresse}/lonnslipp/${token}`;
    }
    const m = maler.lonnslipp({ navn: r.anavn.split(' ')[0], foretak: r.onavn, periode: manedNavn(r.periode), netto: kr(Number(r.netto) + Number(r.utlegg ?? 0)), utbetalt: dato(r.utbetalingsdato), lenke, passordTekst: PASSORD_TEKST[r.slipp_passord_type ?? 'fnr'] });
    const vedlegg = beskyttet ? undefined : [{ filnavn: `lonnslipp-${r.periode}.pdf`, innhold: await lagLonnslippPdf(pdfData(r)) }];
    const ok = await sendEpost({ til: r.epost, ...m, svarTil: r.oepost ?? undefined, vedlegg });
    if (ok) sendt.push(r.anavn);
    else { feilet.push(r.anavn); await db.q('update lonnslipp set sendt_tid = null, send_etter = null where id = $1', [r.id]); }
  }
  return { sendt, feilet };
}

/** Den ansatte åpner lønnslippen med passordet. Sperres i 15 minutter etter 5 feil. */
export async function apneLonnslipp(db: Db, token: string, passord: string): Promise<{ data: LonnslippPdfData; pdf: Uint8Array }> {
  if (!/^[\w-]{20,64}$/.test(token)) throw new RegnskapsFeil('Lenken er ikke gyldig.');
  const r = await db.en<Rad>(`${HENT} where s.token = $1`, [token]);
  if (!r || !r.slipp_passord_hash) throw new RegnskapsFeil('Lenken er ikke gyldig.');
  if (r.sperret) throw new RegnskapsFeil('For mange feil forsøk. Vent 15 minutter og prøv igjen.');
  const svar = r.slipp_passord_type === 'fnr' ? passord.replace(/\s/g, '') : passord;
  if (!(await sjekkPassord(svar, r.slipp_passord_hash))) {
    await db.q(`update lonnslipp set feil = feil + 1, sperret_til = case when feil + 1 >= 5 then now() + interval '15 minutes' else sperret_til end where id = $1`, [r.id]);
    throw new RegnskapsFeil(r.slipp_passord_type === 'fnr' ? 'Fødselsnummeret stemmer ikke.' : 'Passordet stemmer ikke.');
  }
  await db.q('update lonnslipp set feil = 0, sperret_til = null, apnet_tid = coalesce(apnet_tid, now()) where id = $1', [r.id]);
  const data = pdfData(r);
  return { data, pdf: await lagLonnslippPdf(data) };
}

/** Hva siden kan vise før passordet er skrevet: bare foretak, måned og hvilket passord som trengs. */
export async function lonnslippInfo(db: Db, token: string) {
  if (!/^[\w-]{20,64}$/.test(token)) return null;
  const r = await db.en<{ onavn: string; periode: string; slipp_passord_type: string | null; fornavn: string }>(
    `select o.navn as onavn, l.periode, a.slipp_passord_type, split_part(a.navn, ' ', 1) as fornavn from lonnslipp s join lonnskjoring l on l.id = s.lonnskjoring_id join ansatt a on a.id = s.ansatt_id join organisasjon o on o.id = l.organisasjon_id where s.token = $1 and a.slipp_passord_hash is not null`, [token]);
  return r ? { foretak: r.onavn, periode: manedNavn(r.periode), type: r.slipp_passord_type ?? 'fnr', fornavn: r.fornavn } : null;
}
