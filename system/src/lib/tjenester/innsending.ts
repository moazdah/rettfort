// Skanning med mobil. En lenke kan bare sende inn dokumenter; den som har den, ser ingenting av regnskapet.
// Tre slags lenker: egen (QR fra PC-en, 15 minutter), klient (fra regnskapsføreren) og ansatt (utlegg).
// Alt som kommer inn, havner i innboksen under Penger ut.

import { randomBytes } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import type { Sporring, Db } from '../db';
import { RegnskapsFeil } from '../hovedbok';
import { bokfor } from './bokforing';
import { lagreVedlegg } from '../vedlegg';

export type LenkeType = 'egen' | 'klient' | 'ansatt';
export type Tilbake = 'neste_lonn' | 'na';

export interface Lenke { id: string; organisasjon_id: string; token: string; type: LenkeType; ansatt_id: string | null; navn: string | null; epost: string | null; foretak: string; ansatt_navn: string | null }

const MAKS_FIL = 15 * 1024 * 1024;
const MAKS_PER_DOGN = 60;

export async function lagLenke(t: Sporring, orgId: string, o: { type: LenkeType; ansattId?: string | null; navn?: string | null; epost?: string | null; brukerId?: string | null }): Promise<{ id: string; token: string }> {
  if (o.type === 'ansatt') {
    if (!o.ansattId) throw new RegnskapsFeil('Velg den ansatte.');
    const a = await t.en('select 1 from ansatt where id = $1 and organisasjon_id = $2', [o.ansattId, orgId]);
    if (!a) throw new RegnskapsFeil('Fant ikke den ansatte.');
    // Én aktiv lenke per ansatt: den gamle slettes når en ny lages.
    await t.q(`update skannelenke set slettet = true where organisasjon_id = $1 and ansatt_id = $2 and type = 'ansatt'`, [orgId, o.ansattId]);
  }
  if (o.type === 'klient' && !o.navn?.trim()) throw new RegnskapsFeil('Skriv hvem lenken er til.');
  const token = randomBytes(18).toString('base64url');
  const utloper = o.type === 'egen' ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
  const r = await t.en<{ id: string }>(`insert into skannelenke (organisasjon_id, token, type, ansatt_id, navn, epost, utloper, opprettet_av) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
    [orgId, token, o.type, o.ansattId ?? null, o.navn?.trim() || null, o.epost?.trim().toLowerCase() || null, utloper, o.brukerId ?? null]);
  return { id: r!.id, token };
}

export async function hentLenke(t: Sporring, token: string): Promise<Lenke | null> {
  if (!/^[\w-]{16,64}$/.test(token)) return null;
  return t.en<Lenke>(`select l.id, l.organisasjon_id, l.token, l.type, l.ansatt_id, l.navn, l.epost, o.navn as foretak, a.navn as ansatt_navn
    from skannelenke l join organisasjon o on o.id = l.organisasjon_id left join ansatt a on a.id = l.ansatt_id
    where l.token = $1 and not l.slettet and (l.utloper is null or l.utloper > now())`, [token]);
}

/** Flere sider (bilder) blir én PDF, så en lang kvittering eller en faktura på flere sider holdes samlet. */
export async function sammenstill(sider: { data: Uint8Array; mime: string }[]): Promise<{ data: Uint8Array; mime: string; ending: string }> {
  if (sider.length === 1) return { ...sider[0], ending: sider[0].mime === 'application/pdf' ? 'pdf' : sider[0].mime === 'image/png' ? 'png' : 'jpg' };
  const doc = await PDFDocument.create();
  for (const s of sider) {
    if (s.mime !== 'image/jpeg' && s.mime !== 'image/png') throw new RegnskapsFeil('Flere sider må være bilder.');
    const b = s.mime === 'image/png' ? await doc.embedPng(s.data) : await doc.embedJpg(s.data);
    // A4-bredde, høyden følger bildet.
    const w = 595.28, h = (b.height / b.width) * w;
    doc.addPage([w, h]).drawImage(b, { x: 0, y: 0, width: w, height: h });
  }
  return { data: await doc.save(), mime: 'application/pdf', ending: 'pdf' };
}

export async function mottaInnsending(db: Db, token: string, sider: { data: Uint8Array; mime: string }[], o: { tekst?: string | null; betaltMed?: string | null } = {}): Promise<{ id: string }> {
  const l = await hentLenke(db, token);
  if (!l) throw new RegnskapsFeil('Lenken virker ikke lenger. Be om en ny.');
  if (!sider.length) throw new RegnskapsFeil('Ta et bilde først.');
  if (sider.length > 10) throw new RegnskapsFeil('Maks 10 sider om gangen.');
  for (const s of sider) {
    if (s.data.byteLength > MAKS_FIL) throw new RegnskapsFeil('Bildet er for stort (maks 15 MB).');
    if (!/^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/.test(s.mime)) throw new RegnskapsFeil('Send bilde eller PDF.');
  }
  const n = await db.en<{ n: number }>(`select count(*)::int as n from innsending where lenke_id = $1 and opprettet > now() - interval '1 day'`, [l.id]);
  if ((n?.n ?? 0) >= MAKS_PER_DOGN) throw new RegnskapsFeil('Det er sendt veldig mange dokumenter i dag. Prøv igjen i morgen.');
  if (l.type === 'ansatt' && !['eget', 'firma'].includes(o.betaltMed ?? '')) throw new RegnskapsFeil('Velg om du betalte med eget kort eller firmakort.');
  const s = await sammenstill(sider);
  const fra = l.type === 'ansatt' ? l.ansatt_navn : l.type === 'klient' ? l.navn : 'Mobilen din';
  const dag = new Date().toISOString().slice(0, 10);
  const vedleggId = await lagreVedlegg(db, l.organisasjon_id, `${l.type === 'ansatt' ? 'utlegg' : 'bilag'}-${dag}.${s.ending}`, s.mime, s.data);
  const r = await db.en<{ id: string }>(`insert into innsending (organisasjon_id, lenke_id, vedlegg_id, type, fra_navn, tekst, betalt_med) values ($1,$2,$3,$4,$5,$6,$7) returning id`,
    [l.organisasjon_id, l.id, vedleggId, l.type === 'ansatt' ? 'utlegg' : l.type, fra, o.tekst?.trim().slice(0, 300) || null, l.type === 'ansatt' ? o.betaltMed : null]);
  return { id: r!.id };
}

/** For QR fra PC-en: det som har kommet inn på lenken og ikke er hentet ennå. Merkes som hentet. */
export async function hentNye(db: Db, orgId: string, token: string): Promise<{ id: string; vedleggId: string; filnavn: string }[]> {
  return db.q(`update innsending i set status = 'hentet' from skannelenke l, vedlegg v
    where l.id = i.lenke_id and v.id = i.vedlegg_id and l.token = $2 and i.organisasjon_id = $1 and i.status = 'ny'
    returning i.id, i.vedlegg_id as "vedleggId", v.filnavn`, [orgId, token]);
}

export interface InnboksRad {
  id: string; type: string; fra_navn: string | null; tekst: string | null; betalt_med: string | null; status: string; vedlegg_id: string | null; mime: string | null;
  kjop_id: string | null; belop: number | null; tilbake: string | null; avvist_grunn: string | null; opprettet: string; ansatt_id: string | null; ansatt_kontonr: string | null; lonnskjoring_id: string | null;
}

export async function innboks(t: Sporring, orgId: string): Promise<InnboksRad[]> {
  return t.q<InnboksRad>(`select i.id, i.type, i.fra_navn, i.tekst, i.betalt_med, i.status, i.vedlegg_id, v.mime, i.kjop_id, i.belop, i.tilbake, i.avvist_grunn, i.opprettet::text as opprettet,
      l.ansatt_id, a.kontonr as ansatt_kontonr, i.lonnskjoring_id
    from innsending i left join vedlegg v on v.id = i.vedlegg_id left join skannelenke l on l.id = i.lenke_id left join ansatt a on a.id = l.ansatt_id
    where i.organisasjon_id = $1 and (i.status in ('ny','hentet','godkjent') or i.opprettet > now() - interval '30 days')
    order by case when i.status in ('ny','hentet') then 0 when i.status = 'godkjent' then 1 else 2 end, i.opprettet desc`, [orgId]);
}

/** Antall som venter på noe fra arbeidsgiveren/regnskapsføreren. Vises i menyen. */
export async function antallIInnboks(t: Sporring, orgId: string): Promise<number> {
  const r = await t.en<{ n: number }>(`select count(*)::int as n from innsending where organisasjon_id = $1 and (status in ('ny','hentet') or (status = 'godkjent' and tilbake is null) or (status = 'godkjent' and tilbake = 'na'))`, [orgId]);
  return r?.n ?? 0;
}

export async function hentInnsending(t: Sporring, orgId: string, id: string) {
  return t.en<{ id: string; type: string; fra_navn: string | null; tekst: string | null; betalt_med: string | null; status: string; vedlegg_id: string | null; filnavn: string | null }>(
    `select i.id, i.type, i.fra_navn, i.tekst, i.betalt_med, i.status, i.vedlegg_id, v.filnavn from innsending i left join vedlegg v on v.id = i.vedlegg_id where i.id = $1 and i.organisasjon_id = $2`, [id, orgId]);
}

/**
 * Etter at kjøpet er registrert. Et utlegg med eget kort blir «godkjent» og venter på tilbakebetaling;
 * har arbeidsgiveren valgt en fast måte, brukes den. Alt annet er ferdig.
 */
export async function etterRegistrering(t: Sporring, orgId: string, id: string, kjopId: string): Promise<{ trengerValg: boolean; tilbake: Tilbake | null }> {
  const i = await t.en<{ type: string; betalt_med: string | null; status: string }>('select type, betalt_med, status from innsending where id = $1 and organisasjon_id = $2', [id, orgId]);
  if (!i || !['ny', 'hentet'].includes(i.status)) return { trengerValg: false, tilbake: null };
  const k = await t.en<{ total: number }>('select total from kjop where id = $1 and organisasjon_id = $2', [kjopId, orgId]);
  if (i.type === 'utlegg' && i.betalt_med === 'eget') {
    const o = await t.en<{ utlegg_tilbake: Tilbake | null }>('select utlegg_tilbake from organisasjon where id = $1', [orgId]);
    await t.q(`update innsending set status = 'godkjent', kjop_id = $3, belop = $4, tilbake = $5, behandlet = now() where id = $1 and organisasjon_id = $2`, [id, orgId, kjopId, k?.total ?? null, o?.utlegg_tilbake ?? null]);
    return { trengerValg: !o?.utlegg_tilbake, tilbake: o?.utlegg_tilbake ?? null };
  }
  await t.q(`update innsending set status = 'registrert', kjop_id = $3, belop = $4, behandlet = now() where id = $1 and organisasjon_id = $2`, [id, orgId, kjopId, k?.total ?? null]);
  return { trengerValg: false, tilbake: null };
}

export async function settTilbake(t: Sporring, orgId: string, id: string, tilbake: Tilbake, husk: boolean) {
  if (!['neste_lonn', 'na'].includes(tilbake)) throw new RegnskapsFeil('Velg hvordan utlegget betales tilbake.');
  const r = await t.en(`update innsending set tilbake = $3 where id = $1 and organisasjon_id = $2 and status = 'godkjent' returning id`, [id, orgId, tilbake]);
  if (!r) throw new RegnskapsFeil('Utlegget er allerede betalt tilbake.');
  if (husk) await t.q('update organisasjon set utlegg_tilbake = $2 where id = $1', [orgId, tilbake]);
}

export async function settFastTilbake(t: Sporring, orgId: string, tilbake: Tilbake | null) {
  if (tilbake && !['neste_lonn', 'na'].includes(tilbake)) throw new RegnskapsFeil('Ugyldig valg.');
  await t.q('update organisasjon set utlegg_tilbake = $2 where id = $1', [orgId, tilbake]);
}

/** Arbeidsgiveren har betalt utlegget tilbake i nettbanken. Gjelden til den ansatte (2910) går ned. */
export async function betalUtleggNa(t: Sporring, orgId: string, id: string, dato: string, brukerId?: string | null) {
  const i = await t.en<{ belop: number | null; fra_navn: string | null; status: string }>('select belop, fra_navn, status from innsending where id = $1 and organisasjon_id = $2', [id, orgId]);
  if (!i || i.status !== 'godkjent' || !i.belop) throw new RegnskapsFeil('Fant ikke utlegget, eller det er allerede betalt.');
  await bokfor(t, orgId, { dato, type: 'bank', beskrivelse: `Utlegg tilbakebetalt til ${i.fra_navn ?? 'ansatt'}`, brukerId, kilde: 'utlegg' }, [
    { konto: 2910, debet: i.belop, kredit: 0 }, { konto: 1920, debet: 0, kredit: i.belop },
  ]);
  await t.q(`update innsending set status = 'betalt', behandlet = now() where id = $1`, [id]);
}

export async function avvis(t: Sporring, orgId: string, id: string, grunn: string) {
  const g = grunn.trim();
  if (!g) throw new RegnskapsFeil('Skriv hvorfor, så forstår avsenderen hva som mangler.');
  const r = await t.en(`update innsending set status = 'avvist', avvist_grunn = $3, behandlet = now() where id = $1 and organisasjon_id = $2 and status in ('ny','hentet') returning id`, [id, orgId, g.slice(0, 300)]);
  if (!r) throw new RegnskapsFeil('Dokumentet er allerede behandlet.');
}

/** Utlegg som skal betales tilbake med lønnen for disse ansatte. */
export async function utleggTilLonn(t: Sporring, orgId: string): Promise<{ id: string; ansatt_id: string; belop: number; tekst: string }[]> {
  return t.q(`select i.id, l.ansatt_id, i.belop, coalesce(i.tekst, 'Utlegg') as tekst from innsending i join skannelenke l on l.id = i.lenke_id
    where i.organisasjon_id = $1 and i.type = 'utlegg' and i.status = 'godkjent' and i.tilbake = 'neste_lonn' and i.lonnskjoring_id is null and i.belop > 0 order by i.opprettet`, [orgId]);
}

/** Den ansattes egne utlegg, til siden de åpner fra lenken. */
export async function mineUtlegg(t: Sporring, lenkeId: string, ansattId: string) {
  return t.q<{ id: string; opprettet: string; tekst: string | null; betalt_med: string | null; status: string; belop: number | null; tilbake: string | null; avvist_grunn: string | null; periode: string | null }>(
    `select i.id, i.opprettet::text as opprettet, i.tekst, i.betalt_med, i.status, i.belop, i.tilbake, i.avvist_grunn, k.periode
     from innsending i join skannelenke l on l.id = i.lenke_id left join lonnskjoring k on k.id = i.lonnskjoring_id
     where l.ansatt_id = $1 and l.organisasjon_id = (select organisasjon_id from skannelenke where id = $2) and i.type = 'utlegg'
     order by i.opprettet desc limit 50`, [ansattId, lenkeId]);
}

export async function lenker(t: Sporring, orgId: string) {
  return t.q<{ id: string; token: string; type: LenkeType; navn: string | null; epost: string | null; ansatt_navn: string | null; ansatt_id: string | null; opprettet: string; antall: number }>(
    `select l.id, l.token, l.type, l.navn, l.epost, a.navn as ansatt_navn, l.ansatt_id, l.opprettet::text as opprettet, (select count(*)::int from innsending i where i.lenke_id = l.id) as antall
     from skannelenke l left join ansatt a on a.id = l.ansatt_id where l.organisasjon_id = $1 and not l.slettet and l.type <> 'egen' order by l.opprettet desc`, [orgId]);
}

export async function slettLenke(t: Sporring, orgId: string, id: string) {
  await t.q('update skannelenke set slettet = true where id = $1 and organisasjon_id = $2', [id, orgId]);
}
