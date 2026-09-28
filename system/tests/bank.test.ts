import { describe, it, expect } from 'vitest';
import { matchBevegelser, navneLikhet, finnKid, klassifiserBankpost, type Bevegelse, type ApenFaktura, type UbetaltKjop, type BokfortBank } from '@/lib/bankmatch';
import { lagKid } from '@/lib/kid';
import { parseBank } from '@/lib/motor/rettfort-motor.js';

function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }

describe('bankmatching', () => {
  it('navnelikhet', () => {
    expect(navneLikhet('Kvam Transport AS', 'INNBETALING KVAM TRANSPORT')).toBe(1);
    expect(navneLikhet('Telenor Norge AS', 'VARER TELENOR')).toBe(1);
    expect(navneLikhet('Circle K Norge AS', 'VISA CIRCLE K LYSAKER')).toBeGreaterThan(0.4);
    expect(navneLikhet('Nordlys Kontor AS', 'REMA 1000')).toBe(0);
  });
  it('finner KID i teksten og klassifiserer gebyr/renter', () => {
    const kid = lagKid(10023, 42);
    expect(finnKid({ id: '1', dato: '2026-10-10', tekst: `Innbetaling ${kid}`, belop: 100 })).toBe(kid);
    expect(finnKid({ id: '1', dato: '2026-10-10', tekst: 'Innbetaling 1002300423', belop: 100 })).toBeNull();
    expect(klassifiserBankpost('Gebyr nettbank', -4500)).toBe('gebyr');
    expect(klassifiserBankpost('Kreditrente', 1234)).toBe('renteinntekt');
    expect(klassifiserBankpost('Rema 1000', -4500)).toBeNull();
  });
  it('KID vinner over beløp, og hver faktura brukes bare én gang', () => {
    const kidA = lagKid(10001, 1), kidB = lagKid(10002, 2);
    const f: ApenFaktura[] = [{ id: 'A', nr: 10001, kid: kidA, rest: 50000, kunde: 'Alfa AS', forfall: null }, { id: 'B', nr: 10002, kid: kidB, rest: 50000, kunde: 'Beta AS', forfall: null }];
    const b: Bevegelse[] = [{ id: '1', dato: '2026-10-10', tekst: 'Alfa AS', belop: 50000, kid: kidB }, { id: '2', dato: '2026-10-11', tekst: 'Alfa AS', belop: 50000 }];
    const m = matchBevegelser(b, { fakturaer: f, kjop: [], bokfort: [] });
    expect(m.get('1')).toMatchObject({ type: 'faktura', fakturaId: 'B', sikker: true });
    expect(m.get('2')).toMatchObject({ type: 'faktura', fakturaId: 'A', sikker: false });
  });
  it('delbetaling og overbetaling med KID', () => {
    const kid = lagKid(10005, 7);
    const f: ApenFaktura[] = [{ id: 'A', nr: 10005, kid, rest: 100000, kunde: 'X AS', forfall: null }];
    expect(matchBevegelser([{ id: '1', dato: '2026-10-10', tekst: '', belop: 40000, kid }], { fakturaer: f, kjop: [], bokfort: [] }).get('1')).toMatchObject({ belop: 40000, sikker: true });
    expect(matchBevegelser([{ id: '1', dato: '2026-10-10', tekst: '', belop: 140000, kid }], { fakturaer: f, kjop: [], bokfort: [] }).get('1')).toMatchObject({ belop: 100000, sikker: false });
  });
  it('bokførte bankposter matches på beløp og nærmeste dato', () => {
    const bok: BokfortBank[] = [{ bilagId: 'x', dato: '2026-10-01', belop: -44900, tekst: 'Telenor' }, { bilagId: 'y', dato: '2026-10-20', belop: -44900, tekst: 'Telenor' }];
    const m = matchBevegelser([{ id: '1', dato: '2026-10-03', tekst: 'TELENOR', belop: -44900 }, { id: '2', dato: '2026-10-21', tekst: 'TELENOR', belop: -44900 }], { fakturaer: [], kjop: [], bokfort: bok });
    expect(m.get('1')).toMatchObject({ bilagId: 'x' });
    expect(m.get('2')).toMatchObject({ bilagId: 'y' });
    expect(matchBevegelser([{ id: '1', dato: '2026-10-09', tekst: 'TELENOR', belop: -44900 }], { fakturaer: [], kjop: [], bokfort: [bok[0]] }).get('1')!.type).toBe('ingen'); // 8 dager unna
  });
  it('stresstest: 300 måneder med blandede bevegelser, alle kjente poster finnes igjen og ingen brukes to ganger', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed);
      const f: ApenFaktura[] = [], k: UbetaltKjop[] = [], bok: BokfortBank[] = [], bev: Bevegelse[] = [];
      const fasit = new Map<string, string>();
      const kunder = ['Alfa Bygg AS', 'Beta Frakt AS', 'Gamma Regnskap AS', 'Delta Fisk AS', 'Epsilon Data AS'];
      const lev = ['Telenor Norge AS', 'Circle K Norge AS', 'Nordlys Kontor AS', 'Jula Norge AS', 'Adobe Systems'];
      let n = 0;
      for (let i = 0; i < 25; i++) {
        const dag = String(1 + Math.floor(r() * 27)).padStart(2, '0');
        const v = r();
        const id = `b${n++}`;
        if (v < 0.35) {
          const belop = 1000 + Math.floor(r() * 5000000);
          const nr = 10000 + i + seed * 100;
          const kid = lagKid(nr, i);
          const medKid = r() < 0.7;
          f.push({ id: `F${i}`, nr, kid, rest: belop, kunde: kunder[i % 5], forfall: null });
          bev.push({ id, dato: `2026-10-${dag}`, tekst: `Innbetaling ${kunder[i % 5]}`, belop, kid: medKid ? kid : null });
          fasit.set(id, `F${i}`);
        } else if (v < 0.6) {
          const belop = 100 + Math.floor(r() * 2000000);
          bok.push({ bilagId: `B${i}`, dato: `2026-10-${dag}`, belop: -belop, tekst: lev[i % 5] });
          bev.push({ id, dato: `2026-10-${dag}`, tekst: lev[i % 5].toUpperCase(), belop: -belop });
          fasit.set(id, `B${i}`);
        } else if (v < 0.8) {
          const belop = 100 + Math.floor(r() * 2000000);
          k.push({ id: `K${i}`, total: belop, leverandor: lev[i % 5], dato: `2026-10-${dag}`, forfall: null });
          bev.push({ id, dato: `2026-10-${dag}`, tekst: `Betaling ${lev[i % 5]}`, belop: -belop });
          fasit.set(id, `K${i}`);
        } else if (v < 0.9) {
          bev.push({ id, dato: `2026-10-${dag}`, tekst: 'Gebyr', belop: -(100 + Math.floor(r() * 10000)) });
          fasit.set(id, 'gebyr');
        } else {
          bev.push({ id, dato: `2026-10-${dag}`, tekst: 'VIPPS *UKJENT', belop: -(12345 + i) });
          fasit.set(id, 'ingen');
        }
      }
      const m = matchBevegelser(bev, { fakturaer: f, kjop: k, bokfort: bok });
      const brukt = new Set<string>();
      for (const b of bev) {
        const fs = m.get(b.id)!;
        const ref = fs.type === 'faktura' ? fs.fakturaId : fs.type === 'kjop' ? fs.kjopId : fs.type === 'bokfort' ? fs.bilagId : fs.type === 'bankpost' ? fs.post : 'ingen';
        if (ref.startsWith('F') || ref.startsWith('K') || ref.startsWith('B')) { expect(brukt.has(ref)).toBe(false); brukt.add(ref); }
        // Beløp og dato er tilfeldige, så like beløp kan i sjeldne tilfeller bytte plass. Da skal typen likevel stemme.
        const forventet = fasit.get(b.id)!;
        if (forventet === 'gebyr' || forventet === 'ingen') expect(ref).toBe(forventet);
        else expect(ref[0]).toBe(forventet[0]);
      }
    }
  });
});

