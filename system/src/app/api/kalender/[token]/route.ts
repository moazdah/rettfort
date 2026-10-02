import { db, idag } from '@/lib/server';
import { lagIcs } from '@/lib/kalender';
import { kommendeFrister } from '@/lib/frister';
import { fristValg } from '@/lib/tjenester/oversikt';

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = token.replace(/\.ics$/, '');
  if (!/^[A-Za-z0-9_-]{20,}$/.test(t)) return new Response('Ugyldig lenke', { status: 404 });
  const d = await db();
  const o = await d.en<{ id: string; navn: string }>('select id, navn from organisasjon where kalender_token = $1', [t]);
  if (!o) return new Response('Ugyldig lenke', { status: 404 });
  const fra = new Date(Date.parse(idag()) - 60 * 86400000).toISOString().slice(0, 10);
  const frister = kommendeFrister(fra, 15, await fristValg(d, o.id));
  const ics = lagIcs(o.navn, frister, new URL('/frister', req.url).toString());
  return new Response(ics, { headers: { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': 'inline; filename="frister.ics"', 'cache-control': 'private, max-age=3600' } });
}
