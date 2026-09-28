// Innlogging med e-post og passord. Sesjoner lagres som hash i databasen; cookien har bare et tilfeldig token.

import { scrypt as _scrypt, randomBytes, timingSafeEqual, createHash, randomInt } from 'node:crypto';
import { promisify } from 'node:util';
import type { Sporring } from './db';

const scrypt = promisify(_scrypt) as (p: string, s: Buffer, n: number, o: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;
const N = 16384, R = 8, P = 1, LEN = 32;

export const SESJON_COOKIE = 'rf_sesjon';
export const SESJON_DAGER = 30;

export async function hashPassord(passord: string): Promise<string> {
  const salt = randomBytes(16);
  const h = await scrypt(passord.normalize('NFKC'), salt, LEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${salt.toString('base64')}$${h.toString('base64')}`;
}

export async function sjekkPassord(passord: string, lagret: string): Promise<boolean> {
  const [algo, n, saltB, hashB] = lagret.split('$');
  if (algo !== 'scrypt') return false;
  const h = await scrypt(passord.normalize('NFKC'), Buffer.from(saltB, 'base64'), LEN, { N: Number(n), r: R, p: P, maxmem: 64 * 1024 * 1024 });
  const f = Buffer.from(hashB, 'base64');
  return f.length === h.length && timingSafeEqual(f, h);
}

export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function lagKode(): string {
  return String(randomInt(0, 1000000)).padStart(6, '0');
}

export function gyldigEpost(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());
}

export function passordFeil(p: string): string | null {
  if (p.length < 8) return 'Passordet må ha minst 8 tegn.';
  if (p.length > 200) return 'Passordet er for langt.';
  return null;
}

export async function opprettSesjon(t: Sporring, brukerId: string, orgId: string | null): Promise<{ token: string; utloper: Date }> {
  const token = randomBytes(32).toString('base64url');
  const utloper = new Date(Date.now() + SESJON_DAGER * 86400000);
  await t.q('insert into sesjon (token_hash, bruker_id, organisasjon_id, utloper) values ($1,$2,$3,$4)', [tokenHash(token), brukerId, orgId, utloper.toISOString()]);
  return { token, utloper };
}

export interface Sesjon {
  token: string;
  bruker: { id: string; navn: string; epost: string; epostBekreftet: boolean };
  org: { id: string; navn: string; type: 'selskap' | 'byra'; pakke: string; orgnr: string | null; orgform: string; bilagSlug: string | null; mvaRegistrert: boolean; mvaTermin: string } | null;
  rolle: string | null;
  medlemskap: { orgId: string; navn: string; type: string; rolle: string }[];
}

export async function lesSesjon(t: Sporring, token: string | undefined): Promise<Sesjon | null> {
  if (!token) return null;
  const s = await t.en<{ bruker_id: string; organisasjon_id: string | null; navn: string; epost: string; epost_bekreftet: boolean }>(
    `select s.bruker_id, s.organisasjon_id, b.navn, b.epost, b.epost_bekreftet from sesjon s join bruker b on b.id = s.bruker_id where s.token_hash = $1 and s.utloper > now()`, [tokenHash(token)]);
  if (!s) return null;
  const medlemskap = await t.q<{ orgId: string; navn: string; type: string; rolle: string }>(
    `select m.organisasjon_id as "orgId", o.navn, o.type, m.rolle from medlemskap m join organisasjon o on o.id = m.organisasjon_id where m.bruker_id = $1 order by o.navn`, [s.bruker_id]);
  let orgId = s.organisasjon_id;
  // Byrå-medlemmer får også tilgang til selskaper byrået er koblet til.
  let tilgang = medlemskap.find(m => m.orgId === orgId);
  if (orgId && !tilgang) {
    const viaByra = await t.en<{ rolle: string }>(`select bk.rolle from byra_kunde bk join medlemskap m on m.organisasjon_id = bk.byra_id where bk.selskap_id = $1 and m.bruker_id = $2 and bk.status = 'aktiv'`, [orgId, s.bruker_id]);
    if (viaByra) tilgang = { orgId, navn: '', type: 'selskap', rolle: viaByra.rolle };
  }
  if (!tilgang) { orgId = medlemskap[0]?.orgId ?? null; tilgang = medlemskap[0]; }
  const org = orgId ? await t.en<{ id: string; navn: string; type: 'selskap' | 'byra'; pakke: string; orgnr: string | null; orgform: string; bilag_slug: string | null; mva_registrert: boolean; mva_termin: string }>('select id, navn, type, pakke, orgnr, orgform, bilag_slug, mva_registrert, mva_termin from organisasjon where id = $1', [orgId]) : null;
  return {
    token,
    bruker: { id: s.bruker_id, navn: s.navn, epost: s.epost, epostBekreftet: s.epost_bekreftet },
    org: org ? { id: org.id, navn: org.navn, type: org.type, pakke: org.pakke, orgnr: org.orgnr, orgform: org.orgform, bilagSlug: org.bilag_slug, mvaRegistrert: org.mva_registrert, mvaTermin: org.mva_termin } : null,
    rolle: tilgang?.rolle ?? null,
    medlemskap,
  };
}

export function kanEndre(rolle: string | null): boolean {
  return rolle === 'eier' || rolle === 'full' || rolle === 'regnskapsforer_full';
}

export function lagSlug(navn: string): string {
  return navn.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a')
    .replace(/\b(as|asa|enk|da|ans)\b/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'firma';
}
