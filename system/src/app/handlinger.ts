'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/db';
import { hashPassord, sjekkPassord, opprettSesjon, gyldigEpost, passordFeil, lagKode, lagSlug, tokenHash, SESJON_COOKIE, SESJON_DAGER } from '@/lib/auth';
import { sesjon, trygt, idag, sjekkSkrivetilgang, type Resultat } from '@/lib/server';
import { RegnskapsFeil } from '@/lib/hovedbok';
import { lagreSalg, sendSalg, registrerBetaling, krediter, forfallFra, type FakturaInput } from '@/lib/tjenester/faktura';
import { registrerKjop, lagreKjopUtkast, betalKjop, finnEllerLagKontakt, type KjopInput } from '@/lib/tjenester/kjop';
import { korriger } from '@/lib/tjenester/bokforing';
import { importerKontoutskrift, behandleBevegelse, merkManedFerdig, type Handling } from '@/lib/tjenester/bank';
import { sendMva, type Termin } from '@/lib/tjenester/mva';
import { kjorLonn, type LonnInput } from '@/lib/tjenester/lonn';
import { vurderFunn } from '@/lib/tjenester/kontroll';
import type { Enhet } from '@/lib/brreg';
import { randomBytes } from 'node:crypto';
import { sendEpost, maler, grunnadresse } from '@/lib/epost';
import { fakturaPdf } from '@/lib/tjenester/fakturaPdf';
import { hentFakta } from '@/lib/tjenester/assistent';
import { svar as assistentSvar, type Svar } from '@/lib/assistent';
import { harAssistent, erTestbruker } from '@/lib/pakker';
import { nyHemmelighet, sjekkTotp, otpauthUri } from '@/lib/totp';
import QRCode from 'qrcode';
import { lagTestfirma, TESTFIRMA_ORGNR } from '@/lib/db/eksempel';
import { gyldigFnr, planleggUtsending, sendForfalte, apneLonnslipp, type SendNar } from '@/lib/tjenester/lonnslipp';
import type { LonnslippPdfData } from '@/lib/pdf';
import { kr } from '@/lib/penger';

async function settCookie(token: string) {
  const c = await cookies();
  c.set(SESJON_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: SESJON_DAGER * 86400 });
}

async function kreverInnlogget() {
  const s = await sesjon();
  if (!s) throw new RegnskapsFeil('Du er ikke logget inn.');
  return s;
}

/** Kvittering-rollen kan bare registrere kjøp og laste opp vedlegg. */
function sjekkKjopstilgang(s: { rolle: string | null }) {
  if (s.rolle === 'kvittering') return;
  sjekkSkrivetilgang(s as Parameters<typeof sjekkSkrivetilgang>[0]);
}

async function kreverOrg() {
  const s = await kreverInnlogget();
  if (!s.org) throw new RegnskapsFeil('Velg foretak først.');
  return s as typeof s & { org: NonNullable<typeof s.org> };
}

// ---------- Innlogging ----------

export async function loggInn(_: unknown, fd: FormData): Promise<Resultat<string | null> & { totrinn?: boolean }> {
  const epost = String(fd.get('epost') ?? '').trim().toLowerCase();
  const passord = String(fd.get('passord') ?? '');
  const kode = String(fd.get('kode') ?? '').trim();
  let totrinn = false;
  const res = await trygt(async () => {
    const db = await getDb();
    const b = await db.en<{ id: string; passord_hash: string; totp_hemmelig: string | null; totp_feil: number; sperret: boolean }>('select id, passord_hash, totp_hemmelig, totp_feil, coalesce(totp_sperret_til > now(), false) as sperret from bruker where epost = $1', [epost]);
    if (!b || !(await sjekkPassord(passord, b.passord_hash))) throw new RegnskapsFeil('Feil e-post eller passord.');
    // Totrinns innlogging: passordet er riktig, men koden fra autentiseringsappen må også stemme.
    if (b.totp_hemmelig) {
      totrinn = true;
      if (b.sperret) throw new RegnskapsFeil('For mange feil koder. Vent 10 minutter og prøv igjen.');
      if (!kode) throw new RegnskapsFeil('Skriv koden fra autentiseringsappen.');
      if (!sjekkTotp(b.totp_hemmelig, kode)) {
        await db.q(`update bruker set totp_feil = totp_feil + 1, totp_sperret_til = case when totp_feil + 1 >= 5 then now() + interval '10 minutes' else totp_sperret_til end where id = $1`, [b.id]);
        throw new RegnskapsFeil('Koden stemmer ikke. Koden byttes hvert 30. sekund, bruk den som vises nå.');
      }
      await db.q('update bruker set totp_feil = 0, totp_sperret_til = null where id = $1', [b.id]);
    }
    let m = await db.en<{ organisasjon_id: string; type: string }>('select m.organisasjon_id, o.type from medlemskap m join organisasjon o on o.id = m.organisasjon_id where m.bruker_id = $1 order by m.opprettet limit 1', [b.id]);
    // Testbrukere uten eget foretak går rett inn i Testfirma AS i stedet for å opprette foretak.
    if (!m && erTestbruker(epost)) {
      const navn = await db.en<{ navn: string }>('select navn from bruker where id = $1', [b.id]);
      m = { organisasjon_id: await lagTestfirma(db, b.id, navn?.navn.split(' ')[0] || 'Test', idag()), type: 'selskap' };
    }
    const { token } = await db.tx(t => opprettSesjon(t, b.id, m?.organisasjon_id ?? null));
    await settCookie(token);
    return m?.type ?? null;
  });
  if (!res.ok) return { ...res, totrinn };
  const neste = String(fd.get('neste') ?? '');
  if (/^\/invitasjon\/[\w-]+$/.test(neste)) redirect(neste);
  redirect(res.data === 'byra' ? '/byra' : res.data ? '/hjem' : '/velkommen');
}

/** Bare i testmodus: gå rett inn i demo-foretaket uten passord. */
export async function demoInn(fd: FormData) {
  const db = await getDb();
  if (db.modus !== 'testmodus') redirect('/logg-inn');
  const epost = fd.get('rolle') === 'regnskapsforer' ? 'regnskap@rettfort.no' : 'demo@rettfort.no';
  const b = await db.en<{ id: string }>('select id from bruker where epost = $1', [epost]);
  if (!b) redirect('/logg-inn');
  const m = await db.en<{ organisasjon_id: string; type: string }>('select m.organisasjon_id, o.type from medlemskap m join organisasjon o on o.id = m.organisasjon_id where m.bruker_id = $1 order by m.opprettet limit 1', [b.id]);
  const { token } = await db.tx(t => opprettSesjon(t, b.id, m?.organisasjon_id ?? null));
  await settCookie(token);
  redirect(m?.type === 'byra' ? '/byra' : '/hjem');
}

export async function loggUt() {
  const c = await cookies();
  const tok = c.get(SESJON_COOKIE)?.value;
  if (tok) { const db = await getDb(); await db.q('delete from sesjon where token_hash = $1', [tokenHash(tok)]); }
  c.delete(SESJON_COOKIE);
  redirect('/logg-inn');
}

