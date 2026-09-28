// Salg: faktura, tilbud, kvittering (betalt nå) og kreditnota.

import type { Sporring } from '../db';
import { byggFaktura, byggInnbetaling, fakturaSummer, linjeNetto, RegnskapsFeil, type FakturaLinje } from '../hovedbok';
import { bokfor } from './bokforing';
import { lagKid } from '../kid';
import { gyldigOrgnr } from '../brreg';

export type SalgType = 'faktura' | 'tilbud' | 'kvittering' | 'kreditnota';

export interface FakturaInput {
  id?: string;
  type: SalgType;
  kontaktId: string | null;
  dato: string;
  forfall?: string | null;
  levert?: string | null;
  referanse?: string | null;
  linjer: FakturaLinje[];
  gjentakelse?: string | null;
  avsender?: Record<string, string> | null;
}

export interface Org {
  id: string; navn: string; orgnr: string | null; orgform: string; adresse: string | null; postnr: string | null; poststed: string | null;
  kontonr: string | null; epost: string | null; telefon: string | null; mva_registrert: boolean; faktura_forfall_dager: number; kid_metode: 'mod10' | 'mod11';
}

export interface Kontakt { id: string; navn: string; orgnr: string | null; adresse: string | null; postnr: string | null; poststed: string | null; epost: string | null; kundenr: number | null }

export async function hentOrg(t: Sporring, orgId: string): Promise<Org> {
  const o = await t.en<Org>('select * from organisasjon where id = $1', [orgId]);
  if (!o) throw new RegnskapsFeil('Fant ikke foretaket.');
  return o;
}

/**
 * Sjekker lovpålagt innhold (bokføringsforskriften § 5-1-1) før sending.
 * Returnerer en liste med det som mangler, formulert slik brukeren forstår det.
 */
export function mangler(org: Org, kunde: Kontakt | null, f: FakturaInput, avsender?: Record<string, string> | null): string[] {
  const m: string[] = [];
  const a = { ...org, ...(avsender ?? {}) } as Org;
  if (!a.navn) m.push('Firmanavnet ditt mangler.');
  if (!org.orgnr) m.push('Org.nr mangler. Hent det fra Brønnøysund under Innstillinger.');
  else if (!gyldigOrgnr(org.orgnr)) m.push('Org.nr er ugyldig.');
  if (!a.adresse || !a.postnr) m.push('Adressen din mangler.');
  if (f.type !== 'tilbud' && f.type !== 'kvittering' && !a.kontonr) m.push('Kontonummer for betaling mangler.');
  if (!kunde) m.push('Velg hvem som skal betale.');
  else {
    if (!kunde.navn) m.push('Kundens navn mangler.');
    if (f.type !== 'kvittering' && (!kunde.adresse || !kunde.postnr)) m.push(`Adressen til ${kunde.navn} mangler.`);
    if (kunde.orgnr && !gyldigOrgnr(kunde.orgnr)) m.push(`Org.nr til ${kunde.navn} er ugyldig.`);
  }
  if (!f.linjer.length || f.linjer.every(l => linjeNetto(l) === 0)) m.push('Legg til minst én linje med beløp.');
  if (f.linjer.some(l => !l.beskrivelse.trim())) m.push('Alle linjer må ha en beskrivelse av hva som er levert.');
  if (f.type === 'faktura' && !f.forfall) m.push('Forfallsdato mangler.');
  if (f.forfall && f.forfall < f.dato) m.push('Forfall kan ikke være før fakturadato.');
  if (!org.mva_registrert && f.linjer.some(l => l.sats > 0)) m.push('Du er ikke MVA-registrert og kan ikke ta MVA. Sett MVA til 0 %.');
  return m;
}

