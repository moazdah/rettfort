import { describe, it, expect, beforeAll } from 'vitest';
import { nyTestDb, type Db } from '@/lib/db';
import { lagTestfirma } from '@/lib/db/eksempel';
import * as V from '@/lib/tjenester/vaktplan';
import { STANDARD_INNSTILLINGER, lesInnstillinger, erStandard, byttKnapp } from '@/lib/vaktplan-innstillinger';

let db: Db, org: string, sara: string, jonas: string, emma: string;
beforeAll(async () => {
  db = await nyTestDb();
  const b = (await db.en<{ id: string }>(`insert into bruker (epost, navn, passord_hash, epost_bekreftet) values ('kari@example.com', 'Kari Lund', 'x', true) returning id`))!.id;
  org = await lagTestfirma(db, b, 'Kari', '2026-09-29');
  sara = await V.nyAnsatt(db, org, { navn: 'Sara Nilsen', epost: 'sara@example.com', stilling: 'Skiftleder', lonnType: 'fast', stillingsprosent: 100 });
  jonas = await V.nyAnsatt(db, org, { navn: 'Jonas Berg', epost: 'jonas@example.com', lonnType: 'fast', stillingsprosent: 60 });
  emma = await V.nyAnsatt(db, org, { navn: 'Emma Lie', epost: 'emma@example.com', lonnType: 'time', stillingsprosent: 100 });
}, 180000);

describe('innstillinger', () => {
  it('standard, sammenslåing og knappetekst', async () => {
    expect(erStandard(lesInnstillinger(null))).toBe(true);
    const s = lesInnstillinger({ ot: { day: 99, week: 37.5 }, swap: { on: false } });
    expect(s.ot).toMatchObject({ day: 13, week: 37.5, add: 40 });
    expect(byttKnapp(s)).toBe('Gi bort vakt');
    const lagret = await V.lagreInnstillinger(db, org, { ...STANDARD_INNSTILLINGER, ot: { ...STANDARD_INNSTILLINGER.ot, add: 50 } });
    expect(lagret.ot.add).toBe(50);
    expect((await V.innstillinger(db, org)).ot.add).toBe(50);
    expect(await V.lagreSteder(db, org, [' Sentrum ', 'Brygga', 'Sentrum'])).toEqual(['Sentrum', 'Brygga']);
  });
  it('invitasjon: feil og dobbel e-post', async () => {
    await expect(V.nyAnsatt(db, org, { navn: '', epost: 'x@y.no', lonnType: 'time', stillingsprosent: 100 })).rejects.toThrow('Skriv inn navnet til den ansatte.');
    await expect(V.nyAnsatt(db, org, { navn: 'A B', epost: 'feil', lonnType: 'time', stillingsprosent: 100 })).rejects.toThrow('Skriv inn en gyldig e-postadresse.');
    await expect(V.nyAnsatt(db, org, { navn: 'A B', epost: 'SARA@example.com', lonnType: 'time', stillingsprosent: 100 })).rejects.toThrow('Denne e-postadressen er allerede i bruk.');
  });
});

