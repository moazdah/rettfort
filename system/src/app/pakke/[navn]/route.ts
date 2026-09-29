import { cookies } from 'next/headers';
import { sesjon, db } from '@/lib/server';
import { stripePa, startBetaling } from '@/lib/stripe';
import { grunnadresse } from '@/lib/epost';

/**
 * Knappene «Velg Start/Selskap» på forsiden kommer hit. Innlogget eier sendes rett til betaling.
 * Ellers huskes valget, og brukeren registrerer seg først. Hjem minner om betalingen etterpå.
 */
export async function GET(_: Request, { params }: { params: Promise<{ navn: string }> }) {
  const { navn } = await params;
  const base = await grunnadresse();
  const til = (sti: string) => Response.redirect(`${base}${sti}`, 303);
  if (navn === 'gratis') return til('/registrer?rolle=bedrift');
  if (navn !== 'start' && navn !== 'selskap') return til('/');
  const s = await sesjon();
  if (!s) {
    (await cookies()).set('rf_pakke', navn, { path: '/', maxAge: 60 * 60 * 24 * 7, sameSite: 'lax', secure: base.startsWith('https') });
    return til('/registrer?rolle=bedrift');
  }
  if (!s.org || s.org.type !== 'selskap') {
    (await cookies()).set('rf_pakke', navn, { path: '/', maxAge: 60 * 60 * 24 * 7, sameSite: 'lax', secure: base.startsWith('https') });
    return til('/velkommen');
  }
  if (s.rolle !== 'eier' || !stripePa()) return til('/innstillinger?vis=abonnement');
  (await cookies()).delete('rf_pakke');
  try {
    const r = await startBetaling(await db(), s.org.id, navn, s.bruker.epost, base);
    return 'url' in r ? Response.redirect(r.url, 303) : til('/innstillinger?vis=abonnement');
  } catch {
    return til('/innstillinger?vis=abonnement');
  }
}