export async function lagreSalg(t: Sporring, orgId: string, f: FakturaInput): Promise<string> {
  const org = await hentOrg(t, orgId);
  const s = fakturaSummer(f.linjer, org.mva_registrert);
  let id = f.id;
  if (id) {
    const e = await t.en<{ status: string }>('select status from faktura where id = $1 and organisasjon_id = $2', [id, orgId]);
    if (!e) throw new RegnskapsFeil('Fant ikke utkastet.');
    if (e.status !== 'utkast') throw new RegnskapsFeil('Bare utkast kan endres. Send en kreditnota for å rette en sendt faktura.');
    await t.q('update faktura set type=$3, kontakt_id=$4, dato=$5, forfall=$6, levert=$7, referanse=$8, netto=$9, mva=$10, total=$11, gjentakelse=$12, avsender=$13 where id=$1 and organisasjon_id=$2',
      [id, orgId, f.type, f.kontaktId, f.dato, f.forfall ?? null, f.levert ?? null, f.referanse ?? null, s.netto, s.mva, s.total, f.gjentakelse ?? null, f.avsender ? JSON.stringify(f.avsender) : null]);
    await t.q('delete from faktura_linje where faktura_id = $1', [id]);
  } else {
    const r = await t.en<{ id: string }>('insert into faktura (organisasjon_id, type, kontakt_id, dato, forfall, levert, referanse, netto, mva, total, gjentakelse, avsender) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id',
      [orgId, f.type, f.kontaktId, f.dato, f.forfall ?? null, f.levert ?? null, f.referanse ?? null, s.netto, s.mva, s.total, f.gjentakelse ?? null, f.avsender ? JSON.stringify(f.avsender) : null]);
    id = r!.id;
  }
  let i = 0;
  for (const l of f.linjer) {
    i++;
    await t.q('insert into faktura_linje (faktura_id, linje, beskrivelse, antall_milli, pris, mva_sats, konto) values ($1,$2,$3,$4,$5,$6,$7)', [id, i, l.beskrivelse, l.antallMilli, l.pris, org.mva_registrert ? l.sats : 0, l.konto ?? null]);
  }
  return id!;
}

export async function hentSalg(t: Sporring, orgId: string, id: string) {
  const f = await t.en<{ id: string; type: SalgType; nr: number | null; status: string; kontakt_id: string | null; dato: string; forfall: string | null; levert: string | null; referanse: string | null; kid: string | null; netto: number; mva: number; total: number; betalt: number; bilag_id: string | null; krediterer_id: string | null; kreditgrunn: string | null; gjentakelse: string | null; avsender: Record<string, string> | null; sendt_tid: string | null; apnet_tid: string | null; opprettet: string }>(
    `select *, dato::text as dato, forfall::text as forfall from faktura where id = $1 and organisasjon_id = $2`, [id, orgId]);
  if (!f) return null;
  const linjer = await t.q<{ beskrivelse: string; antall_milli: number; pris: number; mva_sats: number; konto: number | null }>('select * from faktura_linje where faktura_id = $1 order by linje', [id]);
  const kunde = f.kontakt_id ? await t.en<Kontakt>('select * from kontakt where id = $1', [f.kontakt_id]) : null;
  return { ...f, linjer: linjer.map(l => ({ beskrivelse: l.beskrivelse, antallMilli: l.antall_milli, pris: l.pris, sats: l.mva_sats, konto: l.konto ?? undefined })), kunde };
}

async function sikreKundenr(t: Sporring, orgId: string, kontaktId: string): Promise<number> {
  const k = await t.en<{ kundenr: number | null }>('select kundenr from kontakt where id = $1 and organisasjon_id = $2', [kontaktId, orgId]);
  if (!k) throw new RegnskapsFeil('Fant ikke kunden.');
  if (k.kundenr) return k.kundenr;
  const n = await t.en<{ nr: number }>('update organisasjon set neste_kundenr = neste_kundenr + 1 where id = $1 returning neste_kundenr - 1 as nr', [orgId]);
  await t.q('update kontakt set kundenr = $1 where id = $2', [n!.nr, kontaktId]);
  return n!.nr;
}