describe('publisering og det de ansatte ser', () => {
  it('endringer etter publisering vises ikke før neste publisering', async () => {
    const a = await V.lagreVakt(db, org, { ansattId: sara, dato: '2026-10-05', start: '07:00', slutt: '15:00', type: 'Åpning', sted: 'Sentrum', kommentar: 'Varelevering kl. 15' });
    await V.lagreVakt(db, org, { ansattId: jonas, dato: '2026-10-05', start: '13:00', slutt: '21:00', type: 'Kveld' });
    expect(await V.vakterMellom(db, org, '2026-10-05', '2026-10-11', 'ansatt')).toEqual([]);
    await V.publiser(db, org, 2026, 41);
    expect(await V.vakterMellom(db, org, '2026-10-05', '2026-10-11', 'ansatt')).toHaveLength(2);
    expect(await V.antallEndringer(db, org, 2026, 41)).toBe(0);
    // Lederen flytter Saras vakt til Emma og sletter Jonas sin
    await V.lagreVakt(db, org, { id: a.id, ansattId: emma, dato: '2026-10-05', start: '07:00', slutt: '15:00', type: 'Åpning', sted: 'Sentrum' });
    const j = (await V.vakterMellom(db, org, '2026-10-05', '2026-10-05')).find(v => v.ansattId === jonas)!;
    await V.slettVakt(db, org, j.id);
    expect(await V.antallEndringer(db, org, 2026, 41)).toBe(2);
    expect(await V.ukeStatus(db, org, 2026, 41)).toBe('endret');
    const ansattSer = await V.vakterMellom(db, org, '2026-10-05', '2026-10-11', 'ansatt');
    expect(ansattSer.map(v => v.ansattId).sort()).toEqual([jonas, sara].sort());
    expect(ansattSer.find(v => v.ansattId === sara)?.kommentar).toBe('Varelevering kl. 15');
    expect(await V.vakterMellom(db, org, '2026-10-05', '2026-10-11')).toHaveLength(1);
    const p = await V.publiser(db, org, 2026, 41);
    expect(p.varsle.sort()).toEqual([sara, jonas, emma].sort());
    const etter = await V.vakterMellom(db, org, '2026-10-05', '2026-10-11', 'ansatt');
    expect(etter.map(v => v.ansattId)).toEqual([emma]);
  });

  it('angre setter tilbake vakten', async () => {
    const [v] = await V.vakterMellom(db, org, '2026-10-05', '2026-10-05');
    const id = await V.angrepunkt(db, org, { vakter: [v.id], uker: [{ aar: 2026, uke: 41 }] });
    await V.tildel(db, org, v.id, jonas);
    expect((await V.vakterMellom(db, org, '2026-10-05', '2026-10-05'))[0].ansattId).toBe(jonas);
    await db.tx(t => V.angre(t, org, id));
    const [x] = await V.vakterMellom(db, org, '2026-10-05', '2026-10-05');
    expect(x.ansattId).toBe(emma);
    expect(x.ikkePublisert).toBe(false);
    expect(await V.ukeStatus(db, org, 2026, 41)).toBe('publisert');
    await expect(db.tx(t => V.angre(t, org, id))).rejects.toThrow(/for sent/);
  });

  it('gjenta hver uke lager vakter åtte uker frem', async () => {
    const r = await V.lagreVakt(db, org, { ansattId: sara, dato: '2026-10-06', start: '07:00', slutt: '15:00', gjenta: 'uke' });
    expect(r.kopier).toBe(8);
    expect((await V.vakterMellom(db, org, '2026-10-06', '2026-12-31')).filter(v => v.ansattId === sara)).toHaveLength(9);
  });
});

describe('fravær og saldo', () => {
  it('fri godkjent som fravær med lønn, vakten gis til en kollega', async () => {
    await V.lagreVakt(db, org, { ansattId: jonas, dato: '2026-10-09', start: '13:00', slutt: '21:00' });
    expect((await V.settTilgjengelig(db, org, jonas, '2026-10-09', 'kan_ikke', 'Tannlege')).friForesporsel).toBe(true);
    const [f] = await V.friForesporsler(db, org);
    await expect(V.behandleFravaer(db, org, { kilde: 'fri', id: f.id, type: 'Velferdspermisjon', handling: 'gi' })).rejects.toThrow(/Velg hvem/);
    const r = await db.tx(t => V.behandleFravaer(t, org, { kilde: 'fri', id: f.id, type: 'Velferdspermisjon', medLonn: true, handling: 'gi', giTil: emma }));
    expect(r).toMatchObject({ navn: 'Jonas Berg', type: 'Velferdspermisjon', medLonn: true, vakter: 1, giTilNavn: 'Emma Lie' });
    const [frav] = await V.fravaer(db, org, { ansattId: jonas });
    expect(frav).toMatchObject({ type: 'Velferdspermisjon', status: 'godkjent', timerMin: 450 });
    expect((await V.vakterMellom(db, org, '2026-10-09', '2026-10-09'))[0].ansattId).toBe(emma);
  });

  it('søknad om ferie og saldo', async () => {
    const s = await V.innstillinger(db, org);
    const id = await V.soknadFravaer(db, org, sara, { type: 'Ferie', fra: '2026-10-19', til: '2026-10-23' }, s);
    const fs = await V.foresporsler(db, org, '2026-10-01');
    expect(fs.fravaer.find(x => x.id === id)?.vakter).toBe(1); // den faste tirsdagsvakten
    await V.behandleFravaer(db, org, { kilde: 'fravaer', id, type: 'Ferie' });
    expect(await V.saldo(db, org, sara, '2026-10-01')).toMatchObject({ ferieTotal: 25, ferieBrukt: 5, ferieIgjen: 20 });
    const avsl = await V.soknadFravaer(db, org, sara, { type: 'Avspasering', fra: '2026-11-02', til: '2026-11-02' }, s);
    await V.behandleFravaer(db, org, { kilde: 'fravaer', id: avsl, avslag: true, kommentar: 'Vi er for få.' });
    expect((await V.fravaer(db, org, { ansattId: sara })).find(x => x.id === avsl)).toMatchObject({ status: 'avslatt', svar: 'Vi er for få.' });
  });
});

