// Betaling med Stripe: abonnement på pakkene Start og Selskap. Bruker Stripes API direkte.
// Produkter, priser, kundeportal og varsler (webhook) opprettes av systemet selv første gang de trengs,
// så det eneste som må settes opp er STRIPE_SECRET_KEY i Vercel.

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Sporring } from './db';
import { RegnskapsFeil } from './hovedbok';
import { PAKKER, prisFor, EKSTRA_ANSATT, ekstraAnsatte, tarBetaltForEkstra, type BetaltPakke } from './pakker';

export const stripePa = () => !!process.env.STRIPE_SECRET_KEY;

/** Stripe tar skjemakoding med klammer for objekter og lister: a[b]=1, c[0]=x. */
export function skjema(o: Record<string, unknown>, forelder = ''): string[] {
  const ut: string[] = [];
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null) continue;
    const navn = forelder ? `${forelder}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((x, i) => typeof x === 'object' ? ut.push(...skjema(x as Record<string, unknown>, `${navn}[${i}]`)) : ut.push(`${encodeURIComponent(`${navn}[${i}]`)}=${encodeURIComponent(String(x))}`));
    else if (typeof v === 'object') ut.push(...skjema(v as Record<string, unknown>, navn));
    else ut.push(`${encodeURIComponent(navn)}=${encodeURIComponent(String(v))}`);
  }
  return ut;
}

export async function stripe<T = Record<string, unknown>>(metode: 'GET' | 'POST' | 'DELETE', sti: string, data?: Record<string, unknown>): Promise<T> {
  const nokkel = process.env.STRIPE_SECRET_KEY;
  if (!nokkel) throw new RegnskapsFeil('Betaling er ikke koblet til ennå.');
  const q = data ? skjema(data).join('&') : '';
  const url = `https://api.stripe.com/v1/${sti}${metode === 'GET' && q ? `?${q}` : ''}`;
  const r = await fetch(url, {
    method: metode,
    headers: { authorization: `Bearer ${nokkel}`, 'content-type': 'application/x-www-form-urlencoded', 'stripe-version': '2024-06-20' },
    body: metode === 'GET' ? undefined : q,
  });
  const j = await r.json() as T & { error?: { message?: string } };
  if (!r.ok) { console.error('Stripe:', r.status, j.error?.message); throw new RegnskapsFeil('Betalingstjenesten svarte ikke som ventet. Prøv igjen om litt.'); }
  return j;
}

async function hentVerdi(t: Sporring, nokkel: string) { return (await t.en<{ verdi: string }>('select verdi from systeminnstilling where nokkel = $1', [nokkel]))?.verdi ?? null; }
async function settVerdi(t: Sporring, nokkel: string, verdi: string) { await t.q('insert into systeminnstilling (nokkel, verdi) values ($1,$2) on conflict (nokkel) do update set verdi = excluded.verdi', [nokkel, verdi]); }

/** Prisen for en pakke. Finnes den ikke i Stripe, lages produkt og pris. Oppslagsnøkkelen inneholder beløpet. */
export async function prisId(pakke: BetaltPakke): Promise<string> {
  const belop = prisFor(pakke);
  const oppslag = `rettfort_${pakke}_${belop}_mnd`;
  const f = await stripe<{ data: { id: string }[] }>('GET', 'prices', { lookup_keys: [oppslag], active: true, limit: 1 });
  if (f.data[0]) return f.data[0].id;
  const navn = PAKKER.find(p => p.k === pakke)!.n;
  const p = await stripe<{ id: string }>('POST', 'prices', {
    currency: 'nok', unit_amount: belop, recurring: { interval: 'month' }, lookup_key: oppslag,
    product_data: { name: `Rettført ${navn}`, metadata: { pakke } }, metadata: { pakke },
  });
  return p.id;
}

/** Prisen for én ekstra ansatt i vaktplanen per måned. Lages i Stripe første gang. */
export async function ekstraPrisId(): Promise<string> {
  const oppslag = `rettfort_ekstra_ansatt_${EKSTRA_ANSATT}_mnd`;
  const f = await stripe<{ data: { id: string }[] }>('GET', 'prices', { lookup_keys: [oppslag], active: true, limit: 1 });
  if (f.data[0]) return f.data[0].id;
  const p = await stripe<{ id: string }>('POST', 'prices', {
    currency: 'nok', unit_amount: EKSTRA_ANSATT, recurring: { interval: 'month' }, lookup_key: oppslag,
    product_data: { name: 'Rettført vaktplan, ekstra ansatt', metadata: { tillegg: 'ekstra_ansatt' } }, metadata: { tillegg: 'ekstra_ansatt' },
  });
  return p.id;
}

