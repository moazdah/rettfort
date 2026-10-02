import { describe, it, expect } from 'vitest';
import { ekstraAnsatte, inkluderteAnsatte, harVaktplan, BYRA_I_SALG, PAKKER } from '../src/lib/pakker';

describe('pakker og ekstra ansatte', () => {
  it('Start har 5 og Selskap 15 ansatte med i prisen', () => {
    expect(inkluderteAnsatte('start')).toBe(5);
    expect(inkluderteAnsatte('selskap')).toBe(15);
    expect(inkluderteAnsatte('gratis')).toBe(0);
  });
  it('teller bare ansatte over grensen', () => {
    expect(ekstraAnsatte('start', 3)).toBe(0);
    expect(ekstraAnsatte('start', 5)).toBe(0);
    expect(ekstraAnsatte('start', 8)).toBe(3);
    expect(ekstraAnsatte('selskap', 16)).toBe(1);
  });
  it('Gratis har ikke vaktplan og betaler ikke for ansatte', () => {
    expect(harVaktplan('gratis')).toBe(false);
    expect(ekstraAnsatte('gratis', 40)).toBe(0);
  });
  it('Byrå er ikke i salg, og pakkelisten har bare Gratis, Start og Selskap', () => {
    expect(BYRA_I_SALG).toBe(false);
    expect(PAKKER.map(p => p.k)).toEqual(['gratis', 'start', 'selskap']);
  });
});