/** Sender (fullfører) et salg: gir nummer og KID, fører i regnskapet. Tilbud føres ikke. */
export async function sendSalg(t: Sporring, orgId: string, id: string, brukerId?: string | null): Promise<{ nr: number; kid: string | null; bilagNr: number | null }> {
  const f = await hentSalg(t, orgId, id);
  if (!f) throw new RegnskapsFeil('Fant ikke dokumentet.');
  if (f.status !== 'utkast') throw new RegnskapsFeil('Dokumentet er allerede sendt.');
  const org = await hentOrg(t, orgId);
  const m = mangler(org, f.kunde, { ...f, type: f.type }, f.avsender);
  if (m.length) throw new RegnskapsFeil(m.join(' '));
  let nr: number;
  if (f.type === 'tilbud') {
    const r = await t.en<{ nr: number }>(`select coalesce(max(nr), 0) + 1 as nr from faktura where organisasjon_id = $1 and type = 'tilbud'`, [orgId]);
    nr = r!.nr;
  } else {
    // Faktura, kvittering og kreditnota deler én løpende nummerserie uten hull.
    const r = await t.en<{ nr: number }>('update organisasjon set neste_fakturanr = neste_fakturanr + 1 where id = $1 returning neste_fakturanr - 1 as nr', [orgId]);
    nr = r!.nr;
  }
  let kid: string | null = null;
  if (f.type === 'faktura') kid = lagKid(nr, await sikreKundenr(t, orgId, f.kontakt_id!), org.kid_metode);
  let bilagNr: number | null = null, bilagId: string | null = null;
  if (f.type !== 'tilbud') {
    const tekst = `${f.type === 'kvittering' ? 'Kvittering' : 'Faktura'} ${nr} · ${f.kunde?.navn ?? ''}`.trim();
    const p = byggFaktura({ linjer: f.linjer, mvaRegistrert: org.mva_registrert, kontaktId: f.kontakt_id, betaltNa: f.type === 'kvittering', tekst });
    const b = await bokfor(t, orgId, { dato: f.dato, type: f.type, beskrivelse: tekst, kontaktId: f.kontakt_id, brukerId, kilde: 'salg' }, p);
    bilagNr = b.nr; bilagId = b.id;
  }
  const status = f.type === 'kvittering' ? 'betalt' : 'sendt';
  await t.q('update faktura set nr=$3, kid=$4, status=$5, bilag_id=$6, sendt_tid=now(), betalt=$7 where id=$1 and organisasjon_id=$2', [id, orgId, nr, kid, status, bilagId, f.type === 'kvittering' ? f.total : 0]);
  return { nr, kid, bilagNr };
}

/** Registrerer innbetaling på en faktura. Delbetaling er lov. */
export async function registrerBetaling(t: Sporring, orgId: string, id: string, belop: number, dato: string, brukerId?: string | null, kilde = 'manuell'): Promise<{ bilagNr: number; bilagId: string; status: string }> {
  const f = await hentSalg(t, orgId, id);
  if (!f || f.type !== 'faktura') throw new RegnskapsFeil('Fant ikke fakturaen.');
  if (f.status === 'utkast') throw new RegnskapsFeil('Fakturaen er ikke sendt ennå.');
  if (f.status === 'kreditert') throw new RegnskapsFeil('Fakturaen er kreditert.');
  const rest = f.total - f.betalt - (await kreditertBelop(t, id));
  if (belop <= 0) throw new RegnskapsFeil('Beløpet må være større enn 0.');
  if (belop > rest) throw new RegnskapsFeil(`Det gjenstår bare ${rest / 100} kr å betale.`);
  const b = await bokfor(t, orgId, { dato, type: 'innbetaling', beskrivelse: `Innbetaling faktura ${f.nr}`, kontaktId: f.kontakt_id, brukerId, kilde }, byggInnbetaling(belop, f.kontakt_id, `Innbetaling faktura ${f.nr}`));
  const betalt = f.betalt + belop;
  const status = betalt >= f.total - (await kreditertBelop(t, id)) ? 'betalt' : 'delvis_betalt';
  await t.q('update faktura set betalt = $3, status = $4 where id = $1 and organisasjon_id = $2', [id, orgId, betalt, status]);
  return { bilagNr: b.nr, bilagId: b.id, status };
}