export async function registrer(_: unknown, fd: FormData): Promise<Resultat<{ kode?: string }>> {
  const navn = String(fd.get('navn') ?? '').trim();
  const epost = String(fd.get('epost') ?? '').trim().toLowerCase();
  const passord = String(fd.get('passord') ?? '');
  const hvem = String(fd.get('hvem') ?? 'bedrift');
  const res = await trygt(async () => {
    if (navn.length < 2) throw new RegnskapsFeil('Skriv navnet ditt.');
    if (!gyldigEpost(epost)) throw new RegnskapsFeil('Skriv en gyldig e-postadresse.');
    const pf = passordFeil(passord); if (pf) throw new RegnskapsFeil(pf);
    const db = await getDb();
    if (await db.en('select 1 from bruker where epost = $1', [epost])) throw new RegnskapsFeil('Det finnes allerede en bruker med denne e-posten. Logg inn i stedet.');
    const kode = lagKode();
    const hash = await hashPassord(passord);
    const { token } = await db.tx(async t => {
      const b = await t.en<{ id: string }>('insert into bruker (epost, navn, passord_hash, bekreftkode) values ($1,$2,$3,$4) returning id', [epost, navn, hash, kode]);
      if (hvem === 'regnskapsforer') {
        const o = await t.en<{ id: string }>(`insert into organisasjon (type, navn, pakke) values ('byra', $1, 'byra') returning id`, [`${navn}s regnskapskontor`]);
        await t.q(`insert into medlemskap (bruker_id, organisasjon_id, rolle) values ($1,$2,'eier')`, [b!.id, o!.id]);
        return opprettSesjon(t, b!.id, o!.id);
      }
      return opprettSesjon(t, b!.id, null);
    });
    await settCookie(token);
    // Koden vises bare på skjermen hvis e-posten ikke kunne sendes.
    const sendt = await sendEpost({ til: epost, ...maler.bekreftkode(navn.split(' ')[0], kode) });
    return { kode: sendt ? undefined : kode };
  });
  return res;
}

export async function bekreftEpost(kode: string): Promise<Resultat> {
  return trygt(async () => {
    const s = await kreverInnlogget();
    const db = await getDb();
    const b = await db.en<{ bekreftkode: string | null }>('select bekreftkode from bruker where id = $1', [s.bruker.id]);
    if (!b?.bekreftkode || b.bekreftkode !== kode.trim()) throw new RegnskapsFeil('Koden stemmer ikke. Sjekk e-posten og prøv igjen.');
    await db.q('update bruker set epost_bekreftet = true, bekreftkode = null where id = $1', [s.bruker.id]);
  });
}

/** Retter e-postadressen før den er bekreftet, og sender en ny kode til den nye adressen. */
export async function byttEpost(ny: string): Promise<Resultat<{ kode: string; epost: string }>> {
  return trygt(async () => {
    const s = await kreverInnlogget();
    const epost = ny.trim().toLowerCase();
    if (!gyldigEpost(epost)) throw new RegnskapsFeil('Skriv en gyldig e-postadresse.');
    const db = await getDb();
    const b = await db.en<{ epost_bekreftet: boolean }>('select epost_bekreftet from bruker where id = $1', [s.bruker.id]);
    if (b?.epost_bekreftet) throw new RegnskapsFeil('E-posten er allerede bekreftet. Endre den under Innstillinger.');
    if (epost !== s.bruker.epost && await db.en('select 1 from bruker where epost = $1', [epost])) throw new RegnskapsFeil('Det finnes allerede en bruker med denne e-posten.');
    const kode = lagKode();
    await db.q('update bruker set epost = $2, bekreftkode = $3 where id = $1', [s.bruker.id, epost, kode]);
    const sendt = await sendEpost({ til: epost, ...maler.bekreftkode(s.bruker.navn.split(' ')[0], kode) });
    return { kode: sendt ? '' : kode, epost };
  });
}

export async function nyKode(): Promise<Resultat<{ kode: string }>> {
  return trygt(async () => {
    const s = await kreverInnlogget();
    const kode = lagKode();
    const db = await getDb();
    await db.q('update bruker set bekreftkode = $2 where id = $1', [s.bruker.id, kode]);
    const sendt = await sendEpost({ til: s.bruker.epost, ...maler.bekreftkode(s.bruker.navn.split(' ')[0], kode) });
    return { kode: sendt ? '' : kode };
  });
}

export interface NyttForetak {
  navn: string; orgnr?: string | null; orgform: string; stiftet?: string | null; adresse?: string; postnr?: string; poststed?: string; kommunenr?: string;
  mvaTermin: 'tomnd' | 'aar' | 'ingen'; start: 'nytt' | 'annet_system' | 'excel'; system?: string; nace?: string | null;
}

export async function opprettForetak(f: NyttForetak): Promise<Resultat<{ slug: string }>> {
  return trygt(async () => {
    const s = await kreverInnlogget();
    if (!f.navn.trim()) throw new RegnskapsFeil('Foretaket må ha et navn.');
    const db = await getDb();
    let slug = lagSlug(f.navn);
    if (await db.en('select 1 from organisasjon where bilag_slug = $1', [slug])) slug = `${slug}-${randomBytes(2).toString('hex')}`;
    const ar = idag().slice(0, 4);
    const orgId = await db.tx(async t => {
      const o = await t.en<{ id: string }>(`insert into organisasjon (type, navn, orgnr, orgform, stiftet, adresse, postnr, poststed, kommunenr, epost, mva_registrert, mva_termin, regnskap_fra, nace, pakke, bilag_slug)
        values ('selskap',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'gratis',$14) returning id`,
        [f.navn.trim(), f.orgnr?.replace(/\s/g, '') || null, f.orgform || 'AS', f.stiftet || null, f.adresse || null, f.postnr || null, f.poststed || null, f.kommunenr || null, s.bruker.epost, f.mvaTermin !== 'ingen', f.mvaTermin, f.start === 'nytt' ? (f.stiftet && f.stiftet > `${ar}-01-01` ? f.stiftet : `${ar}-01-01`) : `${ar}-01-01`, f.nace || null, slug]);
      await t.q(`insert into medlemskap (bruker_id, organisasjon_id, rolle) values ($1,$2,'eier')`, [s.bruker.id, o!.id]);
      await t.q('update sesjon set organisasjon_id = $2 where token_hash = $1', [tokenHash(s.token), o!.id]);
      return o!.id;
    });
    void orgId;
    return { slug };
  });
}

export async function byttForetak(orgId: string): Promise<void> {
  const s = await kreverInnlogget();
  const db = await getDb();
  const ok = s.medlemskap.some(m => m.orgId === orgId) || await db.en(`select 1 from byra_kunde bk join medlemskap m on m.organisasjon_id = bk.byra_id where bk.selskap_id = $1 and m.bruker_id = $2 and bk.status = 'aktiv'`, [orgId, s.bruker.id]);
  if (!ok) throw new RegnskapsFeil('Du har ikke tilgang til dette foretaket.');
  await db.q('update sesjon set organisasjon_id = $2 where token_hash = $1', [tokenHash(s.token), orgId]);
  const o = await db.en<{ type: string }>('select type from organisasjon where id = $1', [orgId]);
  revalidatePath('/', 'layout');
  redirect(o?.type === 'byra' ? '/byra' : '/hjem');
}

// ---------- Kontakter ----------

