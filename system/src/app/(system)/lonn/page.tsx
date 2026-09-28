import Link from 'next/link';
import { kreverSelskap, db, idag } from '@/lib/server';
import { kanEndre } from '@/lib/auth';
import { AGA_SONER } from '@/lib/tjenester/lonn';
import { kr, nd, manedNavn } from '@/lib/vis';
import { LonnOppsett } from './Oppsett';
import { LonnKjoring } from './Kjoring';
import type { AnsattData } from './Ansatt';

export const metadata = { title: 'Lønn' };

export default async function Lonn({ searchParams }: { searchParams: Promise<{ vis?: string }> }) {
  const s = await kreverSelskap();
  const d = await db();
  const dag = idag();
  const sp = await searchParams;
  const o = await d.en<{ ferie_prosent: number; lonningsdag: number | null; otp: string | null; aga_sone: string; navn: string; orgnr: string | null }>('select ferie_prosent, lonningsdag, otp, aga_sone, navn, orgnr from organisasjon where id = $1', [s.org.id]);
  const ansatte = await d.q<AnsattData & { id: string }>(`select id, navn, epost, stilling, lonn_type, manedslonn, timesats, skatteprosent, kontonr, startdato::text as startdato from ansatt where organisasjon_id = $1 and aktiv order by navn`, [s.org.id]);
  const kjoringer = await d.q<{ periode: string; utbetalingsdato: string; brutto: number; skatt: number; netto: number; aga: number; feriepenger: number; nr: number | null }>(`select l.periode, l.utbetalingsdato::text as utbetalingsdato, l.brutto, l.skatt, l.netto, l.aga, l.feriepenger, b.nr from lonnskjoring l left join bilag b on b.id = l.bilag_id where l.organisasjon_id = $1 order by l.periode desc`, [s.org.id]);
  const kjort = new Set(kjoringer.map(k => k.periode));
  // Neste måned som ikke er kjørt, fra og med denne måneden.
  let periode = dag.slice(0, 7);
  while (kjort.has(periode)) { const [y, m] = periode.split('-').map(Number); periode = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; }
  const [py, pm] = periode.split('-').map(Number);
  const sisteDag = new Date(Date.UTC(py, pm, 0)).getUTCDate();
  const dato = `${periode}-${String(Math.min(o?.lonningsdag ?? sisteDag, sisteDag)).padStart(2, '0')}`;
  const agaSats = AGA_SONER[o?.aga_sone ?? '1']?.sats ?? 14.1;
  const forste = o?.lonningsdag == null;
  const vis = forste ? 'oppsett' : ['kjor', 'historikk', 'oppsett'].includes(sp.vis ?? '') ? sp.vis! : 'kjor';
  const ar = dag.slice(0, 4);
  const hittil = kjoringer.filter(k => k.periode.startsWith(ar));

  return (
    <div className="stakk" style={{ gap: 20 }}>
      <div className="hode">
        <div><h1>Lønn</h1><div className="mut" style={{ marginTop: 6 }}>{ansatte.length} {ansatte.length === 1 ? 'ansatt' : 'ansatte'}{hittil.length ? ` · utbetalt ${kr(hittil.reduce((a, k) => a + k.netto, 0), { desimaler: false })} kr i ${ar}` : ''}</div></div>
        {!forste && <nav className="faner">{[['kjor', 'Kjør lønn'], ['historikk', 'Tidligere'], ['oppsett', 'Oppsett']].map(([k, t]) => <Link key={k} href={`/lonn?vis=${k}`} className={vis === k ? 'aktiv' : ''}>{t}</Link>)}</nav>}
      </div>
      {vis === 'oppsett' && <LonnOppsett forste={forste} start={{ ferie: o?.ferie_prosent ?? 10.2, lonningsdag: o?.lonningsdag ?? null, otp: o?.otp ?? null, agaSone: o?.aga_sone ?? '1' }} />}
      {vis === 'kjor' && <LonnKjoring ansatte={ansatte} periode={periode} dato={dato} ferie={o?.ferie_prosent ?? 10.2} agaSats={agaSats} firma={o?.navn ?? ''} orgnr={o?.orgnr ?? null} kanEndre={kanEndre(s.rolle)} />}
      {vis === 'historikk' && (
        <section className="kort stakk">
          <div className="rad" style={{ justifyContent: 'space-between' }}><h2>Kjørte lønninger</h2><a className="knapp hvit liten" href={`/api/lonn?ar=${ar}`}>Lønnsoversikt og feriepengeliste (CSV)</a></div>
          {kjoringer.length ? (
            <div style={{ overflowX: 'auto' }}><table className="tabell">
              <thead><tr><th>Måned</th><th>Utbetalt</th><th className="h">Brutto</th><th className="h">Skattetrekk</th><th className="h">Netto</th><th className="h">AGA</th><th className="h">Feriepenger</th><th>Bilag</th></tr></thead>
              <tbody>{kjoringer.map(k => <tr key={k.periode}><td>{manedNavn(k.periode)}</td><td>{nd(k.utbetalingsdato)}</td><td className="h belop">{kr(k.brutto)}</td><td className="h belop">{kr(k.skatt)}</td><td className="h belop">{kr(k.netto)}</td><td className="h belop">{kr(k.aga)}</td><td className="h belop">{kr(k.feriepenger)}</td><td className="mono">{k.nr}</td></tr>)}</tbody>
            </table></div>
          ) : <p className="mut">Ingen lønn er kjørt ennå.</p>}
        </section>
      )}
    </div>
  );
}