async function kreditertBelop(t: Sporring, fakturaId: string): Promise<number> {
  const r = await t.en<{ s: number }>(`select coalesce(sum(total),0)::bigint as s from faktura where krediterer_id = $1 and status <> 'utkast'`, [fakturaId]);
  return r?.s ?? 0;
}

/**
 * Krediterer hele eller deler av en faktura. Delkreditering: ett beløp inkl. MVA fordelt
 * forholdsmessig på fakturaens satser.
 */
export async function krediter(t: Sporring, orgId: string, id: string, opts: { belop?: number; grunn: string; dato: string }, brukerId?: string | null): Promise<{ nr: number; id: string }> {
  const f = await hentSalg(t, orgId, id);
  if (!f || f.type !== 'faktura' || f.status === 'utkast') throw new RegnskapsFeil('Bare sendte fakturaer kan krediteres.');
  const allerede = await kreditertBelop(t, id);
  const igjen = f.total - allerede;
  if (igjen <= 0) throw new RegnskapsFeil('Fakturaen er allerede kreditert.');
  if (!opts.grunn.trim()) throw new RegnskapsFeil('Skriv hvorfor fakturaen krediteres. Kunden ser grunnen.');
  let linjer: FakturaLinje[];
  if (!opts.belop || opts.belop >= igjen) {
    if (allerede > 0) throw new RegnskapsFeil('Fakturaen er delvis kreditert. Krediter resten med et beløp.');
    linjer = f.linjer;
  } else {
    // Fordel beløpet (inkl. MVA) på satsene etter andel av totalen.
    const org = await hentOrg(t, orgId);
    const s = fakturaSummer(f.linjer, org.mva_registrert);
    linjer = [];
    let fordelt = 0;
    s.perSats.forEach((g, i) => {
      const andelBrutto = i === s.perSats.length - 1 ? opts.belop! - fordelt : Math.round((opts.belop! * (g.grunnlag + g.mva)) / s.total);
      fordelt += andelBrutto;
      const netto = g.sats === 0 ? andelBrutto : Math.round((andelBrutto * 100) / (100 + g.sats));
      linjer.push({ beskrivelse: `Kreditert: ${opts.grunn}`, antallMilli: 1000, pris: netto, sats: g.sats });
    });
  }
  const kn = await lagreSalg(t, orgId, { type: 'kreditnota', kontaktId: f.kontakt_id, dato: opts.dato, linjer });
  await t.q('update faktura set krediterer_id = $2, kreditgrunn = $3, referanse = $4 where id = $1', [kn, id, opts.grunn, `Kreditnota for faktura ${f.nr}`]);
  const org = await hentOrg(t, orgId);
  const nrR = await t.en<{ nr: number }>('update organisasjon set neste_fakturanr = neste_fakturanr + 1 where id = $1 returning neste_fakturanr - 1 as nr', [orgId]);
  const tekst = `Kreditnota ${nrR!.nr} for faktura ${f.nr} · ${f.kunde?.navn ?? ''}`;
  const p = byggFaktura({ linjer, mvaRegistrert: org.mva_registrert, kontaktId: f.kontakt_id, kreditnota: true, tekst });
  const b = await bokfor(t, orgId, { dato: opts.dato, type: 'kreditnota', beskrivelse: tekst, kontaktId: f.kontakt_id, brukerId, kilde: 'salg' }, p);
  const kTot = fakturaSummer(linjer, org.mva_registrert).total;
  await t.q(`update faktura set nr=$2, status='sendt', bilag_id=$3, sendt_tid=now(), total=$4 where id=$1`, [kn, nrR!.nr, b.id, kTot]);
  const nyttKreditert = allerede + kTot;
  const status = nyttKreditert >= f.total ? 'kreditert' : f.betalt + nyttKreditert >= f.total ? 'betalt' : f.status;
  await t.q('update faktura set status = $2 where id = $1', [id, status]);
  return { nr: nrR!.nr, id: kn };
}

/** Standard forfall: dato + dager. */
export function forfallFra(dato: string, dager: number): string {
  const d = new Date(dato + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + dager);
  return d.toISOString().slice(0, 10);
}