export async function lagreKontaktFraBrreg(e: Enhet, type: 'kunde' | 'leverandor'): Promise<Resultat<{ id: string; epost: string | null }>> {
  return trygt(async () => {
    const s = await kreverOrg(); sjekkSkrivetilgang(s);
    const db = await getDb();
    const id = await db.tx(t => finnEllerLagKontakt(t, s.org.id, type, e.navn, e.orgnr, { adresse: e.adresse, postnr: e.postnr, poststed: e.poststed, mvaRegistrert: e.mvaRegistrert }));
    await db.q('update kontakt set adresse = coalesce(adresse, $2), postnr = coalesce(postnr, $3), poststed = coalesce(poststed, $4), mva_registrert = $5 where id = $1', [id, e.adresse, e.postnr, e.poststed, e.mvaRegistrert]);
    const k = await db.en<{ epost: string | null }>('select epost from kontakt where id = $1', [id]);
    return { id, epost: k?.epost ?? null };
  });
}

export async function lagreKontakt(k: { navn: string; adresse?: string; postnr?: string; poststed?: string; epost?: string; type: 'kunde' | 'leverandor' }): Promise<Resultat<{ id: string }>> {
  return trygt(async () => {
    const s = await kreverOrg(); sjekkSkrivetilgang(s);
    if (!k.navn.trim()) throw new RegnskapsFeil('Skriv et navn.');
    const db = await getDb();
    const id = await db.tx(t => finnEllerLagKontakt(t, s.org.id, k.type, k.navn, null, { adresse: k.adresse, postnr: k.postnr, poststed: k.poststed, epost: k.epost }));
    return { id };
  });
}

/** Endrer navn, adresse og e-post på en kunde eller leverandør. Org.nr fra Brønnøysund endres ikke her. */
export async function oppdaterKontakt(id: string, k: { navn: string; adresse: string; postnr: string; poststed: string; epost: string }): Promise<Resultat<{ navn: string; adresse: string | null; postnr: string | null; poststed: string | null; epost: string | null }>> {
  return trygt(async () => {
    const s = await kreverOrg(); sjekkSkrivetilgang(s);
    const navn = k.navn.trim();
    if (!navn) throw new RegnskapsFeil('Skriv et navn.');
    const epost = k.epost.trim().toLowerCase();
    if (epost && !gyldigEpost(epost)) throw new RegnskapsFeil('E-postadressen ser ikke riktig ut.');
    const postnr = k.postnr.trim();
    if (postnr && !/^\d{4}$/.test(postnr)) throw new RegnskapsFeil('Postnummeret skal ha 4 siffer.');
    const v = { navn, adresse: k.adresse.trim() || null, postnr: postnr || null, poststed: k.poststed.trim() || null, epost: epost || null };
    const db = await getDb();
    const r = await db.en<{ id: string }>('update kontakt set navn = $3, adresse = $4, postnr = $5, poststed = $6, epost = $7 where id = $1 and organisasjon_id = $2 returning id', [id, s.org.id, v.navn, v.adresse, v.postnr, v.poststed, v.epost]);
    if (!r) throw new RegnskapsFeil('Fant ikke kunden.');
    return v;
  }, 'Kunden er oppdatert.');
}

// ---------- Salg ----------

export async function lagreUtkastSalg(f: FakturaInput): Promise<Resultat<{ id: string }>> {
  return trygt(async () => {
    const s = await kreverOrg(); sjekkSkrivetilgang(s);
    const db = await getDb();
    const id = await db.tx(t => lagreSalg(t, s.org.id, f));
    revalidatePath('/salg');
    return { id };
  }, 'Utkastet er lagret.');
}

export async function sendSalgHandling(f: FakturaInput, videreKjop: string[] = []): Promise<Resultat<{ id: string; nr: number; kid: string | null; epostTil: string | null }>> {
  return trygt(async () => {
    const s = await kreverOrg(); sjekkSkrivetilgang(s);
    const db = await getDb();
    const r = await db.tx(async t => {
      const id = await lagreSalg(t, s.org.id, f);
      const x = await sendSalg(t, s.org.id, id, s.bruker.id);
      for (const k of videreKjop) await t.q('update kjop set videre_faktura_id = $3 where id = $1 and organisasjon_id = $2', [k, s.org.id, id]);
      return { id, ...x };
    });
    revalidatePath('/', 'layout');
    // Dokumentet sendes til kunden med PDF-en vedlagt når kunden har e-post.
    let epostTil: string | null = null;
    const p = await fakturaPdf(db, s.org.id, r.id);
    if (p?.f.kunde?.epost) {
      const m = maler.faktura({ type: p.f.type, nr: r.nr, foretak: String(p.avsender.navn ?? s.org.navn), kunde: p.f.kunde.navn, belop: kr(p.f.total), forfall: p.f.forfall ? p.f.forfall.split('-').reverse().join('.') : null, kid: r.kid, kontonr: p.avsender.kontonr ? String(p.avsender.kontonr) : null });
      if (await sendEpost({ til: p.f.kunde.epost, ...m, svarTil: p.avsender.epost ? String(p.avsender.epost) : s.bruker.epost, vedlegg: [{ filnavn: p.filnavn, innhold: p.pdf }] })) {
        epostTil = p.f.kunde.epost;
        await db.q(`insert into logg (organisasjon_id, bruker_id, handling, ref) values ($1,$2,'epost_sendt',$3)`, [s.org.id, s.bruker.id, `${r.id} til ${epostTil}`]).catch(() => {});
      }
    }
    return { id: r.id, nr: r.nr, kid: r.kid, epostTil };
  });
}

export async function registrerBetalingHandling(id: string, belop: number, dato: string): Promise<Resultat> {
  return trygt(async () => {
    const s = await kreverOrg(); sjekkSkrivetilgang(s);
    const db = await getDb();
    await db.tx(t => registrerBetaling(t, s.org.id, id, belop, dato, s.bruker.id));
    revalidatePath('/', 'layout');
  }, 'Betalingen er registrert.');
}

export async function krediterHandling(id: string, grunn: string, belop?: number): Promise<Resultat<{ id: string }>> {
  return trygt(async () => {
    const s = await kreverOrg(); sjekkSkrivetilgang(s);
    const db = await getDb();
    const r = await db.tx(t => krediter(t, s.org.id, id, { grunn, belop, dato: idag() }, s.bruker.id));
    revalidatePath('/', 'layout');
    return { id: r.id };
  }, 'Kreditnotaen er laget og ført.');
}

export async function slettUtkast(type: 'salg' | 'kjop', id: string): Promise<Resultat> {
  return trygt(async () => {
    const s = await kreverOrg(); sjekkSkrivetilgang(s);
    const db = await getDb();
    if (type === 'salg') await db.q(`delete from faktura where id = $1 and organisasjon_id = $2 and status = 'utkast'`, [id, s.org.id]);
    else await db.q(`delete from kjop where id = $1 and organisasjon_id = $2 and status = 'utkast'`, [id, s.org.id]);
    revalidatePath('/', 'layout');
  }, 'Utkastet er slettet.');
}

// ---------- Kjøp ----------

export async function registrerKjopHandling(k: KjopInput): Promise<Resultat<{ id: string; bilagNr: number }>> {
  return trygt(async () => {
    const s = await kreverOrg(); sjekkKjopstilgang(s);
    const db = await getDb();
    const r = await db.tx(t => registrerKjop(t, s.org.id, k, s.bruker.id));
    revalidatePath('/', 'layout');
    return r;
  });
}

