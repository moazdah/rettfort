import { describe, it, expect } from 'vitest';
import { arbeidMin, varighetMin, avtaltMin, analyserUke, advarsler, isoUke, ukeDager, flyttUke, kortTid, type VaktInn, type AnsattRegel } from '@/lib/vaktplan';

const full: AnsattRegel = { id: 'a', navn: 'Sara Havøy', lonnType: 'fast', stillingsprosent: 100 };
const deltid: AnsattRegel = { id: 'b', navn: 'Jonas Berg', lonnType: 'fast', stillingsprosent: 60 };
const time: AnsattRegel = { id: 'c', navn: 'Ola Time', lonnType: 'time', stillingsprosent: 100 };
const v = (ansattId: string, dato: string, start: string, slutt: string): VaktInn => ({ ansattId, dato, start, slutt });

describe('arbeidstid', () => {
  it('trekker 30 min pause bare over 5,5 t', () => {
    expect(arbeidMin(v('a', '2026-10-05', '07:00', '15:00'))).toBe(450);
    expect(arbeidMin(v('a', '2026-10-05', '10:00', '15:00'))).toBe(300);
    expect(arbeidMin(v('a', '2026-10-05', '10:00', '15:30'))).toBe(330);
    expect(arbeidMin(v('a', '2026-10-05', '10:00', '15:31'))).toBe(301);
  });
  it('vakt over midnatt', () => {
    expect(varighetMin('22:00', '06:00')).toBe(480);
    expect(arbeidMin(v('a', '2026-10-05', '22:00', '06:00'))).toBe(450);
  });
  it('avtalt per uke', () => {
    expect(avtaltMin(full)).toBe(2250);
    expect(avtaltMin(deltid)).toBe(1350);
    expect(avtaltMin(time)).toBeNull();
  });
});

describe('overtid og merarbeid', () => {
  it('over 9 t på en dag er overtid', () => {
    const r = analyserUke([v('a', '2026-10-05', '07:00', '18:00')], [full]);
    expect(r.perAnsatt.get('a')).toMatchObject({ arbeid: 630, overtid: 90 });
  });
  it('over 40 t i uka: vakten som passerer grensen får overtiden', () => {
    const vakter = ['05', '06', '07', '08', '09', '10'].map(d => v('a', `2026-10-${d}`, '07:00', '15:00')); // 6 × 7,5 = 45 t
    const r = analyserUke(vakter, [full]);
    expect(r.perAnsatt.get('a')!.overtid).toBe(300);
    expect(r.perVakt.get(vakter[5])!.overtid).toBe(300);
    expect(r.perVakt.get(vakter[4])!.overtid).toBe(0);
  });
  it('deltid over avtalt, under 40 t, er merarbeid', () => {
    const vakter = ['05', '06', '07', '08'].map(d => v('b', `2026-10-${d}`, '07:00', '15:00')); // 30 t, avtalt 22,5
    const r = analyserUke(vakter, [deltid]);
    expect(r.perAnsatt.get('b')).toMatchObject({ arbeid: 1800, merarbeid: 450, overtid: 0 });
    expect(r.perVakt.get(vakter[3])!.merarbeid).toBe(450);
  });
  it('timelønn har ikke merarbeid, men får overtid', () => {
    const vakter = ['05', '06', '07', '08', '09', '10'].map(d => v('c', `2026-10-${d}`, '07:00', '15:00'));
    const r = analyserUke(vakter, [time]);
    expect(r.perAnsatt.get('c')).toMatchObject({ merarbeid: 0, overtid: 300 });
  });
});

describe('advarsler', () => {
  it('kan ikke, har vakt, overtid og over 9 t', () => {
    const andre = [v('a', '2026-10-05', '07:00', '15:00')];
    const a = advarsler(v('a', '2026-10-05', '15:00', '22:00'), andre, full, [{ ansattId: 'a', dato: '2026-10-05', status: 'kan_ikke', grunn: 'Tannlege' }]);
    expect(a.join(' ')).toMatch(/ikke kan jobbe.*Tannlege/);
    expect(a.join(' ')).toMatch(/allerede en vakt/);
    expect(a.join(' ')).toMatch(/overtid/);
    expect(advarsler(v('a', '2026-10-06', '07:00', '18:00'), [], full, []).join(' ')).toMatch(/over 9 timer/);
  });
  it('merarbeid for deltid', () => {
    const andre = ['05', '06', '07'].map(d => v('b', `2026-10-${d}`, '07:00', '15:00'));
    expect(advarsler(v('b', '2026-10-08', '07:00', '15:00'), andre, deltid, []).join(' ')).toMatch(/merarbeid/);
  });
  it('ledig vakt gir ingen personadvarsler', () => {
    expect(advarsler(v(null as unknown as string, '2026-10-05', '07:00', '15:00'), [], null, [])).toEqual([]);
  });
});

describe('uker', () => {
  it('ISO-uke og dager', () => {
    expect(isoUke('2026-10-05')).toEqual({ aar: 2026, uke: 41 });
    expect(isoUke('2027-01-01')).toEqual({ aar: 2026, uke: 53 });
    expect(ukeDager(2026, 41)[0]).toBe('2026-10-05');
    expect(ukeDager(2026, 41)[6]).toBe('2026-10-11');
    expect(flyttUke(2026, 53, 1)).toEqual({ aar: 2027, uke: 1 });
    expect(flyttUke(2027, 1, -1)).toEqual({ aar: 2026, uke: 53 });
    expect(kortTid('07:00', '15:00')).toBe('07–15');
    expect(kortTid('07:30', '15:00')).toBe('07:30–15');
  });
});
