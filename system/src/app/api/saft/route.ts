import { sesjon, db, idag } from '@/lib/server';
import { lagSaft } from '@/lib/saft';
import { harFulltRegnskap, betaltTekst } from '@/lib/pakker';

export async function GET(req: Request) {
  const s = await sesjon();
  if (!s?.org) return new Response('Ikke logget inn', { status: 401 });
  if (!harFulltRegnskap(s.org.pakke)) return new Response(betaltTekst('saft'), { status: 402, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  const ar = Number(new URL(req.url).searchParams.get('ar')) || Number(idag().slice(0, 4));
  if (ar < 2000 || ar > 2100) return new Response('Ugyldig år', { status: 400 });
  const xml = await lagSaft(await db(), s.org.id, ar, idag());
  const orgnr = s.org.orgnr ?? 'firma';
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'content-disposition': `attachment; filename="SAF-T Financial_${orgnr}_${ar}.xml"` } });
}