export async function lagreKjopUtkastHandling(k: KjopInput): Promise<Resultat<{ id: string }>> {
  return trygt(async () => {
    const s = await kreverOrg(); sjekkKjopstilgang(s);
    const db = await getDb();
    const id = await db.tx(t => lagreKjopUtkast(t, s.org.id, k));
    revalidatePath('/kjop');
    return { id };
  }, 'Utkastet er lagret.');
}

export async function betalKjopHandling(id: string, dato: string): Promise<Resultat> {
  return trygt(async () => {
    const s = await kreverOrg(); sjekkSkrivetilgang(s);
    const db = await getDb();
    await db.tx(t => betalKjop(t, s.org.id, id, dato, s.bruker.id));
    revalidatePath('/', 'layout');
  }, 'Betalingen er registrert.');
}

/** Retter et kjøp: motposterer det gamle og fører det nye. Opprinnelig bilag står urørt. */
export async function rettKjopHandling(id: string, ny: KjopInput): Promise<Resultat<{ id: string; bilagNr: number }>> {
  return trygt(async () => {
    const s = await kreverOrg(); sjekkSkrivetilgang(s);
    const db = await getDb();
    const r = await db.tx(async t => {
      const k = await t.en<{ bilag_id: string; status: string }>('select bilag_id, status from kjop where id = $1 and organisasjon_id = $2', [id, s.org.id]);
      if (!k?.bilag_id) throw new RegnskapsFeil('Fant ikke kjøpet.');
      if (k.status === 'betalt' && ny.betaltMed === 'ubetalt') throw new RegnskapsFeil('Kjøpet er allerede betalt.');
      // Motposteringen føres i dag (åpen periode). Det opprinnelige bilaget står urørt i hovedboken.
      await korriger(t, s.org.id, k.bilag_id, idag(), s.bruker.id, 'Retting');
      await t.q('delete from kjop where id = $1', [id]);
      return registrerKjop(t, s.org.id, { ...ny, id: undefined }, s.bruker.id);
    });
    revalidatePath('/', 'layout');
    return { id: r.id, bilagNr: r.bilagNr };
  }, 'Kjøpet er rettet med en korrigering.');
}

export async function slettKjopHandling(id: string): Promise<Resultat> {
  return trygt(async () => {
    const s = await kreverOrg(); sjekkSkrivetilgang(s);
    const db = await getDb();
    await db.tx(async t => {
      const k = await t.en<{ bilag_id: string | null; status: string }>('select bilag_id, status from kjop where id = $1 and organisasjon_id = $2', [id, s.org.id]);
      if (!k) throw new RegnskapsFeil('Fant ikke kjøpet.');
      if (k.bilag_id) await korriger(t, s.org.id, k.bilag_id, idag(), s.bruker.id, 'Sletting');
      await t.q(`delete from kjop where id = $1`, [id]);
    });
    revalidatePath('/', 'layout');
  }, 'Kjøpet er fjernet med en motpostering.');
}

// ---------- Bank ----------

export async function lastOppKontoutskrift(fd: FormData): Promise<Resultat<{ maned: string; nye: number }>> {
  return trygt(async () => {
    const s = await kreverOrg(); sjekkSkrivetilgang(s);
    const fil = fd.get('fil') as File | null;
    if (!fil || !fil.size) throw new RegnskapsFeil('Velg en fil.');
    if (fil.size > 10 * 1024 * 1024) throw new RegnskapsFeil('Filen er for stor (maks 10 MB).');
    const { decodeFile } = await import('@/lib/motor/rettfort-motor.js');
    const buf = new Uint8Array(await fil.arrayBuffer());
    let tekst: string;
    try { tekst = decodeFile(buf, 'bank'); } catch (e) {
      const m = (e as Error).message;
      throw new RegnskapsFeil(/PDF|bilde/.test(m) ? 'PDF og bilder av kontoutskrift leses automatisk når AI-lesing er koblet til. Last ned kontoutskriften som CSV (Excel) eller CAMT.053 fra nettbanken i mellomtiden.' : m);
    }
    const db = await getDb();
    const r = await db.tx(t => importerKontoutskrift(t, s.org.id, tekst, fil.name));
    revalidatePath('/bank');
    return { maned: r.maned, nye: r.nye };
  });
}

export async function behandleBevegelseHandling(id: string, h: Handling): Promise<Resultat> {
  return trygt(async () => {
    const s = await kreverOrg(); sjekkSkrivetilgang(s);
    const db = await getDb();
    const m = await db.tx(t => behandleBevegelse(t, s.org.id, id, h, s.bruker.id));
    revalidatePath('/', 'layout');
    return m;
  });
}

export async function merkManedFerdigHandling(maned: string): Promise<Resultat> {
  return trygt(async () => {
    const s = await kreverOrg(); sjekkSkrivetilgang(s);
    const db = await getDb();
    await db.tx(t => merkManedFerdig(t, s.org.id, maned, s.bruker.id));
    revalidatePath('/', 'layout');
  }, 'Måneden er ferdig og låst.');
}

// ---------- MVA ----------

export async function sendMvaHandling(termin: Termin): Promise<Resultat<{ aBetale: number }>> {
  return trygt(async () => {
    const s = await kreverOrg(); sjekkSkrivetilgang(s);
    const db = await getDb();
    const o = await db.en<{ mva_termin: 'tomnd' | 'aar' | 'ingen' }>('select mva_termin from organisasjon where id = $1', [s.org.id]);
    if (!o || o.mva_termin === 'ingen') throw new RegnskapsFeil('Foretaket er ikke MVA-registrert.');
    const { terminFor } = await import('@/lib/tjenester/mva');
    const riktig = terminFor(termin.fra, o.mva_termin);
    if (riktig.fra !== termin.fra || riktig.til !== termin.til) throw new RegnskapsFeil('Terminen passer ikke med MVA-terminen til foretaket.');
    if (riktig.til >= idag()) throw new RegnskapsFeil('Terminen er ikke over ennå.');
    const r = await db.tx(t => sendMva(t, s.org.id, riktig, s.bruker.id));
    revalidatePath('/', 'layout');
    return r;
  });
}

export async function vurderFunnHandling(id: string, tekst: string): Promise<Resultat> {
  return trygt(async () => {
    const s = await kreverOrg(); sjekkSkrivetilgang(s);
    const db = await getDb();
    await db.tx(t => vurderFunn(t, s.org.id, id, tekst));
    revalidatePath('/', 'layout');
  }, 'Funnet er markert som vurdert.');
}

// ---------- Lønn ----------

export async function lagreLonnsoppsett(v: { ferie: number; lonningsdag: number; otp: string; agaSone: string }): Promise<Resultat> {
  return trygt(async () => {
    const s = await kreverOrg(); sjekkSkrivetilgang(s);
    const db = await getDb();
    await db.q('update organisasjon set ferie_prosent = $2, lonningsdag = $3, otp = $4, aga_sone = $5 where id = $1', [s.org.id, v.ferie, v.lonningsdag, v.otp, v.agaSone]);
    revalidatePath('/lonn');
  });
}

