'use client';

import { useEffect, useRef, useState } from 'react';
import type { Enhet } from '@/lib/brreg';

/** Søk i Brønnøysundregistrene på navn eller org.nr. Minst 2 tegn. */
export function BrregSok({ onVelg, plassholder = 'Skriv navn eller org.nr. Vi søker i Brønnøysund.', autoFocus, ekstra }: { onVelg: (e: Enhet) => void; plassholder?: string; autoFocus?: boolean; ekstra?: React.ReactNode }) {
  const [q, setQ] = useState('');
  const [treff, setTreff] = useState<Enhet[]>([]);
  const [status, setStatus] = useState<'' | 'soker' | 'feil' | 'ingen'>('');
  const [feil, setFeil] = useState('');
  const tid = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (tid.current) clearTimeout(tid.current);
    const s = q.trim();
    if (s.length < 2) { setTreff([]); setStatus(''); return; }
    tid.current = setTimeout(async () => {
      setStatus('soker');
      try {
        const r = await fetch(`/api/brreg?q=${encodeURIComponent(s)}`);
        const j = await r.json();
        if (!r.ok) { setStatus('feil'); setFeil(j.feil ?? 'Søket feilet.'); setTreff([]); return; }
        setTreff(j.treff);
        setStatus(j.treff.length ? '' : 'ingen');
      } catch { setStatus('feil'); setFeil('Ingen nettforbindelse.'); }
    }, 250);
  }, [q]);
  return (
    <div>
      <input className="inndata" value={q} onChange={e => setQ(e.target.value)} placeholder={plassholder} autoFocus={autoFocus} aria-label="Søk i Brønnøysund" />
      {status === 'soker' && <p className="hint">Søker …</p>}
      {status === 'feil' && <p className="hint" style={{ color: 'var(--rod)' }}>{feil}</p>}
      {status === 'ingen' && <p className="hint">Fant ingen med det navnet. {/^\d+$/.test(q.replace(/\s/g, '')) && q.replace(/\s/g, '').length < 9 ? 'Skriv hele org.nr (9 siffer).' : ''}</p>}
      {treff.length > 0 && (
        <div className="liste" style={{ marginTop: 8 }}>
          {treff.map(e => (
            <button type="button" key={e.orgnr} className="linje" style={{ width: '100%', border: 0, background: 'none', textAlign: 'left', borderTop: '1px solid var(--linje-3)' }} onClick={() => { onVelg(e); setQ(''); setTreff([]); }}>
              <div className="fyll">
                <div className="tittel">{e.navn}</div>
                <div className="mut liten">{e.orgformNavn} · <span className="mono">{e.orgnr.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')}</span>{e.poststed ? ` · ${e.poststed}` : ''}{e.mvaRegistrert ? ' · MVA-registrert' : ''}</div>
              </div>
            </button>
          ))}
        </div>
      )}
      {ekstra}
    </div>
  );
}
