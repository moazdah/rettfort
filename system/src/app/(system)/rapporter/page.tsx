import Link from 'next/link';
import { kreverSelskap, db, idag } from '@/lib/server';
import { rapportData, oppstilling } from '@/lib/tjenester/rapport';
import { kr, nd, MANEDER } from '@/lib/vis';

export const metadata = { title: 'Rapporter' };

const FARGER = ['#35AE74', '#0B2545', '#F6DF6E', '#8FB8DE', '#C9C2B4', '#E4DFD4'];
const FANER = [['res', 'Resultatregnskap'], ['bal', 'Balanse'], ['sb', 'Saldobalanse'], ['hb', 'Hovedbok']] as const;

function Fordeling({ tittel, sum, deler, siste }: { tittel: string; sum: number; deler: { konto: number; navn: string; belop: number }[]; siste: (k: number) => { dato: string; beskrivelse?: string | null; debet: number; kredit: number }[] }) {
  return (
    <div className="stakk" style={{ gap: 8 }}>
      <div className="rad" style={{ justifyContent: 'space-between' }}><b>{tittel}</b><span className="belop">{kr(sum)} kr</span></div>
      <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', background: 'var(--noyt-bg)' }}>
        {deler.map((d, i) => <span key={d.navn} title={`${d.navn}: ${kr(d.belop)} kr`} style={{ width: `${sum ? Math.max(0, (d.belop / sum) * 100) : 0}%`, background: FARGER[i % FARGER.length] }} />)}
      </div>
      <div className="stakk" style={{ gap: 2 }}>
        {deler.map((d, i) => (
          <details key={d.navn}>
            <summary className="rad liten" style={{ cursor: d.konto ? 'pointer' : 'default', gap: 8, flexWrap: 'nowrap' }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: FARGER[i % FARGER.length], flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{d.navn}</span><span className="belop mut">{kr(d.belop)}</span>
            </summary>
            {d.konto > 0 && (
              <div className="liten" style={{ padding: '4px 0 8px 18px' }}>
                {siste(d.konto).map((p, j) => <div key={j} className="rad" style={{ flexWrap: 'nowrap', gap: 8 }}><span className="mut mono" style={{ width: 44 }}>{nd(p.dato).slice(0, 5)}</span><span style={{ flex: 1 }}>{p.beskrivelse ?? ''}</span><span className="belop">{kr(Math.abs(p.debet - p.kredit))}</span></div>)}
              </div>
            )}
          </details>
        ))}
      </div>
    </div>
  );
}

export default async function Rapporter({ searchParams }: { searchParams: Promise<{ ar?: string; tab?: string }> }) {
  const s = await kreverSelskap();
  const d = await db();
  const dag = idag();
  const sp = await searchParams;
  const aar = await d.q<{ ar: number }>(`select distinct extract(year from dato)::int as ar from bilag where organisasjon_id = $1 order by 1`, [s.org.id]);
  const ar = sp.ar && /^\d{4}$/.test(sp.ar) ? Number(sp.ar) : Number(dag.slice(0, 4));
  const tab = (FANER.find(f => f[0] === sp.tab)?.[0] ?? 'res') as (typeof FANER)[number][0];
  const r = await rapportData(d, s.org.id, ar, dag);
  const endring = r.ifjor && r.ifjor.resultat !== 0 ? Math.round(((r.res.resultat - r.ifjor.resultat) / Math.abs(r.ifjor.resultat)) * 100) : null;
  const skyldPoster = [
    ...(r.mvaSkyld > 0 ? [{ t: 'MVA til Skatteetaten', d: 'Oppgjør for sendt termin', b: r.mvaSkyld, href: '/mva' }] : []),
    ...(r.trekk + r.aga > 0 ? [{ t: 'Skattetrekk og arbeidsgiveravgift', d: 'Til Skatteetaten', b: r.trekk + r.aga, href: '/frister' }] : []),
    ...r.levPoster.map(l => ({ t: l.navn, d: `Regning${l.forfall ? ` · forfall ${nd(l.forfall)}` : ''}`, b: l.total, href: `/kjop/${l.id}` })),
  ];
  const storst = skyldPoster.slice().sort((a, b) => b.b - a.b)[0];
  const maks = Math.max(1, ...r.mnd.map(m => Math.max(m.inn, m.ut)));
  const sisteMnd = ar === Number(dag.slice(0, 4)) ? Number(dag.slice(5, 7)) : 12;
  const rader = oppstilling(tab, r);
  const inn = r.inn.reduce((a, x) => a + x.belop, 0), ut = r.ut.reduce((a, x) => a + x.belop, 0);
  const siste = (k: number) => r.siste(k);

  return (
    <div className="stakk" style={{ gap: 20 }}>
      <div className="hode">
        <div><h1>Rapporter</h1><div className="mut" style={{ marginTop: 6 }}>{nd(r.fra)} – {nd(r.til)}</div></div>
        {aar.length > 1 && <nav className="faner">{aar.map(a => <Link key={a.ar} href={`/rapporter?ar=${a.ar}&tab=${tab}`} className={a.ar === ar ? 'aktiv' : ''}>{a.ar}</Link>)}</nav>}
      </div>

      <div className="rutenett tre">
        <section className="kort"><div className="stikk mut">Tjener jeg penger?</div><div className="belop" style={{ fontSize: 28, fontWeight: 600, margin: '6px 0' }}>{kr(r.res.resultat, { desimaler: false })} kr</div><p className="mut liten">{r.res.resultat >= 0 ? 'Det er overskuddet' : 'Det er underskuddet'} så langt i år{endring != null ? `, ${Math.abs(endring)} % ${endring >= 0 ? 'mer' : 'mindre'} enn på samme tid i fjor` : ''}.</p></section>
        <section className="kort"><div className="stikk mut">Hva har jeg?</div><div className="belop" style={{ fontSize: 28, fontWeight: 600, margin: '6px 0' }}>{kr(r.bank + r.kunder, { desimaler: false })} kr</div><p className="mut liten">{kr(r.bank, { desimaler: false })} kr i banken{r.kunder ? `, og kunder skylder deg ${kr(r.kunder, { desimaler: false })} kr` : ''}.</p></section>
        <section className="kort"><div className="stikk mut">Hva skylder jeg?</div><div className="belop" style={{ fontSize: 28, fontWeight: 600, margin: '6px 0' }}>{kr(Math.max(0, r.gjeld), { desimaler: false })} kr</div><p className="mut liten">{storst ? `Mest ${storst.t.startsWith('MVA') || storst.t.startsWith('Skatt') ? storst.t.charAt(0).toLowerCase() + storst.t.slice(1) : `til ${storst.t}`}, ${kr(storst.b, { desimaler: false })} kr.` : 'Ingen ubetalte regninger.'}</p></section>
      </div>

      <section className="kort stakk" style={{ gap: 18 }}>
        <h2>Hva pengene kommer fra og går til</h2>
        <div className="rutenett to" style={{ gap: 28 }}>
          <Fordeling tittel="Inntekter" sum={inn} deler={r.inn} siste={siste} />
          <Fordeling tittel="Utgifter" sum={ut} deler={r.ut} siste={siste} />
        </div>
      </section>

      <section className="kort stakk">
        <div className="rad" style={{ justifyContent: 'space-between' }}><h2>Måned for måned</h2><span className="rad liten mut"><span style={{ width: 10, height: 10, background: 'var(--gronn-lys)', borderRadius: 2 }} /> Inn <span style={{ width: 10, height: 10, background: '#C9C2B4', borderRadius: 2 }} /> Ut</span></div>
        <div className="stolper" role="img" aria-label="Inntekter og utgifter per måned">
          {r.mnd.slice(0, sisteMnd).map(m => (
            <div key={m.maned} className="stakk" style={{ flex: 1, gap: 4, height: '100%', alignItems: 'stretch' }}>
              <div className="par" title={`${MANEDER[m.maned - 1]}: inn ${kr(m.inn)} kr, ut ${kr(m.ut)} kr`}>
                <div className="inn" style={{ height: `${Math.max(0, (m.inn / maks) * 100)}%` }} />
                <div className="ut" style={{ height: `${Math.max(0, (m.ut / maks) * 100)}%` }} />
              </div>
              <span className="faint" style={{ fontSize: 11, textAlign: 'center' }}>{MANEDER[m.maned - 1].slice(0, 3)}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="rutenett to">
        <section className="kort stakk">
          <div className="rad" style={{ justifyContent: 'space-between' }}><h2>Kunder skylder deg</h2><span className="belop">{kr(r.kundePoster.reduce((a, k) => a + k.rest, 0))} kr</span></div>
          {r.kundePoster.length ? r.kundePoster.map(k => (
            <Link key={k.id} href={`/salg/${k.id}`} className="rad" style={{ textDecoration: 'none', borderTop: '1px solid var(--linje-3)', paddingTop: 8, flexWrap: 'nowrap' }}>
              <div style={{ flex: 1 }}><div>{k.kunde}</div><div className="liten" style={{ color: k.forfall && k.forfall < dag ? 'var(--rod)' : 'var(--mut)' }}>Faktura {k.nr} · {k.forfall && k.forfall < dag ? `forfalt ${nd(k.forfall)}` : `forfall ${nd(k.forfall)}`}</div></div>
              <span className="belop">{kr(k.rest)}</span>
            </Link>
          )) : <p className="mut liten">Alle fakturaer er betalt.</p>}
        </section>
        <section className="kort stakk">
          <div className="rad" style={{ justifyContent: 'space-between' }}><h2>Du skylder</h2><span className="belop">{kr(skyldPoster.reduce((a, k) => a + k.b, 0))} kr</span></div>
          {skyldPoster.length ? skyldPoster.map((k, i) => (
            <Link key={i} href={k.href} className="rad" style={{ textDecoration: 'none', borderTop: '1px solid var(--linje-3)', paddingTop: 8, flexWrap: 'nowrap' }}>
              <div style={{ flex: 1 }}><div>{k.t}</div><div className="mut liten">{k.d}</div></div><span className="belop">{kr(k.b)}</span>
            </Link>
          )) : <p className="mut liten">Ingenting ubetalt.</p>}
        </section>
      </div>

      <section className="kort stakk">
        <div className="rad" style={{ justifyContent: 'space-between' }}>
          <div><h2>For regnskapsføreren</h2><div className="mut liten">Vanlige oppstillinger med kontonummer</div></div>
          <div className="rad">
            <a className="knapp hvit liten" href={`/api/rapport?type=${tab}&ar=${ar}`}>Excel (CSV)</a>
            <a className="knapp hvit liten" href={`/api/saft?ar=${ar}`}>SAF-T</a>
          </div>
        </div>
        <nav className="faner">{FANER.map(([k, t]) => <Link key={k} href={`/rapporter?ar=${ar}&tab=${k}`} className={tab === k ? 'aktiv' : ''}>{t}</Link>)}</nav>
        {tab === 'bal' && r.bal.differanse !== 0 && <div className="varsel rod">Balansen går ikke opp (differanse {kr(r.bal.differanse)} kr). Ta kontakt med oss.</div>}
        <div style={{ overflowX: 'auto' }}>
          <table className="tabell">
            <thead><tr>{tab === 'hb' && <><th>Dato</th><th>Bilag</th></>}<th>Konto</th><th>{tab === 'hb' ? 'Tekst' : 'Navn'}</th><th className="h">{tab === 'hb' ? 'Beløp (debet +)' : tab === 'sb' ? 'Saldo (debet +)' : 'Beløp'}</th></tr></thead>
            <tbody>
              {rader.slice(0, tab === 'hb' ? 1500 : 500).map((x, i) => (
                <tr key={i} className={x.sum ? 'sum' : ''}>{tab === 'hb' && <><td className="mono liten">{nd(x.d)}</td><td className="mono liten">{x.bilag}</td></>}<td className="mono faint">{x.k}</td><td>{tab === 'hb' ? <><span className="faint liten">{x.k ? '' : ''}</span>{x.t}</> : x.t}</td><td className="h belop">{x.b == null ? '' : kr(x.b)}</td></tr>
              ))}
            </tbody>
          </table>
          {tab === 'hb' && rader.length > 1500 && <p className="mut liten">Viser de første 1 500 linjene. Last ned CSV for alt.</p>}
        </div>
      </section>
    </div>
  );
}
