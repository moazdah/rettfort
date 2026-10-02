import { sesjon, db, idag } from '@/lib/server';

const tall = (o: number) => (o / 100).toFixed(2).replace('.', ',');
const cel = (s: string | number) => { const t = String(s); return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };

/** Lønnsoversikt per ansatt og måned, med opptjente feriepenger. For regnskapsføreren. */
export async function GET(req: Request) {
  const s = await sesjon();
  if (!s?.org) return new Response('Ikke logget inn', { status: 401 });
  const ar = String(Number(new URL(req.url).searchParams.get('ar')) || idag().slice(0, 4));
  const d = await db();
  const r = await d.q<{ periode: string; navn: string; brutto: number; skatt: number; netto: number; feriepenger: number }>(
    `select l.periode, a.navn, s.brutto, s.skatt, s.netto, s.feriepenger from lonnslipp s join lonnskjoring l on l.id = s.lonnskjoring_id join ansatt a on a.id = s.ansatt_id where l.organisasjon_id = $1 and l.periode like $2 order by a.navn, l.periode`, [s.org.id, `${ar}-%`]);
  const linjer: (string | number)[][] = [['Ansatt', 'Måned', 'Brutto', 'Skattetrekk', 'Netto', 'Feriepenger opptjent']];
  for (const x of r) linjer.push([x.navn, x.periode, tall(x.brutto), tall(x.skatt), tall(x.netto), tall(x.feriepenger)]);
  const navn = [...new Set(r.map(x => x.navn))];
  linjer.push([], ['Sum per ansatt', '', 'Brutto', 'Skattetrekk', 'Netto', 'Feriepenger til utbetaling neste år']);
  for (const n of navn) { const l = r.filter(x => x.navn === n); linjer.push([n, ar, tall(l.reduce((a, x) => a + x.brutto, 0)), tall(l.reduce((a, x) => a + x.skatt, 0)), tall(l.reduce((a, x) => a + x.netto, 0)), tall(l.reduce((a, x) => a + x.feriepenger, 0))]); }
  const csv = '﻿' + linjer.map(l => l.map(cel).join(';')).join('\r\n');
  return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="lonn-${ar}.csv"` } });
}
