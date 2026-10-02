import { sesjon, db, idag } from '@/lib/server';
import { rapportData, oppstilling } from '@/lib/tjenester/rapport';
import { kontoNavn } from '@/lib/kontoplan';

const NAVN = { res: 'resultatregnskap', bal: 'balanse', sb: 'saldobalanse', hb: 'hovedbok' } as const;
const tall = (o: number | null) => (o == null ? '' : (o / 100).toFixed(2).replace('.', ','));
const cel = (s: string | number) => { const t = String(s); return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };

export async function GET(req: Request) {
  const s = await sesjon();
  if (!s?.org) return new Response('Ikke logget inn', { status: 401 });
  const u = new URL(req.url);
  const type = (Object.keys(NAVN).includes(u.searchParams.get('type') ?? '') ? u.searchParams.get('type') : 'res') as keyof typeof NAVN;
  const ar = Number(u.searchParams.get('ar')) || Number(idag().slice(0, 4));
  const d = await rapportData(await db(), s.org.id, ar, idag());
  const rader = oppstilling(type, d);
  const hode = type === 'hb' ? ['Dato', 'Bilag', 'Konto', 'Kontonavn', 'Tekst', 'Beløp'] : ['Konto', 'Navn', 'Beløp'];
  const linjer = [hode, ...rader.map(r => type === 'hb' ? [r.d ?? '', r.bilag ?? '', r.k, kontoNavn(Number(r.k)), r.t, tall(r.b)] : [r.k, r.t, tall(r.b)])];
  // Semikolon og BOM gjør at norsk Excel åpner filen riktig.
  const csv = '﻿' + linjer.map(l => l.map(cel).join(';')).join('\r\n');
  return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${NAVN[type]}-${ar}.csv"` } });
}
