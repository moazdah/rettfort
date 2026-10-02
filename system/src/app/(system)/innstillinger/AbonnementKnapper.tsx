'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { byttPakke, apneKundeportal, angreOppsigelseHandling } from '@/app/handlinger';

/** Bekreftelse som ark: nederst på mobil, midt på skjermen på PC. */
function Bekreft({ tittel, tekst, behold, gjor, rod, onGjor, lukk, venter, feil }: { tittel: string; tekst: string[]; behold: string; gjor: string; rod?: boolean; onGjor: () => void; lukk: () => void; venter: boolean; feil: string }) {
  return (
    <div className="bekreft-bak" onClick={lukk}>
      <div className="bekreft-ark" role="dialog" aria-modal="true" aria-label={tittel} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: 0 }}>{tittel}</h2>
        {tekst.map(t => <p key={t} className="mut" style={{ margin: 0 }}>{t}</p>)}
        {feil && <div className="varsel rod">{feil}</div>}
        <div className="bekreft-knapper">
          <button type="button" className="knapp" onClick={lukk} autoFocus>{behold}</button>
          <button type="button" className={`knapp hvit ${rod ? 'rod-kant' : ''}`} disabled={venter} onClick={onGjor}>{venter ? 'Et øyeblikk …' : gjor}</button>
        </div>
      </div>
    </div>
  );
}

function useHandling() {
  const [venter, setVenter] = useState(false);
  const [feil, setFeil] = useState('');
  const router = useRouter();
  const kjor = async (f: () => Promise<{ ok: boolean; feil?: string; data?: { url?: string } | unknown }>, etter?: () => void) => {
    setVenter(true); setFeil('');
    const r = await f() as { ok: boolean; feil?: string; data?: { url?: string } };
    if (!r.ok) { setVenter(false); setFeil(r.feil ?? 'Noe gikk galt.'); return; }
    if (r.data?.url) { location.href = r.data.url; return; }
    setVenter(false); etter?.(); router.refresh();
  };
  return { venter, feil, kjor, setFeil };
}

/** Si opp: pakken gjelder ut perioden, deretter Gratis. */
export function SiOpp({ pakke, slutt }: { pakke: string; slutt: string }) {
  const [apen, setApen] = useState(false);
  const h = useHandling();
  const stenges = pakke === 'Selskap' ? 'Vaktplanen og assistenten stenges da.' : 'Vaktplanen, banken, MVA-meldingen og lønn stenges da.';
  return (
    <>
      <button type="button" className="lenke dempet liten" onClick={() => setApen(true)}>Si opp abonnementet</button>
      {apen && <Bekreft tittel="Si opp abonnementet?" tekst={[`Du har ${pakke} til ${slutt}, deretter Gratis. Ingenting du har ført blir borte.`, `${stenges} Ansatte, vakter og timer blir liggende, og du kan velge en pakke igjen når du vil.`]}
        behold={`Behold ${pakke}`} gjor="Si opp" rod venter={h.venter} feil={h.feil} lukk={() => setApen(false)} onGjor={() => h.kjor(() => byttPakke('gratis'), () => setApen(false))} />}
    </>
  );
}

/** Bytt ned fra Selskap til Start. */
export function ByttNed({ ekstra }: { ekstra: number }) {
  const [apen, setApen] = useState(false);
  const h = useHandling();
  return (
    <>
      <button type="button" className="knapp hvit liten" style={{ width: '100%' }} onClick={() => setApen(true)}>Bytt til Start</button>
      {apen && <Bekreft tittel="Bytte til Start?" tekst={['Assistenten stenges, og vaktplanen har plass til 5 ansatte. Ingenting du har ført blir borte.', ekstra > 0 ? `Dere har ${5 + ekstra} ansatte, så ${ekstra} koster 29 kr i måneden hver.` : 'Mellomlegget for resten av perioden trekkes fra neste faktura.']}
        behold="Behold Selskap" gjor="Bytt til Start" venter={h.venter} feil={h.feil} lukk={() => setApen(false)} onGjor={() => h.kjor(() => byttPakke('start'), () => setApen(false))} />}
    </>
  );
}

export function EndreKort({ tekst = 'Endre kort', klasse = 'knapp hvit liten' }: { tekst?: string; klasse?: string }) {
  const h = useHandling();
  return (
    <span className="stakk" style={{ gap: 4 }}>
      <button type="button" className={klasse} disabled={h.venter} onClick={() => h.kjor(() => apneKundeportal())}>{h.venter ? 'Åpner …' : tekst}</button>
      {h.feil && <span className="rod liten">{h.feil}</span>}
    </span>
  );
}

export function AngreOppsigelse() {
  const h = useHandling();
  return (
    <span className="stakk" style={{ gap: 4 }}>
      <button type="button" className="knapp hvit liten" disabled={h.venter} onClick={() => h.kjor(() => angreOppsigelseHandling())}>{h.venter ? 'Et øyeblikk …' : 'Angre oppsigelse'}</button>
      {h.feil && <span className="rod liten">{h.feil}</span>}
    </span>
  );
}
