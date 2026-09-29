import { sesjon, db } from '@/lib/server';
import { lonnslippPdf } from '@/lib/tjenester/lonnslipp';

/** Lønnslippen for én ansatt og måned, som PDF. Ikke for rollen som bare leverer kvitteringer. */
export async function GET(req: Request) {
  const s = await sesjon();
  if (!s?.org || s.rolle === 'kvittering') return new Response('Ikke tilgang', { status: 401 });
  const u = new URL(req.url).searchParams;
  const periode = u.get('periode') ?? '', ansatt = u.get('ansatt') ?? '';
  if (!/^\d{4}-\d{2}$/.test(periode) || !/^[0-9a-f-]{36}$/.test(ansatt)) return new Response('Ugyldig', { status: 400 });
  const r = await lonnslippPdf(await db(), s.org.id, periode, ansatt);
  if (!r) return new Response('Fant ikke lønnslippen', { status: 404 });
  return new Response(r.pdf as unknown as BodyInit, { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="${r.filnavn}"` } });
}