export async function antallAnsatte(t: Sporring, orgId: string): Promise<number> {
  return Number((await t.en<{ n: string }>('select count(*) as n from ansatt where organisasjon_id = $1 and aktiv', [orgId]))?.n ?? 0);
}

/**
 * Holder antallet ekstra ansatte i abonnementet i takt med de ansatte i systemet.
 * Gjør ingenting i introduksjonsperioden, uten Stripe eller uten aktivt abonnement.
 */
export async function synkEkstraAnsatte(t: Sporring, orgId: string): Promise<void> {
  if (!tarBetaltForEkstra() || !stripePa()) return;
  const o = await t.en<{ pakke: string; stripe_abonnement: string | null }>('select pakke, stripe_abonnement from organisasjon where id = $1', [orgId]);
  if (!o?.stripe_abonnement) return;
  const antall = ekstraAnsatte(o.pakke, await antallAnsatte(t, orgId));
  const pris = await ekstraPrisId();
  const a = await stripe<{ items: { data: { id: string; quantity: number; price: { id: string } }[] } }>('GET', `subscriptions/${o.stripe_abonnement}`);
  const linje = a.items.data.find(i => i.price.id === pris);
  if (linje && antall === linje.quantity) return;
  if (linje && antall === 0) await stripe('DELETE', `subscription_items/${linje.id}`, { proration_behavior: 'create_prorations' });
  else if (linje) await stripe('POST', `subscription_items/${linje.id}`, { quantity: antall, proration_behavior: 'create_prorations' });
  else if (antall > 0) await stripe('POST', 'subscription_items', { subscription: o.stripe_abonnement, price: pris, quantity: antall, proration_behavior: 'create_prorations' });
}

