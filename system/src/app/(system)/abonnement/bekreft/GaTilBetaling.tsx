'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { byttPakke } from '@/app/handlinger';

/** Lager betalingen hos Stripe og sender videre. Ved bytte mellom betalte pakker byttes det direkte. */
export function GaTilBetaling({ pakke, tekst }: { pakke: 'start' | 'selskap'; tekst: string }) {
  const [venter, setVenter] = useState(false);
  const [feil, setFeil] = useState('');
  const router = useRouter();
  const ga = async () => {
    setVenter(true); setFeil('');
    const r = await byttPakke(pakke);
    if (!r.ok) { setVenter(false); setFeil(r.feil); return; }
    if (r.data?.url) { location.href = r.data.url; return; }
    router.push(`/abonnement/takk?pakke=${pakke}`);
  };
  return (
    <div className="stakk" style={{ gap: 8 }}>
      <button type="button" className="knapp stor" style={{ width: '100%' }} disabled={venter} onClick={ga}>{venter ? <><span className="spinner" aria-hidden /> Et øyeblikk …</> : tekst}</button>
      {feil && <div className="varsel rod">{feil}</div>}
    </div>
  );
}
