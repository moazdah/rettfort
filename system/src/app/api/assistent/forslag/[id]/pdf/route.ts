import { sesjon, db } from '@/lib/server';
import { forslagPdf } from '@/lib/ai/utfor';

/** Fakturaen i et forslag fra assistenten som PDF. ?last=1 laster ned i stedet for å åpne. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await sesjon();
  if (!s?.org) return new Response('Ikke logget inn', { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('Ugyldig', { status: 400 });
  const r = await forslagPdf(await db(), s.org.id, id);
  if (!r) return new Response('Fant ikke dokumentet', { status: 404 });
  const last = new URL(req.url).searchParams.has('last');
  return new Response(r.pdf as unknown as BodyInit, { headers: { 'content-type': 'application/pdf', 'content-disposition': `${last ? 'attachment' : 'inline'}; filename="${r.filnavn}"`, 'cache-control': 'no-store' } });
}
