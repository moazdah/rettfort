// Utfører et forslag fra assistenten når brukeren velger det. «Utfør» sender/registrerer; «vent» lager et
// utkast på riktig side (faktura, kostnad) eller legger forslaget i listen på Hjem. Beløpene er de brukeren så.

import type { Db } from '../db';
import { RegnskapsFeil, type BetaltMed, type FakturaLinje } from '../hovedbok';
import { lagreSalg, sendSalg, registrerBetaling, krediter } from '../tjenester/faktura';
import { registrerKjop, lagreKjopUtkast } from '../tjenester/kjop';
import { sendMva, type Termin } from '../tjenester/mva';
import { fakturaPdf } from '../tjenester/fakturaPdf';
import { lagFakturaPdf, type PdfData } from '../pdf';
import { sendEpost, maler, qrVedlegg } from '../epost';
import { kr } from '../penger';
import { finnEllerLagKontakt } from '../tjenester/kjop';
import { lagLenke } from '../tjenester/innsending';
import { kjorLonn, type LonnInput } from '../tjenester/lonn';
import { planleggUtsending, sendForfalte, type SendNar } from '../tjenester/lonnslipp';
import { randomBytes } from 'node:crypto';
import { lagreForslagUke, tildel, merkTimerBrukt } from '../tjenester/vaktplan';
import { varsleAnsatt, publiserOgVarsle, dagTekst } from '../tjenester/vaktvarsel';
import { kortTid, type VaktInn } from '../vaktplan';

export type Valg = 'utfor' | 'vent' | 'avbryt';

/** Hvilke forslag som kan settes på vent som utkast på sin egen side. De andre venter på Hjem. */
export const UTKAST: Record<string, string> = { faktura: '/salg', kostnad: '/kjop' };

