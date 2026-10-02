// Stresstest av rapporter, SAF-T og åpne poster: et helt år med tilfeldige hendelser gjennom de
// samme tjenestene som nettsiden bruker. Alle tall kontrolleres mot en uavhengig utregning.

import { describe, it, expect, beforeAll } from 'vitest';
import { nyTestDb, type Db } from '@/lib/db';
import { lagreSalg, sendSalg, registrerBetaling, krediter, lagGjentakendeUtkast, hentSalg } from '@/lib/tjenester/faktura';
import { registrerKjop, betalKjop, finnEllerLagKontakt } from '@/lib/tjenester/kjop';
import { kjorLonn } from '@/lib/tjenester/lonn';
import { bokfor, hentPosteringer } from '@/lib/tjenester/bokforing';
import { sendMva, mvaStatus, terminFor } from '@/lib/tjenester/mva';
import { rapportData, oppstilling } from '@/lib/tjenester/rapport';
import { importerKontoutskrift, behandleBevegelse } from '@/lib/tjenester/bank';
import { lagSaft } from '@/lib/saft';
import { lagIcs } from '@/lib/kalender';
import { lagFakturaPdf } from '@/lib/pdf';
import { kommendeFrister } from '@/lib/frister';
import { byggApningsbalanse, byggKjop, fakturaSummer } from '@/lib/hovedbok';
import { saldobalanse, mvaMelding } from '@/lib/rapporter';

// Deterministisk tilfeldighet slik at en feil kan gjenskapes.
let frø = Number(process.env.RF_FRO ?? 20261005);
const tilf = () => { frø = (frø * 1103515245 + 12345) % 2147483648; return frø / 2147483648; };
const heltall = (a: number, b: number) => a + Math.floor(tilf() * (b - a + 1));
const velg = <T,>(l: readonly T[]) => l[Math.floor(tilf() * l.length)];
const dato = (m: number, d: number) => `2026-${String(m).padStart(2, '0')}-${String(Math.min(d, 28)).padStart(2, '0')}`;

let db: Db, org: string;
const kunder: string[] = [];
const fakturaer: { id: string; total: number; forfall: string }[] = [];
const ubetalteKjop: { id: string; total: number }[] = [];

beforeAll(async () => {
  db = await nyTestDb();
  org = (await db.en<{ id: string }>(`insert into organisasjon (type, navn, orgnr, orgform, adresse, postnr, poststed, kontonr, aga_sone, mva_termin, regnskap_fra) values ('selskap','Stresstest AS','912345688','AS','Gate 1','9008','Tromsø','15062233445','1','tomnd','2026-01-01') returning id`))!.id;
  for (const [n, o] of [['Kunde En AS', '923456783'], ['Kunde To AS', '974760673'], ['Kunde Tre AS', null]] as const)
    kunder.push(await db.tx(t => finnEllerLagKontakt(t, org, 'kunde', n, o, { adresse: 'Vei 1', postnr: '0150', poststed: 'Oslo' })));
  await db.tx(t => bokfor(t, org, { dato: '2025-12-31', type: 'apningsbalanse' }, byggApningsbalanse([{ konto: 1920, saldo: 25000000 }, { konto: 2000, saldo: -3000000 }, { konto: 1250, saldo: 4500000 }])));
  await db.q(`insert into ansatt (organisasjon_id, navn, lonn_type, manedslonn, skatteprosent) values ($1,'Fast Ansatt','fast',4250000,31.5)`, [org]);
  await db.q(`insert into ansatt (organisasjon_id, navn, lonn_type, timesats, skatteprosent) values ($1,'Time Ansatt','time',23750,22)`, [org]);
}, 60000);

