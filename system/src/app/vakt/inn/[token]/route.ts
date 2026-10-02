import { db } from '@/lib/server';
import { apneLenke } from '@/lib/tjenester/vaktplan';
import { opprettSesjon } from '@/lib/auth';
import { settOkt } from '@/lib/okt';
import { grunnadresse } from '@/lib/epost';

/** Lenken fra SMS/e-post: logger den ansatte rett inn i vaktplanen (uten passord i testfasen). */
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const base = await grunnadresse();
  const d = await db();
  const r = /^[\w-]{20,80}$/.test(token) ? await apneLenke(d, token) : null;
  if (!r) return Response.redirect(`${base}/vakt?ugyldig=1`, 303);
  const { token: sesjon } = await d.tx(t => opprettSesjon(t, r.brukerId, r.orgId));
  await settOkt(sesjon);
  return Response.redirect(`${base}/vakt`, 303);
}
