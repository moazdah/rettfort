import Link from 'next/link';
import { kreverSelskap, db, idag } from '@/lib/server';
import { kanEndre } from '@/lib/auth';
import { AGA_SONER, agaForKjoring } from '@/lib/tjenester/lonn';
import { kr, nd, manedNavn } from '@/lib/vis';
import { LonnOppsett } from './Oppsett';
import { LonnKjoring } from './Kjoring';
import type { AnsattData } from './Ansatt';
import { Utfylling } from '@/components/Utfylling';

export const metadata = { title: 'Lønn' };

export default async function Lonn({ searchParams }: { searchParams: Promise<{ vis?: string; amelding?: string }> }) {
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
  // A-melding: tallene for valgt måned (standard: siste kjørte), per ansatt og for virksomheten.
  const amPeriode = sp.amelding && kjort.has(sp.amelding) ? sp.amelding : kjoringer[0]?.periode;
  const amKjoring = kjoringer.find(k => k.periode === amPeriode);
  const amSlipper = amPeriode ? await d.q<{ navn: string; brutto: number; skatt: number }>(`select a.navn, ls.brutto, ls.skatt from lonnslipp ls join lonnskjoring l on l.id = ls.lonnskjoring_id join ansatt a on a.id = ls.ansatt_id where l.organisasjon_id = $1 and l.periode = $2 order by a.navn`, [s.org.id, amPeriode]) : [];
  const sone = AGA_SONER[o?.aga_sone ?? '1'];
  const amAga = amPeriode ? await agaForKjoring(d, s.org.id, amPeriode) : 0;
  const amFrist = amPeriode ? (() => { const [y, m] = amPeriode.split('-').map(Number); return m === 12 ? `05.01.${y + 1}` : `05.${String(m + 1).padStart(2, '0')}.${y}`; })() : '';

  return (
    <div className="stakk" style={{ gap: 20 }}>
      <div className="hode">
        <div><h1>Lønn</h1><div className="mut" style={{ marginTop: 6 }}>{ansatte.length} {ansatte.length === 1 ? 'ansatt' : 'ansatte'}{hittil.length ? ` · utbetalt ${kr(hittil.reduce((a, k) => a + k.netto, 0), { desimaler: false })} kr i ${ar}` : ''}</div></div>
        {!forste && <nav className="faner">{[['kjor', 'Kjør lønn'], ['historikk', 'Tidligere'], ['oppsett', 'Oppsett']].map(([k, t]) => <Link key={k} href={`/lonn?vis=${k}`} className={vis === k ? 'aktiv' : ''}>{t}</Link>)}</nav>}
      </div>
      {vis === 'oppsett' && <LonnOppsett forste={forste} start={{ ferie: o?.ferie_prosent ?? 10.2, lonningsdag: o?.lonningsdag ?? null, otp: o?.otp ?? null, agaSone: o?.aga_sone ?? '1' }} />}
      {vis === 'kjor' && <LonnKjoring ansatte={ansatte} periode={periode} dato={dato} ferie={o?.ferie_prosent ?? 10.2} agaSats={agaSats} firma={o?.navn ?? ''} orgnr={o?.orgnr ?? null} kanEndre={kanEndre(s.rolle)} />}
      {vis === 'historikk' && amKjoring && (
        <section className="kort stakk">
          <div className="rad" style={{ justifyContent: 'space-between' }}>
            <div><h2>A-melding for {manedNavn(amKjoring.periode)}</h2><div className="mut liten">Frist {amFrist}. Du sender selv i Altinn. Tallene står klare under, trykk for å kopiere.</div></div>
            {kjoringer.length > 1 && <nav className="faner">{kjoringer.slice(0, 4).map(k => <Link key={k.periode} href={`/lonn?vis=historikk&amelding=${k.periode}`} className={k.periode === amKjoring.periode ? 'aktiv' : ''}>{manedNavn(k.periode).split(' ')[0]}</Link>)}</nav>}
          </div>
          <ol className="mut liten" style={{ margin: 0, paddingLeft: 18 }}>
            <li>Logg inn i Altinn med BankID, velg {o?.navn ?? 'foretaket'} og åpne a-meldingen for {manedNavn(amKjoring.periode)}.</li>
            <li>Første gang må hver ansatt registreres med fødselsnummer, stillingsprosent og yrke. Deretter er det bare tallene under.</li>
            <li>Kryss av etter hvert. Når alt er fylt inn, sjekk at summene stemmer og send.</li>
          </ol>
          <Utfylling id={`amelding-${s.org.id}-${amKjoring.periode}`} lenke="https://www.altinn.no/" lenketekst="Gå til Altinn"
            rader={[
              ...amSlipper.map(a => ({ tekst: `${a.navn}: lønn og forskuddstrekk`, verdier: [{ etikett: 'Lønn', verdi: kr(a.brutto) }, { etikett: 'Forskuddstrekk', verdi: kr(a.skatt) }] })),
              { tekst: `Arbeidsgiveravgift, sone ${o?.aga_sone ?? '1'} (${sone?.sats ?? 14.1} %)`, verdier: [{ etikett: 'Grunnlag', verdi: kr(amKjoring.brutto) }, { etikett: 'Avgift', verdi: kr(amAga) }] },
              { tekst: 'Sum forskuddstrekk for virksomheten', verdier: [{ etikett: 'Sum', verdi: kr(amKjoring.skatt) }] },
            ]} />
        </section>
      )}
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
