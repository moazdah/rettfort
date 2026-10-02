'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Timeliste } from '@/lib/tjenester/vaktplan';
import { timer } from '@/lib/vaktplan';
import { godkjennTimerHandling } from '@/app/vaktplan-handlinger';

/** Timer fra vaktplanen for uker som er over. Lederen godkjenner, og timene fylles inn i Kjør lønn. */
export function Timelister({ lister, kanEndre }: { lister: Timeliste[]; kanEndre: boolean }) {
  const router = useRouter();
  const [opptatt, setOpptatt] = useState('');
  const [feil, setFeil] = useState('');
  return (
    <section className="kort stakk">
      <h2>Timer fra vaktplanen</h2>
      <p className="mut liten" style={{ margin: 0 }}>Godkjenn timene for uker som er over. Da fylles de inn under, og overtid får tillegget sitt. Fastlønnede får overtiden lagt til, og trekk for fravær uten lønn.</p>
      {lister.map(l => (
        <div key={`${l.aar}-${l.uke}`} className="stakk" style={{ gap: 6 }}>
          <div className="rad" style={{ justifyContent: 'space-between' }}>
            <b>Uke {l.uke}</b>
            {kanEndre && <button type="button" className="knapp liten" disabled={!!opptatt} onClick={async () => {
              setOpptatt(`${l.aar}-${l.uke}`); setFeil('');
              const r = await godkjennTimerHandling(l.aar, l.uke);
              setOpptatt('');
              if (!r.ok) setFeil(r.feil); else router.refresh();
            }}>{opptatt === `${l.aar}-${l.uke}` ? '…' : 'Godkjenn timene'}</button>}
          </div>
          <div className="liste">
            {l.rader.map(r => (
              <div key={r.ansattId} className="linje">
                <span className="fyll">{r.navn} <small className="mut">{r.lonnType === 'time' ? 'timelønn' : 'fastlønn'}</small></span>
                <span className="mono">{timer(r.arbeid)}</span>
                {r.overtid > 0 && <span className="merke gul">{timer(r.overtid)} overtid</span>}
              </div>
            ))}
          </div>
        </div>
      ))}
      {feil && <div className="varsel rod liten">{feil}</div>}
    </section>
  );
}