describe('et helt år med tilfeldige hendelser', () => {
  it('fører salg, kjøp, betalinger, kreditnotaer, lønn og MVA-oppgjør for 12 måneder', async () => {
    const ansatte = await db.q<{ id: string; lonn_type: string }>('select id, lonn_type from ansatt where organisasjon_id = $1', [org]);
    for (let m = 1; m <= 12; m++) {
      // Salg
      for (let i = 0; i < heltall(3, 7); i++) {
        const linjer = Array.from({ length: heltall(1, 4) }, () => ({ beskrivelse: velg(['Timer', 'Materiell', 'Mat', 'Frakt', 'Kurs']), antallMilli: heltall(1, 40) * 250, pris: heltall(100, 250000), sats: velg([25, 25, 15, 12, 0]) }));
        const type = tilf() < 0.15 ? 'kvittering' : 'faktura';
        const id = await db.tx(t => lagreSalg(t, org, { type, kontaktId: velg(kunder), dato: dato(m, heltall(1, 28)), forfall: type === 'faktura' ? dato(m, 28) : null, linjer }));
        await db.tx(t => sendSalg(t, org, id));
        const f = (await db.tx(t => hentSalg(t, org, id)))!;
        if (type === 'faktura') fakturaer.push({ id, total: f.total, forfall: f.forfall! });
      }
      // Kjøp
      for (let i = 0; i < heltall(4, 9); i++) {
        const sats = velg([25, 25, 15, 12, 0]);
        const total = heltall(1000, 3000000);
        const mva = sats ? Math.round((total * sats) / (100 + sats)) : 0;
        const betaltMed = velg(['bank', 'bank', 'ubetalt', 'privat', 'kontant'] as const);
        const r = await db.tx(t => registrerKjop(t, org, { leverandorNavn: velg(['Telenor Norge AS', 'Circle K', 'Kiwi', 'Clas Ohlson', 'Tromsø Eiendom AS']), dato: dato(m, heltall(1, 28)), total, mva, sats, konto: velg([6800, 7000, 6540, 6300, 7350, 6900]), betaltMed, kilde: 'uten_kvittering' }));
        if (betaltMed === 'ubetalt') ubetalteKjop.push({ id: r.id, total });
      }
      // Betalinger av tidligere fakturaer og regninger, noen delvis
      for (const f of fakturaer.filter(x => x.total > 0)) {
        if (tilf() < 0.5) continue;
        const st = (await db.tx(t => hentSalg(t, org, f.id)))!;
        if (!['sendt', 'delvis_betalt'].includes(st.status)) continue;
        const kr0 = (await db.q<{ s: number }>(`select coalesce(sum(total),0)::bigint as s from faktura where krediterer_id = $1 and status <> 'utkast'`, [f.id]))[0].s;
        const rest = st.total - st.betalt - kr0;
        if (rest <= 0) continue;
        const belop = tilf() < 0.3 ? Math.max(1, Math.floor(rest / 3)) : rest;
        await db.tx(t => registrerBetaling(t, org, f.id, belop, dato(m, 28)));
      }
      for (const k of ubetalteKjop.splice(0).filter(() => tilf() < 0.7)) await db.tx(t => betalKjop(t, org, k.id, dato(m, 27)));
      // En kreditnota nå og da
      const kandidat = fakturaer.find(f => f.total > 5000);
      if (kandidat && tilf() < 0.4) {
        const st = (await db.tx(t => hentSalg(t, org, kandidat.id)))!;
        const kred = await db.q<{ s: number }>(`select coalesce(sum(total),0)::bigint as s from faktura where krediterer_id = $1`, [kandidat.id]);
        const igjen = st.total - kred[0].s;
        if (st.status !== 'kreditert' && igjen > 2000 && st.status !== 'utkast') {
          await db.tx(t => krediter(t, org, kandidat.id, { grunn: 'Test', belop: Math.floor(igjen / 4), dato: dato(m, 28) }));
        }
      }
      // Lønn
      await db.tx(t => kjorLonn(t, org, `2026-${String(m).padStart(2, '0')}`, dato(m, 20), ansatte.map(a => ({ ansattId: a.id, timer: a.lonn_type === 'time' ? heltall(20, 160) : undefined, tillegg: tilf() < 0.2 ? [{ tekst: 'Bonus', belop: heltall(1000, 500000) }] : [] }))));
      // MVA-oppgjør etter hver partallsmåned
      if (m % 2 === 0) {
        const termin = terminFor(dato(m, 1), 'tomnd');
        const st = await db.tx(t => mvaStatus(t, org, termin));
        const r = await db.tx(t => sendMva(t, org, termin));
        expect(r.aBetale).toBe(st.tall.aBetale);
      }
    }
  }, 240000);

  it('balansen går opp og resultatet stemmer med en uavhengig utregning', async () => {
    const d = await rapportData(db, org, 2026, '2026-12-31');
    expect(d.bal.differanse).toBe(0);
    const rader = await hentPosteringer(db, org, '2026-01-01', '2026-12-31');
    // Uavhengig: resultat = −(sum av saldo på kontoklasse 3–8)
    const uavh = -rader.filter(r => r.konto >= 3000 && r.konto < 8800).reduce((a, r) => a + r.debet - r.kredit, 0);
    expect(d.res.resultat).toBe(uavh);
    // Sum debet = sum kredit for hele året
    expect(rader.reduce((a, r) => a + r.debet, 0)).toBe(rader.reduce((a, r) => a + r.kredit, 0));
  });

  it('åpne poster stemmer med saldo på kundefordringer og leverandørgjeld', async () => {
    const d = await rapportData(db, org, 2026, '2026-12-31');
    const kundeSum = d.kundePoster.reduce((a, k) => a + k.rest, 0);
    expect(kundeSum).toBe(d.sb.get(1500)?.saldo ?? 0);
    const levSum = d.levPoster.reduce((a, k) => a + k.total, 0);
    expect(levSum).toBe(-(d.sb.get(2400)?.saldo ?? 0));
  });

  it('MVA-kontoene er nullstilt etter siste oppgjør, og 2740 er summen av meldingene', async () => {
    const sb = saldobalanse(await hentPosteringer(db, org, undefined, '2026-12-31'));
    expect(sb.get(2700)?.saldo ?? 0).toBe(0);
    expect(sb.get(2710)?.saldo ?? 0).toBe(0);
    const meldt = await db.q<{ s: number }>('select coalesce(sum(a_betale),0)::bigint as s from mva_melding where organisasjon_id = $1', [org]);
    expect(-(sb.get(2740)?.saldo ?? 0)).toBe(meldt[0].s);
    // Hver melding er lik utgående minus inngående fra posteringene i terminen
    for (const m of await db.q<{ fra: string; til: string; a_betale: number }>('select fra::text as fra, til::text as til, a_betale from mva_melding where organisasjon_id = $1', [org])) {
      const r = await hentPosteringer(db, org, m.fra, m.til);
      expect(mvaMelding(r, m.fra, m.til).aBetale).toBe(m.a_betale);
    }
  });

  it('oppstillingene summerer riktig', async () => {
    const d = await rapportData(db, org, 2026, '2026-12-31');
    const res = oppstilling('res', d);
    expect(res.find(r => r.t === 'Resultat')!.b).toBe(d.res.resultat);
    const bal = oppstilling('bal', d);
    expect(bal.find(r => r.t === 'Sum eiendeler')!.b).toBe(bal.find(r => r.t === 'Sum egenkapital og gjeld')!.b);
    const sb = oppstilling('sb', d);
    // Saldobalansen (balanse fra start, resultat for året) summerer til null
    expect(sb.reduce((a, r) => a + (r.b ?? 0), 0)).toBe(0);
    const hb = oppstilling('hb', d);
    expect(hb.reduce((a, r) => a + (r.b ?? 0), 0)).toBe(0);
  });

  it('SAF-T: debet = kredit, åpning + bevegelse = slutt for hver konto, og kunder/leverandører stemmer', async () => {
    const x = await lagSaft(db, org, 2026, '2027-01-15');
    expect(x.startsWith('<?xml')).toBe(true);
    const tall = (re: RegExp) => Number(x.match(re)![1]);
    expect(tall(/<n1:TotalDebit>([\d.]+)</)).toBe(tall(/<n1:TotalCredit>([\d.]+)</));
    const antall = (await db.q<{ n: number }>(`select count(*)::int as n from bilag where organisasjon_id = $1 and dato between '2026-01-01' and '2026-12-31'`, [org]))[0].n;
    expect(tall(/<n1:NumberOfEntries>(\d+)</)).toBe(antall);
    // Summen av alle sluttsaldoer (debet − kredit) er null
    let sum = 0;
    for (const a of x.matchAll(/<n1:Account>(.*?)<\/n1:Account>/g)) {
      const d = a[1].match(/<n1:ClosingDebitBalance>([\d.]+)</), k = a[1].match(/<n1:ClosingCreditBalance>([\d.]+)</);
      sum += Math.round((d ? Number(d[1]) : 0) * 100) - Math.round((k ? Number(k[1]) : 0) * 100);
    }
    // Resultatkontoene er ikke nullstilt mot egenkapital (ingen årsavslutning ennå), så summen er null når åpningsbalansen går i null.
    expect(sum).toBe(0);
    // Linjer i hver transaksjon går i null
    for (const t of x.matchAll(/<n1:Transaction>(.*?)<\/n1:Transaction>/gs)) {
      let s = 0;
      for (const l of t[1].matchAll(/<n1:(Debit|Credit)Amount><n1:Amount>([\d.]+)</g)) s += (l[1] === 'Debit' ? 1 : -1) * Math.round(Number(l[2]) * 100);
      expect(s).toBe(0);
    }
    // Ingen uescapede spesialtegn
    expect(/&(?!amp;|lt;|gt;|quot;)/.test(x)).toBe(false);
  });

  it('faste fakturaer lager ett utkast per måned, ikke flere', async () => {
    const id = await db.tx(t => lagreSalg(t, org, { type: 'faktura', kontaktId: kunder[0], dato: '2027-01-10', forfall: '2027-01-24', linjer: [{ beskrivelse: 'Husleie', antallMilli: 1000, pris: 1000000, sats: 25 }], gjentakelse: 'maned' }));
    await db.tx(t => sendSalg(t, org, id));
    expect(await db.tx(t => lagGjentakendeUtkast(t, org, '2027-01-20'))).toBe(0); // samme måned
    expect(await db.tx(t => lagGjentakendeUtkast(t, org, '2027-02-05'))).toBe(0); // dagen er ikke kommet
    expect(await db.tx(t => lagGjentakendeUtkast(t, org, '2027-02-10'))).toBe(1);
    expect(await db.tx(t => lagGjentakendeUtkast(t, org, '2027-02-11'))).toBe(0); // allerede laget
    const u = await db.q<{ status: string; total: number; dato: string }>(`select status, total, dato::text as dato from faktura where organisasjon_id = $1 and gjentakelse like 'fra:%'`, [org]);
    expect(u).toEqual([{ status: 'utkast', total: 1250000, dato: '2027-02-10' }]);
  });
});

