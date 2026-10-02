import { describe, it, expect } from 'vitest';
import { nyTestDb } from '@/lib/db';
import { lagTestfirma, TESTFIRMA_ORGNR } from '@/lib/db/eksempel';
import { hentPosteringer } from '@/lib/tjenester/bokforing';
import { balanse } from '@/lib/rapporter';
import { gyldigOrgnr } from '@/lib/brreg';

describe('testfirma', () => {
  it('fyller et fiktivt firma med fakturaer, kjøp, lønn, MVA og bank', async () => {
    const db = await nyTestDb();
    const b = await db.en<{ id: string }>(`insert into bruker (epost, navn, passord_hash, epost_bekreftet) values ('test@example.com', 'Test Person', 'x', true) returning id`);
    const idag = '2026-09-29';
    const org = await lagTestfirma(db, b!.id, 'Test', idag);
    expect(gyldigOrgnr(TESTFIRMA_ORGNR)).toBe(true);
    expect(balanse(await hentPosteringer(db, org), '2026-12-31').differanse).toBe(0);
    const n = async (sql: string) => Number((await db.en<{ n: number }>(sql, [org]))!.n);
    expect(await n(`select count(*)::int as n from faktura where organisasjon_id = $1 and type = 'faktura'`)).toBe(18);
    expect(await n(`select count(*)::int as n from faktura where organisasjon_id = $1 and status <> 'betalt' and type = 'faktura'`)).toBeGreaterThanOrEqual(3);
    expect(await n(`select count(*)::int as n from lonnskjoring where organisasjon_id = $1`)).toBe(9);
    expect(await n(`select count(*)::int as n from mva_melding where organisasjon_id = $1`)).toBe(3);
    expect(await n(`select count(*)::int as n from bankbevegelse where organisasjon_id = $1`)).toBeGreaterThan(5);
    // Brukeren eier firmaet
    expect(await db.en(`select 1 from medlemskap where bruker_id = $1 and organisasjon_id = $2 and rolle = 'eier'`, [b!.id, org])).toBeTruthy();
    // Kan lages flere ganger for samme bruker
    const org2 = await lagTestfirma(db, b!.id, 'Test', idag);
    expect(org2).not.toBe(org);
  }, 180000);
});
