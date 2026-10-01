import { describe, it, expect } from 'vitest';
import { nyTestDb } from '@/lib/db';
import { lagTestfirma } from '@/lib/db/eksempel';
import { mineData, slettPlan, slettKonto } from '@/lib/tjenester/konto';
import { hentPosteringer } from '@/lib/tjenester/bokforing';

describe('din konto', () => {
  it('laster ned egne data og sletter kontoen uten å røre regnskapet', async () => {
    const db = await nyTestDb();
    const ny = async (e: string) => (await db.en<{ id: string }>(`insert into bruker (epost, navn, passord_hash, epost_bekreftet) values ($1, 'Kari Test', 'x', true) returning id`, [e]))!.id;
    const kari = await ny('kari@example.com');
    const org = await lagTestfirma(db, kari, 'Kari', '2026-09-29');
    await db.q(`insert into ai_samtale (organisasjon_id, bruker_id, tittel, meldinger) values ($1,$2,'Hei','[]')`, [org, kari]);

    const data = await mineData(db, kari);
    expect(data.bruker).toMatchObject({ epost: 'kari@example.com', navn: 'Kari Test' });
    expect(data.tilganger).toHaveLength(1);
    expect(data.samtaler_med_assistenten).toHaveLength(1);

    // Eneste eier, men andre har tilgang: må gi eierskapet videre først.
    const ola = await ny('ola@example.com');
    await db.q(`insert into medlemskap (bruker_id, organisasjon_id, rolle) values ($1,$2,'full')`, [ola, org]);
    const p1 = await slettPlan(db, kari);
    expect(p1.kanSlette).toBe(false);
    await expect(db.tx(t => slettKonto(t, kari, '2026-09-29'))).rejects.toThrow(/eneste eier/);

    await db.q(`delete from medlemskap where bruker_id = $1`, [ola]);
    const for_ = (await hentPosteringer(db, org)).length;
    const r = await db.tx(t => slettKonto(t, kari, '2026-09-29'));
    expect(r.foretak).toHaveLength(1);
    const b = await db.en<{ epost: string; navn: string; passord_hash: string }>('select epost, navn, passord_hash from bruker where id = $1', [kari]);
    expect(b).toMatchObject({ navn: 'Slettet bruker', passord_hash: '!' });
    expect(b!.epost).toMatch(/@slettet\.invalid$/);
    expect(await db.en('select 1 from medlemskap where bruker_id = $1', [kari])).toBeNull();
    expect(await db.en('select 1 from ai_samtale where bruker_id = $1', [kari])).toBeNull();
    // Regnskapet er urørt og merket for sletting når oppbevaringsplikten er ute.
    expect((await hentPosteringer(db, org)).length).toBe(for_);
    expect((await db.en<{ d: string }>('select slettes_etter::text as d from organisasjon where id = $1', [org]))!.d).toBe('2032-01-01');
    // Samme e-post kan registreres på nytt.
    await ny('kari@example.com');
  }, 180000);
});
