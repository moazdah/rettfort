'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { velgForslag, forslagDirekte } from '@/app/handlinger';
import type { Kort } from '@/lib/ai/verktoy';
import { FakturaDokument, type DokAvsender } from './FakturaDokument';
import type { FakturaLinje } from '@/lib/hovedbok';
import { kr } from '@/lib/penger';

const nd = (d?: string | null) => (d ? d.split('-').reverse().join('.') : '');
const MND = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
const MND_LANG = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];

type Forslag = Extract<Kort, { type: 'forslag' }>;

const KNAPP: Record<string, string> = { faktura: 'Send fakturaen', kostnad: 'Registrer', betaling: 'Registrer betalingen', purring: 'Send purringen', kreditnota: 'Lag kreditnota', mva: 'Merk som sendt' };
const TITTEL: Record<string, string> = { faktura: 'Faktura', kostnad: 'Kostnad', betaling: 'Innbetaling', purring: 'Purring', kreditnota: 'Kreditnota', mva: 'MVA-melding' };

/** Et forslag fra assistenten: vis hva som skal skje, og la brukeren sende, sette på vent eller avbryte. */
type Ferdig = (id: string, status: string, melding: string, lenke?: string) => void;
type Valg = 'utfor' | 'vent' | 'avbryt';

export function ForslagKort({ k, onUtvid, onFerdig, utlos }: { k: Forslag; onUtvid?: () => void; onFerdig?: Ferdig; utlos?: Valg | null }) {
  const router = useRouter();
  const [status, setStatus] = useState(k.status);
  const [melding, setMelding] = useState<{ tekst: string; lenke?: string } | null>(null);
  const [venter, setVenter] = useState('');
  const [feil, setFeil] = useState('');
  const [vis, setVis] = useState(false);
  const d = k.data as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const opptatt = useRef(false);
  const velg = async (valg: Valg) => {
    if (opptatt.current) return;
    opptatt.current = true;
    setVenter(valg); setFeil('');
    const r = await velgForslag(k.id, valg);
    setVenter(''); opptatt.current = false;
    if (!r.ok) { setFeil(r.feil); return; }
    setStatus(r.data!.status); setMelding({ tekst: r.data!.melding, lenke: r.data!.lenke });
    onFerdig?.(k.id, r.data!.status, r.data!.melding, r.data!.lenke);
    router.refresh();
  };
  const aapen = status === 'venter';
  const pdf = (last: boolean) => `/api/assistent/forslag/${k.id}/pdf?s=${status}${last ? '&last=1' : ''}`;
  const fakturaPdf = <a className="lenke liten" href={pdf(true)} download>Last ned fakturaen (PDF)</a>;
  // Brukeren skrev «send»/«vent»/«avbryt» i chatten i stedet for å trykke.
  useEffect(() => { if (utlos && aapen) velg(utlos); }, [utlos]); // eslint-disable-line react-hooks/exhaustive-deps
  const mvaMangler = k.art === 'mva' && Number(d.mangler) > 0;

  return (
    <div className={`ak-kort ${aapen ? '' : 'ferdig'}`} data-forslag={k.id}>
      <div className="ak-topp"><span className="ak-merke">{TITTEL[k.art]}</span>{!aapen && <span className={`ak-status ${status}`}>{status === 'utfort' ? 'Utført' : status === 'pa_vent' ? 'På vent' : 'Avbrutt'}</span>}</div>

      {k.art === 'faktura' && (
        <>
          <b>{d.kunde.navn}</b>
          <div className="ak-linjer">{(d.linjer as FakturaLinje[]).map((l, i) => <div key={i}><span>{l.beskrivelse} × {String(l.antallMilli / 1000).replace('.', ',')}</span><span className="mono">{kr(Math.round(l.pris * l.antallMilli / 1000))}</span></div>)}</div>
          {d.sum.mva > 0 && <div className="ak-linjer mut"><div><span>MVA</span><span className="mono">{kr(d.sum.mva)}</span></div></div>}
          <div className="ak-sum"><span>Totalt inkl. MVA</span><b className="mono">{kr(d.sum.total)} kr</b></div>
          <div className="mut liten">Forfall {nd(d.forfall)} · {d.kunde.epost ? `sendes til ${d.kunde.epost}` : 'kunden har ikke e-post, du må sende PDF-en selv'}</div>
          <div className="ak-valg">
            <button type="button" className="lenke liten" onClick={() => { setVis(!vis); if (!vis) onUtvid?.(); }}>{vis ? 'Skjul fakturaen' : 'Se fakturaen'}</button>
            <a className="lenke liten" href={pdf(true)} download>Last ned PDF</a>
          </div>
          {vis && <div className="ak-dokument"><FakturaDokument type="faktura" dato={d.dato} forfall={d.forfall} referanse={d.referanse} avsender={d.avsender as DokAvsender} kunde={d.kunde} linjer={d.linjer} /></div>}
        </>
      )}
      {k.art === 'kostnad' && (
        <>
          <b>{d.leverandor}</b>
          <div className="ak-rader">
            <span>Beløp</span><b className="mono">{kr(d.total)} kr</b>
            <span>MVA</span><span className="mono">{d.sats ? `${kr(d.mva)} kr (${d.sats} %)` : 'Ingen'}</span>
            <span>Dato</span><span>{nd(d.dato)}</span>
            <span>Føres på</span><span>{d.kontoNavn} ({d.konto})</span>
            <span>Betalt</span><span>{({ bank: 'Firmakort/bank', ubetalt: `Ikke ennå, forfall ${nd(d.forfall)}`, privat: 'Med egne penger (utlegg)', kontant: 'Kontant' } as Record<string, string>)[d.betaltMed]}</span>
          </div>
          {d.tekst && <div className="mut liten">«{d.tekst}»</div>}
          {d.duplikat && <div className="varsel gul liten">Ligner bilag {d.duplikat.nr} fra {nd(d.duplikat.dato)}. Sjekk at det ikke er ført to ganger.</div>}
        </>
      )}
      {k.art === 'betaling' && <><b>Faktura {d.nr} · {d.kunde}</b><div className="ak-sum"><span>Innbetalt {nd(d.dato)}</span><b className="mono">{kr(d.belop)} kr</b></div>{d.belop < d.rest && <div className="mut liten">Delbetaling. {kr(d.rest - d.belop)} kr står igjen.</div>}{fakturaPdf}</>}
      {k.art === 'purring' && <><b>Faktura {d.nr} · {d.kunde}</b><div className="ak-sum"><span>Forfalt {nd(d.forfall)}</span><b className="mono">{kr(d.rest)} kr</b></div><div className="mut liten">Påminnelse med fakturaen vedlagt sendes til {d.epost}.</div>{fakturaPdf}</>}
      {k.art === 'kreditnota' && <><b>Kreditnota på faktura {d.nr} · {d.kunde}</b><div className="ak-sum"><span>Krediteres</span><b className="mono">{kr(d.belop)} kr</b></div><div className="mut liten">Grunn: {d.grunn}</div>{status === 'utfort' ? <a className="lenke liten" href={pdf(true)} download>Last ned kreditnotaen (PDF)</a> : fakturaPdf}</>}
      {k.art === 'mva' && (
        <>
          <b>{d.termin.tittel}</b>
          <div className="ak-sum"><span>{d.aBetale >= 0 ? 'Å betale' : 'Til gode'}</span><b className="mono">{kr(Math.abs(d.aBetale))} kr</b></div>
          <div className="mut liten">Frist {nd(d.frist)}.{mvaMangler ? ` ${d.mangler} ${d.mangler === 1 ? 'bevegelse' : 'bevegelser'} i banken mangler bilag. Ordne dem før du sender.` : ' Alt er klart.'}</div>
          <Link href="/mva" className="lenke liten">Åpne MVA-siden</Link>
        </>
      )}

      {aapen && (
        <div className="ak-knapper">
          <button type="button" className="knapp liten" disabled={!!venter || mvaMangler} onClick={() => velg('utfor')}>{venter === 'utfor' ? 'Et øyeblikk …' : KNAPP[k.art]}</button>
          <button type="button" className="knapp hvit liten" disabled={!!venter} onClick={() => velg('vent')}>{venter === 'vent' ? '…' : 'Sett på vent'}</button>
          <button type="button" className="lenke liten" disabled={!!venter} onClick={() => velg('avbryt')}>Avbryt</button>
        </div>
      )}
      {feil && <div className="varsel rod liten">{feil}</div>}
      {melding && <div className={`varsel ${status === 'avbrutt' ? 'info' : 'gronn'} liten`}>{melding.tekst} {melding.lenke && <Link href={melding.lenke}>Åpne</Link>}</div>}
    </div>
  );
}

