import 'server-only';
import { cookies, headers } from 'next/headers';
import { SESJON_COOKIE, SESJON_DAGER } from './auth';
import { OKT_COOKIE, oktDomene, vertAv } from './verter';

/** Innloggingen: den nye, delte kaken først, ellers den gamle som bare gjaldt min.rettført.no. */
export async function oktToken(): Promise<string | undefined> {
  const c = await cookies();
  return c.get(OKT_COOKIE)?.value || c.get(SESJON_COOKIE)?.value;
}

/** varig = false: kaken forsvinner når nettleseren lukkes (brukes før e-posten er bekreftet). */
export async function settOkt(token: string, varig = true) {
  const c = await cookies();
  const domain = oktDomene(vertAv(await headers()));
  c.set(OKT_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', ...(domain ? { domain } : {}), ...(varig ? { maxAge: SESJON_DAGER * 86400 } : {}) });
  if (c.get(SESJON_COOKIE)) c.delete(SESJON_COOKIE);
}

export async function slettOkt() {
  const c = await cookies();
  const domain = oktDomene(vertAv(await headers()));
  c.delete({ name: OKT_COOKIE, path: '/', ...(domain ? { domain } : {}) });
  if (c.get(SESJON_COOKIE)) c.delete(SESJON_COOKIE);
}
