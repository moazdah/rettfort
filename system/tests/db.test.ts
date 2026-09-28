import { describe, it, expect, beforeAll } from 'vitest';
import { nyTestDb, type Db } from '@/lib/db';
import { bokfor, korriger, hentPosteringer, laasPeriode } from '@/lib/tjenester/bokforing';
import { byggKjop, byggFaktura } from '@/lib/hovedbok';
import { balanse, resultatregnskap } from '@/lib/rapporter';

let db: Db;
let org: string;

beforeAll(async () => {
  db = await nyTestDb();
  const o = await db.en<{ id: string }>(`insert into organisasjon (type, navn, orgnr) values ('selskap','Test AS','912345678') returning id`);
  org = o!.id;
});

describe('database og hovedbok', () => {
  it('fører bilag med løpende nummer', async () => {
    const a = await db.tx(t => bokfor(t, org, { dato: '2026-01-10', type: 'kjop' }, byggKjop({ linjer: [{ konto: 6800, brutto: 12500, sats: 25 }], betaltMed: 'bank', mvaRegistrert: true })));
    const b = await db.tx(t => bokfor(t, org, { dato: '2026-01-11', type: 'faktura' }, byggFaktura({ linjer: [{ beskrivelse: 'x', antallMilli: 1000, pris: 100000, sats: 25 }], mvaRegistrert: true, kontaktId: null })));
    expect(b.nr).toBe(a.nr + 1);
  });
  it('databasen stopper posteringer som ikke går i null, selv uten koden', async () => {
    await expect(db.tx(async t => {
      const b = await t.en<{ id: string }>(`insert into bilag (organisasjon_id, nr, dato, type) values ($1, 9999, '2026-02-01', 'manuell') returning id`, [org]);
      await t.q(`insert into postering (bilag_id, organisasjon_id, linje, dato, konto, debet, kredit) values ($1,$2,1,'2026-02-01',1920,100,0)`, [b!.id, org]);
      await t.q(`insert into postering (bilag_id, organisasjon_id, linje, dato, konto, debet, kredit) values ($1,$2,2,'2026-02-01',3000,0,99)`, [b!.id, org]);
    })).rejects.toThrow(/går ikke i null/);
    const n = await db.en<{ n: number }>('select count(*)::int as n from bilag where nr = 9999');
    expect(n!.n).toBe(0);
  });
  it('posteringer kan ikke endres eller slettes', async () => {
    await expect(db.q('update postering set debet = debet + 1 where organisasjon_id = $1', [org])).rejects.toThrow(/kan ikke endres/);
    await expect(db.q('delete from postering where organisasjon_id = $1', [org])).rejects.toThrow(/kan ikke endres/);
    await expect(db.q('delete from bilag where organisasjon_id = $1', [org])).rejects.toThrow();
  });
  it('korrigering lager motpostering og nuller ut', async () => {
    const a = await db.tx(t => bokfor(t, org, { dato: '2026-03-05', type: 'kjop' }, byggKjop({ linjer: [{ konto: 6540, brutto: 99900, sats: 25 }], betaltMed: 'bank', mvaRegistrert: true })));
    const foer = resultatregnskap(await hentPosteringer(db, org), '2026-01-01', '2026-12-31').resultat;
    await db.tx(t => korriger(t, org, a.id, '2026-03-06'));
    const etter = resultatregnskap(await hentPosteringer(db, org), '2026-01-01', '2026-12-31').resultat;
    expect(etter - foer).toBe(79920);
    await expect(db.tx(t => korriger(t, org, a.id, '2026-03-07'))).rejects.toThrow(/allerede korrigert/);
  });
  it('låst periode kan ikke få nye bilag, verken via koden eller direkte i databasen', async () => {
    await db.tx(t => laasPeriode(t, org, '2026-02-28', 'MVA sendt'));
    await expect(db.tx(t => bokfor(t, org, { dato: '2026-02-15', type: 'kjop' }, byggKjop({ linjer: [{ konto: 6800, brutto: 100, sats: 25 }], betaltMed: 'bank', mvaRegistrert: true })))).rejects.toThrow(/låst/);
    await expect(db.q(`insert into bilag (organisasjon_id, nr, dato, type) values ($1, 8888, '2026-01-20', 'manuell')`, [org])).rejects.toThrow(/låst/);
    const ok = await db.tx(t => bokfor(t, org, { dato: '2026-03-01', type: 'kjop' }, byggKjop({ linjer: [{ konto: 6800, brutto: 100, sats: 25 }], betaltMed: 'bank', mvaRegistrert: true })));
    expect(ok.nr).toBeGreaterThan(0);
  });
  it('mislykket transaksjon gir ikke hull i bilagsnummer', async () => {
    const foer = await db.en<{ n: number }>('select neste_bilagsnr as n from organisasjon where id = $1', [org]);
    await expect(db.tx(async t => {
      await bokfor(t, org, { dato: '2026-04-01', type: 'kjop' }, byggKjop({ linjer: [{ konto: 6800, brutto: 100, sats: 25 }], betaltMed: 'bank', mvaRegistrert: true }));
      throw new Error('avbrutt');
    })).rejects.toThrow('avbrutt');
    const etter = await db.en<{ n: number }>('select neste_bilagsnr as n from organisasjon where id = $1', [org]);
    expect(etter!.n).toBe(foer!.n);
    const nr = (await db.q<{ nr: number }>('select nr from bilag where organisasjon_id = $1 order by nr', [org])).map(x => x.nr);
    nr.forEach((v, i) => expect(v).toBe(i + 1));
  });
  it('balansen går opp etter alt dette', async () => {
    expect(balanse(await hentPosteringer(db, org), '2026-12-31').differanse).toBe(0);
  });
});
