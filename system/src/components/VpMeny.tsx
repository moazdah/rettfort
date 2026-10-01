'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Logo } from './Logo';
import { AssistentKnapp } from './Assistent';
import { loggUt } from '@/app/handlinger';

/** Toppmenyen på vaktplan.rettført.no. Bare vaktplanen, og en lenke tilbake til regnskapet. */
export function VpMeny({ firma, bruker, epost, regnskap, assistent }: { firma: string; bruker: string; epost: string; regnskap: string; assistent: boolean }) {
  const [apen, setApen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!apen) return;
    const lukk = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setApen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setApen(false); };
    document.addEventListener('mousedown', lukk); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', lukk); document.removeEventListener('keydown', esc); };
  }, [apen]);
  const initialer = bruker.split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase();
  return (
    <header className="toppmeny ikke-utskrift">
      <div className="toppmeny-indre">
        <Link href="/" className="logo vp-logo" aria-label="Rettført Vaktplan, til uka"><Logo bredde={100} /><span className="vp-produkt">Vaktplan</span></Link>
        <span className="vp-firma">{firma}</span>
        <div className="toppmeny-hoyre">
          <a href={`${regnskap}/hjem`} className="knapp hvit liten vp-til-regnskap">Til regnskapet <span aria-hidden>↗</span></a>
          {assistent && <AssistentKnapp />}
          <div className="nedtrekk profil" ref={ref}>
            <button type="button" className={`profil-knapp ${apen ? 'apen' : ''}`} aria-expanded={apen} aria-haspopup="true" onClick={() => setApen(x => !x)}>
              <span className="avatar">{initialer}</span>
            </button>
            {apen && (
              <div className="nedtrekk-panel hoyre profil-panel" role="menu">
                <div className="profil-info"><b>{bruker}</b><span>{epost}</span></div>
                <a href={`${regnskap}/hjem`} role="menuitem">Regnskapet</a>
                <a href={`${regnskap}/lonn`} role="menuitem">Lønn</a>
                <a href={`${regnskap}/innstillinger`} role="menuitem">Innstillinger</a>
                <form action={loggUt}><button className="logg-ut" role="menuitem">Logg ut</button></form>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
