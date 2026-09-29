import { getDb } from '@/lib/db';
import { sendForfalte } from '@/lib/tjenester/lonnslipp';
import { grunnadresse } from '@/lib/epost';

/** Daglig jobb: sender lønnslipper som er planlagt til i dag. Kan kjøres flere ganger uten å sende noe to ganger. */
export async function GET(req: Request) {
  const hemmelig = process.env.CRON_SECRET;
  if (hemmelig && req.headers.get('authorization') !== `Bearer ${hemmelig}`) return new Response('Ikke tilgang', { status: 401 });
  const r = await sendForfalte(await getDb(), await grunnadresse());
  return Response.json({ sendt: r.sendt.length, feilet: r.feilet.length });
}