export async function lagreAnsatt(a: { id?: string; navn: string; epost?: string; stilling?: string; lonnType: 'fast' | 'time' | 'provisjon'; manedslonn: number; timesats: number; skatteprosent: number; kontonr?: string; startdato?: string; provisjonProsent?: number; overtidProsent?: number; stillingsprosent?: number; fasteTillegg?: { tekst: string; belop: number; feriepengegrunnlag?: boolean }[]; passordType?: 'fnr' | 'eget' | 'ingen'; passord?: string }): Promise<Resultat> {
  return trygt(async () => {
    const s = await kreverOrg(); sjekkSkrivetilgang(s);
    if (!a.navn.trim()) throw new RegnskapsFeil('Skriv navnet til den ansatte.');
    if (!['fast', 'time', 'provisjon'].includes(a.lonnType)) throw new RegnskapsFeil('Velg hvordan den ansatte får lønn.');
    if (!(a.skatteprosent >= 0 && a.skatteprosent <= 60)) throw new RegnskapsFeil('Skatteprosenten må være mellom 0 og 60.');
    if (a.lonnType === 'fast' && a.manedslonn <= 0) throw new RegnskapsFeil('Skriv månedslønnen.');
    if (a.lonnType === 'time' && a.timesats <= 0) throw new RegnskapsFeil('Skriv timelønnen.');
    const prov = a.provisjonProsent ?? 0, ot = a.overtidProsent ?? 40, st = a.stillingsprosent ?? 100;
    if (a.lonnType === 'provisjon' && !(prov > 0 && prov <= 100)) throw new RegnskapsFeil('Provisjonen må være mellom 0 og 100 prosent.');
    if (!(ot >= 0 && ot <= 200)) throw new RegnskapsFeil('Overtidstillegget må være mellom 0 og 200 prosent.');
    if (!(st > 0 && st <= 100)) throw new RegnskapsFeil('Stillingsprosenten må være mellom 1 og 100.');
    const p = a.passordType && a.passordType !== 'ingen' && a.passord?.trim() ? (a.passordType === 'fnr' ? a.passord.replace(/\s/g, '') : a.passord) : '';
    if (p && a.passordType === 'fnr' && !gyldigFnr(p)) throw new RegnskapsFeil('Fødselsnummeret er ikke gyldig. Sjekk at alle 11 siffer er riktige.');
    if (p && a.passordType === 'eget' && p.length < 6) throw new RegnskapsFeil('Passordet må ha minst 6 tegn.');
    const faste = (a.fasteTillegg ?? []).filter(t => t.tekst.trim() && t.belop).map(t => ({ tekst: t.tekst.trim(), belop: Math.round(t.belop), feriepengegrunnlag: t.feriepengegrunnlag !== false }));
    if (faste.some(t => t.belop < 0)) throw new RegnskapsFeil('Faste tillegg kan ikke være negative.');
    const db = await getDb();
    const v = [a.navn.trim(), a.epost || null, a.stilling || null, a.lonnType, a.lonnType === 'time' ? 0 : a.manedslonn, a.lonnType === 'time' ? a.timesats : 0, a.skatteprosent, a.kontonr || null, a.startdato || null, a.lonnType === 'provisjon' ? prov : 0, ot, st, JSON.stringify(faste)];
    let ansattId = a.id;
    if (a.id) await db.q('update ansatt set navn=$3, epost=$4, stilling=$5, lonn_type=$6, manedslonn=$7, timesats=$8, skatteprosent=$9, kontonr=$10, startdato=$11, provisjon_prosent=$12, overtid_prosent=$13, stillingsprosent=$14, faste_tillegg=$15 where id=$1 and organisasjon_id=$2', [a.id, s.org.id, ...v]);
    else ansattId = (await db.en<{ id: string }>('insert into ansatt (organisasjon_id, navn, epost, stilling, lonn_type, manedslonn, timesats, skatteprosent, kontonr, startdato, provisjon_prosent, overtid_prosent, stillingsprosent, faste_tillegg) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id', [s.org.id, ...v]))!.id;
    // Passord på lønnslippen: bare lagret som hash. Tomt felt ved endring betyr «behold det som er satt».
    if (a.passordType === 'ingen') {
      await db.q('update ansatt set slipp_passord_hash = null, slipp_passord_type = null where id = $1 and organisasjon_id = $2', [ansattId, s.org.id]);
    } else if (a.passordType && p) {
      await db.q('update ansatt set slipp_passord_hash = $3, slipp_passord_type = $4 where id = $1 and organisasjon_id = $2', [ansattId, s.org.id, await hashPassord(p), a.passordType]);
    }
    revalidatePath('/lonn');
  }, 'Den ansatte er lagret.');
}

export async function kjorLonnHandling(periode: string, dato: string, input: LonnInput[], sendNar: SendNar = 'utbetaling'): Promise<Resultat<{ bilagNr: number; sendt: string[]; feilet: string[]; planlagt: number; utenEpost: string[] }>> {
  return trygt(async () => {
    const s = await kreverOrg(); sjekkSkrivetilgang(s);
    if (!['na', 'utbetaling', 'ingen'].includes(sendNar)) throw new RegnskapsFeil('Velg når lønnslippene skal sendes.');
    const db = await getDb();
    const r = await db.tx(async t => {
      const k = await kjorLonn(t, s.org.id, periode, dato, input, s.bruker.id);
      await planleggUtsending(t, k.id, sendNar, dato);
      return k;
    });
    const utenEpost = (await db.q<{ navn: string }>(`select a.navn from lonnslipp s join ansatt a on a.id = s.ansatt_id where s.lonnskjoring_id = $1 and (a.epost is null or a.epost = '')`, [r.id])).map(x => x.navn);
    const planlagt = (await db.en<{ n: number }>('select count(*)::int as n from lonnslipp where lonnskjoring_id = $1 and send_etter is not null and sendt_tid is null', [r.id]))!.n;
    const u = sendNar === 'na' ? await sendForfalte(db, await grunnadresse(), s.org.id) : { sendt: [], feilet: [] };
    revalidatePath('/', 'layout');
    return { bilagNr: r.bilagNr, sendt: u.sendt, feilet: u.feilet, planlagt: sendNar === 'na' ? 0 : planlagt, utenEpost };
  }, 'Lønnen er kjørt og ført i regnskapet.');
}

/** Den ansatte åpner lønnslippen fra lenken i e-posten. Krever ikke innlogging, men passordet. */
export async function apneLonnslippHandling(token: string, passord: string): Promise<Resultat<{ data: LonnslippPdfData; pdf: string }>> {
  return trygt(async () => {
    const db = await getDb();
    const r = await apneLonnslipp(db, token, passord);
    return { data: r.data, pdf: Buffer.from(r.pdf).toString('base64') };
  });
}

// ---------- Innstillinger og regnskapsfører ----------

export async function lagreInnstillinger(v: Record<string, string | number | boolean | null>): Promise<Resultat> {
  return trygt(async () => {
    const s = await kreverOrg(); sjekkSkrivetilgang(s);
    const lov = ['adresse', 'postnr', 'poststed', 'epost', 'telefon', 'kontonr', 'mva_termin', 'faktura_forfall_dager', 'faktura_tekst', 'kid_metode', 'ehf', 'purring'];
    const felt = Object.keys(v).filter(k => lov.includes(k));
    if (!felt.length) return;
    if (v.mva_termin && !['tomnd', 'aar', 'ingen'].includes(String(v.mva_termin))) throw new RegnskapsFeil('Ugyldig MVA-termin.');
    if (v.faktura_forfall_dager != null && (Number(v.faktura_forfall_dager) < 0 || Number(v.faktura_forfall_dager) > 120)) throw new RegnskapsFeil('Dager til forfall må være mellom 0 og 120.');
    const db = await getDb();
    await db.q(`update organisasjon set ${felt.map((k, i) => `${k} = $${i + 2}`).join(', ')}${v.mva_termin ? `, mva_registrert = ${v.mva_termin !== 'ingen'}` : ''} where id = $1`, [s.org.id, ...felt.map(k => v[k])]);
    revalidatePath('/', 'layout');
  }, 'Lagret.');
}

