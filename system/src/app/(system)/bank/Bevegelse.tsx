'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { behandleBevegelseHandling } from '@/app/handlinger';
import type { Handling } from '@/lib/tjenester/bank';

export interface BevVis { id: string; dato: string; tekst: string; belop: number; status: string; info: string; forslagTekst: string | null; orgform: string; kanEndre: boolean }

export function BevegelseValg({ b }: { b: BevVis }) {
  const router = useRouter();
  const [venter, start] = useTransition();
  const [feil, setFeil] = useState('');
  const [flere, setFlere] = useState(false);
  const kjor = (h: Handling) => start(async () => {
    setFeil('');
    const r = await behandleBevegelseHandling(b.id, h);
    if (!r.ok) setFeil(r.feil); else router.refresh();
  });
  if (!b.kanEndre || b.status === 'matchet' || b.status === 'ignorert') return null;
  const ut = b.belop < 0;
  const eier = b.orgform === 'ENK' ? (ut ? 'Privat uttak' : 'Eget innskudd') : (ut ? 'Lån til eier' : 'Innskudd fra eier');
  const kjopLenke = `/kjop/ny?lev=${encodeURIComponent(b.tekst.slice(0, 60))}&total=${Math.abs(b.belop)}&dato=${b.dato}`;
  return (
    <div className="stakk" style={{ gap: 6, alignItems: 'flex-end' }}>
      <div className="rad" style={{ justifyContent: 'flex-end', gap: 6 }}>
        {b.status === 'foreslatt' && <button type="button" className="knapp liten" disabled={venter} onClick={() => kjor({ type: 'godkjenn' })}>{b.forslagTekst ?? 'Godkjenn'}</button>}
        {b.status === 'apen' && ut && <Link href={kjopLenke} className="knapp liten">Registrer kjøp</Link>}
        {b.status === 'apen' && !ut && <Link href="/salg/ny" className="knapp liten">Lag kvittering for salget</Link>}
        <button type="button" className="knapp hvit liten" onClick={() => setFlere(!flere)}>{flere ? 'Færre valg' : 'Andre valg'}</button>
      </div>
      {flere && (
        <div className="rad" style={{ justifyContent: 'flex-end', gap: 6 }}>
          {ut && <button type="button" className="knapp hvit liten" disabled={venter} onClick={() => kjor({ type: 'bankpost', post: 'gebyr' })}>Bankgebyr</button>}
          {ut && <button type="button" className="knapp hvit liten" disabled={venter} onClick={() => kjor({ type: 'bankpost', post: 'rentekostnad' })}>Rentekostnad</button>}
          {!ut && <button type="button" className="knapp hvit liten" disabled={venter} onClick={() => kjor({ type: 'bankpost', post: 'renteinntekt' })}>Renteinntekt</button>}
          <button type="button" className="knapp hvit liten" disabled={venter} onClick={() => kjor({ type: 'bankpost', post: ut ? 'uttak' : 'innskudd_eier' })}>{eier}</button>
          <button type="button" className="knapp hvit liten" disabled={venter} onClick={() => kjor({ type: 'skatteetaten', hva: 'mva' })}>{ut ? 'MVA til Skatteetaten' : 'MVA tilbake fra Skatteetaten'}</button>
          {ut && <button type="button" className="knapp hvit liten" disabled={venter} onClick={() => kjor({ type: 'skatteetaten', hva: 'skatt_aga' })}>Skattetrekk og arbeidsgiveravgift</button>}
          <button type="button" className="knapp hvit liten" disabled={venter} onClick={() => kjor({ type: 'bankpost', post: 'overforing' })}>Overføring til egen konto</button>
          <button type="button" className="knapp hvit liten" disabled={venter} onClick={() => { if (confirm('Ignorere bevegelsen? Den blir ikke ført i regnskapet.')) kjor({ type: 'ignorer' }); }}>Ignorer</button>
        </div>
      )}
      {venter && <span className="mut liten">Fører …</span>}
      {feil && <span className="liten" style={{ color: 'var(--rod)' }}>{feil}</span>}
    </div>
  );
}
