import { describe, it, expect } from 'vitest';
import { paskedag, helligdager, fristerForAr, kommendeFrister, mvaTerminer, erVirkedag } from '@/lib/frister';

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe('frister', () => {
  it('påskedag stemmer med kjente år', () => {
    expect(iso(paskedag(2024))).toBe('2024-03-31');
    expect(iso(paskedag(2025))).toBe('2025-04-20');
    expect(iso(paskedag(2026))).toBe('2026-04-05');
    expect(iso(paskedag(2027))).toBe('2027-03-28');
    expect(iso(paskedag(2030))).toBe('2030-04-21');
  });
  it('helligdager 2026', () => {
    const h = helligdager(2026);
    for (const d of ['2026-01-01', '2026-04-02', '2026-04-03', '2026-04-05', '2026-04-06', '2026-05-01', '2026-05-14', '2026-05-17', '2026-05-24', '2026-05-25', '2026-12-25', '2026-12-26']) expect(h.has(d)).toBe(true);
  });
  it('MVA-frister 2026 (annenhver måned) med flytting til virkedag', () => {
    const t = mvaTerminer(2026).map(f => f.dato);
    // 10.04.2026 fredag, 10.06 onsdag, 31.08 mandag, 10.10 lørdag → 12.10, 10.12 torsdag, 10.02.2027 onsdag
    expect(t).toEqual(['2026-04-10', '2026-06-10', '2026-08-31', '2026-10-12', '2026-12-10', '2027-02-10']);
  });
  it('alle frister havner på virkedager', () => {
    for (let ar = 2024; ar <= 2035; ar++) {
      for (const f of fristerForAr(ar, { orgform: 'AS', mvaTermin: 'tomnd', harAnsatte: true })) {
        expect(erVirkedag(new Date(f.dato + 'T00:00:00Z'))).toBe(true);
        expect(f.dato >= f.opprinnelig).toBe(true);
      }
    }
  });
  it('skattetrekk for september–oktober forfaller 15. november', () => {
    const f = fristerForAr(2026, { orgform: 'AS', mvaTermin: 'tomnd', harAnsatte: true }).find(x => x.id === 'trekk-2026-5')!;
    expect(f.opprinnelig).toBe('2026-11-15');
    expect(f.dato).toBe('2026-11-16'); // 15.11.2026 er søndag
  });
  it('a-melding for desember går i januar året etter', () => {
    const f = fristerForAr(2026, { orgform: 'AS', mvaTermin: 'tomnd', harAnsatte: true }).find(x => x.id === 'amelding-2026-12')!;
    expect(f.opprinnelig).toBe('2027-01-05');
  });
  it('kommende frister uten duplikater', () => {
    const k = kommendeFrister('2026-10-05', 3, { orgform: 'AS', mvaTermin: 'tomnd', harAnsatte: true });
    expect(new Set(k.map(f => f.id)).size).toBe(k.length);
    expect(k[0].dato >= '2026-10-05').toBe(true);
    expect(k.some(f => f.tittel === 'MVA for juli–august')).toBe(true);
  });
});
