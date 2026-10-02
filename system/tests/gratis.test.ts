import { describe, it, expect } from 'vitest';
import { nyTestDb } from '@/lib/db';
import { lagTestfirma } from '@/lib/db/eksempel';
import { gratisBruk, sjekkFakturaGrense, taKvitteringslesing, sendteFakturaer } from '@/lib/tjenester/bruk';
import { harFulltRegnskap, GRATIS_GRENSE } from '@/lib/pakker';

describe('Gratis: kreditter per måned', () => {
  it('teller kvitteringer som leses av, stopper på 5 og starter på nytt neste måned', async () => {
    const db = await nyTestDb();
    const b = (await db.en<{ id: string }>(`insert into bruker (epost, navn, passord_hash, epost_bekreftet) values ('g@example.com','G','x',true) returning id`))!.id;
    const org = await lagTestfirma(db, b, 'G', '2026-10-05');
    const igjen: (number | null)[] = [];
    for (let i = 0; i < GRATIS_GRENSE.kvittering; i++) igjen.push(await db.tx(t => taKvitteringslesing(t, org, 'gratis', '2026-10-05')));
    expect(igjen).toEqual([4, 3, 2, 1, 0]);
    await expect(db.tx(t => taKvitteringslesing(t, org, 'gratis', '2026-10-20'))).rejects.toThrow(/5 kvitteringer denne måneden/);
    expect((await gratisBruk(db, org, '2026-10-20')).kvittering).toBe(5);
    // Ny måned, nye kreditter. Betalt pakke har ingen grense og teller ikke.
    expect(await db.tx(t => taKvitteringslesing(t, org, 'gratis', '2026-11-01'))).toBe(4);
    expect(await db.tx(t => taKvitteringslesing(t, org, 'start', '2026-10-20'))).toBeNull();
  });

  it('stopper den sjette fakturaen i måneden i Gratis, men ikke i Start', async () => {
    const db = await nyTestDb();
    const b = (await db.en<{ id: string }>(`insert into bruker (epost, navn, passord_hash, epost_bekreftet) values ('f@example.com','F','x',true) returning id`))!.id;
    const org = await lagTestfirma(db, b, 'F', '2026-10-05');
    const n = await sendteFakturaer(db, org, '2026-10-05');
    // Fyll opp til grensen med sendte fakturaer denne måneden.
    for (let i = n; i < GRATIS_GRENSE.faktura; i++) {
      await db.q(`insert into faktura (organisasjon_id, type, nr, status, dato, sendt_tid) values ($1, 'faktura', $2, 'sendt', '2026-10-05', '2026-10-05')`, [org, 90000 + i]);
    }
    expect(await sendteFakturaer(db, org, '2026-10-05')).toBeGreaterThanOrEqual(GRATIS_GRENSE.faktura);
    await expect(db.tx(t => sjekkFakturaGrense(t, org, 'gratis', '2026-10-05'))).rejects.toThrow(/5 fakturaer denne måneden/);
    await expect(db.tx(t => sjekkFakturaGrense(t, org, 'start', '2026-10-05'))).resolves.toBeUndefined();
    await expect(db.tx(t => sjekkFakturaGrense(t, org, 'gratis', '2026-11-02'))).resolves.toBeUndefined();
  });

  it('bare Gratis mangler fullt regnskap', () => {
    expect(['gratis', 'start', 'selskap', 'byra'].map(harFulltRegnskap)).toEqual([false, true, true, true]);
  });
});
