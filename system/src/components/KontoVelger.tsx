'use client';

import { useMemo, useState } from 'react';
import { sokKonto, konto as finnKonto, KONTOPLAN } from '@/lib/kontoplan';

const VANLIGE = [6800, 6540, 6551, 6420, 6900, 7000, 7140, 7350, 6860, 7790];

/** «Hva slags kjøp er dette?» Søk med vanlige ord. Kontonummeret vises for den som vil se det. */
export function KontoVelger({ verdi, onVelg, forslag }: { verdi: number; onVelg: (nr: number) => void; forslag?: { nr: number; grunn: string } | null }) {
  const [apen, setApen] = useState(false);
  const [q, setQ] = useState('');
  const k = finnKonto(verdi);
  const treff = useMemo(() => (q.trim() ? sokKonto(q, true, 8) : VANLIGE.map(n => finnKonto(n)!).filter(Boolean)), [q]);
  return (
    <div className="stakk" style={{ gap: 8 }}>
      <span className="mut liten">Hva slags kjøp er dette?</span>
      <div className="rad" style={{ border: '1px solid var(--linje-2)', borderRadius: 10, padding: '10px 12px', flexWrap: 'nowrap', background: '#fff' }}>
        <div style={{ flex: 1, minWidth: 0 }}><b style={{ fontWeight: 600 }}>{k?.navn ?? 'Velg type'}</b><div className="mut liten">{k?.beskrivelse}</div></div>
        <span className="mono faint liten">{verdi || ''}</span>
        <button type="button" className="knapp hvit liten" onClick={() => setApen(!apen)}>{apen ? 'Lukk' : 'Bytt'}</button>
      </div>
      {forslag && forslag.nr === verdi && <div className="liten mut"><b>Foreslått:</b> {forslag.grunn}</div>}
      {apen && (
        <div className="kort stakk" style={{ padding: 14, gap: 8 }}>
          <input className="inndata" value={q} onChange={e => setQ(e.target.value)} placeholder="Søk med vanlige ord: strøm, bil, verktøy …" autoFocus aria-label="Søk etter type kjøp" />
          {!q.trim() && <span className="stikk mut">Vanlige valg</span>}
          <div className="stakk" style={{ gap: 4 }}>
            {treff.map(t => (
              <button type="button" key={t.nr} onClick={() => { onVelg(t.nr); setApen(false); setQ(''); }} className="valgkort" style={{ padding: '9px 12px', display: 'flex', gap: 10, alignItems: 'center', borderColor: t.nr === verdi ? 'var(--ink)' : undefined }}>
                <span style={{ flex: 1 }}><b style={{ fontWeight: 500 }}>{t.navn}</b><span className="mut liten" style={{ display: 'block' }}>{t.beskrivelse}</span></span>
                <span className="mono faint liten">{t.nr}</span>
              </button>
            ))}
          </div>
          {q.trim() && !treff.length && <span className="mut liten">Fant ingenting på «{q}». Prøv et annet ord.</span>}
        </div>
      )}
    </div>
  );
}

export const KJOPSKONTOER = KONTOPLAN.filter(k => k.kjop).map(k => ({ nr: k.nr, navn: k.navn }));
