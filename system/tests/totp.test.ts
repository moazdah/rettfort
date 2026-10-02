import { describe, it, expect } from 'vitest';
import { totp, sjekkTotp, base32, fraBase32, nyHemmelighet } from '@/lib/totp';

// RFC 6238, vedlegg B: nøkkelen er ASCII «12345678901234567890» (SHA-1), 8 siffer.
const RFC = base32(Buffer.from('12345678901234567890'));
describe('totrinns innlogging (TOTP)', () => {
  it('gir kodene fra RFC 6238', () => {
    expect(totp(RFC, 59, 8)).toBe('94287082');
    expect(totp(RFC, 1111111109, 8)).toBe('07081804');
    expect(totp(RFC, 1111111111, 8)).toBe('14050471');
    expect(totp(RFC, 1234567890, 8)).toBe('89005924');
    expect(totp(RFC, 2000000000, 8)).toBe('69279037');
  });
  it('base32 frem og tilbake', () => {
    const h = nyHemmelighet();
    expect(h).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32(fraBase32(h))).toBe(h);
  });
  it('godtar koden 30 sekunder før og etter, ikke mer, og ikke feil kode', () => {
    const h = nyHemmelighet(), t = 1_800_000_000;
    expect(sjekkTotp(h, totp(h, t), t)).toBe(true);
    expect(sjekkTotp(h, totp(h, t - 30), t)).toBe(true);
    expect(sjekkTotp(h, totp(h, t + 30), t)).toBe(true);
    expect(sjekkTotp(h, totp(h, t - 90), t)).toBe(false);
    expect(sjekkTotp(h, '12345', t)).toBe(false);
    expect(sjekkTotp(h, 'abcdef', t)).toBe(false);
  });
});
