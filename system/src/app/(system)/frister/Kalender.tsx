'use client';

import { useState } from 'react';
import { kalenderLenke } from '@/app/handlinger';

export function Kalender() {
  const [lenke, setLenke] = useState('');
  const [feil, setFeil] = useState('');
  const [kopiert, setKopiert] = useState('');
  const hent = async (app: string) => {
    let l = lenke;
    if (!l) {
      const r = await kalenderLenke();
      if (!r.ok) { setFeil(r.feil); return; }
      l = `${location.origin}/api/kalender/${r.data!.token}.ics`;
      setLenke(l);
    }
    if (app === 'Apple Kalender') { location.href = l.replace(/^https?:/, 'webcal:'); return; }
    if (app === 'Google Kalender') { window.open(`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(l.replace(/^https?:/, 'webcal:'))}`, '_blank'); return; }
    try { await navigator.clipboard.writeText(l); setKopiert(`Lenken er kopiert. Lim den inn i ${app} under «Legg til kalender fra Internett».`); } catch { setKopiert(''); }
  };
  return (
    <div className="stakk" style={{ gap: 10 }}>
      <div className="rad">{['Google Kalender', 'Apple Kalender', 'Outlook'].map(a => <button type="button" key={a} className="knapp hvit liten" onClick={() => hent(a)}>{a}</button>)}</div>
      {lenke && <div className="mono liten" style={{ wordBreak: 'break-all', background: 'var(--kort-2)', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--linje)' }}>{lenke}</div>}
      {kopiert && <span className="liten" style={{ color: 'var(--gronn)' }}>{kopiert}</span>}
      {feil && <span className="liten" style={{ color: 'var(--rod)' }}>{feil}</span>}
      <span className="faint liten">Lenken er privat. Del den bare med dem som skal se fristene.</span>
    </div>
  );
}