export async function byttPakke(pakke: 'gratis' | 'start' | 'selskap'): Promise<Resultat> {
  return trygt(async () => {
    const s = await kreverOrg();
    if (s.rolle !== 'eier') throw new RegnskapsFeil('Bare eieren kan bytte pakke.');
    const db = await getDb();
    // Betaling (Stripe) er ikke koblet til ennå. Byttet registreres, og faktureres når betaling er på plass.
    await db.q('update organisasjon set pakke = $2 where id = $1', [s.org.id, pakke]);
    revalidatePath('/', 'layout');
  }, 'Pakken er byttet.');
}

export async function inviterRegnskapsforer(epost: string, rolle: 'regnskapsforer_full' | 'regnskapsforer_les'): Promise<Resultat<{ lenke: string; sendt: boolean }>> {
  return trygt(async () => {
    const s = await kreverOrg(); sjekkSkrivetilgang(s);
    if (!gyldigEpost(epost)) throw new RegnskapsFeil('Skriv en gyldig e-postadresse.');
    const db = await getDb();
    const token = randomBytes(18).toString('base64url');
    await db.q('insert into invitasjon (organisasjon_id, epost, rolle, token) values ($1,$2,$3,$4)', [s.org.id, epost.trim().toLowerCase(), rolle, token]);
    revalidatePath('/regnskapsforer');
    const lenke = `/invitasjon/${token}`;
    const sendt = await sendEpost({ til: epost.trim(), ...maler.invitasjon(s.bruker.navn, s.org.navn, rolle === 'regnskapsforer_full' ? 'som regnskapsfører' : 'som regnskapsfører med lesetilgang', (await grunnadresse()) + lenke), svarTil: s.bruker.epost });
    return { lenke, sendt };
  }, 'Invitasjonen er laget.');
}

export async function inviterBruker(epost: string, rolle: 'full' | 'les' | 'kvittering'): Promise<Resultat<{ lenke: string; sendt: boolean }>> {
  return trygt(async () => {
    const s = await kreverOrg(); sjekkSkrivetilgang(s);
    if (!gyldigEpost(epost)) throw new RegnskapsFeil('Skriv en gyldig e-postadresse.');
    const db = await getDb();
    const token = randomBytes(18).toString('base64url');
    await db.q('insert into invitasjon (organisasjon_id, epost, rolle, token) values ($1,$2,$3,$4)', [s.org.id, epost.trim().toLowerCase(), rolle, token]);
    revalidatePath('/innstillinger');
    const lenke = `/invitasjon/${token}`;
    const sendt = await sendEpost({ til: epost.trim(), ...maler.invitasjon(s.bruker.navn, s.org.navn, rolle === 'full' ? 'med full tilgang' : rolle === 'les' ? 'med lesetilgang' : 'for å levere kvitteringer', (await grunnadresse()) + lenke), svarTil: s.bruker.epost });
    return { lenke, sendt };
  }, 'Invitasjonen er laget.');
}

export async function trekkInvitasjon(id: string): Promise<Resultat> {
  return trygt(async () => {
    const s = await kreverOrg(); sjekkSkrivetilgang(s);
    const db = await getDb();
    await db.q(`update invitasjon set status = 'trukket' where id = $1 and organisasjon_id = $2`, [id, s.org.id]);
    revalidatePath('/', 'layout');
  }, 'Tilgangen er fjernet.');
}

export async function fjernByraTilgang(byraId: string): Promise<Resultat> {
  return trygt(async () => {
    const s = await kreverOrg(); sjekkSkrivetilgang(s);
    const db = await getDb();
    await db.q(`update byra_kunde set status = 'avsluttet' where byra_id = $1 and selskap_id = $2`, [byraId, s.org.id]);
    revalidatePath('/regnskapsforer');
  }, 'Tilgangen er fjernet.');
}

export async function godtaInvitasjon(token: string): Promise<Resultat> {
  const res = await trygt(async () => {
    const s = await kreverInnlogget();
    const db = await getDb();
    const inv = await db.en<{ id: string; organisasjon_id: string; rolle: string; status: string; epost: string }>('select * from invitasjon where token = $1', [token]);
    if (!inv || inv.status !== 'venter') throw new RegnskapsFeil('Invitasjonen er ikke gyldig lenger.');
    await db.tx(async t => {
      if (inv.rolle.startsWith('regnskapsforer')) {
        let byra = s.medlemskap.find(m => m.type === 'byra')?.orgId;
        if (!byra) {
          const o = await t.en<{ id: string }>(`insert into organisasjon (type, navn, pakke) values ('byra', $1, 'byra') returning id`, [`${s.bruker.navn}s regnskapskontor`]);
          await t.q(`insert into medlemskap (bruker_id, organisasjon_id, rolle) values ($1,$2,'eier')`, [s.bruker.id, o!.id]);
          byra = o!.id;
        }
        await t.q(`insert into byra_kunde (byra_id, selskap_id, status, rolle) values ($1,$2,'aktiv',$3) on conflict (byra_id, selskap_id) do update set status = 'aktiv', rolle = excluded.rolle`, [byra, inv.organisasjon_id, inv.rolle]);
      } else {
        await t.q(`insert into medlemskap (bruker_id, organisasjon_id, rolle) values ($1,$2,$3) on conflict do nothing`, [s.bruker.id, inv.organisasjon_id, inv.rolle]);
      }
      await t.q(`update invitasjon set status = 'godtatt' where id = $1`, [inv.id]);
      await t.q('update sesjon set organisasjon_id = $2 where token_hash = $1', [tokenHash(s.token), inv.organisasjon_id]);
    });
  });
  if (!res.ok) return res;
  redirect('/hjem');
}

export async function forfallForDato(dato: string): Promise<string> {
  const s = await sesjon();
  const db = await getDb();
  const o = s?.org ? await db.en<{ d: number }>('select faktura_forfall_dager as d from organisasjon where id = $1', [s.org.id]) : null;
  return forfallFra(dato, o?.d ?? 14);
}

// ---------- Live kontroll og vedlegg ----------

