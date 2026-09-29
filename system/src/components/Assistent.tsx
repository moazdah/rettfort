'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Maskot } from './Logo';
import { sporAssistent } from '@/app/handlinger';
import { FORSLAG, type Svar } from '@/lib/assistent';

type Melding = { fra: 'bruker'; tekst: string } | { fra: 'assistent'; svar: Svar } | { fra: 'feil'; tekst: string };

/** Assistenten: svarer på spørsmål om egne tall, med kilde. Med i Selskap og Byrå. */
export function Assistent() {
  const [apen, setApen] = useState(false);
  const [meldinger, setMeldinger] = useState<Melding[]>([]);
  const [tekst, setTekst] = useState('');
  const [venter, setVenter] = useState(false);
  const bunn = useRef<HTMLDivElement>(null);
  useEffect(() => { bunn.current?.scrollIntoView({ block: 'end' }); }, [meldinger, venter, apen]);
  useEffect(() => {
    if (!apen) return;
    const tast = (e: KeyboardEvent) => { if (e.key === 'Escape') setApen(false); };
    document.addEventListener('keydown', tast);
    return () => document.removeEventListener('keydown', tast);
  }, [apen]);

  const spor = async (q: string) => {
    const s = q.trim(); if (!s || venter) return;
    setTekst(''); setMeldinger(m => [...m, { fra: 'bruker', tekst: s }]); setVenter(true);
    const r = await sporAssistent(s);
    setVenter(false);
    setMeldinger(m => [...m, r.ok ? { fra: 'assistent', svar: r.data! } : { fra: 'feil', tekst: r.feil }]);
  };

  if (!apen) return (
    <button type="button" className="assistent-knapp ikke-utskrift" onClick={() => setApen(true)} aria-label="Spør assistenten">
      <Maskot storrelse={34} /><span><b>Spør assistenten</b><small>Svar med kilde</small></span>
    </button>
  );

  return (
    <section className="assistent-panel ikke-utskrift" aria-label="Assistent">
      <header>
        <Maskot storrelse={30} />
        <div className="fyll"><b>Assistenten</b><small>Svarer ut fra regnskapet ditt, med kilde</small></div>
        <button type="button" className="lenke" onClick={() => setApen(false)} aria-label="Lukk">Lukk</button>
      </header>
      <div className="assistent-meldinger" aria-live="polite">
        {!meldinger.length && (
          <div className="stakk" style={{ gap: 10 }}>
            <p className="mut liten" style={{ margin: 0 }}>Spør om tallene dine. Jeg regner ingenting selv, alt hentes fra regnskapet.</p>
            <div className="assistent-forslag">{FORSLAG.map(f => <button key={f} type="button" onClick={() => spor(f)}>{f}</button>)}</div>
          </div>
        )}
        {meldinger.map((m, i) => m.fra === 'bruker'
          ? <div key={i} className="boble bruker">{m.tekst}</div>
          : m.fra === 'feil'
            ? <div key={i} className="boble feil">{m.tekst}</div>
            : <div key={i} className="boble svar"><div style={{ whiteSpace: 'pre-line' }}>{m.svar.tekst}</div>{m.svar.kilder.length > 0 && <div className="kilder">Kilde: {m.svar.kilder.map((k, j) => <Link key={j} href={k.href} onClick={() => setApen(false)}>{k.tekst}</Link>)}</div>}</div>)}
        {venter && <div className="boble svar mut">Ser i regnskapet …</div>}
        <div ref={bunn} />
      </div>
      <form className="assistent-skriv" onSubmit={e => { e.preventDefault(); spor(tekst); }}>
        <input className="inndata" value={tekst} onChange={e => setTekst(e.target.value)} placeholder="Skriv et spørsmål" aria-label="Spørsmål" autoFocus maxLength={500} />
        <button className="knapp" disabled={!tekst.trim() || venter}>Send</button>
      </form>
    </section>
  );
}
