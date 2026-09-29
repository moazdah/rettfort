import { getDb } from '@/lib/db';
import { mottaInnsending } from '@/lib/tjenester/innsending';
import { RegnskapsFeil } from '@/lib/hovedbok';

/** Mottar bilder fra skannesiden. Krever ikke innlogging; lenken bestemmer hvor dokumentet havner. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const fd = await req.formData();
    const sider = await Promise.all(fd.getAll('side').filter((f): f is File => f instanceof File && f.size > 0)
      .map(async f => ({ data: new Uint8Array(await f.arrayBuffer()), mime: f.type || 'image/jpeg' })));
    const r = await mottaInnsending(await getDb(), token, sider, { tekst: String(fd.get('tekst') ?? ''), betaltMed: String(fd.get('betaltMed') ?? '') || null });
    return Response.json({ ok: true, id: r.id });
  } catch (e) {
    const feil = e instanceof RegnskapsFeil ? e.message : 'Noe gikk galt. Prøv igjen.';
    if (!(e instanceof RegnskapsFeil)) console.error('Skann feilet:', e);
    return Response.json({ ok: false, feil }, { status: 400 });
  }
}
