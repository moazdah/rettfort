// Tallene bak Rapporter: tre svar, fordeling, måned for måned, åpne poster og oppstillinger.

import type { Sporring } from '../db';
import { hentPosteringer } from './bokforing';
import { resultatregnskap, balanse, saldobalanse, manedForManed, type PostRad } from '../rapporter';
import { kontoNavn, kontoType } from '../kontoplan';

export function periodeFor(ar: number, idag: string): { fra: string; til: string } {
  const fra = `${ar}-01-01`;
  const slutt = `${ar}-12-31`;
  return { fra, til: idag < slutt && idag >= fra ? idag : slutt };
}

export async function rapportData(t: Sporring, orgId: string, ar: number, idag: string) {
  const { fra, til } = periodeFor(ar, idag);
  const alle = await hentPosteringer(t, orgId, undefined, til);
  const iAr = alle.filter(r => r.dato >= fra);
  const res = resultatregnskap(alle, fra, til);
  // Samme periode i fjor
  const ifjorTil = `${ar - 1}${til.slice(4)}`;
  const ifjor = resultatregnskap(alle, `${ar - 1}-01-01`, ifjorTil);
  const harIfjor = alle.some(r => r.dato >= `${ar - 1}-01-01` && r.dato <= ifjorTil);
  const bal = balanse(alle, til);
  const sb = saldobalanse(alle, undefined, til);
  const saldo = (fraK: number, tilK: number) => [...sb.entries()].filter(([k]) => k >= fraK && k <= tilK).reduce((a, [, v]) => a + v.saldo, 0);
  const bank = saldo(1900, 1999);
  const kunder = saldo(1500, 1599);
  const gjeld = -saldo(2100, 2999);

  // Fordeling på typer (topp 5 + resten)
  const fordel = (type: 'inntekt' | 'kostnad') => {
    const l = res.linjer.filter(x => (type === 'inntekt' ? x.type === 'inntekt' : x.type === 'kostnad') && x.belop !== 0).sort((a, b) => b.belop - a.belop);
    const topp = l.slice(0, 5);
    const rest = l.slice(5).reduce((a, x) => a + x.belop, 0);
    return rest ? [...topp.map(x => ({ konto: x.konto, navn: x.navn, belop: x.belop })), { konto: 0, navn: 'Annet', belop: rest }] : topp.map(x => ({ konto: x.konto, navn: x.navn, belop: x.belop }));
  };
  const siste = (konto: number, n = 8) => iAr.filter(r => r.konto === konto).slice(-n).reverse();

  // Åpne poster
  const kundePoster = await t.q<{ id: string; nr: number; kunde: string; forfall: string | null; rest: number }>(
    `select f.id, f.nr, coalesce(c.navn,'') as kunde, f.forfall::text as forfall, (f.total - f.betalt - coalesce((select sum(k.total) from faktura k where k.krediterer_id = f.id and k.status <> 'utkast'),0))::bigint as rest
     from faktura f left join kontakt c on c.id = f.kontakt_id where f.organisasjon_id = $1 and f.type = 'faktura' and f.status in ('sendt','delvis_betalt') order by f.forfall`, [orgId]);
  const levPoster = await t.q<{ id: string; navn: string; forfall: string | null; total: number }>(
    `select id, leverandor_navn as navn, forfall::text as forfall, total from kjop where organisasjon_id = $1 and status = 'registrert' order by forfall nulls last`, [orgId]);
  const mvaSkyld = -(sb.get(2740)?.saldo ?? 0);
  const trekk = -(sb.get(2600)?.saldo ?? 0), aga = -((sb.get(2770)?.saldo ?? 0) + (sb.get(2785)?.saldo ?? 0));

  // Saldobalanse: balansekontoer fra starten, resultatkontoer bare for året.
  const sbVis = new Map([...sb.entries()].filter(([k]) => k < 3000).concat([...saldobalanse(alle, fra, til).entries()].filter(([k]) => k >= 3000)).sort((a, b) => a[0] - b[0]));
  return { fra, til, res, sbVis, ifjor: harIfjor ? ifjor : null, bal, sb, bank, kunder, gjeld, inn: fordel('inntekt'), ut: fordel('kostnad'), siste, mnd: manedForManed(iAr, ar), kundePoster: kundePoster.filter(k => k.rest > 0), levPoster, mvaSkyld, trekk, aga, rader: iAr };
}

/** Oppstillingene som tabellrader: [konto, tekst, beløp, sum?] */
export function oppstilling(type: 'res' | 'bal' | 'sb' | 'hb', d: Awaited<ReturnType<typeof rapportData>>): { k: string; t: string; b: number | null; sum?: boolean; d?: string; bilag?: number }[] {
  if (type === 'res') {
    const r = d.res;
    const gr = (t: string) => r.linjer.filter(x => x.type === t).map(x => ({ k: String(x.konto), t: x.navn, b: x.belop }));
    return [
      ...gr('inntekt'), { k: '', t: 'Sum driftsinntekter', b: r.inntekter, sum: true },
      ...gr('kostnad'), { k: '', t: 'Sum driftskostnader', b: r.kostnader, sum: true },
      { k: '', t: 'Driftsresultat', b: r.inntekter - r.kostnader, sum: true },
      ...gr('finansinntekt'), ...gr('finanskostnad'), { k: '', t: 'Netto finans', b: r.finans, sum: true },
      ...gr('skatt'),
      { k: '', t: 'Resultat', b: r.resultat, sum: true },
    ];
  }
  if (type === 'bal') {
    const b = d.bal;
    const gr = (t: string) => b.linjer.filter(x => x.type === t && x.belop !== 0).map(x => ({ k: String(x.konto), t: x.navn, b: x.belop }));
    return [
      ...gr('eiendel'), { k: '', t: 'Sum eiendeler', b: b.eiendeler, sum: true },
      ...gr('egenkapital'), { k: '', t: 'Udisponert resultat', b: b.udisponertResultat }, { k: '', t: 'Sum egenkapital', b: b.egenkapital, sum: true },
      ...gr('gjeld'), { k: '', t: 'Sum gjeld', b: b.gjeld, sum: true },
      { k: '', t: 'Sum egenkapital og gjeld', b: b.egenkapital + b.gjeld, sum: true },
    ];
  }
  if (type === 'sb') {
    return [...d.sbVis.entries()].filter(([, v]) => v.saldo !== 0 || v.debet !== 0).map(([k, v]) => ({ k: String(k), t: kontoNavn(k), b: v.saldo }));
  }
  return d.rader.map((r: PostRad) => ({ k: String(r.konto), t: `${r.beskrivelse ?? ''}`, b: r.debet - r.kredit, d: r.dato, bilag: r.bilagNr }));
}

export { kontoType };
