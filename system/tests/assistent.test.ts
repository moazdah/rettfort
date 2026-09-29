import { describe, it, expect } from 'vitest';
import { svar, type Fakta } from '@/lib/assistent';
import { nyTestDb } from '@/lib/db';
import { lagreSalg, sendSalg } from '@/lib/tjenester/faktura';
import { registrerKjop, finnEllerLagKontakt } from '@/lib/tjenester/kjop';
import { bokfor } from '@/lib/tjenester/bokforing';
import { hentFakta } from '@/lib/tjenester/assistent';

const F: Fakta = {
  idag: '2026-10-05', ar: 2026, bank: 10000000,
  kunder: [{ nr: 10010, kunde: 'Kvam Transport AS', forfall: '2026-09-19', rest: 1725000 }, { nr: 10012, kunde: 'Nordlys AS', forfall: '2026-10-20', rest: 500000 }, { nr: 10005, kunde: 'Betalt AS', forfall: '2026-09-01', rest: 0 }],
  leverandorer: [{ navn: 'Telenor', forfall: '2026-10-15', total: 44900 }],
  resultat: { inntekter: 50000000, kostnader: 30000000, resultat: 20000000 }, ifjor: { inntekter: 40000000, kostnader: 25000000, resultat: 15000000 },
  storsteKostnader: [{ navn: 'Lønn', belop: 20000000 }, { navn: 'Husleie', belop: 5000000 }],
  mva: { fra: '2026-09-01', til: '2026-10-31', aBetale: 1234500, sendt: false, mangler: 2 }, skyldigMva: 0, trekk: 144000, aga: 35550,
  frister: [{ dato: '2026-10-15', tittel: 'Skattetrekk og arbeidsgiveravgift' }, { dato: '2026-12-10', tittel: 'MVA-melding' }],
};

describe('assistenten svarer med tall fra regnskapet', () => {
  it('hvem skylder oss: bare åpne poster, forfalte merket, riktig sum', () => {
    const s = svar('Hvem skylder oss penger?', F);
    expect(s.tekst).toContain('22 250,00 kr');
    expect(s.tekst).toContain('Kvam Transport AS, faktura 10010: 17 250,00 kr, forfalt 19.09.2026');
    expect(s.tekst).not.toContain('Betalt AS');
    expect(s.kilder[0].href).toBe('/salg');
  });
  it('bank: saldo og 30-dagers utsikt', () => {
    const s = svar('hvor mye har vi i banken', F);
    expect(s.tekst).toContain('100 000,00 kr');
    expect(s.tekst).toContain('22 250,00 kr inn');
    expect(s.tekst).toContain('2 244,50 kr ut'); // 449 + 1440 + 355,50
  });
  it('MVA, frister, resultat og kostnader', () => {
    expect(svar('Hvor mye moms skal vi betale?', F).tekst).toContain('12 345,00 kr å betale');
    expect(svar('Når er neste frist?', F).tekst).toContain('15.10.2026, om 10 dager');
    const r = svar('Hvordan går det i år?', F).tekst;
    expect(r).toContain('overskudd på 200 000,00 kr');
    expect(r).toContain('50 000,00 kr bedre');
    expect(svar('Hva bruker vi mest penger på?', F).tekst).toContain('Lønn: 200 000,00 kr');
  });
  it('gjetter aldri: ukjente spørsmål får et ærlig svar uten tall', () => {
    const s = svar('Hva blir været i morgen?', F);
    expect(s.tekst).toMatch(/finner jeg ikke svar/);
    expect(s.tekst).not.toMatch(/\d/);
  });
  it('fakta hentes riktig fra en ekte database', async () => {
    const db = await nyTestDb();
    const org = (await db.en<{ id: string }>(`insert into organisasjon (type, navn, orgnr, kontonr, adresse, postnr, poststed) values ('selskap','Test AS','912345688','15062233445','Vei 1','9008','Tromsø') returning id`))!.id;
    await db.tx(t => bokfor(t, org, { dato: '2026-01-01', type: 'apning' }, [{ konto: 1920, debet: 5000000, kredit: 0 }, { konto: 2050, debet: 0, kredit: 5000000 }]));
    const kunde = await db.tx(t => finnEllerLagKontakt(t, org, 'kunde', 'Kvam Transport AS', '923456783', { adresse: 'Vei 2', postnr: '5600', poststed: 'Norheimsund' }));
    const id = await db.tx(t => lagreSalg(t, org, { type: 'faktura', kontaktId: kunde, dato: '2026-09-05', forfall: '2026-09-19', linjer: [{ beskrivelse: 'Timer', antallMilli: 10000, pris: 100000, sats: 25 }] }));
    await db.tx(t => sendSalg(t, org, id));
    await db.tx(t => registrerKjop(t, org, { leverandorNavn: 'Telenor', dato: '2026-09-01', total: 44900, mva: 8980, sats: 25, konto: 6900, betaltMed: 'bank', kilde: 'uten_kvittering' }));
    const f = await hentFakta(db, org, '2026-10-05');
    expect(f.bank).toBe(5000000 - 44900);
    expect(f.kunder.find(k => k.kunde === 'Kvam Transport AS')?.rest).toBe(1250000);
    expect(svar('Hvem skylder oss?', f).tekst).toContain('12 500,00 kr');
  });
});
