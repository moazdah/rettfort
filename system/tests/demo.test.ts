import { describe, it, expect } from 'vitest';
import { nyTestDb } from '@/lib/db';
import { seedDemo } from '@/lib/db/demo';
import { hentPosteringer } from '@/lib/tjenester/bokforing';
import { balanse } from '@/lib/rapporter';
import { mvaStatus, aktuellTermin } from '@/lib/tjenester/mva';
import { lesSesjon, opprettSesjon, sjekkPassord } from '@/lib/auth';

describe('eksempeldata', () => {
  it('lager et gyldig regnskap som ligner prototypen', async () => {
    const db = await nyTestDb();
    await seedDemo(db);
    await seedDemo(db); // idempotent
    const org = (await db.en<{ id: string }>(`select id from organisasjon where bilag_slug = 'havoy-fisk'`))!.id;
    expect(balanse(await hentPosteringer(db, org), '2026-12-31').differanse).toBe(0);
    const termin = await db.tx(t => aktuellTermin(t, org, '2026-09-28'));
    expect(termin!.tittel).toBe('MVA for juli–august');
    const s = await db.tx(t => mvaStatus(t, org, termin!));
    expect(s.manglerBilag.map(m => m.belop)).toEqual([-61200, -23900]);
    expect(s.funn.map(f => f.kode)).toContain('ikke_mva_reg');
    const b = await db.en<{ id: string; passord_hash: string }>(`select id, passord_hash from bruker where epost = 'demo@rettfort.no'`);
    expect(await sjekkPassord('rettfort-demo', b!.passord_hash)).toBe(true);
    expect(await sjekkPassord('feil', b!.passord_hash)).toBe(false);
    const { token } = await db.tx(t => opprettSesjon(t, b!.id, org));
    const ses = await lesSesjon(db, token);
    expect(ses!.org!.navn).toBe('Havøy Fisk AS');
    expect(await lesSesjon(db, 'ugyldig')).toBeNull();
    // Byrået ser selskapet via byra_kunde
    const by = await db.en<{ id: string }>(`select id from bruker where epost = 'regnskap@rettfort.no'`);
    const t2 = await db.tx(t => opprettSesjon(t, by!.id, org));
    const s2 = await lesSesjon(db, t2.token);
    expect(s2!.org!.navn).toBe('Havøy Fisk AS');
    expect(s2!.rolle).toBe('regnskapsforer_full');
  }, 120000);
});
