import { describe, it, expect } from 'vitest';
import { oktDomene, tilVaktplan, adresse, erVaktplanVert, erMinVert } from '../src/lib/verter';

describe('adressene min. og vaktplan.', () => {
  it('kjenner igjen vertene', () => {
    expect(erMinVert('min.xn--rettfrt-u1a.no')).toBe(true);
    expect(erVaktplanVert('vaktplan.xn--rettfrt-u1a.no')).toBe(true);
    expect(erVaktplanVert('min.xn--rettfrt-u1a.no')).toBe(false);
  });
  it('deler innloggingen bare på rettført.no', () => {
    expect(oktDomene('min.xn--rettfrt-u1a.no')).toBe('.xn--rettfrt-u1a.no');
    expect(oktDomene('vaktplan.xn--rettfrt-u1a.no')).toBe('.xn--rettfrt-u1a.no');
    expect(oktDomene('rettfort-system-abc.vercel.app')).toBeUndefined();
    expect(oktDomene('localhost:3100')).toBeUndefined();
  });
  it('vaktlenker i e-post går til vaktplan-adressen når den er slått på', () => {
    expect(tilVaktplan('https://min.xn--rettfrt-u1a.no')).toBe('https://min.xn--rettfrt-u1a.no');
    process.env.RETTFORT_VAKTPLAN_ADRESSE = '1';
    expect(tilVaktplan('https://min.xn--rettfrt-u1a.no')).toBe('https://vaktplan.xn--rettfrt-u1a.no');
    expect(tilVaktplan('http://localhost:3100')).toBe('http://localhost:3100');
    delete process.env.RETTFORT_VAKTPLAN_ADRESSE;
  });
  it('lokale adresser bruker http', () => {
    expect(adresse('localhost:3100')).toBe('http://localhost:3100');
    expect(adresse('vaktplan.localhost:3100')).toBe('http://vaktplan.localhost:3100');
    expect(adresse('min.xn--rettfrt-u1a.no')).toBe('https://min.xn--rettfrt-u1a.no');
  });
});
