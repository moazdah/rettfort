import { NextResponse } from 'next/server';
import { sokEnheter, hentUnderenhet } from '@/lib/brreg';
import { sesjon } from '@/lib/server';

export async function GET(req: Request) {
  const s = await sesjon();
  if (!s) return NextResponse.json({ feil: 'Ikke innlogget' }, { status: 401 });
  const url = new URL(req.url);
  const q = url.searchParams.get('q') ?? '';
  try {
    if (url.searchParams.get('underenhet')) {
      return NextResponse.json({ underenhet: await hentUnderenhet(url.searchParams.get('underenhet')!) });
    }
    return NextResponse.json({ treff: await sokEnheter(q, 8) });
  } catch {
    return NextResponse.json({ feil: 'Brønnøysundregistrene svarer ikke akkurat nå. Prøv igjen, eller fyll ut selv.' }, { status: 502 });
  }
}
