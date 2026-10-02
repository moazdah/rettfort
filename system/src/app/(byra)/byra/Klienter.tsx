'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BrregSok } from '@/components/BrregSok';
import { byttForetak, opprettKlient } from '@/app/handlinger';
import type { Enhet } from '@/lib/brreg';

export function AapneKnapp({ id, tekst = 'Åpne', klasse = 'knapp liten' }: { id: string; tekst?: string; klasse?: string }) {
  const [venter, setVenter] = useState(false);
  return <button type="button" className={klasse} disabled={venter} onClick={async () => { setVenter(true); await byttForetak(id); }}>{venter ? 'Åpner …' : tekst}</button>;
}

export function NyKlient() {
  const router = useRouter();
  const [apen, setApen] = useState(false);
  const [feil, setFeil] = useState('');
  const [ok, setOk] = useState('');
  const velg = async (e: Enhet) => {
    setFeil(''); setOk('');
    const r = await opprettKlient({ navn: e.navn, orgnr: e.orgnr, orgform: e.orgform, adresse: e.adresse, postnr: e.postnr, poststed: e.poststed, mvaRegistrert: e.mvaRegistrert, stiftet: e.stiftet });
    if (!r.ok) { setFeil(r.feil); return; }
    setOk(`${e.navn} er lagt til på Gratis.`); router.refresh();
  };
  if (!apen) return <button type="button" className="knapp" onClick={() => setApen(true)}>+ Ny klient</button>;
  return (
    <section className="kort stakk" style={{ width: '100%' }}>
      <div className="rad" style={{ justifyContent: 'space-between' }}><h2>Ny klient</h2><button type="button" className="lenke" onClick={() => setApen(false)}>Lukk</button></div>
      <p className="mut liten">Små kunder kan føre selv i Rettført Gratis, med deg koblet på. Du får dem i arbeidslisten med funn og frister.</p>
      <BrregSok onVelg={velg} autoFocus />
      {feil && <div className="varsel rod">{feil}</div>}
      {ok && <div className="varsel gronn">{ok}</div>}
    </section>
  );
}
