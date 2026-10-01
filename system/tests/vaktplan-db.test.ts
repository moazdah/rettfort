import { describe, it, expect, beforeAll } from 'vitest';
import { nyTestDb, type Db } from '@/lib/db';
import { lagTestfirma } from '@/lib/db/eksempel';
import * as V from '@/lib/tjenester/vaktplan';

let db: Db, org: string, sara: string, jonas: string;
beforeAll(async () => {
  db = await nyTestDb();
  const b = (await db.en<{ id: string }>(`insert into bruker (epost, navn, passord_hash, epost_bekreftet) values ('leder@example.com', 'Kari Leder', 'x', true) returning id`))!.id;
  org = await lagTestfirma(db, b, 'Kari', '2026-09-29');
  sara = await V.lagreVaktAnsatt(db, org, { navn: 'Sara Vakt', kontakt: 'sara@example.com', lonnType: 'fast', stillingsprosent: 100, sats: 4500000 });
  jonas = await V.lagreVaktAnsatt(db, org, { navn: 'Jonas Deltid', kontakt: '+47 900 00 000', lonnType: 'time', stillingsprosent: 60, sats: 25000 });
}, 180000);

describe('vaktplan i databasen', () => {
  it('ansatte fra vaktplanen er de samme som i Lønn', async () => {
    expect(await db.en('select 1 from ansatt where id = $1 and lonn_type = $2 and timesats = 25000', [jonas, 'time'])).toBeTruthy();
    await expect(V.lagreVaktAnsatt(db, org, { navn: 'X Y', kontakt: 'ikke gyldig', lonnType: 'fast', stillingsprosent: 100, sats: 0 })).rejects.toThrow(/mobilnummer/);
  });

  it('lagrer vakter med advarsler, publiserer og merker endringer', async () => {
    const a = await V.lagreVakt(db, org, { ansattId: sara, dato: '2026-10-05', start: '07:00', slutt: '15:00' });
    expect(a.advarsler).toEqual([]);
    const b = await V.lagreVakt(db, org, { ansattId: sara, dato: '2026-10-05', start: '15:00', slutt: '20:00' });
    expect(b.advarsler.join(' ')).toMatch(/allerede en vakt/);
    await V.slettVakt(db, org, b.id);
    const p = await V.publiser(db, org, 2026, 41);
    expect(p.forste).toBe(true);
    expect(p.varsle).toEqual([sara]);
    expect(await V.ukeStatus(db, org, 2026, 41)).toBe('publisert');
    await expect(V.publiser(db, org, 2026, 41)).rejects.toThrow(/allerede publisert/);
    await V.lagreVakt(db, org, { ansattId: jonas, dato: '2026-10-06', start: '10:00', slutt: '18:00' });
    expect(await V.ukeStatus(db, org, 2026, 41)).toBe('endret');
    const p2 = await V.publiser(db, org, 2026, 41);
    expect(p2).toEqual({ varsle: [jonas], forste: false });
  });

  it('fri godkjent gjør vakten ledig, og tildeling tømmer interessen', async () => {
    const r = await V.settTilgjengelig(db, org, sara, '2026-10-05', 'kan_ikke', 'Tannlege');
    expect(r.friForesporsel).toBe(true);
    expect(await V.antallForesporsler(db, org, '2026-10-01')).toBe(1);
    const [f] = await V.friForesporsler(db, org);
    await V.svarFri(db, org, f.id, true);
    const ledig = (await V.vakterMellom(db, org, '2026-10-05', '2026-10-05'))[0];
    expect(ledig.ansattId).toBeNull();
    expect(await V.ukeStatus(db, org, 2026, 41)).toBe('endret');
    await V.settInteresse(db, org, jonas, ledig.id, true);
    const t = await V.trengerSvar(db, org, '2026-10-01');
    expect(t.ledigeMedInteresse[0].interessenter[0].navn).toBe('Jonas Deltid');
    await V.tildel(db, org, ledig.id, jonas);
    const etter = (await V.vakterMellom(db, org, '2026-10-05', '2026-10-05'))[0];
    expect(etter).toMatchObject({ ansattId: jonas, interesse: [] });
    await expect(V.settInteresse(db, org, sara, ledig.id, true)).rejects.toThrow(/ikke ledig/);
  });

  it('bytte bort: leder gjør ledig eller beholder', async () => {
    const v = (await V.vakterMellom(db, org, '2026-10-06', '2026-10-06'))[0];
    await V.byttBort(db, org, jonas, v.id, true);
    expect((await V.trengerSvar(db, org, '2026-10-01')).bytte).toHaveLength(1);
    await V.behold(db, org, v.id);
    expect((await V.trengerSvar(db, org, '2026-10-01')).bytte).toHaveLength(0);
  });

  it('kopierer uke og lager forslag som unngår «kan ikke»', async () => {
    expect(await V.kopierUke(db, org, { aar: 2026, uke: 41 }, { aar: 2026, uke: 42 })).toBe(2);
    await expect(V.kopierUke(db, org, { aar: 2026, uke: 41 }, { aar: 2026, uke: 42 })).rejects.toThrow(/allerede vakter/);
    await V.settTilgjengelig(db, org, jonas, '2026-10-19', 'kan_ikke', 'Eksamen');
    const f = await V.forslagUke(db, org, 2026, 43);
    expect(f.vakter).toHaveLength(2);
    expect(f.ledige).toBe(1);
    expect(f.hensyn.join(' ')).toMatch(/Jonas kan ikke.*Eksamen/);
    expect(await V.lagreForslagUke(db, org, 2026, 43, f.vakter)).toBe(2);
  });

  it('timer fra ferdige uker godkjennes til lønn', async () => {
    const l = await V.ventendeTimelister(db, org, '2026-10-14');
    expect(l[0]).toMatchObject({ aar: 2026, uke: 41 });
    expect(await V.godkjennTimeliste(db, org, 2026, 41)).toBe(1);
    const g = await V.godkjenteTimer(db, org);
    expect(g[jonas].timer).toBe(15);
    expect((await V.ventendeTimelister(db, org, '2026-10-14')).find(x => x.uke === 41)).toBeUndefined();
  });

  it('invitasjon gir en lenke som logger den ansatte inn med rollen ansatt', async () => {
    const i = await V.inviterAnsatt(db, org, sara);
    expect(i.epost).toBe('sara@example.com');
    const r = await V.apneLenke(db, i.token);
    expect(r?.orgId).toBe(org);
    expect(await db.en(`select 1 from medlemskap where bruker_id = $1 and organisasjon_id = $2 and rolle = 'ansatt'`, [r!.brukerId, org])).toBeTruthy();
    expect((await db.en<{ tilgang: string }>('select tilgang from ansatt where id = $1', [sara]))!.tilgang).toBe('aktiv');
    const ny = await V.nyLenke(db, sara);
    expect(await V.apneLenke(db, i.token)).toBeTruthy();
    expect(await V.apneLenke(db, ny)).toBeTruthy();
    expect(await V.apneLenke(db, 'feil')).toBeNull();
  });
});
