'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
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
const antall = (milli: number) => String(milli / 1000).replace('.', ',');

type Forslag = Extract<Kort, { type: 'forslag' }>;
type Valg = 'utfor' | 'vent' | 'avbryt';
export type Ferdig = (id: string, status: string, melding: string, lenke?: string) => void;

const KNAPP: Record<string, string> = { faktura: 'Send fakturaen', kostnad: 'Før kostnad', betaling: 'Registrer betalingen', purring: 'Send purringen', kreditnota: 'Lag kreditnota', mva: 'Merk som sendt', skannelenke: 'Send lenken', invitasjon: 'Send invitasjonen', lonn: 'Kjør lønn', lonnslipp: 'Send lønnslippen', kunde: 'Legg til kunden' };
const TITTEL: Record<string, string> = { faktura: 'Faktura', kostnad: 'Kostnad', betaling: 'Innbetaling', purring: 'Purring', kreditnota: 'Kreditnota', mva: 'MVA-melding', skannelenke: 'Skannelenke', invitasjon: 'Invitasjon', lonn: 'Lønnskjøring', lonnslipp: 'Lønnslipp', kunde: 'Ny kunde' };
const APNE: Record<string, string> = { faktura: 'Åpne faktura', kostnad: 'Åpne bilag', betaling: 'Åpne faktura', purring: 'Åpne faktura', kreditnota: 'Åpne kreditnota', mva: 'Åpne MVA', skannelenke: 'Åpne innboksen', invitasjon: 'Åpne brukere', lonn: 'Åpne lønn', lonnslipp: 'Åpne lønn', kunde: 'Åpne' };
const STATUS: Record<string, [string, string]> = { venter: ['Venter på deg', 'venter'], utfort: ['Lagret', 'utfort'], pa_vent: ['På vent', 'pa_vent'], avbrutt: ['Avbrutt', 'avbrutt'] };
const UTKAST_ART = new Set(['faktura', 'kostnad']);

const PdfIkon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M12 4v11M7 10l5 5 5-5" /><path d="M5 20h14" /></svg>;
const ApneIkon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" /></svg>;

/** Felles ramme for alle kort: tittel øverst, valgfritt merke til høyre. */
function Ramme({ tittel, hoyre, status, children }: { tittel: string; hoyre?: ReactNode; status?: string; children: ReactNode }) {
  return (
    <div className={`ak-kort ${status ?? ''}`}>
      <div className="ak-kort-topp"><span className="ak-kort-tittel">{tittel}</span>{hoyre}</div>
      {children}
    </div>
  );
}

const Linjer = ({ rader }: { rader: [ReactNode, ReactNode][] }) => (
  <div className="ak-linjer">{rader.map(([k, v], i) => <div key={i}><span>{k}</span><span>{v}</span></div>)}</div>
);