/** Søyler per måned. Trykk på en måned for nøkkeltall. */
export function GrafManed({ k }: { k: Extract<Kort, { type: 'graf_maned' }> }) {
  const [valgt, setValgt] = useState<number | null>(null);
  const maks = Math.max(1, ...k.maneder.flatMap(m => [m.inn, m.ut]));
  const m = valgt != null ? k.maneder.find(x => x.maned === valgt) : null;
  const forrige = m ? k.maneder.find(x => x.maned === m.maned - 1) : null;
  const sumInn = k.maneder.reduce((s, x) => s + x.inn, 0), sumUt = k.maneder.reduce((s, x) => s + x.ut, 0);
  return (
    <div className="ak-kort">
      <div className="ak-topp"><span className="ak-merke">Resultat {k.ar}</span><span className="mut liten">Trykk på en måned</span></div>
      <div className="ak-graf" role="group" aria-label={`Inntekter og kostnader per måned i ${k.ar}`}>
        {k.maneder.map(x => (
          <button type="button" key={x.maned} className={`ak-mnd ${valgt === x.maned ? 'valgt' : ''}`} onClick={() => setValgt(valgt === x.maned ? null : x.maned)} aria-label={`${MND_LANG[x.maned - 1]}: inntekter ${kr(x.inn)}, kostnader ${kr(x.ut)}`}>
            <span className="ak-soyler"><span className="inn" style={{ height: `${(x.inn / maks) * 100}%` }} /><span className="ut" style={{ height: `${(x.ut / maks) * 100}%` }} /></span>
            <span className="ak-mnd-navn">{MND[x.maned - 1]}</span>
          </button>
        ))}
      </div>
      <div className="ak-forklaring"><span><i className="inn" /> Inntekter {kr(sumInn, { desimaler: false })}</span><span><i className="ut" /> Kostnader {kr(sumUt, { desimaler: false })}</span></div>
      {m && (
        <div className="ak-detalj">
          <b>{MND_LANG[m.maned - 1][0].toUpperCase() + MND_LANG[m.maned - 1].slice(1)} {k.ar}</b>
          <div className="ak-rader">
            <span>Inntekter</span><span className="mono">{kr(m.inn)} kr</span>
            <span>Kostnader</span><span className="mono">{kr(m.ut)} kr</span>
            <span>Resultat</span><b className={`mono ${m.resultat < 0 ? 'tekst-rod' : 'tekst-gronn'}`}>{kr(m.resultat)} kr</b>
            {forrige && <><span>Mot {MND_LANG[forrige.maned - 1]}</span><span className="mono">{m.resultat - forrige.resultat >= 0 ? '+' : '−'}{kr(Math.abs(m.resultat - forrige.resultat))} kr</span></>}
            <span>Bilag</span><span>{m.bilag}</span>
          </div>
          {m.topp.length > 0 && <><span className="mut liten">Største kostnader</span><div className="ak-linjer">{m.topp.map(t => <div key={t.navn}><span>{t.navn}</span><span className="mono">{kr(t.belop)}</span></div>)}</div></>}
          <Link href="/rapporter?tab=res" className="lenke liten">Åpne resultatregnskapet</Link>
        </div>
      )}
    </div>
  );
}

