'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Maskot } from './Logo';
import { chatMedAssistent } from '@/app/handlinger';
import type { Kort } from '@/lib/ai/verktoy';
import type { Tur } from '@/lib/ai/agent';
import { VisKort } from './AssistentKort';

type Melding =
  | { fra: 'bruker'; tekst: string }
  | { fra: 'assistent'; tekst: string; kort: Kort[]; kilder?: { tekst: string; href: string }[] }
  | { fra: 'notat'; tekst: string }
  | { fra: 'feil'; tekst: string };

const FORSLAG = [
  'Lag en faktura',
  'Hvem skylder oss penger?',
  'Vis resultatet per måned',
  'Hva er de største kostnadene i år?',
  'Hvordan ligger vi an med MVA?',
  'Har vi nok penger de neste 30 dagene?',
];

// Korte svar som gjelder det siste forslaget som venter, så man slipper å trykke.
const UTFOR = /^(ja[,!. ]*)?(godkjenn|godkjent|send( den| det| fakturaen| purringen)?|registrer( den| det)?|utfør|kjør( på)?|gjør det|ok,? send)[.! ]*$/i;
const VENT = /^(sett (den |det )?på vent|vent|ikke ennå|senere)[.! ]*$/i;
const AVBRYT = /^(avbryt|nei,? avbryt|glem det|slett (den|det))[.! ]*$/i;

const TITTEL: Record<string, string> = { faktura: 'fakturaforslag', kostnad: 'kostnadsforslag', betaling: 'innbetaling', purring: 'purring', kreditnota: 'kreditnota', mva: 'MVA-melding' };