export async function utforForslag(db: Db, o: { orgId: string; brukerId: string; brukerEpost: string; brukerNavn?: string; foretak: string; idag: string; grunnadresse?: string }, id: string, valg: Valg): Promise<{ melding: string; lenke?: string; status: string }> {
  const f = await db.en<{ id: string; art: string; data: Record<string, unknown> | string; status: string }>('select id, art, data, status from ai_forslag where id = $1 and organisasjon_id = $2', [id, o.orgId]);
  if (!f) throw new RegnskapsFeil('Fant ikke forslaget.');
  if (!['venter', 'pa_vent'].includes(f.status)) throw new RegnskapsFeil(f.status === 'utfort' ? 'Dette er allerede gjort.' : 'Forslaget er avbrutt.');
  const d = (typeof f.data === 'string' ? JSON.parse(f.data) : f.data) as Record<string, unknown>;
  const ferdig = async (status: string, resultat: Record<string, unknown>) => {
    await db.q('update ai_forslag set status = $3, resultat = $4, behandlet = now() where id = $1 and organisasjon_id = $2', [id, o.orgId, status, JSON.stringify(resultat)]);
  };

  if (valg === 'avbryt') { await ferdig('avbrutt', {}); return { melding: 'Avbrutt. Ingenting er endret.', status: 'avbrutt' }; }

  if (f.art === 'faktura') {
    const kunde = d.kunde as { id: string; epost: string | null };
    const input = { type: 'faktura' as const, kontaktId: kunde.id, dato: String(d.dato), forfall: String(d.forfall), referanse: (d.referanse as string | null) ?? null, linjer: d.linjer as FakturaLinje[] };
    if (valg === 'vent') {
      const fid = await db.tx(t => lagreSalg(t, o.orgId, input));
      await ferdig('pa_vent', { fakturaId: fid });
      return { melding: 'Lagret som utkast under Penger inn. Trykk «Send» der når du er klar.', lenke: `/salg/ny?utkast=${fid}`, status: 'pa_vent' };
    }
    const r = await db.tx(async t => { const fid = await lagreSalg(t, o.orgId, input); const s = await sendSalg(t, o.orgId, fid, o.brukerId); return { fid, ...s }; });
    let epostTil: string | null = null;
    const p = await fakturaPdf(db, o.orgId, r.fid);
    if (p?.f.kunde?.epost) {
      const m = maler.faktura({ type: 'faktura', nr: r.nr, foretak: String(p.avsender.navn ?? o.foretak), kunde: p.f.kunde.navn, belop: kr(p.f.total), forfall: p.f.forfall ? p.f.forfall.split('-').reverse().join('.') : null, kid: r.kid, kontonr: p.avsender.kontonr ? String(p.avsender.kontonr) : null });
      if (await sendEpost({ til: p.f.kunde.epost, ...m, svarTil: p.avsender.epost ? String(p.avsender.epost) : o.brukerEpost, vedlegg: [{ filnavn: p.filnavn, innhold: p.pdf }] })) epostTil = p.f.kunde.epost;
    }
    await ferdig('utfort', { fakturaId: r.fid, nr: r.nr, epostTil });
    const hvorfor = p?.f.kunde?.epost ? 'E-posten kunne ikke sendes' : 'Kunden har ingen e-post';
    return { melding: `Faktura ${r.nr} er laget og ført${epostTil ? `, og sendt til ${epostTil}` : `. ${hvorfor}, så last ned PDF-en og send den selv`}.`, lenke: `/salg/${r.fid}`, status: 'utfort' };
  }

  if (f.art === 'kostnad') {
    const k = { leverandorNavn: String(d.leverandor), dato: String(d.dato), total: Number(d.total), mva: Number(d.mva), sats: Number(d.sats), konto: Number(d.konto), betaltMed: String(d.betaltMed) as BetaltMed, forfall: (d.forfall as string | null) ?? null, tekst: String(d.tekst ?? '') || null, kilde: 'assistent' };
    if (valg === 'vent') {
      const kid = await db.tx(t => lagreKjopUtkast(t, o.orgId, k));
      await ferdig('pa_vent', { kjopId: kid });
      return { melding: 'Lagret som utkast under Penger ut. Registrer det der når du er klar.', lenke: `/kjop/ny?utkast=${kid}`, status: 'pa_vent' };
    }
    const r = await db.tx(t => registrerKjop(t, o.orgId, k, o.brukerId));
    await ferdig('utfort', { kjopId: r.id, bilagNr: r.bilagNr });
    return { melding: `Registrert som bilag ${r.bilagNr}.`, lenke: `/kjop/${r.id}`, status: 'utfort' };
  }

  // Resten har ikke utkast på egen side. «Vent» legger dem i listen på Hjem.
  if (valg === 'vent') { await ferdig('pa_vent', {}); return { melding: 'Satt på vent. Du finner det under «Venter på deg» på Hjem.', lenke: '/hjem', status: 'pa_vent' }; }

  if (f.art === 'betaling') {
    await db.tx(t => registrerBetaling(t, o.orgId, String(d.fakturaId), Number(d.belop), String(d.dato), o.brukerId, 'assistent'));
    await ferdig('utfort', {});
    return { melding: `Innbetalingen på faktura ${d.nr} er registrert.`, lenke: `/salg/${d.fakturaId}`, status: 'utfort' };
  }
  if (f.art === 'kreditnota') {
    const r = await db.tx(t => krediter(t, o.orgId, String(d.fakturaId), { grunn: String(d.grunn), belop: Number(d.belop), dato: o.idag }, o.brukerId));
    await ferdig('utfort', { kreditnotaId: r.id, nr: r.nr });
    return { melding: `Kreditnota ${r.nr} er laget og ført.`, lenke: `/salg/${r.id}`, status: 'utfort' };
  }
  if (f.art === 'purring') {
    const p = await fakturaPdf(db, o.orgId, String(d.fakturaId));
    if (!p) throw new RegnskapsFeil('Fant ikke fakturaen.');
    const m = maler.purring({ nr: Number(d.nr), foretak: String(p.avsender.navn ?? o.foretak), kunde: String(d.kunde), belop: kr(Number(d.rest)), forfall: String(d.forfall).split('-').reverse().join('.'), kid: p.f.kid, kontonr: p.avsender.kontonr ? String(p.avsender.kontonr) : null });
    const ok = await sendEpost({ til: String(d.epost), ...m, svarTil: p.avsender.epost ? String(p.avsender.epost) : o.brukerEpost, vedlegg: [{ filnavn: p.filnavn, innhold: p.pdf }] });
    if (!ok) throw new RegnskapsFeil('Purringen kunne ikke sendes. Sjekk at e-post er koblet til, og prøv igjen.');
    await db.q(`insert into logg (organisasjon_id, bruker_id, handling, ref) values ($1,$2,'purring_sendt',$3)`, [o.orgId, o.brukerId, `${d.fakturaId} til ${d.epost}`]).catch(() => {});
    await ferdig('utfort', { til: d.epost });
    return { melding: `Purring på faktura ${d.nr} er sendt til ${d.epost}.`, lenke: `/salg/${d.fakturaId}`, status: 'utfort' };
  }
  if (f.art === 'mva') {
    const r = await db.tx(t => sendMva(t, o.orgId, d.termin as Termin, o.brukerId));
    await ferdig('utfort', { aBetale: r.aBetale });
    return { melding: `MVA-meldingen er markert som sendt og ført. ${r.aBetale >= 0 ? `Betal ${kr(r.aBetale)} kr` : `Du får ${kr(-r.aBetale)} kr tilbake`}. Husk å levere tallene i Altinn.`, lenke: '/mva', status: 'utfort' };
  }
  const base = o.grunnadresse ?? 'https://min.xn--rettfrt-u1a.no';
  if (f.art === 'skannelenke') {
    const type = d.type === 'ansatt' ? 'ansatt' : 'klient';
    const { token } = await db.tx(t => lagLenke(t, o.orgId, { type, ansattId: (d.ansattId as string | null) ?? null, navn: (d.navn as string | null) ?? null, epost: String(d.epost), brukerId: o.brukerId }));
    const url = `${base}/skann/${token}`;
    const sendt = await sendEpost({ til: String(d.epost), ...maler.skannelenke({ navn: (d.navn as string | null) ?? null, foretak: o.foretak, type, lenke: url, qr: true }), svarTil: o.brukerEpost, vedlegg: [await qrVedlegg(url)] });
    await ferdig('utfort', { url, sendt });
    return { melding: sendt ? `Lenken med QR-kode er sendt til ${d.epost}. Bildene havner i innboksen under Penger ut.` : `Lenken er laget, men e-posten kunne ikke sendes. Kopier lenken fra Penger ut → Innboks og send den selv.`, lenke: '/kjop/innboks', status: 'utfort' };
  }
  if (f.art === 'invitasjon') {
    const rolle = String(d.rolle);
    const token = randomBytes(18).toString('base64url');
    await db.q('insert into invitasjon (organisasjon_id, epost, rolle, token) values ($1,$2,$3,$4)', [o.orgId, String(d.epost), rolle, token]);
    const sendt = await sendEpost({ til: String(d.epost), ...maler.invitasjon(o.brukerNavn ?? o.foretak, o.foretak, rolle === 'full' ? 'med full tilgang' : rolle === 'les' ? 'med lesetilgang' : 'for å levere kvitteringer', `${base}/invitasjon/${token}`), svarTil: o.brukerEpost });
    await ferdig('utfort', { sendt });
    return { melding: sendt ? `Invitasjonen er sendt til ${d.epost}.` : `Invitasjonen er laget, men e-posten kunne ikke sendes. Lenken finner du under Innstillinger → Brukere.`, lenke: '/innstillinger?vis=brukere', status: 'utfort' };
  }
  if (f.art === 'lonn') {
    const send = (['na', 'utbetaling', 'ingen'].includes(String(d.send)) ? d.send : 'utbetaling') as SendNar;
    const r = await db.tx(async t => {
      const k = await kjorLonn(t, o.orgId, String(d.periode), String(d.utbetalingsdato), d.input as LonnInput[], o.brukerId);
      await planleggUtsending(t, k.id, send, String(d.utbetalingsdato));
      await merkTimerBrukt(t, o.orgId, k.id, k.slipper.map(x => x.ansattId));
      return k;
    });
    const u = send === 'na' ? await sendForfalte(db, base, o.orgId) : { sendt: [], feilet: [] };
    await ferdig('utfort', { bilagNr: r.bilagNr });
    const om = send === 'na' ? (u.sendt.length ? ` Lønnslipper sendt til ${u.sendt.length}.` : ' Lønnslippene kunne ikke sendes nå.') : send === 'utbetaling' ? ' Lønnslippene sendes på utbetalingsdagen.' : '';
    return { melding: `Lønn for ${d.periode} er kjørt og ført som bilag ${r.bilagNr}.${om} Husk a-meldingen innen den 5.`, lenke: '/lonn?vis=historikk', status: 'utfort' };
  }
  if (f.art === 'lonnslipp') {
    const r = await db.en<{ id: string }>(`select ls.id from lonnslipp ls join lonnskjoring l on l.id = ls.lonnskjoring_id where l.organisasjon_id = $1 and l.periode = $2 and ls.ansatt_id = $3`, [o.orgId, String(d.periode), String(d.ansattId)]);
    if (!r) throw new RegnskapsFeil('Fant ikke lønnslippen.');
    await db.q('update lonnslipp set send_etter = now(), sendt_tid = null where id = $1', [r.id]);
    const u = await sendForfalte(db, base, o.orgId);
    if (!u.sendt.length) throw new RegnskapsFeil('Lønnslippen kunne ikke sendes. Sjekk at e-post er koblet til, og prøv igjen.');
    await ferdig('utfort', {});
    return { melding: `Lønnslippen for ${d.periode} er sendt til ${d.epost}.`, lenke: '/lonn?vis=historikk', status: 'utfort' };
  }
  if (f.art === 'kunde') {
    const kid = await db.tx(async t => {
      const id = await finnEllerLagKontakt(t, o.orgId, 'kunde', String(d.navn), (d.orgnr as string | null) ?? null, { adresse: (d.adresse as string) ?? undefined, postnr: (d.postnr as string) ?? undefined, poststed: (d.poststed as string) ?? undefined, epost: (d.epost as string) ?? undefined });
      if (d.epost) await t.q('update kontakt set epost = coalesce(epost, $2) where id = $1', [id, d.epost]);
      return id;
    });
    await ferdig('utfort', { kontaktId: kid });
    return { melding: `${d.navn} er lagt til som kunde. Be meg lage fakturaen nå.`, status: 'utfort' };
  }
  if (f.art === 'vaktplan') {
    const n = await db.tx(t => lagreForslagUke(t, o.orgId, Number(d.aar), Number(d.uke), d.vakter as VaktInn[]));
    await ferdig('utfort', { antall: n });
    return { melding: `Utkast for uke ${d.uke} er laget med ${n} vakter. Se over og trykk «Publiser og varsle» når du er fornøyd.`, lenke: `/vaktplan?uke=${d.aar}-${d.uke}`, status: 'utfort' };
  }
  if (f.art === 'tildel_vakt') {
    const r = await db.tx(t => tildel(t, o.orgId, String(d.vaktId), String(d.ansattId)));
    await varsleAnsatt(db, base, o.orgId, o.foretak, String(d.ansattId), 'Du fikk vakten', [`Du har fått vakten ${dagTekst(r.dato)} ${kortTid(r.start, r.slutt)}.`]);
    await ferdig('utfort', {});
    return { melding: `${d.navn} har fått vakten ${dagTekst(String(d.dato))} ${kortTid(String(d.start), String(d.slutt))}.`, lenke: `/vaktplan`, status: 'utfort' };
  }
  if (f.art === 'publiser_uke') {
    const r = await publiserOgVarsle(db, base, o.orgId, o.foretak, Number(d.aar), Number(d.uke));
    await ferdig('utfort', r);
    return { melding: `Uke ${d.uke} er publisert. ${r.varslet} fikk e-post${r.uten ? `, ${r.uten} har ikke e-post` : ''}.`, lenke: `/vaktplan?uke=${d.aar}-${d.uke}`, status: 'utfort' };
  }
  throw new RegnskapsFeil('Ukjent forslag.');
}

