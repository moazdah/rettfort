import { describe, it, expect, beforeAll } from 'vitest';
import { nyTestDb, type Db } from '@/lib/db';
import { lagreSalg, sendSalg, hentSalg } from '@/lib/tjenester/faktura';
import { registrerKjop, finnEllerLagKontakt } from '@/lib/tjenester/kjop';
import { importerKontoutskrift, behandleBevegelse, avstemming, merkManedFerdig } from '@/lib/tjenester/bank';
import { mvaStatus, sendMva, terminFor, aktuellTermin } from '@/lib/tjenester/mva';
import { kjorLonn, forhandsvisLonn, beregnLonnslipp, trekkOgAga, agaForKjoring } from '@/lib/tjenester/lonn';
import { kontrollFunn, vurderFunn } from '@/lib/tjenester/kontroll';
import { hentPosteringer, bokfor } from '@/lib/tjenester/bokforing';
import { balanse, saldobalanse } from '@/lib/rapporter';
import { byggKjop } from '@/lib/hovedbok';

let db: Db, org: string, kunde: string;
const kr = (n: number) => String(n.toFixed(2)).replace('.', ',');

beforeAll(async () => {
  db = await nyTestDb();
  org = (await db.en<{ id: string }>(`insert into organisasjon (type, navn, orgnr, adresse, postnr, poststed, kontonr, aga_sone) values ('selskap','Havøy Fisk AS','912345688','Strandveien 12','9008','Tromsø','15062233445','4a') returning id`))!.id;
  kunde = await db.tx(t => finnEllerLagKontakt(t, org, 'kunde', 'Kvam Transport AS', '923456783', { adresse: 'Kvamsveien 1', postnr: '5600', poststed: 'Norheimsund' }));
  // Åpningsbalanse: 100 000 kr i banken
  await db.tx(t => bokfor(t, org, { dato: '2026-08-31', type: 'apning' }, [{ konto: 1920, debet: 10000000, kredit: 0 }, { konto: 2050, debet: 0, kredit: 10000000 }]));
});

