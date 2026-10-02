import { getDb } from '@/lib/db';
import { gyldigSignatur, webhookHemmeligheter, lagreAbonnement, stripe } from '@/lib/stripe';

/** Varsler fra Stripe om betaling, bytte og oppsigelse. Signaturen sjekkes før noe endres. */
export async function POST(req: Request) {
  const innhold = await req.text();
  const db = await getDb();
  if (!gyldigSignatur(innhold, req.headers.get('stripe-signature'), await webhookHemmeligheter(db))) return new Response('Ugyldig signatur', { status: 400 });
  const h = JSON.parse(innhold) as { type: string; data: { object: Record<string, unknown> } };
  const o = h.data.object;
  try {
    if (h.type === 'checkout.session.completed' && typeof o.subscription === 'string') {
      const a = await stripe<Parameters<typeof lagreAbonnement>[1]>('GET', `subscriptions/${o.subscription}`);
      await lagreAbonnement(db, a, typeof o.client_reference_id === 'string' ? o.client_reference_id : undefined);
    } else if (h.type === 'customer.subscription.updated' || h.type === 'customer.subscription.deleted') {
      await lagreAbonnement(db, o as unknown as Parameters<typeof lagreAbonnement>[1]);
    }
  } catch (e) {
    console.error('Stripe-varsel feilet:', h.type, e);
    return new Response('Feil', { status: 500 });
  }
  return Response.json({ mottatt: true });
}
