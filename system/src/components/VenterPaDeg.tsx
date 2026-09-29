'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { velgForslag } from '@/app/handlinger';

export interface Ventende { id: string; art: string; tittel: string; tekst: string; knapp: string; sperret?: string }

/** Forslag fra assistenten som er satt på vent. Brukeren sender dem herfra når hen er klar. */
export function VenterPaDeg({ rader }: { rader: Ventende[] }) {
  const router = useRouter();
  const [opptatt, setOpptatt] = useState('');
  const [melding, setMelding] = useState<{ tekst: string; feil?: boolean } | null>(null);
  const velg = async (id: string, valg: 'utfor' | 'avbryt') => {
    setOpptatt(id + valg); setMelding(null);
    const r = await velgForslag(id, valg);
    setOpptatt('');
    setMelding(r.ok ? { tekst: r.data!.melding } : { tekst: r.feil, feil: true });
    router.refresh();
  };
  return (
    <section className="venter-pa-deg">
      <div className="rad" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <h2>Venter på deg</h2>
        <span className="mut liten">Satt på vent fra assistenten</span>
      </div>
      <div className="liste">
        {rader.map(r => (
          <div key={r.id} className="linje">
            <span className="merke" style={{ minWidth: 72, justifyContent: 'center' }}>{r.tittel}</span>
            <span className="fyll tittel">{r.tekst}{r.sperret && <small className="mut" style={{ display: 'block' }}>{r.sperret}</small>}</span>
            <button type="button" className="knapp liten" disabled={!!opptatt || !!r.sperret} onClick={() => velg(r.id, 'utfor')}>{opptatt === r.id + 'utfor' ? '…' : r.knapp}</button>
            <button type="button" className="lenke liten" disabled={!!opptatt} onClick={() => velg(r.id, 'avbryt')}>Fjern</button>
          </div>
        ))}
      </div>
      {melding && <div className={`varsel ${melding.feil ? 'rod' : 'gronn'} liten`} style={{ marginTop: 10 }}>{melding.tekst}</div>}
    </section>
  );
}