/** Forslag som er satt på vent og ikke har egen side. Vises på Hjem. */
export async function ventende(db: Db, orgId: string) {
  return db.q<{ id: string; art: string; data: Record<string, unknown>; opprettet: string }>(
    `select id, art, data, opprettet::text as opprettet from ai_forslag where organisasjon_id = $1 and status = 'pa_vent' and art not in ('faktura','kostnad') order by opprettet desc limit 20`, [orgId]);
}

/** PDF av fakturaen i et forslag. Er den laget (sendt eller utkast), brukes den ekte fakturaen med nummer og KID. */
export async function forslagPdf(db: Db, orgId: string, id: string): Promise<{ pdf: Uint8Array; filnavn: string } | null> {
  const f = await db.en<{ art: string; data: Record<string, unknown> | string; resultat: Record<string, unknown> | string | null }>('select art, data, resultat from ai_forslag where id = $1 and organisasjon_id = $2', [id, orgId]);
  if (!f) return null;
  const d = (typeof f.data === 'string' ? JSON.parse(f.data) : f.data) as Record<string, unknown>;
  const res = (typeof f.resultat === 'string' ? JSON.parse(f.resultat) : f.resultat ?? {}) as Record<string, unknown>;
  const ekte = res.fakturaId ?? res.kreditnotaId ?? d.fakturaId;
  if (ekte) { const p = await fakturaPdf(db, orgId, String(ekte)); return p && { pdf: p.pdf, filnavn: p.filnavn }; }
  if (f.art !== 'faktura') return null;
  const pdf = await lagFakturaPdf({ type: 'faktura', nr: null, dato: String(d.dato), forfall: String(d.forfall), levert: null, referanse: (d.referanse as string | null) ?? null, kid: null, avsender: d.avsender as PdfData['avsender'], kunde: d.kunde as PdfData['kunde'], linjer: d.linjer as FakturaLinje[] });
  return { pdf, filnavn: 'faktura-forslag.pdf' };
}
