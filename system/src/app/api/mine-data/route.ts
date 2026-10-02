import { sesjon, db } from '@/lib/server';
import { mineData } from '@/lib/tjenester/konto';

/** Last ned egne data (personopplysninger) som JSON. */
export async function GET() {
  const s = await sesjon();
  if (!s) return new Response('Ikke logget inn', { status: 401 });
  const data = await mineData(await db(), s.bruker.id);
  return new Response(JSON.stringify(data, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="rettfort-mine-data-${new Date().toISOString().slice(0, 10)}.json"`, 'cache-control': 'no-store' } });
}