/** Et forslag fra assistenten: vis hva som skal skje, og la brukeren sende, sette på vent eller avbryte. */
export function ForslagKort({ k, onUtvid, onFerdig, onEndre, utlos }: { k: Forslag; onUtvid?: () => void; onFerdig?: Ferdig; onEndre?: () => void; utlos?: Valg | null }) {
  const router = useRouter();
  const [status, setStatus] = useState(k.status);
  const [melding, setMelding] = useState<{ tekst: string; lenke?: string } | null>(k.melding ? { tekst: k.melding, lenke: k.lenke } : null);
  const [venter, setVenter] = useState('');
  const [feil, setFeil] = useState('');
  const [vis, setVis] = useState(false);
  const d = k.data as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const opptatt = useRef(false);
  useEffect(() => { setStatus(k.status); }, [k.status]);
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
  const pdf = `/api/assistent/forslag/${k.id}/pdf?s=${status}&last=1`;
  const harPdf = ['faktura', 'betaling', 'purring', 'kreditnota'].includes(k.art);
  // Brukeren skrev «send»/«vent»/«avbryt» i chatten i stedet for å trykke.
  useEffect(() => { if (utlos && aapen) velg(utlos); }, [utlos]); // eslint-disable-line react-hooks/exhaustive-deps
  const mvaMangler = k.art === 'mva' && Number(d.mangler) > 0;
  const [stTekst, stKlasse] = STATUS[status] ?? STATUS.venter;

  let rader: [ReactNode, ReactNode][] = [];
  let sum: [string, number] = ['', 0];
  let ekstra: ReactNode = null;
  if (k.art === 'faktura') {
    rader = [['Kunde', d.kunde.navn], ...(d.linjer as FakturaLinje[]).map((l): [ReactNode, ReactNode] => [l.beskrivelse, `${antall(l.antallMilli)} × ${kr(l.pris)} kr`])];
    if (d.sum.mva > 0) rader.push(['MVA', `${kr(d.sum.mva)} kr`]);
    rader.push(['Forfall', nd(d.forfall)], ['Sendes til', d.kunde.epost ?? 'Ingen e-post, send PDF-en selv']);
    sum = ['Å betale', d.sum.total];
    ekstra = (
      <>
        <div className="ak-kort-valg">
          <button type="button" className="ak-lenkeknapp" onClick={() => { setVis(!vis); if (!vis) onUtvid?.(); }}>{vis ? 'Skjul fakturaen' : 'Se fakturaen'}</button>
          {aapen && <a className="ak-lenkeknapp" href={pdf} download>Last ned PDF</a>}
        </div>
        {vis && <div className="ak-dokument"><FakturaDokument type="faktura" dato={d.dato} forfall={d.forfall} referanse={d.referanse} avsender={d.avsender as DokAvsender} kunde={d.kunde} linjer={d.linjer} /></div>}
      </>
    );
  } else if (k.art === 'kostnad') {
    rader = [['Leverandør', d.leverandor], ['Konto', `${d.konto} ${d.kontoNavn}`], ['MVA', d.sats ? `${d.sats} %, ${kr(d.mva)} kr` : 'Ingen'], ['Dato', nd(d.dato)],
      ['Betalt', ({ bank: 'Firmakort/bank', ubetalt: `Ikke ennå, forfall ${nd(d.forfall)}`, privat: 'Med egne penger (utlegg)', kontant: 'Kontant' } as Record<string, string>)[d.betaltMed]]];
    if (d.tekst) rader.push(['Tekst', d.tekst]);
    sum = ['Totalt', d.total];
    if (d.duplikat) ekstra = <div className="ak-kort-merknad gul">Ligner bilag {d.duplikat.nr} fra {nd(d.duplikat.dato)}. Sjekk at det ikke er ført to ganger.</div>;
  } else if (k.art === 'betaling') {
    rader = [['Faktura', `${d.nr} · ${d.kunde}`], ['Dato', nd(d.dato)]];
    if (d.belop < d.rest) rader.push(['Står igjen etterpå', `${kr(d.rest - d.belop)} kr`]);
    sum = ['Innbetalt', d.belop];
  } else if (k.art === 'purring') {
    rader = [['Faktura', `${d.nr} · ${d.kunde}`], ['Forfalt', nd(d.forfall)], ['Sendes til', d.epost], ['Vedlegg', 'Fakturaen som PDF']];
    sum = ['Utestående', d.rest];
  } else if (k.art === 'kreditnota') {
    rader = [['Faktura', `${d.nr} · ${d.kunde}`], ['Grunn', d.grunn]];
    sum = ['Krediteres', d.belop];
  } else if (k.art === 'skannelenke') {
    rader = [['Til', d.navn ? `${d.navn} · ${d.epost}` : d.epost], ['Hvem', d.type === 'ansatt' ? 'Ansatt (utlegg og kvitteringer)' : 'Klient (kvitteringer og fakturaer)'], ['Virker', 'Til du sletter lenken']];
    sum = ['', 0];
    ekstra = <div className="ak-kort-merknad gul" style={{ margin: 0, background: 'var(--kort-2)', color: 'var(--mut)' }}>E-posten har en QR-kode og en lenke. Bildene de tar, havner i innboksen under Penger ut.</div>;
  } else if (k.art === 'invitasjon') {
    rader = [['E-post', d.epost], ['Tilgang', ({ full: 'Full tilgang, kan føre', les: 'Kan se, ikke endre', kvittering: 'Kan bare levere kvitteringer' } as Record<string, string>)[d.rolle] ?? d.rolle]];
  } else if (k.art === 'lonn') {
    rader = (d.slipper as { navn: string; brutto: number; netto: number; epost: string | null }[]).map((x): [ReactNode, ReactNode] => [x.navn, `${kr(x.netto)} kr netto`]);
    rader.push(['Brutto', `${kr(d.sum.brutto)} kr`], ['Skattetrekk', `${kr(d.sum.skatt)} kr`], ['Arbeidsgiveravgift', `${kr(d.sum.aga)} kr`], ['Utbetales', nd(d.utbetalingsdato)],
      ['Lønnslipper', d.send === 'na' ? 'Sendes med en gang' : d.send === 'ingen' ? 'Sendes ikke' : 'Sendes på utbetalingsdagen']);
    sum = ['Til utbetaling', d.sum.netto];
    const adv = (d.slipper as { navn: string; advarsler: string[] }[]).flatMap(x => x.advarsler.map(a => `${x.navn}: ${a}`));
    if (adv.length) ekstra = <div className="ak-kort-merknad gul">{adv.join(' ')}</div>;
  } else if (k.art === 'lonnslipp') {
    rader = [['Ansatt', d.navn], ['Måned', d.periode], ['Sendes til', d.epost]];
    sum = ['Netto', d.netto];
  } else if (k.art === 'kunde') {
    rader = [['Navn', d.navn], ...(d.orgnr ? [['Org.nr', d.orgnr] as [string, string]] : []), ['E-post', d.epost ?? 'Ingen'], ['Adresse', [d.adresse, [d.postnr, d.poststed].filter(Boolean).join(' ')].filter(Boolean).join(', ') || 'Ingen']];
  } else if (k.art === 'mva') {
    rader = [['Termin', d.termin.tittel], ['Frist', nd(d.frist)], ['Status', mvaMangler ? `${d.mangler} ${d.mangler === 1 ? 'bevegelse' : 'bevegelser'} i banken mangler bilag` : 'Alt er klart']];
    sum = [d.aBetale >= 0 ? 'Å betale' : 'Til gode', Math.abs(d.aBetale)];
    ekstra = <div className="ak-kort-valg"><Link href="/mva" className="ak-lenkeknapp">Åpne MVA-siden</Link></div>;
  }

  return (
    <Ramme tittel={`${TITTEL[k.art]}${aapen ? ' · forslag' : ''}`} status={stKlasse} hoyre={<span className={`ak-status ${stKlasse}`}>{stTekst}</span>}>
      <div data-forslag={k.id} className="ak-kort-innhold">
        <Linjer rader={rader} />
        {ekstra}
      </div>
      {sum[0] && <div className="ak-kort-sum"><span>{sum[0]}</span><span className="tall">{kr(sum[1])} kr</span></div>}
      {aapen && (
        <div className="ak-kort-knapper">
          <button type="button" className="ak-knapp hoved" disabled={!!venter || mvaMangler} onClick={() => velg('utfor')}>{venter === 'utfor' ? 'Et øyeblikk …' : KNAPP[k.art]}</button>
          <button type="button" className="ak-knapp" disabled={!!venter} onClick={() => velg('vent')}>{venter === 'vent' ? '…' : 'Sett på vent'}</button>
          {onEndre && <button type="button" className="ak-knapp" disabled={!!venter} onClick={onEndre}>Endre</button>}
          <button type="button" className="ak-knapp stille" disabled={!!venter} onClick={() => velg('avbryt')}>Avbryt</button>
        </div>
      )}
      {feil && <div className="ak-kort-merknad rod">{feil}</div>}
      {!aapen && (
        <div className="ak-kort-ferdig">
          <span className={status === 'avbrutt' ? 'mut' : status === 'pa_vent' ? 'vent' : 'ok'}>{status === 'utfort' ? '✓ ' : ''}{melding?.tekst ?? (status === 'utfort' ? 'Utført' : status === 'pa_vent' ? 'Satt på vent' : 'Avbrutt. Ingenting er endret.')}</span>
          {status !== 'avbrutt' && (
            <span className="ak-kort-ferdig-knapper">
              {melding?.lenke && <Link href={melding.lenke} className="ak-liten-knapp" title="Åpne"><ApneIkon />{status === 'pa_vent' && UTKAST_ART.has(k.art) ? 'Åpne utkast' : APNE[k.art]}</Link>}
              {harPdf && <a href={pdf} download className="ak-liten-knapp" title="Last ned PDF" aria-label="Last ned PDF"><PdfIkon />PDF</a>}
            </span>
          )}
        </div>
      )}
    </Ramme>
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
    <Ramme tittel={`Resultat ${k.ar}`} hoyre={<span className="ak-hint">Trykk på en måned</span>}>
      <div className="ak-kort-innhold">
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
            <Linjer rader={[
              ['Inntekter', `${kr(m.inn)} kr`], ['Kostnader', `${kr(m.ut)} kr`],
              ['Resultat', <b key="r" className={m.resultat < 0 ? 'tekst-rod' : 'tekst-gronn'}>{kr(m.resultat)} kr</b>],
              ...(forrige ? [[`Mot ${MND_LANG[forrige.maned - 1]}`, `${m.resultat - forrige.resultat >= 0 ? '+' : '−'}${kr(Math.abs(m.resultat - forrige.resultat))} kr`] as [string, string]] : []),
              ['Bilag', String(m.bilag)],
            ]} />
            {m.topp.length > 0 && <><span className="ak-hint">Største kostnader</span><Linjer rader={m.topp.map(t => [t.navn, `${kr(t.belop)} kr`])} /></>}
            <Link href="/rapporter?tab=res" className="ak-lenkeknapp">Åpne resultatregnskapet</Link>
          </div>
        )}
      </div>
    </Ramme>
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
  return (
    <Ramme tittel={k.tittel} hoyre={k.rader.length ? <span className="ak-hint">Trykk på en faktura</span> : undefined}>
      {!k.rader.length ? <div className="ak-kort-innhold mut">Ingen.</div> : (
        <div className="ak-tabell">
          {k.rader.map(r => (
            <div key={r.id}>
              <button type="button" className={`ak-rad ${valgt === r.id ? 'valgt' : ''}`} onClick={() => setValgt(valgt === r.id ? null : r.id)} aria-expanded={valgt === r.id}>
                <span className="ak-rad-nr">{r.nr}</span>
                <span className="fyll"><span className="ak-rad-navn">{r.kunde}</span><small className={r.forfalt ? 'tekst-rod' : ''}>{r.forfalt ? 'Forfalt' : 'Forfall'} {nd(r.forfall)}</small></span>
                <span className="tall">{kr(r.rest)}</span>
              </button>
              {valgt === r.id && (
                <div className="ak-radvalg">
                  <Link href={`/salg/${r.id}`} className="ak-liten-knapp"><ApneIkon />Åpne</Link>
                  <a href={`/api/faktura/${r.id}/pdf`} download className="ak-liten-knapp"><PdfIkon />PDF</a>
                  {r.forfalt && <button type="button" className="ak-liten-knapp" onClick={() => lag('send_purring', r.nr)}>Send purring</button>}
                  <button type="button" className="ak-liten-knapp" onClick={() => lag('registrer_innbetaling', r.nr)}>Registrer betaling</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {k.rader.length > 0 && <div className="ak-kort-sum"><span>Sum</span><span className="tall">{kr(sum)} kr</span></div>}
      {feil && <div className="ak-kort-merknad rod">{feil}</div>}
    </Ramme>
  );
}

export function Liste({ k }: { k: Extract<Kort, { type: 'liste' }> }) {
  const maks = Math.max(1, ...k.rader.map(r => Math.abs(r.belop)));
  return (
    <Ramme tittel={k.tittel}>
      <div className="ak-tabell">
        {k.rader.map(r => {
          const innhold = r.tekst != null
            ? <><span className="fyll"><span className="ak-rad-navn">{r.navn}</span></span><span className="tall">{r.tekst}</span></>
            : <><span className="fyll"><span className="ak-rad-navn">{r.navn}</span><span className="ak-bar"><span style={{ width: `${(Math.abs(r.belop) / maks) * 100}%` }} className={r.belop < 0 ? 'ut' : 'inn'} /></span></span><span className="tall">{kr(r.belop)}</span></>;
          return r.lenke ? <Link key={r.navn} href={r.lenke} className="ak-rad">{innhold}</Link> : <div key={r.navn} className="ak-rad statisk">{innhold}</div>;
        })}
      </div>
    </Ramme>
  );
}

export function VisKort({ k, onUtvid, onNyttKort, onFerdig, onEndre, utlos }: { k: Kort; onUtvid?: () => void; onNyttKort: (kort: Kort) => void; onFerdig?: Ferdig; onEndre?: () => void; utlos?: Valg | null }) {
  if (k.type === 'forslag') return <ForslagKort k={k} onUtvid={onUtvid} onFerdig={onFerdig} onEndre={onEndre} utlos={utlos} />;
  if (k.type === 'graf_maned') return <GrafManed k={k} />;
  if (k.type === 'tabell_fakturaer') return <TabellFakturaer k={k} onNyttKort={onNyttKort} />;
  return <Liste k={k} />;
}