export async function kontrollKjopHandling(k: KjopInput, unntakId?: string): Promise<Resultat<{ funn: import('@/lib/tjenester/kjop').Funn[]; forslag: { nr: number; navn: string; grunn: string } | null }>> {
  return trygt(async () => {
    const s = await kreverOrg();
    const db = await getDb();
    const { kontrollerKjop, finnDuplikat } = await import('@/lib/tjenester/kjop');
    const { foreslaKonto } = await import('@/lib/kontoplan');
    const org = await db.en<{ mva_registrert: boolean }>('select mva_registrert from organisasjon where id = $1', [s.org.id]);
    const navn = k.leverandorNavn.trim();
    const kontakt = navn ? await db.en<{ mva_registrert: boolean | null }>(
      k.leverandorOrgnr ? 'select mva_registrert from kontakt where organisasjon_id = $1 and orgnr = $2' : 'select mva_registrert from kontakt where organisasjon_id = $1 and lower(navn) = lower($2)',
      [s.org.id, k.leverandorOrgnr ? k.leverandorOrgnr.replace(/\s/g, '') : navn]) : null;
    const duplikat = navn && k.total > 0 && k.dato ? await finnDuplikat(db, s.org.id, navn, k.total, k.dato, unntakId) : null;
    const funn = kontrollerKjop(k, { orgMvaRegistrert: !!org?.mva_registrert, finnesLeverandor: navn ? !!kontakt : undefined, mvaRegistrertLeverandor: kontakt?.mva_registrert ?? null, duplikat });
    // Regel først: samme leverandør som før gir samme type kjøp.
    const forrige = navn ? await db.en<{ konto: number }>(`select konto from kjop where organisasjon_id = $1 and lower(leverandor_navn) = lower($2) and status <> 'utkast' and konto is not null order by opprettet desc limit 1`, [s.org.id, navn]) : null;
    const { konto: finnKonto } = await import('@/lib/kontoplan');
    const kf = forrige ? finnKonto(forrige.konto) : null;
    if (kf) return { funn, forslag: { nr: kf.nr, navn: kf.navn, grunn: `Samme som sist du kjøpte fra ${navn}.` } };
    const f = navn ? foreslaKonto(`${navn} ${k.tekst ?? ''}`) : null;
    return { funn, forslag: f ? { nr: f.konto.nr, navn: f.konto.navn, grunn: f.grunn } : null };
  });
}

export async function lastOppVedlegg(fd: FormData): Promise<Resultat<{ id: string; navn: string }>> {
  return trygt(async () => {
    const s = await kreverOrg(); sjekkKjopstilgang(s);
    const fil = fd.get('fil') as File | null;
    if (!fil || !fil.size) throw new RegnskapsFeil('Velg en fil.');
    if (fil.size > 15 * 1024 * 1024) throw new RegnskapsFeil('Filen er for stor (maks 15 MB).');
    const mime = fil.type || 'application/octet-stream';
    if (!/^(image\/|application\/pdf|application\/xml|text\/xml)/.test(mime)) throw new RegnskapsFeil('Last opp bilde, PDF eller EHF (XML).');
    const { lagreVedlegg } = await import('@/lib/vedlegg');
    const id = await lagreVedlegg(await getDb(), s.org.id, fil.name, mime, new Uint8Array(await fil.arrayBuffer()));
    return { id, navn: fil.name };
  });
}

export async function kobleVedlegg(kjopId: string, vedleggId: string): Promise<Resultat> {
  return trygt(async () => {
    const s = await kreverOrg(); sjekkSkrivetilgang(s);
    const db = await getDb();
    const v = await db.en('select 1 from vedlegg where id = $1 and organisasjon_id = $2', [vedleggId, s.org.id]);
    if (!v) throw new RegnskapsFeil('Fant ikke vedlegget.');
    await db.q('update kjop set vedlegg_id = $3 where id = $1 and organisasjon_id = $2', [kjopId, s.org.id, vedleggId]);
    revalidatePath('/', 'layout');
  }, 'Kvitteringen er lagt ved.');
}

export async function kalenderLenke(): Promise<Resultat<{ token: string }>> {
  return trygt(async () => {
    const s = await kreverOrg();
    const db = await getDb();
    const o = await db.en<{ kalender_token: string | null }>('select kalender_token from organisasjon where id = $1', [s.org.id]);
    if (o?.kalender_token) return { token: o.kalender_token };
    const token = randomBytes(24).toString('base64url');
    await db.q('update organisasjon set kalender_token = $2 where id = $1 and kalender_token is null', [s.org.id, token]);
    const n = await db.en<{ kalender_token: string }>('select kalender_token from organisasjon where id = $1', [s.org.id]);
    return { token: n!.kalender_token };
  });
}

export async function laasPeriodeHandling(tilDato: string): Promise<Resultat> {
  return trygt(async () => {
    const s = await kreverOrg(); sjekkSkrivetilgang(s);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tilDato)) throw new RegnskapsFeil('Velg en dato.');
    if (tilDato >= idag()) throw new RegnskapsFeil('Du kan bare låse perioder som er over.');
    const db = await getDb();
    const { laasPeriode, laastTil } = await import('@/lib/tjenester/bokforing');
    const f = await laastTil(db, s.org.id);
    if (f && tilDato <= f) throw new RegnskapsFeil(`Regnskapet er allerede låst til og med ${f.split('-').reverse().join('.')}. En lås kan ikke flyttes bakover.`);
    await db.tx(t => laasPeriode(t, s.org.id, tilDato, 'Låst av bruker', s.bruker.id));
    revalidatePath('/', 'layout');
  }, 'Regnskapet er låst.');
}

export async function lagreApningsbalanse(dato: string, saldoer: { konto: number; saldo: number }[]): Promise<Resultat<{ bilagNr: number }>> {
  return trygt(async () => {
    const s = await kreverOrg(); sjekkSkrivetilgang(s);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dato)) throw new RegnskapsFeil('Velg dato for åpningsbalansen.');
    const db = await getDb();
    if (await db.en(`select 1 from bilag where organisasjon_id = $1 and type = 'apningsbalanse' and not exists (select 1 from bilag k where k.korrigerer_id = bilag.id)`, [s.org.id])) throw new RegnskapsFeil('Åpningsbalansen er allerede ført. Rett den med en korrigering, eller ta kontakt med regnskapsføreren.');
    const { byggApningsbalanse } = await import('@/lib/hovedbok');
    const { bokfor } = await import('@/lib/tjenester/bokforing');
    const p = byggApningsbalanse(saldoer.filter(x => x.saldo !== 0));
    const b = await db.tx(t => bokfor(t, s.org.id, { dato, type: 'apningsbalanse', beskrivelse: 'Åpningsbalanse', brukerId: s.bruker.id, kilde: 'manuell' }, p));
    revalidatePath('/', 'layout');
    return { bilagNr: b.nr };
  }, 'Åpningsbalansen er ført.');
}

// ---------- Byrå ----------

async function kreverByraOrg() {
  const s = await kreverInnlogget();
  const byra = s.medlemskap.find(m => m.type === 'byra');
  if (!byra) throw new RegnskapsFeil('Du er ikke registrert som regnskapsfører.');
  return { s, byraId: byra.orgId };
}

