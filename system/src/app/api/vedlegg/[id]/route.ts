import { sesjon, db } from '@/lib/server';
import { hentVedlegg } from '@/lib/vedlegg';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await sesjon();
  if (!s?.org) return new Response('Ikke logget inn', { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('Ugyldig', { status: 400 });
  const v = await hentVedlegg(await db(), s.org.id, id);
  if (!v) return new Response('Fant ikke vedlegget', { status: 404 });
  return new Response(v.data as unknown as BodyInit, { headers: { 'content-type': v.mime, 'content-disposition': `inline; filename="${encodeURIComponent(v.filnavn)}"`, 'cache-control': 'private, max-age=3600' } });
}