describe('betaling av skattetrekk og arbeidsgiveravgift fra banken', () => {
  it('fordeles på trekk, avgift og avgift på feriepenger', async () => {
    const d2 = await nyTestDb();
    const o = (await d2.en<{ id: string }>(`insert into organisasjon (type, navn, orgform) values ('selskap','Lønn AS','AS') returning id`))!.id;
    await d2.q(`insert into ansatt (organisasjon_id, navn, lonn_type, manedslonn, skatteprosent) values ($1,'A','fast',5000000,30)`, [o]);
    await d2.tx(t => bokfor(t, o, { dato: '2026-01-01', type: 'apning' }, byggApningsbalanse([{ konto: 1920, saldo: 50000000 }])));
    await d2.tx(t => kjorLonn(t, o, '2026-01', '2026-01-20', []));
    const sb = saldobalanse(await hentPosteringer(d2, o));
    const skyld = -((sb.get(2600)?.saldo ?? 0) + (sb.get(2770)?.saldo ?? 0) + (sb.get(2785)?.saldo ?? 0));
    const csv = ['Dato;Forklaring;Ut fra konto;Inn på konto', `15.03.2026;Skatteetaten skattetrekk;${(skyld / 100).toFixed(2).replace('.', ',')};`].join('\n');
    await d2.tx(t => importerKontoutskrift(t, o, csv, 'mars.csv'));
    const b = (await d2.en<{ id: string; forslag: string }>('select id, forslag from bankbevegelse where organisasjon_id = $1', [o]))!;
    expect(JSON.parse(b.forslag).grunn).toMatch(/Skatteetaten/);
    await d2.tx(t => behandleBevegelse(t, o, b.id, { type: 'skatteetaten', hva: 'skatt_aga' }));
    const etter = saldobalanse(await hentPosteringer(d2, o));
    for (const k of [2600, 2770, 2785]) expect(etter.get(k)?.saldo ?? 0).toBe(0);
  });
});

