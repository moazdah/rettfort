import { describe, it, expect, beforeAll } from 'vitest';
import { nyTestDb, type Db } from '@/lib/db';
import { lagreSalg, sendSalg, registrerBetaling, krediter, hentSalg, mangler, hentOrg } from '@/lib/tjenester/faktura';
import { registrerKjop, kontrollerKjop, finnDuplikat, betalKjop, finnEllerLagKontakt, lagreKjopUtkast } from '@/lib/tjenester/kjop';
import { hentPosteringer } from '@/lib/tjenester/bokforing';
import { balanse, saldobalanse, mvaMelding, resultatregnskap } from '@/lib/rapporter';
import { gyldigKid } from '@/lib/kid';

let db: Db, org: string, kunde: string;

beforeAll(async () => {
  db = await nyTestDb();
  org = (await db.en<{ id: string }>(`insert into organisasjon (type, navn, orgnr, adresse, postnr, poststed, kontonr) values ('selskap','Havøy Fisk AS','912345688','Strandveien 12','9008','Tromsø','15062233445') returning id`))!.id;
  kunde = await db.tx(t => finnEllerLagKontakt(t, org, 'kunde', 'Kvam Transport AS', '923456783', { adresse: 'Kvamsveien 1', postnr: '5600', poststed: 'Norheimsund' }));
});

const linje = (pris: number, antall = 1, sats = 25) => ({ beskrivelse: 'Konsulenttimer', antallMilli: antall * 1000, pris, sats });

describe('salg', () => {
  it('finner mangler etter bokføringsforskriften § 5-1-1', async () => {
    const o = await db.tx(t => hentOrg(t, org));
    expect(mangler({ ...o, orgnr: null }, null, { type: 'faktura', kontaktId: null, dato: '2026-10-05', linjer: [] })).toEqual(expect.arrayContaining(['Org.nr mangler. Hent det fra Brønnøysund under Innstillinger.', 'Velg hvem som skal betale.', 'Legg til minst én linje med beløp.', 'Forfallsdato mangler.']));
    expect(mangler({ ...o, orgnr: '912345678' }, null, { type: 'faktura', kontaktId: null, dato: '2026-10-05', linjer: [linje(100)] })).toContain('Org.nr er ugyldig.');
  });
  it('sender faktura: løpende nummer, gyldig KID, riktig føring', async () => {
    const id1 = await db.tx(t => lagreSalg(t, org, { type: 'faktura', kontaktId: kunde, dato: '2026-10-05', forfall: '2026-10-19', linjer: [linje(115000, 12)] }));
    const r1 = await db.tx(t => sendSalg(t, org, id1));
    expect(r1.nr).toBe(10001);
    expect(gyldigKid(r1.kid!)).toBe(true);
    const id2 = await db.tx(t => lagreSalg(t, org, { type: 'faktura', kontaktId: kunde, dato: '2026-10-06', forfall: '2026-10-20', linjer: [linje(50000)] }));
    const r2 = await db.tx(t => sendSalg(t, org, id2));
    expect(r2.nr).toBe(10002);
    await expect(db.tx(t => sendSalg(t, org, id2))).rejects.toThrow(/allerede sendt/);
    const f = await db.tx(t => hentSalg(t, org, id1));
    expect(f!.total).toBe(1725000);
    const sb = saldobalanse(await hentPosteringer(db, org));
    expect(sb.get(1500)!.saldo).toBe(1725000 + 62500);
  });
  it('sendt faktura kan ikke endres', async () => {
    const f = (await db.q<{ id: string }>(`select id from faktura where nr = 10001`))[0];
    await expect(db.tx(t => lagreSalg(t, org, { id: f.id, type: 'faktura', kontaktId: kunde, dato: '2026-10-05', forfall: '2026-10-19', linjer: [linje(1)] }))).rejects.toThrow(/Bare utkast/);
  });
  it('delbetaling og full betaling', async () => {
    const f = (await db.q<{ id: string }>(`select id from faktura where nr = 10001`))[0];
    expect((await db.tx(t => registrerBetaling(t, org, f.id, 1000000, '2026-10-10'))).status).toBe('delvis_betalt');
    await expect(db.tx(t => registrerBetaling(t, org, f.id, 800000, '2026-10-11'))).rejects.toThrow(/gjenstår bare/);
    expect((await db.tx(t => registrerBetaling(t, org, f.id, 725000, '2026-10-12'))).status).toBe('betalt');
  });
  it('kreditnota for hele fakturaen nuller kundefordringen', async () => {
    const f = (await db.q<{ id: string }>(`select id from faktura where nr = 10002`))[0];
    const k = await db.tx(t => krediter(t, org, f.id, { grunn: 'Feil pris', dato: '2026-10-07' }));
    expect(k.nr).toBe(10003);
    const orig = await db.tx(t => hentSalg(t, org, f.id));
    expect(orig!.status).toBe('kreditert');
    expect(saldobalanse(await hentPosteringer(db, org)).get(1500)?.saldo ?? 0).toBe(0);
    await expect(db.tx(t => krediter(t, org, f.id, { grunn: 'x', dato: '2026-10-07' }))).rejects.toThrow(/allerede kreditert/);
  });
  it('delkreditering fordeler på satser og går i null', async () => {
    const id = await db.tx(t => lagreSalg(t, org, { type: 'faktura', kontaktId: kunde, dato: '2026-10-08', forfall: '2026-10-22', linjer: [linje(100000, 1, 25), linje(100000, 1, 15)] }));
    await db.tx(t => sendSalg(t, org, id));
    await db.tx(t => krediter(t, org, id, { belop: 50000, grunn: 'Rabatt', dato: '2026-10-09' }));
    const rest = saldobalanse(await hentPosteringer(db, org)).get(1500)!.saldo;
    expect(Math.abs(rest - (240000 - 50000))).toBeLessThanOrEqual(1);
    expect(balanse(await hentPosteringer(db, org), '2026-12-31').differanse).toBe(0);
  });
  it('kvittering (betalt nå) går rett i banken, tilbud føres ikke', async () => {
    const k = await db.tx(t => lagreSalg(t, org, { type: 'kvittering', kontaktId: kunde, dato: '2026-10-10', linjer: [linje(20000)] }));
    const r = await db.tx(t => sendSalg(t, org, k));
    expect(r.kid).toBeNull();
    const tilbud = await db.tx(t => lagreSalg(t, org, { type: 'tilbud', kontaktId: kunde, dato: '2026-10-10', linjer: [linje(999900)] }));
    const rt = await db.tx(t => sendSalg(t, org, tilbud));
    expect(rt.bilagNr).toBeNull();
    expect(rt.nr).toBe(1);
  });
});

