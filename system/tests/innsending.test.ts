import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { nyTestDb } from '@/lib/db';
import { lagLenke, hentLenke, mottaInnsending, hentNye, innboks, antallIInnboks, etterRegistrering, settTilbake, betalUtleggNa, avvis, mineUtlegg, utleggTilLonn, sammenstill } from '@/lib/tjenester/innsending';
import { registrerKjop } from '@/lib/tjenester/kjop';
import { kjorLonn } from '@/lib/tjenester/lonn';
import { hentPosteringer } from '@/lib/tjenester/bokforing';
import { saldobalanse, balanse } from '@/lib/rapporter';

const jpeg = async () => new Uint8Array(await sharp({ create: { width: 40, height: 60, channels: 3, background: '#fff' } }).jpeg().toBuffer());

async function oppsett() {
  const db = await nyTestDb();
  const o = (await db.en<{ id: string }>(`insert into organisasjon (type, navn, orgnr, lonningsdag, mva_registrert) values ('selskap','Utlegg AS','315000009',25,true) returning id`))!.id;
  const a = (await db.en<{ id: string }>(`insert into ansatt (organisasjon_id, navn, epost, lonn_type, manedslonn, skatteprosent, kontonr) values ($1,'Kari Nordmann','kari@test.no','fast',4000000,30,'12345600017') returning id`, [o]))!.id;
  return { db, o, a };
}
const kjop = (db: Awaited<ReturnType<typeof nyTestDb>>, o: string, betaltMed: 'privat' | 'bank', vedleggId: string) =>
  db.tx(t => registrerKjop(t, o, { leverandorNavn: 'Parkering AS', dato: '2026-09-10', total: 25000, mva: 5000, sats: 25, konto: 7140, betaltMed, vedleggId, kilde: 'kvittering', lestAutomatisk: true, bekreftetAvBruker: true }));

