import { describe, it, expect } from 'vitest';
import { beregnLonnslipp, grunntimesats } from '@/lib/tjenester/lonn';
import { nyTestDb } from '@/lib/db';

const base = { id: 'a', navn: 'Test', manedslonn: 0, timesats: 0, skatteprosent: 30 };

describe('lønnsformer', () => {
  it('provisjon med fastlønn i bunn', () => {
    const s = beregnLonnslipp({ ...base, lonn_type: 'provisjon', manedslonn: 2000000, provisjon_prosent: 10 }, { ansattId: 'a', provisjonGrunnlag: 15000000 }, 10.2, 14.1);
    expect(s.linjer.map(l => l.belop)).toEqual([2000000, 1500000]);
    expect(s.brutto).toBe(3500000);
    expect(s.feriepenger).toBe(357000);
    expect(s.skatt).toBe(1050000);
  });
  it('bare provisjon, uten salg gir ingen lønn', () => {
    const s = beregnLonnslipp({ ...base, lonn_type: 'provisjon', provisjon_prosent: 12.5 }, { ansattId: 'a' }, 10.2, 14.1);
    expect(s.brutto).toBe(0);
  });
  it('overtid for fastlønnet regnes fra månedslønn / 162,5 timer', () => {
    const a = { ...base, lonn_type: 'fast' as const, manedslonn: 4875000, overtid_prosent: 40 };
    expect(grunntimesats(a)).toBe(30000);
    const s = beregnLonnslipp(a, { ansattId: 'a', overtidTimer: 10 }, 10.2, 14.1);
    expect(s.linjer[1]).toMatchObject({ antall: 10, sats: 42000, belop: 420000 });
    expect(s.brutto).toBe(5295000);
  });
  it('overtid for timelønnet, og faste tillegg med og uten feriepenger', () => {
    const s = beregnLonnslipp({ ...base, lonn_type: 'time', timesats: 25000, overtid_prosent: 50, faste_tillegg: JSON.stringify([{ tekst: 'Skifttillegg', belop: 100000 }, { tekst: 'Telefon', belop: 50000, feriepengegrunnlag: false }]) }, { ansattId: 'a', timer: 100, overtidTimer: 4 }, 10, 14.1);
    expect(s.linjer.map(l => l.tekst)).toEqual(['Timelønn', 'Overtid (50 % tillegg)', 'Skifttillegg', 'Telefon']);
    expect(s.brutto).toBe(2500000 + 150000 + 100000 + 50000);
    expect(s.feriepenger).toBe(Math.round((2500000 + 150000 + 100000) * 0.1));
  });
  it('nye kolonner finnes etter migrering, og provisjon er lov lønnstype', async () => {
    const db = await nyTestDb();
    const o = await db.en<{ id: string }>(`insert into organisasjon (type, navn) values ('selskap','X') returning id`);
    await db.q(`insert into ansatt (organisasjon_id, navn, lonn_type, provisjon_prosent, faste_tillegg) values ($1,'P','provisjon',10,'[{"tekst":"A","belop":100}]')`, [o!.id]);
    const a = await db.en<{ provisjon_prosent: number; overtid_prosent: number; stillingsprosent: number; faste_tillegg: unknown }>('select * from ansatt where organisasjon_id = $1', [o!.id]);
    expect([a!.provisjon_prosent, a!.overtid_prosent, a!.stillingsprosent].map(Number)).toEqual([10, 40, 100]);
    expect(Array.isArray(a!.faste_tillegg)).toBe(true);
  });
});

describe('kundeinfo på sendte fakturaer', () => {
  it('endring på kunden påvirker ikke fakturaer som er sendt', async () => {
    const { lagreSalg, sendSalg, hentSalg } = await import('@/lib/tjenester/faktura');
    const { finnEllerLagKontakt } = await import('@/lib/tjenester/kjop');
    const db = await nyTestDb();
    const o = await db.en<{ id: string }>(`insert into organisasjon (type, navn, orgnr, adresse, postnr, poststed, kontonr, mva_registrert) values ('selskap','X AS','315000009','Vei 1','0150','Oslo','12345600009',true) returning id`);
    const k = await db.tx(t => finnEllerLagKontakt(t, o!.id, 'kunde', 'Gammel AS', '315000017', { adresse: 'Gammelvei 1', postnr: '0150', poststed: 'Oslo', epost: 'gammel@x.no' }));
    const f = await db.tx(t => lagreSalg(t, o!.id, { type: 'faktura', kontaktId: k, dato: '2026-09-01', forfall: '2026-09-15', linjer: [{ beskrivelse: 'Arbeid', antallMilli: 1000, pris: 100000, sats: 25 }] }));
    await db.tx(t => sendSalg(t, o!.id, f));
    await db.q(`update kontakt set navn = 'Ny AS', epost = 'ny@x.no', adresse = 'Nyvei 2' where id = $1`, [k]);
    const s = await db.tx(t => hentSalg(t, o!.id, f));
    expect(s!.kunde).toMatchObject({ navn: 'Gammel AS', adresse: 'Gammelvei 1', epost: 'ny@x.no' });
    const u = await db.tx(t => lagreSalg(t, o!.id, { type: 'faktura', kontaktId: k, dato: '2026-09-02', forfall: '2026-09-16', linjer: [{ beskrivelse: 'Arbeid', antallMilli: 1000, pris: 100000, sats: 25 }] }));
    expect((await db.tx(t => hentSalg(t, o!.id, u)))!.kunde).toMatchObject({ navn: 'Ny AS', epost: 'ny@x.no' });
  });
});
