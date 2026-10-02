// Totrinns innlogging med autentiseringsapp (TOTP, RFC 6238): 6 siffer som byttes hvert 30. sekund.
// Fungerer med Google Authenticator, Microsoft Authenticator, 1Password og andre. Ingen avtaler trengs.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ALFABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32(buf: Buffer): string {
  let bits = 0, verdi = 0, ut = '';
  for (const b of buf) { verdi = (verdi << 8) | b; bits += 8; while (bits >= 5) { ut += ALFABET[(verdi >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) ut += ALFABET[(verdi << (5 - bits)) & 31];
  return ut;
}

export function fraBase32(s: string): Buffer {
  const ren = s.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, verdi = 0; const ut: number[] = [];
  for (const c of ren) { verdi = (verdi << 5) | ALFABET.indexOf(c); bits += 5; if (bits >= 8) { ut.push((verdi >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(ut);
}

export const nyHemmelighet = () => base32(randomBytes(20));

/** Koden for et gitt tidspunkt (sekunder). */
export function totp(hemmelighet: string, sekunder = Math.floor(Date.now() / 1000), siffer = 6, steg = 30, algoritme: 'sha1' | 'sha256' | 'sha512' = 'sha1'): string {
  const teller = Buffer.alloc(8);
  teller.writeBigUInt64BE(BigInt(Math.floor(sekunder / steg)));
  const h = createHmac(algoritme, fraBase32(hemmelighet)).update(teller).digest();
  const o = h[h.length - 1] & 15;
  const kode = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(kode % 10 ** siffer).padStart(siffer, '0');
}

/** Godtar koden for nå og ett steg før/etter (klokkene på telefon og server er sjelden helt like). */
export function sjekkTotp(hemmelighet: string, kode: string, sekunder = Math.floor(Date.now() / 1000)): boolean {
  const k = kode.replace(/\s/g, '');
  if (!/^\d{6}$/.test(k)) return false;
  return [-30, 0, 30].some(d => { const f = totp(hemmelighet, sekunder + d); return timingSafeEqual(Buffer.from(f), Buffer.from(k)); });
}

export const otpauthUri = (hemmelighet: string, epost: string) =>
  `otpauth://totp/${encodeURIComponent('Rettført:' + epost)}?secret=${hemmelighet}&issuer=${encodeURIComponent('Rettført')}&algorithm=SHA1&digits=6&period=30`;