describe('bytter, avvik og tilgang', () => {
  it('bytte med kollega: kollega sier ja, lederen godkjenner', async () => {
    const v = await V.lagreVakt(db, org, { ansattId: sara, dato: '2026-10-08', start: '07:00', slutt: '15:00' });
    const b = await V.byttMed(db, org, sara, v.id, jonas);
    expect(await V.svarBytte(db, org, jonas, b, true, true)).toBe('venter_leder');
    expect((await V.foresporsler(db, org, '2026-10-01')).bytteKollega).toHaveLength(1);
    await V.lederBytte(db, org, b, true);
    expect((await V.vakterMellom(db, org, '2026-10-08', '2026-10-08')).find(x => x.id === v.id)?.ansattId).toBe(jonas);
  });

  it('gi bort har frist', async () => {
    const v = await V.lagreVakt(db, org, { ansattId: sara, dato: '2026-10-12', start: '07:00', slutt: '15:00' });
    await expect(V.byttBort(db, org, sara, v.id, true, 24, new Date('2026-10-11T12:00:00'))).rejects.toThrow(/minst 24 timer/);
    await V.byttBort(db, org, sara, v.id, true, 24, new Date('2026-10-10T12:00:00'));
  });

  it('avvik endrer timene, og «de som stemmer» godkjennes', async () => {
    const v = (await V.vakterMellom(db, org, '2026-10-05', '2026-10-05'))[0];
    await V.meldAvvik(db, org, v.ansattId!, { vaktId: v.id, start: '07:00', slutt: '15:30' });
    const rader = await V.timerForUke(db, org, 2026, 41);
    const emmaRad = rader.find(r => r.ansattId === emma)!;
    expect(emmaRad.avvik[0].diffMin).toBe(30);
    expect(V.avvikTekst(emmaRad.avvik[0])).toBe('Mandag 5. okt: 30 min lenger enn planlagt');
    const n = await V.godkjennTimeliste(db, org, 2026, 41, 'stemmer');
    expect(n).toBe(rader.filter(r => !r.avvik.length).length);
    expect((await V.timerForUke(db, org, 2026, 41)).find(r => r.ansattId === emma)?.status).toBe('venter');
  });

  it('tilbakestill innlogging og fjern fra vaktplanen', async () => {
    const i = await V.inviterAnsatt(db, org, jonas);
    expect(await V.apneLenke(db, i.token)).toBeTruthy();
    const ny = await V.tilbakestillInnlogging(db, org, jonas);
    expect(await V.apneLenke(db, i.token)).toBeNull();
    expect(await V.apneLenke(db, ny)).toBeTruthy();
    const angreId = await V.angrepunkt(db, org, { ansatt: jonas });
    const r = await db.tx(t => V.fjernFraVaktplan(t, org, jonas, '2026-10-01'));
    expect(r.ledige.length).toBeGreaterThan(0);
    expect((await V.vaktAnsatte(db, org)).some(a => a.id === jonas)).toBe(false);
    expect(await V.apneLenke(db, ny)).toBeNull();
    await db.tx(t => V.angre(t, org, angreId));
    expect((await V.vaktAnsatte(db, org)).some(a => a.id === jonas)).toBe(true);
    expect(await V.apneLenke(db, ny)).toBeTruthy();
  });
});