/** Stripe varsler systemet om trekk, feil og oppsigelser. Endepunktet lages én gang per adresse. */
export async function sikreWebhook(t: Sporring, grunnadresse: string): Promise<void> {
  const url = `${grunnadresse}/api/stripe/webhook`;
  if (await hentVerdi(t, `stripe_webhook:${url}`)) return;
  const w = await stripe<{ id: string; secret: string }>('POST', 'webhook_endpoints', {
    url, description: 'Rettført: abonnement',
    enabled_events: ['checkout.session.completed', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.payment_failed', 'invoice.paid'],
  });
  await settVerdi(t, `stripe_webhook:${url}`, w.secret);
}

export async function webhookHemmeligheter(t: Sporring): Promise<string[]> {
  return (await t.q<{ verdi: string }>(`select verdi from systeminnstilling where nokkel like 'stripe_webhook:%'`)).map(r => r.verdi);
}

/** Sjekker signaturen fra Stripe (HMAC-SHA256 av «tidspunkt.innhold»), og at meldingen ikke er gammel. */
export function gyldigSignatur(innhold: string, header: string | null, hemmeligheter: string[], naa = Date.now()): boolean {
  if (!header) return false;
  const deler = Object.fromEntries(header.split(',').map(d => d.split('=') as [string, string]).filter(d => d.length === 2 && d[0] === 't'));
  const t = Number(deler.t);
  if (!t || Math.abs(naa / 1000 - t) > 300) return false;
  const signaturer = header.split(',').filter(d => d.startsWith('v1=')).map(d => d.slice(3));
  return hemmeligheter.some(h => {
    const forventet = createHmac('sha256', h).update(`${t}.${innhold}`).digest('hex');
    return signaturer.some(s => s.length === forventet.length && timingSafeEqual(Buffer.from(s), Buffer.from(forventet)));
  });
}

/** Kundeportalen: bytte kort, se kvitteringer og si opp. Oppsettet lages én gang. */
async function portalOppsett(t: Sporring): Promise<string> {
  const lagret = await hentVerdi(t, 'stripe_portal');
  if (lagret) return lagret;
  const c = await stripe<{ id: string }>('POST', 'billing_portal/configurations', {
    business_profile: { headline: 'Rettført: abonnement og kvitteringer' },
    features: {
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      customer_update: { enabled: true, allowed_updates: ['email', 'name', 'address'] },
      subscription_cancel: { enabled: true, mode: 'at_period_end' },
    },
  });
  await settVerdi(t, 'stripe_portal', c.id);
  return c.id;
}

type Org = { id: string; navn: string; epost: string | null; stripe_kunde: string | null; stripe_abonnement: string | null };

async function kunde(t: Sporring, o: Org, epost: string): Promise<string> {
  if (o.stripe_kunde) return o.stripe_kunde;
  const k = await stripe<{ id: string }>('POST', 'customers', { name: o.navn, email: o.epost || epost, metadata: { org_id: o.id }, preferred_locales: ['nb'] });
  await t.q('update organisasjon set stripe_kunde = $2 where id = $1', [o.id, k.id]);
  return k.id;
}

/** Betalingsside hos Stripe for en ny pakke. Har foretaket abonnement fra før, byttes pakken der i stedet. */
export async function startBetaling(t: Sporring, orgId: string, pakke: BetaltPakke, epost: string, grunnadresse: string): Promise<{ url: string } | { byttet: true }> {
  const o = await t.en<Org>('select id, navn, epost, stripe_kunde, stripe_abonnement from organisasjon where id = $1', [orgId]);
  if (!o) throw new RegnskapsFeil('Fant ikke foretaket.');
  await sikreWebhook(t, grunnadresse);
  const pris = await prisId(pakke);
  if (o.stripe_abonnement) {
    const a = await stripe<{ status: string; items: { data: { id: string; price: { metadata?: { tillegg?: string } } }[] } }>('GET', `subscriptions/${o.stripe_abonnement}`);
    const pakkelinje = a.items.data.find(i => !i.price.metadata?.tillegg) ?? a.items.data[0];
    if (['active', 'trialing', 'past_due'].includes(a.status)) {
      await stripe('POST', `subscriptions/${o.stripe_abonnement}`, { items: [{ id: pakkelinje.id, price: pris }], proration_behavior: 'create_prorations', cancel_at_period_end: false, metadata: { org_id: orgId, pakke } });
      await t.q(`update organisasjon set pakke = $2, abonnement_status = 'active', abonnement_slutt = null where id = $1`, [orgId, pakke]);
      await synkEkstraAnsatte(t, orgId);
      return { byttet: true };
    }
  }
  const k = await kunde(t, o, epost);
  const s = await stripe<{ url: string }>('POST', 'checkout/sessions', {
    mode: 'subscription', customer: k, client_reference_id: orgId, locale: 'nb',
    line_items: [{ price: pris, quantity: 1 }, ...await ekstraLinje(t, orgId, pakke)],
    subscription_data: { metadata: { org_id: orgId, pakke } },
    metadata: { org_id: orgId, pakke },
    success_url: `${grunnadresse}/abonnement/takk?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${grunnadresse}/abonnement/bekreft?pakke=${pakke}&avbrutt=1`,
  });
  return { url: s.url };
}

/** Linjen for ekstra ansatte på betalingssiden, når den gjelder. */
async function ekstraLinje(t: Sporring, orgId: string, pakke: BetaltPakke): Promise<{ price: string; quantity: number }[]> {
  if (!tarBetaltForEkstra()) return [];
  const antall = ekstraAnsatte(pakke, await antallAnsatte(t, orgId));
  return antall > 0 ? [{ price: await ekstraPrisId(), quantity: antall }] : [];
}

type Abonnement = { id: string; status: string; customer: string; cancel_at_period_end: boolean; current_period_end: number; metadata: { org_id?: string; pakke?: string } };

/** Oppdaterer foretaket ut fra abonnementet i Stripe. Brukes av webhook, etter betaling og når siden åpnes. */
export async function lagreAbonnement(t: Sporring, a: Abonnement, orgId?: string): Promise<void> {
  const org = orgId ?? a.metadata.org_id ?? (await t.en<{ id: string }>('select id from organisasjon where stripe_kunde = $1', [a.customer]))?.id;
  if (!org) return;
  const aktiv = ['active', 'trialing', 'past_due'].includes(a.status);
  const pakke = aktiv && (a.metadata.pakke === 'start' || a.metadata.pakke === 'selskap') ? a.metadata.pakke : 'gratis';
  const slutt = a.cancel_at_period_end || !aktiv ? new Date(a.current_period_end * 1000).toISOString() : null;
  await t.q(`update organisasjon set pakke = $2, stripe_kunde = $3, stripe_abonnement = $4, abonnement_status = $5, abonnement_slutt = $6 where id = $1 and type = 'selskap'`,
    [org, pakke, a.customer, aktiv ? a.id : null, a.status, slutt]);
}

/** Etter at kunden kommer tilbake fra betalingssiden: sjekk betalingen hos Stripe før pakken aktiveres. */
export async function fullforBetaling(t: Sporring, orgId: string, sessionId: string): Promise<boolean> {
  if (!/^cs_[\w]+$/.test(sessionId)) return false;
  const s = await stripe<{ client_reference_id: string | null; status: string; subscription: Abonnement | null }>('GET', `checkout/sessions/${sessionId}`, { expand: ['subscription'] });
  if (s.client_reference_id !== orgId || s.status !== 'complete' || !s.subscription) return false;
  await lagreAbonnement(t, s.subscription, orgId);
  return true;
}

/** Henter abonnementet på nytt fra Stripe, i tilfelle et varsel ikke kom fram. */
export async function synkAbonnement(t: Sporring, orgId: string): Promise<void> {
  const o = await t.en<{ stripe_abonnement: string | null }>('select stripe_abonnement from organisasjon where id = $1', [orgId]);
  if (!o?.stripe_abonnement) return;
  await lagreAbonnement(t, await stripe<Abonnement>('GET', `subscriptions/${o.stripe_abonnement}`), orgId);
}

export async function portalLenke(t: Sporring, orgId: string, grunnadresse: string): Promise<string> {
  const o = await t.en<{ stripe_kunde: string | null }>('select stripe_kunde from organisasjon where id = $1', [orgId]);
  if (!o?.stripe_kunde) throw new RegnskapsFeil('Du har ikke betalt abonnement ennå.');
  const p = await stripe<{ url: string }>('POST', 'billing_portal/sessions', { customer: o.stripe_kunde, configuration: await portalOppsett(t), return_url: `${grunnadresse}/innstillinger?vis=abonnement`, locale: 'nb' });
  return p.url;
}

/** Til Gratis: abonnementet sies opp ved slutten av perioden. Pakken beholdes til da. */
export async function sigOpp(t: Sporring, orgId: string): Promise<string | null> {
  const o = await t.en<{ stripe_abonnement: string | null }>('select stripe_abonnement from organisasjon where id = $1', [orgId]);
  if (!o?.stripe_abonnement) { await t.q(`update organisasjon set pakke = 'gratis' where id = $1`, [orgId]); return null; }
  const a = await stripe<Abonnement>('POST', `subscriptions/${o.stripe_abonnement}`, { cancel_at_period_end: true });
  await lagreAbonnement(t, a, orgId);
  return new Date(a.current_period_end * 1000).toISOString().slice(0, 10);
}

/** Angre en oppsigelse før perioden er ute. */
export async function angreOppsigelse(t: Sporring, orgId: string): Promise<void> {
  const o = await t.en<{ stripe_abonnement: string | null }>('select stripe_abonnement from organisasjon where id = $1', [orgId]);
  if (!o?.stripe_abonnement) throw new RegnskapsFeil('Fant ikke abonnementet.');
  await lagreAbonnement(t, await stripe<Abonnement>('POST', `subscriptions/${o.stripe_abonnement}`, { cancel_at_period_end: false }), orgId);
}

export interface Kvittering { dato: string; tekst: string; belop: number; betalt: boolean; pdf: string | null }
export interface AbonnementDetaljer {
  status: string; sagtOpp: boolean; periodeSlutt: string; nesteBelop: number;
  kort: { merke: string; siste4: string; utlop: string } | null; kvitteringer: Kvittering[];
}

const KORT: Record<string, string> = { visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express' };

/** Neste trekk, kortet og kvitteringene, rett fra Stripe. Beløp i øre med MVA slik Stripe trekker dem. */
export async function abonnementDetaljer(t: Sporring, orgId: string): Promise<AbonnementDetaljer | null> {
  const o = await t.en<{ stripe_abonnement: string | null; stripe_kunde: string | null }>('select stripe_abonnement, stripe_kunde from organisasjon where id = $1', [orgId]);
  if (!o?.stripe_abonnement || !o.stripe_kunde) return null;
  type Pm = { card?: { brand: string; last4: string; exp_month: number; exp_year: number } } | null;
  const a = await stripe<Abonnement & { default_payment_method: Pm; items: { data: { quantity: number; price: { unit_amount: number } }[] } }>('GET', `subscriptions/${o.stripe_abonnement}`, { expand: ['default_payment_method'] });
  const f = await stripe<{ data: { created: number; total: number; status: string; invoice_pdf: string | null; lines: { data: { description: string | null }[] } }[] }>('GET', 'invoices', { customer: o.stripe_kunde, limit: 12 });
  const kort = a.default_payment_method?.card;
  const netto = a.items.data.reduce((s, i) => s + i.price.unit_amount * i.quantity, 0);
  return {
    status: a.status, sagtOpp: a.cancel_at_period_end,
    periodeSlutt: new Date(a.current_period_end * 1000).toISOString().slice(0, 10),
    nesteBelop: Math.round(netto * 1.25),
    kort: kort ? { merke: KORT[kort.brand] ?? kort.brand, siste4: kort.last4, utlop: `${String(kort.exp_month).padStart(2, '0')}/${String(kort.exp_year).slice(2)}` } : null,
    kvitteringer: f.data.map(x => ({ dato: new Date(x.created * 1000).toISOString().slice(0, 10), tekst: x.lines.data[0]?.description ?? 'Rettført', belop: x.total, betalt: x.status === 'paid', pdf: x.invoice_pdf })),
  };
}