describe('kalender og PDF', () => {
  it('iCalendar har CRLF, korte linjer og én hendelse per frist', () => {
    const f = kommendeFrister('2026-10-05', 12, { orgform: 'AS', mvaTermin: 'tomnd', harAnsatte: true });
    const ics = lagIcs('Havøy Fisk AS, «test»; med komma', f, 'https://eksempel.no/frister');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.split('\r\n').every(l => Buffer.byteLength(l) <= 75)).toBe(true);
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(f.length);
    expect(ics.replace(/\r\n /g, '')).toContain('X-WR-CALNAME:Frister Havøy Fisk AS\\, «test»\\; med komma');
  });
  it('PDF lages med norske tegn, lange linjer og mange linjer (flere sider)', async () => {
    const linjer = Array.from({ length: 60 }, (_, i) => ({ beskrivelse: `Linje ${i} med æøå ÆØÅ og en veldig lang beskrivelse som må brytes over flere linjer − med tankestrek og «anførsel»`, antallMilli: 1500, pris: 99999, sats: 25 }));
    const pdf = await lagFakturaPdf({ type: 'faktura', nr: 10001, dato: '2026-10-05', forfall: '2026-10-19', levert: 'oktober', referanse: 'Ref 1', kid: '100010001', avsender: { navn: 'Havøy Fisk AS', orgnr: '912345688', adresse: 'Strandveien 12', postnr: '9008', poststed: 'Tromsø', kontonr: '15062233445', epost: 'post@havoyfisk.no', telefon: '77 60 12 34', tekst: 'Takk for handelen!', mvaRegistrert: true, orgform: 'AS' }, kunde: { navn: 'Kvam Transport AS', orgnr: '923456783', adresse: 'Vei 1', postnr: '5600', poststed: 'Norheimsund' }, linjer });
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe('%PDF-');
    expect(pdf.byteLength).toBeGreaterThan(3000);
    const s = fakturaSummer(linjer, true);
    expect(s.total).toBe(s.netto + s.mva);
  });
});

describe('åpningsbalanse', () => {
  it('differansen føres mot annen egenkapital og bilaget går i null', () => {
    const p = byggApningsbalanse([{ konto: 1920, saldo: 12345 }, { konto: 2400, saldo: -2345 }]);
    expect(p.find(x => x.konto === 2050)!.kredit).toBe(10000);
    expect(p.reduce((a, x) => a + x.debet - x.kredit, 0)).toBe(0);
    expect(() => byggApningsbalanse([{ konto: 3000, saldo: 100 }])).toThrow(/balansekontoer/);
    void byggKjop;
  });
});
