import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { nyTestDb } from '@/lib/db';
import { skjema, gyldigSignatur, startBetaling, fullforBetaling, lagreAbonnement, sigOpp, webhookHemmeligheter } from '@/lib/stripe';

afterEach(() => { vi.unstubAllGlobals(); delete process.env.STRIPE_SECRET_KEY; });

/** En enkel etterligning av Stripe som svarer på det systemet spør om. */
function falskStripe() {
  const kall = [] as { metode: string; sti: string; data: string }[] & { orgId?: string };
  const f = vi.fn(async (url: string, init: RequestInit) => {
    const u = new URL(url); const sti = u.pathname.replace('/v1/', ''); const data = init.method === 'GET' ? u.search.slice(1) : String(init.body ?? '');
    kall.push({ metode: String(init.method), sti, data: decodeURIComponent(data) });
    const svar = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
    if (sti === 'webhook_endpoints') return svar({ id: 'we_1', secret: 'whsec_test' });
    if (sti === 'prices' && init.method === 'GET') return svar({ data: [] });
    if (sti === 'prices') return svar({ id: 'price_start' });
    if (sti === 'customers') return svar({ id: 'cus_1' });
    if (sti === 'checkout/sessions') return svar({ url: 'https://checkout.stripe.com/c/pay/cs_1' });
    if (sti.startsWith('checkout/sessions/')) return svar({ client_reference_id: kall.orgId, status: 'complete', subscription: { id: 'sub_1', status: 'active', customer: 'cus_1', cancel_at_period_end: false, current_period_end: 1790000000, metadata: { org_id: kall.orgId, pakke: 'start' } } });
    if (sti === 'subscriptions/sub_1' && init.method === 'POST') return svar({ id: 'sub_1', status: 'active', customer: 'cus_1', cancel_at_period_end: true, current_period_end: 1793000000, metadata: { pakke: 'start' } });
    return new Response(JSON.stringify({ error: { message: 'ukjent' } }), { status: 400 });
  });
  vi.stubGlobal('fetch', f);
  return kall;
}

describe('Stripe', () => {
  it('koder skjemaer slik Stripe vil ha dem', () => {
    expect(skjema({ a: 1, b: { c: 'x y' }, d: ['p', 'q'], e: [{ f: 1 }], g: undefined })).toEqual(['a=1', 'b%5Bc%5D=x%20y', 'd%5B0%5D=p', 'd%5B1%5D=q', 'e%5B0%5D%5Bf%5D=1']);
  });
  it('godtar bare varsler med riktig og fersk signatur', () => {
    const t = 1790000000, innhold = '{"type":"x"}';
    const sig = createHmac('sha256', 'whsec_a').update(`${t}.${innhold}`).digest('hex');
    expect(gyldigSignatur(innhold, `t=${t},v1=${sig}`, ['whsec_a'], t * 1000)).toBe(true);
    expect(gyldigSignatur(innhold + ' ', `t=${t},v1=${sig}`, ['whsec_a'], t * 1000)).toBe(false);
    expect(gyldigSignatur(innhold, `t=${t},v1=${sig}`, ['whsec_b'], t * 1000)).toBe(false);
    expect(gyldigSignatur(innhold, `t=${t},v1=${sig}`, ['whsec_a'], (t + 600) * 1000)).toBe(false);
    expect(gyldigSignatur(innhold, null, ['whsec_a'])).toBe(false);
  });
  it('betaling: lager varsel, pris, kunde og betalingsside; pakken aktiveres først når betalingen er bekreftet', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    const kall = falskStripe();
    const db = await nyTestDb();
    const o = (await db.en<{ id: string }>(`insert into organisasjon (type, navn, epost) values ('selskap','Betal AS','post@betal.no') returning id`))!.id;
    kall.orgId = o;
    const r = await startBetaling(db, o, 'start', 'eier@betal.no', 'https://min.test');
    expect(r).toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_1' });
    expect(kall.map(k => k.sti)).toEqual(['webhook_endpoints', 'prices', 'prices', 'customers', 'checkout/sessions']);
    expect(kall[2].data).toContain('unit_amount=17900');
    expect(kall[2].data).toContain('currency=nok');
    expect(kall[4].data).toContain('success_url=https://min.test/innstillinger?vis=abonnement&betaling={CHECKOUT_SESSION_ID}');
    expect(await webhookHemmeligheter(db)).toEqual(['whsec_test']);
    expect((await db.en<{ pakke: string }>('select pakke from organisasjon where id = $1', [o]))!.pakke).toBe('gratis');
    expect(await fullforBetaling(db, o, 'cs_1')).toBe(true);
    expect(await db.en('select pakke, stripe_abonnement, abonnement_status from organisasjon where id = $1', [o])).toEqual({ pakke: 'start', stripe_abonnement: 'sub_1', abonnement_status: 'active' });
    expect(await fullforBetaling(db, o, 'ugyldig')).toBe(false);
    // Neste betaling lager ikke nytt varsel-endepunkt
    const n = kall.length;
    await startBetaling(db, o, 'start', 'eier@betal.no', 'https://min.test').catch(() => {});
    expect(kall.slice(n).some(k => k.sti === 'webhook_endpoints')).toBe(false);
  });
  it('oppsigelse gjelder til periodens slutt; avsluttet abonnement gir Gratis', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    falskStripe();
    const db = await nyTestDb();
    const o = (await db.en<{ id: string }>(`insert into organisasjon (type, navn, pakke, stripe_kunde, stripe_abonnement) values ('selskap','X','start','cus_1','sub_1') returning id`))!.id;
    const slutt = await sigOpp(db, o);
    expect(slutt).toBe(new Date(1793000000 * 1000).toISOString().slice(0, 10));
    expect((await db.en<{ pakke: string }>('select pakke from organisasjon where id = $1', [o]))!.pakke).toBe('start');
    await lagreAbonnement(db, { id: 'sub_1', status: 'canceled', customer: 'cus_1', cancel_at_period_end: false, current_period_end: 1793000000, metadata: { pakke: 'start' } });
    expect(await db.en('select pakke, stripe_abonnement from organisasjon where id = $1', [o])).toEqual({ pakke: 'gratis', stripe_abonnement: null });
  });
});