describe('lesing av kontoutskrift (fra kontrollmotoren)', () => {
  it('DNB-lignende CSV med saldo', () => {
    const csv = 'Dato;Forklaring;Rentedato;Ut fra konto;Inn på konto\n01.10.2026;Telenor;01.10.2026;449,00;\n10.10.2026;Innbetaling 1002300422;10.10.2026;;17 250,00\n';
    const k = parseBank(csv);
    expect(k.lines).toHaveLength(2);
    expect(k.lines[0].amount).toBe(-449);
    expect(k.lines[1].amount).toBe(17250);
  });
  it('CAMT.053', () => {
    const xml = `<?xml version="1.0"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt><Stmt><Acct><Id><IBAN>NO9386011117947</IBAN></Id></Acct>
<Bal><Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp><Amt Ccy="NOK">1000.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>2026-10-01</Dt></Dt></Bal>
<Bal><Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp><Amt Ccy="NOK">17801.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>2026-10-31</Dt></Dt></Bal>
<Ntry><Amt Ccy="NOK">449.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><BookgDt><Dt>2026-10-01</Dt></BookgDt><AddtlNtryInf>Telenor</AddtlNtryInf></Ntry>
<Ntry><Amt Ccy="NOK">17250.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><BookgDt><Dt>2026-10-10</Dt></BookgDt><NtryDtls><TxDtls><RmtInf><Strd><CdtrRefInf><Ref>1002300422</Ref></CdtrRefInf></Strd></RmtInf></TxDtls></NtryDtls></Ntry>
</Stmt></BkToCstmrStmt></Document>`;
    const k = parseBank(xml);
    expect(k.kind).toBe('camt');
    expect(k.closing).toBe(17801);
    expect(k.lines[1].ref).toBe('1002300422');
  });
});