describe('kjøp', () => {
  it('kontrollen finner feil MVA, duplikat og manglende MVA-registrering', () => {
    const base = { leverandorNavn: 'Nordlys Kontor AS', dato: '2026-10-01', total: 44900, mva: 11225, sats: 25, konto: 6800, betaltMed: 'bank' as const };
    const f = kontrollerKjop(base, { orgMvaRegistrert: true, mvaRegistrertLeverandor: false, duplikat: { nr: 7, dato: '2026-10-01' }, finnesLeverandor: false });
    const koder = f.map(x => x.kode);
    expect(koder).toEqual(expect.arrayContaining(['mva_sum', 'ikke_mva_reg', 'duplikat', 'ny_leverandor']));
    expect(kontrollerKjop({ ...base, mva: 8980 }, { orgMvaRegistrert: true }).map(x => x.kode)).not.toContain('mva_sum');
  });
  it('registrerer, finner duplikat og betaler', async () => {
    const k = { leverandorNavn: 'Telenor Norge AS', leverandorOrgnr: '976967631', dato: '2026-10-01', total: 44900, mva: 8980, sats: 25, konto: 6900, betaltMed: 'ubetalt' as const, tekst: 'mobilabonnement' };
    const r = await db.tx(t => registrerKjop(t, org, k));
    expect(r.bilagNr).toBeGreaterThan(0);
    const d = await db.tx(t => finnDuplikat(t, org, 'telenor norge as', 44900, '2026-10-01'));
    expect(d!.nr).toBe(r.bilagNr);
    await db.tx(t => betalKjop(t, org, r.id, '2026-10-15'));
    await expect(db.tx(t => betalKjop(t, org, r.id, '2026-10-15'))).rejects.toThrow(/allerede betalt/);
    expect(saldobalanse(await hentPosteringer(db, org)).get(2400)?.saldo ?? 0).toBe(0);
  });
  it('delt kjøp og utkast', async () => {
    const u = await db.tx(t => lagreKjopUtkast(t, org, { leverandorNavn: 'Jula', dato: '2026-10-02', total: 0, mva: 0, sats: 25, konto: 6500, betaltMed: 'bank' }));
    const r = await db.tx(t => registrerKjop(t, org, { id: u, leverandorNavn: 'Jula', dato: '2026-10-02', total: 30000, mva: 0, sats: 25, konto: 6500, betaltMed: 'bank', deler: [{ konto: 6500, brutto: 20000, sats: 25 }, { konto: 5910, brutto: 10000, sats: 15 }] }));
    const s = await db.en<{ status: string }>('select status from kjop where id = $1', [r.id]);
    expect(s!.status).toBe('betalt');
    await expect(db.tx(t => registrerKjop(t, org, { leverandorNavn: 'Jula', dato: '2026-10-02', total: 30000, mva: 0, sats: 25, konto: 6500, betaltMed: 'bank', deler: [{ konto: 6500, brutto: 20000, sats: 25 }] }))).rejects.toThrow(/summerer ikke/);
  });
  it('rapportene stemmer etter hele flyten', async () => {
    const rader = await hentPosteringer(db, org);
    expect(balanse(rader, '2026-12-31').differanse).toBe(0);
    const m = mvaMelding(rader, '2026-09-01', '2026-10-31');
    const sb = saldobalanse(rader, '2026-09-01', '2026-10-31');
    expect(m.aBetale).toBe(-((sb.get(2700)?.saldo ?? 0) + (sb.get(2710)?.saldo ?? 0)));
    const res = resultatregnskap(rader, '2026-01-01', '2026-12-31');
    expect(res.inntekter).toBeGreaterThan(0);
  });
});