describe('en hel termin', () => {
  let fakturaId: string, kid: string;
  it('faktura, kjøp og lønn i september', async () => {
    fakturaId = await db.tx(t => lagreSalg(t, org, { type: 'faktura', kontaktId: kunde, dato: '2026-09-05', forfall: '2026-09-19', linjer: [{ beskrivelse: 'Konsulenttimer', antallMilli: 12000, pris: 115000, sats: 25 }] }));
    kid = (await db.tx(t => sendSalg(t, org, fakturaId))).kid!;
    await db.tx(t => registrerKjop(t, org, { leverandorNavn: 'Telenor Norge AS', dato: '2026-09-01', total: 44900, mva: 8980, sats: 25, konto: 6900, betaltMed: 'bank', vedleggId: null, kilde: 'uten_kvittering' }));
    // Tall lest fra en kvittering kan ikke føres før brukeren har sjekket dem.
    const lestKjop = { leverandorNavn: 'Kiwi', dato: '2026-09-02', total: 16380, mva: 2137, sats: 15, konto: 6800, betaltMed: 'bank' as const, kilde: 'kvittering', lestAutomatisk: true };
    await expect(db.tx(t => registrerKjop(t, org, lestKjop))).rejects.toThrow(/Sjekk tallene/);
    await expect(db.tx(t => registrerKjop(t, org, { ...lestKjop, lestAutomatisk: false }))).rejects.toThrow(/Sjekk tallene/);
    await db.q(`insert into ansatt (organisasjon_id, navn, lonn_type, manedslonn, skatteprosent) values ($1, 'Sara Havøy', 'fast', 4500000, 32)`, [org]);
    const s = await db.tx(t => forhandsvisLonn(t, org, []));
    expect(s[0]).toMatchObject({ brutto: 4500000, skatt: 1440000, netto: 3060000, feriepenger: 459000, aga: 355500 });
    await db.tx(t => kjorLonn(t, org, '2026-09', '2026-09-25', []));
    await expect(db.tx(t => kjorLonn(t, org, '2026-09', '2026-09-25', []))).rejects.toThrow(/allerede kjørt/);
    // Det som skal betales og rapporteres i a-meldingen, er AGA på utbetalt lønn. AGA på avsatte feriepenger
    // (459 000 kr × 7,9 % i sone 4a) forfaller først når feriepengene utbetales.
    expect(await trekkOgAga(db, org, '2026-09-01', '2026-10-31')).toEqual({ skatt: 1440000, aga: 355500 });
    expect(await agaForKjoring(db, org, '2026-09')).toBe(355500);
  });
  it('kontoutskrift: KID-innbetaling, Telenor allerede ført, gebyr og en ukjent post', async () => {
    const csv = [
      'Dato;Forklaring;Ut fra konto;Inn på konto;Saldo',
      `01.09.2026;Telenor;449,00;;99 551,00`,
      `12.09.2026;Innbetaling Kvam Transport ${kid};;17 250,00;116 801,00`,
      `25.09.2026;Lønn Sara;30 600,00;;86 201,00`,
      `30.09.2026;Gebyr;45,00;;86 156,00`,
      `28.09.2026;VIPPS *JOKER;214,50;;85 941,50`,
    ].join('\n');
    const r = await db.tx(t => importerKontoutskrift(t, org, csv, 'sept.csv'));
    expect(r.nye).toBe(5);
    const again = await db.tx(t => importerKontoutskrift(t, org, csv, 'sept.csv'));
    expect(again.nye).toBe(0); // samme fil to ganger gir ingen dobbeltposter
    const bev = await db.q<{ id: string; tekst: string; status: string; forslag: string }>(`select id, tekst, status, forslag from bankbevegelse where organisasjon_id = $1 order by dato`, [org]);
    const f = (tekst: string) => bev.find(b => b.tekst.startsWith(tekst))!;
    const forslag = (tekst: string) => { const x = f(tekst).forslag; return typeof x === 'string' ? JSON.parse(x) : x; };
    expect(forslag('Innbetaling').type).toBe('faktura');
    expect(forslag('Telenor').type).toBe('bokfort');
    expect(forslag('Lønn').type).toBe('bokfort');
    expect(forslag('Gebyr').type).toBe('bankpost');
    expect(forslag('VIPPS').type).toBe('ingen');
    for (const t of ['Innbetaling', 'Telenor', 'Lønn', 'Gebyr']) await db.tx(x => behandleBevegelse(x, org, f(t).id, { type: 'godkjenn' }));
    const fa = await db.tx(t => hentSalg(t, org, fakturaId));
    expect(fa!.status).toBe('betalt');
  });
  it('MVA-steg: VIPPS mangler bilag, så sending er stoppet', async () => {
    const termin = terminFor('2026-09-15', 'tomnd');
    expect(termin).toMatchObject({ fra: '2026-09-01', til: '2026-10-31', frist: '2026-12-10' });
    const s = await db.tx(t => mvaStatus(t, org, termin));
    expect(s.manglerBilag).toHaveLength(1);
    expect(s.tall.utgaende).toBe(345000);
    expect(s.tall.inngaende).toBe(8980);
    expect(s.tall.aBetale).toBe(336020);
    await expect(db.tx(t => sendMva(t, org, termin))).rejects.toThrow(/mangler/);
  });
  it('bank stemmer ikke før VIPPS er ført', async () => {
    const a1 = await db.tx(t => avstemming(t, org, '2026-09'));
    expect(a1.stemmer).toBe(false);
    await expect(db.tx(t => merkManedFerdig(t, org, '2026-09'))).rejects.toThrow(/ikke avstemt/);
    // Brukeren tar bilde av kvitteringen: kjøp registreres, og bevegelsen matches mot det bokførte kjøpet
    await db.tx(t => registrerKjop(t, org, { leverandorNavn: 'Joker Brønnøy', dato: '2026-09-28', total: 21450, mva: 2798, sats: 15, konto: 5910, betaltMed: 'bank', kilde: 'uten_kvittering' }));
    const vipps = (await db.q<{ id: string; forslag: string }>(`select id, forslag from bankbevegelse where tekst like 'VIPPS%'`))[0];
    await db.tx(t => behandleBevegelse(t, org, vipps.id, { type: 'godkjenn' }));
    const a2 = await db.tx(t => avstemming(t, org, '2026-09'));
    expect(a2.regnskap).toBe(8594150);
    expect(a2.bank).toBe(8594150);
    expect(a2.stemmer).toBe(true);
    await db.tx(t => merkManedFerdig(t, org, '2026-09'));
    await expect(db.tx(t => registrerKjop(t, org, { leverandorNavn: 'Sen kvittering', dato: '2026-09-30', total: 100, mva: 0, sats: 0, konto: 6800, betaltMed: 'bank' }))).rejects.toThrow(/låst/);
  });
  it('sender MVA-meldingen når alt er på plass, og låser terminen', async () => {
    const termin = terminFor('2026-09-15', 'tomnd');
    const s = await db.tx(t => mvaStatus(t, org, termin));
    expect(s.antallMangler).toBe(0);
    // Kantinekjøpet (5910) gir ikke fradrag, så inngående MVA er fortsatt bare Telenor
    expect(s.tall.inngaende).toBe(8980);
    const r = await db.tx(t => sendMva(t, org, termin));
    expect(r.aBetale).toBe(336020);
    const sb = saldobalanse(await hentPosteringer(db, org));
    expect(sb.get(2700)?.saldo ?? 0).toBe(0);
    expect(sb.get(2710)?.saldo ?? 0).toBe(0);
    expect(sb.get(2740)!.saldo).toBe(-336020);
    await expect(db.tx(t => sendMva(t, org, termin))).rejects.toThrow(/allerede sendt/);
    expect(balanse(await hentPosteringer(db, org), '2026-12-31').differanse).toBe(0);
    const neste = await db.tx(t => aktuellTermin(t, org, '2026-11-05'));
    expect(neste!.fra).toBe('2026-11-01');
  });
  it('kontrollen finner fradrag fra leverandør utenfor MVA-registeret', async () => {
    const lev = await db.tx(t => finnEllerLagKontakt(t, org, 'leverandor', 'Uregistrert Snekker', null, { mvaRegistrert: false }));
    await db.tx(t => registrerKjop(t, org, { leverandorNavn: 'Uregistrert Snekker', kontaktId: lev, dato: '2026-11-03', total: 12500, mva: 2500, sats: 25, konto: 6600, betaltMed: 'bank' }));
    const f = await db.tx(t => kontrollFunn(t, org, '2026-11-01', '2026-12-31'));
    const funn = f.find(x => x.kode === 'ikke_mva_reg')!;
    expect(funn.alvor).toBe('hoy');
    await db.tx(t => vurderFunn(t, org, funn.id, 'Sjekket'));
    expect((await db.tx(t => kontrollFunn(t, org, '2026-11-01', '2026-12-31'))).find(x => x.kode === 'ikke_mva_reg')).toBeUndefined();
  });
  it('lønnsslipp: timelønn og tillegg', () => {
    const s = beregnLonnslipp({ id: 'a', navn: 'Per', lonn_type: 'time', manedslonn: 0, timesats: 25000, skatteprosent: 25 }, { ansattId: 'a', timer: 162.5, tillegg: [{ tekst: 'Bonus', belop: 500000 }] }, 10.2, 14.1);
    expect(s.brutto).toBe(4062500 + 500000);
    expect(s.skatt).toBe(1140600); // 25 % av 45 625 = 11 406,25 → 11 406 kr
    expect(s.feriepenger).toBe(Math.round(4562500 * 0.102));
    expect(beregnLonnslipp({ id: 'a', navn: 'Per', lonn_type: 'time', manedslonn: 0, timesats: 25000, skatteprosent: 25 }, { ansattId: 'a', timer: 300 }, 10.2, 14.1).advarsler).toHaveLength(1);
  });
});
void byggKjop; void kr;
