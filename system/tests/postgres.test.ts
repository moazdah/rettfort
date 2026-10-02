// Kjøres mot en ekte Postgres når RF_PG_URL er satt (f.eks. lokal Postgres med Supabase-rollene anon og authenticated).
// Uten RF_PG_URL hoppes testen over.
import { describe, it, expect } from 'vitest';

const url = process.env.RF_PG_URL;

describe.skipIf(!url)('ekte Postgres (samme oppsett som Supabase)', () => {
  it('skjema, føring, uforanderlige posteringer og stengt API-tilgang', async () => {
    process.env.POSTGRES_URL = url;
    const { getDb } = await import('@/lib/db');
    const { finnEllerLagKontakt, registrerKjop } = await import('@/lib/tjenester/kjop');
    const db = await getDb();
    expect(db.modus).toBe('postgres');
    const org = (await db.en<{ id: string }>(`insert into organisasjon (type, navn) values ('selskap', 'Pg Test AS') returning id`))!.id;
    await db.tx(t => finnEllerLagKontakt(t, org, 'leverandor', 'Kiwi', null));
    const r = await db.tx(t => registrerKjop(t, org, { leverandorNavn: 'Kiwi', dato: '2026-09-02', total: 16380, mva: 2137, sats: 15, konto: 6800, betaltMed: 'bank', kilde: 'kvittering', lestAutomatisk: true, bekreftetAvBruker: true }));
    expect(r.bilagNr).toBeGreaterThan(0);
    const sum = await db.en<{ d: number; k: number }>('select sum(p.debet)::bigint d, sum(p.kredit)::bigint k from postering p join bilag b on b.id = p.bilag_id where b.organisasjon_id = $1', [org]);
    expect(sum).toEqual({ d: 16380, k: 16380 });
    // Posteringer kan ikke endres.
    await expect(db.q('update postering set debet = debet + 1 where bilag_id in (select id from bilag where organisasjon_id = $1)', [org])).rejects.toThrow();
    // Supabase sitt offentlige API (rollene anon/authenticated) får ikke lese noe.
    for (const rolle of ['anon', 'authenticated']) {
      await expect(db.tx(async t => { await t.q(`set local role ${rolle}`); return t.q('select * from bruker limit 1'); })).rejects.toThrow(/permission denied/);
    }
    const uten = await db.en<{ n: number }>(`select count(*)::int n from pg_tables where schemaname = 'public' and not rowsecurity`);
    expect(uten!.n).toBe(0);
  });
});