/** Fakturaer som tabell. Trykk på en rad for detaljer og handlinger. */
export function TabellFakturaer({ k, onNyttKort }: { k: Extract<Kort, { type: 'tabell_fakturaer' }>; onNyttKort: (kort: Kort) => void }) {
  const [valgt, setValgt] = useState<string | null>(null);
  const [feil, setFeil] = useState('');
  const sum = k.rader.reduce((s, x) => s + x.rest, 0);
  const lag = async (v: 'send_purring' | 'registrer_innbetaling', nr: number) => {
    setFeil('');
    const r = await forslagDirekte(v, { faktura_nr: nr });
    if (!r.ok) { setFeil(r.feil); return; }
    if (r.data) onNyttKort(r.data);
  };
  if (!k.rader.length) return <div className="ak-kort"><div className="ak-topp"><span className="ak-merke">{k.tittel}</span></div><span className="mut">Ingen.</span></div>;
  return (
    <div className="ak-kort">
      <div className="ak-topp"><span className="ak-merke">{k.tittel}</span><span className="mono liten">{kr(sum)} kr</span></div>
      <div className="ak-tabell">
        {k.rader.map(r => (
          <div key={r.id}>
            <button type="button" className={`ak-rad ${valgt === r.id ? 'valgt' : ''}`} onClick={() => setValgt(valgt === r.id ? null : r.id)}>
              <span className="fyll"><b>{r.kunde}</b><small className={r.forfalt ? 'tekst-rod' : 'mut'}>Nr. {r.nr} · {r.forfalt ? 'forfalt' : 'forfall'} {nd(r.forfall)}</small></span>
              <span className="mono">{kr(r.rest)}</span>
            </button>
            {valgt === r.id && (
              <div className="ak-radvalg">
                <Link href={`/salg/${r.id}`} className="knapp hvit liten">Åpne fakturaen</Link>
                {r.forfalt && <button type="button" className="knapp liten" onClick={() => lag('send_purring', r.nr)}>Send purring</button>}
                <button type="button" className="knapp hvit liten" onClick={() => lag('registrer_innbetaling', r.nr)}>Registrer betaling</button>
              </div>
            )}
          </div>
        ))}
      </div>
      {feil && <div className="varsel rod liten">{feil}</div>}
    </div>
  );
}