/** Assistenten: svarer, viser tall som grafer og tabeller, og lager forslag du sender eller setter på vent. */
export function Assistent() {
  const [apen, setApen] = useState(false);
  const [bred, setBred] = useState(false);
  const [meldinger, setMeldinger] = useState<Melding[]>([]);
  const [tekst, setTekst] = useState('');
  const [venter, setVenter] = useState(false);
  const [igjen, setIgjen] = useState<number | null>(null);
  const [behandlet, setBehandlet] = useState<Record<string, string>>({});
  const [utlos, setUtlos] = useState<{ id: string; valg: 'utfor' | 'vent' | 'avbryt' } | null>(null);
  const bunn = useRef<HTMLDivElement>(null);
  useEffect(() => { bunn.current?.scrollIntoView({ block: 'end' }); }, [meldinger, venter, apen]);
  useEffect(() => {
    if (!apen) return;
    const tast = (e: KeyboardEvent) => { if (e.key === 'Escape') setApen(false); };
    document.addEventListener('keydown', tast);
    return () => document.removeEventListener('keydown', tast);
  }, [apen]);

  const sisteVentende = () => {
    for (let i = meldinger.length - 1; i >= 0; i--) {
      const m = meldinger[i];
      if (m.fra !== 'assistent') continue;
      for (let j = m.kort.length - 1; j >= 0; j--) {
        const k = m.kort[j];
        if (k.type === 'forslag' && k.status === 'venter' && !behandlet[k.id]) return k;
      }
    }
    return null;
  };

  // Historikken modellen får: bare tekst, med en kort merknad om hvilke kort som ble vist og hva brukeren valgte.
  const historikk = (liste: Melding[]): Tur[] => liste.flatMap((m): Tur[] => {
    if (m.fra === 'bruker') return [{ role: 'user' as const, content: m.tekst }];
    if (m.fra === 'assistent') {
      const kort = m.kort.map(k => k.type === 'forslag' ? `${TITTEL[k.art] ?? k.art} (${behandlet[k.id] ?? 'venter på brukeren'})` : k.type === 'graf_maned' ? `graf over resultat ${k.ar}` : k.tittel);
      return [{ role: 'assistant' as const, content: m.tekst + (kort.length ? `\n[Viste kort: ${kort.join('; ')}]` : '') }];
    }
    if (m.fra === 'notat') return [{ role: 'assistant' as const, content: `[${m.tekst}]` }];
    return [];
  });

  const ferdig = (id: string, status: string, melding: string) => {
    setBehandlet(b => ({ ...b, [id]: status === 'utfort' ? 'utført' : status === 'pa_vent' ? 'satt på vent' : 'avbrutt' }));
    setMeldinger(m => [...m, { fra: 'notat', tekst: melding }]);
  };

  const spor = async (q: string) => {
    const s = q.trim(); if (!s || venter) return;
    setTekst('');
    const ventende = sisteVentende();
    const valg = UTFOR.test(s) ? 'utfor' : VENT.test(s) ? 'vent' : AVBRYT.test(s) ? 'avbryt' : null;
    if (ventende && valg) {
      setMeldinger(m => [...m, { fra: 'bruker', tekst: s }]);
      setUtlos({ id: ventende.id, valg });
      return;
    }
    const neste: Melding[] = [...meldinger, { fra: 'bruker', tekst: s }];
    setMeldinger(neste); setVenter(true);
    const r = await chatMedAssistent(historikk(neste));
    setVenter(false);
    if (!r.ok) { setMeldinger(m => [...m, { fra: 'feil', tekst: r.feil }]); return; }
    const d = r.data!;
    if (d.igjen !== undefined) setIgjen(d.igjen);
    setMeldinger(m => [...m, { fra: 'assistent', tekst: d.tekst, kort: d.kort, kilder: d.kilder }]);
  };

  const nyttKort = (k: Kort) => setMeldinger(m => [...m, { fra: 'assistent', tekst: '', kort: [k] }]);

  if (!apen) return (
    <button type="button" className="assistent-knapp ikke-utskrift" onClick={() => setApen(true)} aria-label="Spør assistenten">
      <Maskot storrelse={34} /><span><b>Spør assistenten</b><small>Tall, faktura, kostnader</small></span>
    </button>
  );

  return (
    <section className={`assistent-panel ikke-utskrift ${bred ? 'bred' : ''}`} aria-label="Assistent">
      <header>
        <Maskot storrelse={30} />
        <div className="fyll"><b>Assistenten</b><small>{igjen != null ? `${igjen} svar igjen denne måneden` : 'Spør eller be om hjelp'}</small></div>
        {meldinger.length > 0 && <button type="button" className="lenke liten" onClick={() => { setMeldinger([]); setBehandlet({}); }}>Ny samtale</button>}
        <button type="button" className="lenke liten skjul-mobil" onClick={() => setBred(!bred)} aria-pressed={bred}>{bred ? 'Smalere' : 'Utvid'}</button>
        <button type="button" className="lenke" onClick={() => setApen(false)} aria-label="Lukk">Lukk</button>
      </header>
      <div className="assistent-meldinger" aria-live="polite">
        {!meldinger.length && (
          <div className="stakk" style={{ gap: 10 }}>
            <p className="mut liten" style={{ margin: 0 }}>Spør om tallene dine, eller be meg lage en faktura, føre en kostnad, sende purring eller sjekke MVA. Du ser alltid forslaget før noe sendes.</p>
            <div className="assistent-forslag">{FORSLAG.map(f => <button key={f} type="button" onClick={() => spor(f)}>{f}</button>)}</div>
          </div>
        )}
        {meldinger.map((m, i) => {
          if (m.fra === 'bruker') return <div key={i} className="boble bruker">{m.tekst}</div>;
          if (m.fra === 'feil') return <div key={i} className="boble feil">{m.tekst}</div>;
          if (m.fra === 'notat') return null; // Kortet viser selv hva som skjedde; notatet er bare for historikken.
          return (
            <div key={i} className="ak-svar">
              {m.tekst && <div className="boble svar"><div style={{ whiteSpace: 'pre-line' }}>{m.tekst}</div>{!!m.kilder?.length && <div className="kilder">Kilde: {m.kilder.map((k, j) => <Link key={j} href={k.href} onClick={() => setApen(false)}>{k.tekst}</Link>)}</div>}</div>}
              {m.kort.map(k => (
                <VisKort key={k.type === 'forslag' ? k.id : `${i}-${k.type}`} k={k}
                  onUtvid={() => setBred(true)}
                  onNyttKort={nyttKort}
                  utlos={k.type === 'forslag' && utlos?.id === k.id ? utlos.valg : null}
                  onFerdig={(id, status, melding) => { setUtlos(null); ferdig(id, status, melding); }} />
              ))}
            </div>
          );
        })}
        {venter && <div className="boble svar mut ak-tenker"><span /><span /><span /></div>}
        <div ref={bunn} />
      </div>
      <form className="assistent-skriv" onSubmit={e => { e.preventDefault(); spor(tekst); }}>
        <input className="inndata" value={tekst} onChange={e => setTekst(e.target.value)} placeholder="Skriv til assistenten" aria-label="Melding til assistenten" autoFocus maxLength={2000} />
        <button className="knapp" disabled={!tekst.trim() || venter}>Send</button>
      </form>
    </section>
  );
}