/** Regnskapsføreren legger til en ny kunde. Kunden starter på Gratis, og byrået får full tilgang. */
export async function opprettKlient(e: { navn: string; orgnr?: string | null; orgform?: string; adresse?: string; postnr?: string; poststed?: string; mvaRegistrert?: boolean; stiftet?: string | null }): Promise<Resultat<{ id: string }>> {
  return trygt(async () => {
    const { byraId } = await kreverByraOrg();
    if (!e.navn?.trim()) throw new RegnskapsFeil('Skriv navnet på kunden.');
    const db = await getDb();
    const orgnr = e.orgnr?.replace(/\s/g, '') || null;
    if (orgnr) {
      const finnes = await db.en<{ id: string }>(`select id from organisasjon where orgnr = $1 and type = 'selskap'`, [orgnr]);
      if (finnes) {
        const koblet = await db.en(`select 1 from byra_kunde where byra_id = $1 and selskap_id = $2 and status = 'aktiv'`, [byraId, finnes.id]);
        throw new RegnskapsFeil(koblet ? 'Kunden er allerede i listen din.' : 'Foretaket bruker allerede Rettført. Be dem invitere deg under «Regnskapsfører».');
      }
    }
    let slug = lagSlug(e.navn);
    if (await db.en('select 1 from organisasjon where bilag_slug = $1', [slug])) slug = `${slug}-${randomBytes(2).toString('hex')}`;
    const ar = idag().slice(0, 4);
    const id = await db.tx(async t => {
      const o = await t.en<{ id: string }>(`insert into organisasjon (type, navn, orgnr, orgform, stiftet, adresse, postnr, poststed, mva_registrert, mva_termin, regnskap_fra, pakke, bilag_slug)
        values ('selskap',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'gratis',$11) returning id`,
        [e.navn.trim(), orgnr, e.orgform || 'AS', e.stiftet || null, e.adresse || null, e.postnr || null, e.poststed || null, e.mvaRegistrert !== false, e.mvaRegistrert === false ? 'ingen' : 'tomnd', `${ar}-01-01`, slug]);
      await t.q(`insert into byra_kunde (byra_id, selskap_id, status, rolle) values ($1,$2,'aktiv','regnskapsforer_full')`, [byraId, o!.id]);
      return o!.id;
    });
    revalidatePath('/byra');
    return { id };
  }, 'Kunden er lagt til.');
}

// ---------- Assistent ----------

/** Svarer på spørsmål om egne tall. Bare for pakkene som har assistent. */
export async function sporAssistent(sporsmal: string): Promise<Resultat<Svar>> {
  return trygt(async () => {
    const s = await kreverOrg();
    if (!harAssistent(s.org.pakke) && !s.medlemskap.some(m => m.type === 'byra')) throw new RegnskapsFeil('Assistenten er med i Selskap og Byrå.');
    const q = sporsmal.trim().slice(0, 500);
    if (!q) throw new RegnskapsFeil('Skriv et spørsmål.');
    const db = await getDb();
    return assistentSvar(q, await hentFakta(db, s.org.id, idag()));
  });
}

// ---------- Testtilgang ----------

/** Bare for testbrukere: bytt pakke fritt, uten betaling, for å se hvordan hver pakke ser ut. */
export async function settTestPakke(pakke: 'gratis' | 'start' | 'selskap'): Promise<Resultat> {
  return trygt(async () => {
    const s = await kreverOrg();
    if (!erTestbruker(s.bruker.epost)) throw new RegnskapsFeil('Ikke tilgang.');
    const db = await getDb();
    await db.q('update organisasjon set pakke = $2 where id = $1', [s.org.id, pakke]);
    revalidatePath('/', 'layout');
  }, 'Pakken er byttet.');
}

/** Bare for testbrukere: lag et testbyrå der eget foretak er kunde, og gå dit. */
export async function testByra(): Promise<Resultat> {
  const res = await trygt(async () => {
    const s = await kreverInnlogget();
    if (!erTestbruker(s.bruker.epost)) throw new RegnskapsFeil('Ikke tilgang.');
    const db = await getDb();
    const finnes = s.medlemskap.find(m => m.type === 'byra');
    await db.tx(async t => {
      let byraId = finnes?.orgId;
      if (!byraId) {
        const o = await t.en<{ id: string }>(`insert into organisasjon (type, navn, pakke) values ('byra', $1, 'byra') returning id`, [`${s.bruker.navn.split(' ')[0]}s testbyrå`]);
        byraId = o!.id;
        await t.q(`insert into medlemskap (bruker_id, organisasjon_id, rolle) values ($1,$2,'eier')`, [s.bruker.id, byraId]);
      }
      for (const m of s.medlemskap.filter(m => m.type === 'selskap')) {
        await t.q(`insert into byra_kunde (byra_id, selskap_id, status, rolle) values ($1,$2,'aktiv','regnskapsforer_full') on conflict (byra_id, selskap_id) do update set status = 'aktiv'`, [byraId, m.orgId]);
      }
    });
    revalidatePath('/', 'layout');
  });
  if (!res.ok) return res;
  redirect('/byra');
}

/** Bare for testbrukere: lag Testfirma AS med fiktivt orgnr og et års aktivitet, og gå dit. Finnes det, åpnes det. */
export async function testfirma(): Promise<Resultat> {
  const res = await trygt(async () => {
    const s = await kreverInnlogget();
    if (!erTestbruker(s.bruker.epost)) throw new RegnskapsFeil('Ikke tilgang.');
    const db = await getDb();
    const finnes = await db.en<{ id: string }>(`select o.id from organisasjon o join medlemskap m on m.organisasjon_id = o.id where m.bruker_id = $1 and o.orgnr = $2 limit 1`, [s.bruker.id, TESTFIRMA_ORGNR]);
    const orgId = finnes?.id ?? await lagTestfirma(db, s.bruker.id, s.bruker.navn.split(' ')[0] || 'Test', idag());
    await db.q('update sesjon set organisasjon_id = $2 where token_hash = $1', [tokenHash(s.token), orgId]);
    revalidatePath('/', 'layout');
  });
  if (!res.ok) return res;
  redirect('/hjem');
}

// ---------- Totrinns innlogging ----------

/** Starter oppsett: lager en ny hemmelighet og viser QR-koden. Slås ikke på før koden er bekreftet. */
export async function startTotrinn(): Promise<Resultat<{ qr: string; hemmelighet: string; uri: string }>> {
  return trygt(async () => {
    const s = await kreverInnlogget();
    const h = nyHemmelighet();
    const db = await getDb();
    await db.q('update bruker set totp_ny = $2 where id = $1', [s.bruker.id, h]);
    const uri = otpauthUri(h, s.bruker.epost);
    return { qr: await QRCode.toDataURL(uri, { margin: 1, width: 220, color: { dark: '#0B2545', light: '#ffffff' } }), hemmelighet: h.replace(/(.{4})/g, '$1 ').trim(), uri };
  });
}

export async function bekreftTotrinn(kode: string): Promise<Resultat> {
  return trygt(async () => {
    const s = await kreverInnlogget();
    const db = await getDb();
    const b = await db.en<{ totp_ny: string | null }>('select totp_ny from bruker where id = $1', [s.bruker.id]);
    if (!b?.totp_ny) throw new RegnskapsFeil('Start oppsettet på nytt.');
    if (!sjekkTotp(b.totp_ny, kode)) throw new RegnskapsFeil('Koden stemmer ikke. Sjekk at klokken på telefonen er riktig, og bruk koden som vises nå.');
    await db.q('update bruker set totp_hemmelig = totp_ny, totp_ny = null, totp_feil = 0 where id = $1', [s.bruker.id]);
    revalidatePath('/innstillinger');
  }, 'Totrinns innlogging er slått på.');
}

export async function slaAvTotrinn(kode: string): Promise<Resultat> {
  return trygt(async () => {
    const s = await kreverInnlogget();
    const db = await getDb();
    const b = await db.en<{ totp_hemmelig: string | null }>('select totp_hemmelig from bruker where id = $1', [s.bruker.id]);
    if (!b?.totp_hemmelig) return;
    if (!sjekkTotp(b.totp_hemmelig, kode)) throw new RegnskapsFeil('Koden stemmer ikke.');
    await db.q('update bruker set totp_hemmelig = null, totp_ny = null where id = $1', [s.bruker.id]);
    revalidatePath('/innstillinger');
  }, 'Totrinns innlogging er slått av.');
}