export function Liste({ k }: { k: Extract<Kort, { type: 'liste' }> }) {
  const maks = Math.max(1, ...k.rader.map(r => Math.abs(r.belop)));
  return (
    <div className="ak-kort">
      <div className="ak-topp"><span className="ak-merke">{k.tittel}</span></div>
      <div className="ak-tabell">
        {k.rader.map(r => {
          const innhold = <><span className="fyll"><span>{r.navn}</span><span className="ak-bar"><span style={{ width: `${(Math.abs(r.belop) / maks) * 100}%` }} className={r.belop < 0 ? 'ut' : 'inn'} /></span></span><span className="mono">{kr(r.belop)}</span></>;
          return r.lenke ? <Link key={r.navn} href={r.lenke} className="ak-rad">{innhold}</Link> : <div key={r.navn} className="ak-rad">{innhold}</div>;
        })}
      </div>
    </div>
  );
}

export function VisKort({ k, onUtvid, onNyttKort, onFerdig, utlos }: { k: Kort; onUtvid?: () => void; onNyttKort: (kort: Kort) => void; onFerdig?: Ferdig; utlos?: Valg | null }) {
  if (k.type === 'forslag') return <ForslagKort k={k} onUtvid={onUtvid} onFerdig={onFerdig} utlos={utlos} />;
  if (k.type === 'graf_maned') return <GrafManed k={k} />;
  if (k.type === 'tabell_fakturaer') return <TabellFakturaer k={k} onNyttKort={onNyttKort} />;
  return <Liste k={k} />;
}