describe('skanning og utlegg', () => {
  it('QR-lenke fra PC-en: bilde kommer inn og hentes én gang', async () => {
    const { db, o } = await oppsett();
    const { token } = await db.tx(t => lagLenke(t, o, { type: 'egen' }));
    expect((await hentLenke(db, token))!.foretak).toBe('Utlegg AS');
    await mottaInnsending(db, token, [{ data: await jpeg(), mime: 'image/jpeg' }]);
    const nye = await hentNye(db, o, token);
    expect(nye).toHaveLength(1);
    expect(await hentNye(db, o, token)).toHaveLength(0);
    // Utløpt QR-lenke virker ikke
    await db.q(`update skannelenke set utloper = now() - interval '1 minute' where token = $1`, [token]);
    expect(await hentLenke(db, token)).toBeNull();
    await expect(mottaInnsending(db, token, [{ data: await jpeg(), mime: 'image/jpeg' }])).rejects.toThrow('Lenken virker ikke');
  });

  it('flere sider blir én PDF', async () => {
    const s = await sammenstill([{ data: await jpeg(), mime: 'image/jpeg' }, { data: await jpeg(), mime: 'image/jpeg' }]);
    expect(s.mime).toBe('application/pdf');
    expect(Buffer.from(s.data.slice(0, 4)).toString()).toBe('%PDF');
  });

  it('utlegg med eget kort: godkjennes, betales med neste lønn og står på lønnslippen', async () => {
    const { db, o, a } = await oppsett();
    const { token } = await db.tx(t => lagLenke(t, o, { type: 'ansatt', ansattId: a }));
    await expect(mottaInnsending(db, token, [{ data: await jpeg(), mime: 'image/jpeg' }])).rejects.toThrow('eget kort eller firmakort');
    const { id } = await mottaInnsending(db, token, [{ data: await jpeg(), mime: 'image/jpeg' }], { tekst: 'Parkering hos kunde', betaltMed: 'eget' });
    expect(await antallIInnboks(db, o)).toBe(1);
    const rad = (await innboks(db, o))[0];
    expect(rad).toMatchObject({ type: 'utlegg', fra_navn: 'Kari Nordmann', betalt_med: 'eget', status: 'ny' });
    const k = await kjop(db, o, 'privat', rad.vedlegg_id!);
    const e = await db.tx(t => etterRegistrering(t, o, id, k.id));
    expect(e).toEqual({ trengerValg: true, tilbake: null });
    await db.tx(t => settTilbake(t, o, id, 'neste_lonn', true));
    expect((await db.en<{ utlegg_tilbake: string }>('select utlegg_tilbake from organisasjon where id = $1', [o]))!.utlegg_tilbake).toBe('neste_lonn');
    expect(await utleggTilLonn(db, o)).toHaveLength(1);
    // Gjeld til den ansatte før lønn
    expect(saldobalanse(await hentPosteringer(db, o)).get(2910)!.saldo).toBe(-25000);
    await db.tx(t => kjorLonn(t, o, '2026-09', '2026-09-25', []));
    const ls = await db.en<{ utlegg: number; utlegg_linjer: { tekst: string; belop: number }[] }>('select utlegg, utlegg_linjer from lonnslipp');
    expect(Number(ls!.utlegg)).toBe(25000);
    expect(ls!.utlegg_linjer).toEqual([{ tekst: 'Parkering hos kunde', belop: 25000 }]);
    const sb = saldobalanse(await hentPosteringer(db, o));
    expect(sb.get(2910)?.saldo ?? 0).toBe(0);
    expect(balanse(await hentPosteringer(db, o), '2026-12-31').differanse).toBe(0);
    const mine = await mineUtlegg(db, (await hentLenke(db, token))!.id, a);
    expect(mine[0]).toMatchObject({ status: 'betalt', periode: '2026-09' });
    // Neste utlegg bruker det faste valget uten å spørre
    const neste = await mottaInnsending(db, token, [{ data: await jpeg(), mime: 'image/jpeg' }], { tekst: 'Buss', betaltMed: 'eget' });
    const k2 = await kjop(db, o, 'privat', (await innboks(db, o)).find(r => r.id === neste.id)!.vedlegg_id!);
    expect(await db.tx(t => etterRegistrering(t, o, neste.id, k2.id))).toEqual({ trengerValg: false, tilbake: 'neste_lonn' });
  });

  it('utlegg betalt med en gang fører ned gjelden', async () => {
    const { db, o, a } = await oppsett();
    const { token } = await db.tx(t => lagLenke(t, o, { type: 'ansatt', ansattId: a }));
    const { id } = await mottaInnsending(db, token, [{ data: await jpeg(), mime: 'image/jpeg' }], { tekst: 'Tog', betaltMed: 'eget' });
    const k = await kjop(db, o, 'privat', (await innboks(db, o))[0].vedlegg_id!);
    await db.tx(t => etterRegistrering(t, o, id, k.id));
    await db.tx(t => settTilbake(t, o, id, 'na', false));
    await db.tx(t => betalUtleggNa(t, o, id, '2026-09-12'));
    const sb = saldobalanse(await hentPosteringer(db, o));
    expect(sb.get(2910)?.saldo ?? 0).toBe(0);
    await expect(db.tx(t => betalUtleggNa(t, o, id, '2026-09-12'))).rejects.toThrow('allerede betalt');
  });

  it('firmakort og klientbilag blir bare registrert, avvisning med grunn', async () => {
    const { db, o, a } = await oppsett();
    const ansatt = await db.tx(t => lagLenke(t, o, { type: 'ansatt', ansattId: a }));
    const { id } = await mottaInnsending(db, ansatt.token, [{ data: await jpeg(), mime: 'image/jpeg' }], { tekst: 'Lunsj', betaltMed: 'firma' });
    const k = await kjop(db, o, 'bank', (await innboks(db, o))[0].vedlegg_id!);
    expect(await db.tx(t => etterRegistrering(t, o, id, k.id))).toEqual({ trengerValg: false, tilbake: null });
    const klient = await db.tx(t => lagLenke(t, o, { type: 'klient', navn: 'Butikken AS', epost: 'post@butikken.no' }));
    const kb = await mottaInnsending(db, klient.token, [{ data: await jpeg(), mime: 'image/jpeg' }]);
    await expect(db.tx(t => avvis(t, o, kb.id, ' '))).rejects.toThrow('Skriv hvorfor');
    await db.tx(t => avvis(t, o, kb.id, 'Uskarpt bilde'));
    expect((await innboks(db, o)).find(r => r.id === kb.id)).toMatchObject({ status: 'avvist', avvist_grunn: 'Uskarpt bilde', fra_navn: 'Butikken AS' });
    // Ny lenke til samme ansatt gjør den gamle ugyldig
    await db.tx(t => lagLenke(t, o, { type: 'ansatt', ansattId: a }));
    expect(await hentLenke(db, ansatt.token)).toBeNull();
  });

  it('avviser feil filtype og for mange sider', async () => {
    const { db, o } = await oppsett();
    const { token } = await db.tx(t => lagLenke(t, o, { type: 'klient', navn: 'X' }));
    await expect(mottaInnsending(db, token, [{ data: new Uint8Array([1, 2]), mime: 'text/html' }])).rejects.toThrow('bilde eller PDF');
    await expect(mottaInnsending(db, token, Array.from({ length: 11 }, () => ({ data: new Uint8Array([1]), mime: 'image/jpeg' })))).rejects.toThrow('Maks 10');
  });
});
