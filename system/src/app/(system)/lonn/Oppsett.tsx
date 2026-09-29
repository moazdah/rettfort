'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { lagreLonnsoppsett, settFastTilbakebetaling } from '@/app/handlinger';
import { AGA_SONER } from '@/lib/tjenester/lonn';

export function LonnOppsett({ start, forste }: { start: { ferie: number; lonningsdag: number | null; otp: string | null; agaSone: string; utleggTilbake?: string | null }; forste: boolean }) {
  const router = useRouter();
  const [ferie, setFerie] = useState(start.ferie);
  const [dag, setDag] = useState(start.lonningsdag ?? 20);
  const [otp, setOtp] = useState(start.otp ?? 'ingen');
  const [sone, setSone] = useState(start.agaSone);
  const [tilbake, setTilbake] = useState<string | null>(start.utleggTilbake ?? null);
  const [feil, setFeil] = useState('');
  const [ok, setOk] = useState('');
  const lagre = async () => {
    setFeil(''); setOk('');
    const r = await lagreLonnsoppsett({ ferie, lonningsdag: dag, otp, agaSone: sone });
    if (!r.ok) { setFeil(r.feil); return; }
    setOk('Lagret.'); router.refresh();
  };
  return (
    <section className="kort stakk" style={{ maxWidth: 680 }}>
      <h2>{forste ? 'Tre spørsmål, så er du i gang' : 'Oppsett'}</h2>
      <div className="stakk" style={{ gap: 8 }}>
        <span className="mut liten">Hvor mye ferie har de ansatte?</span>
        {([[10.2, 'Fire uker og en dag (10,2 %)', 'Det vanlige etter ferieloven.'], [12, 'Fem uker (12 %)', 'Hvis dere har tariffavtale eller har avtalt en ekstra uke.']] as const).map(([v, t, d]) => (
          <button type="button" key={v} className={`valgkort ${ferie === v ? 'valgt' : ''}`} onClick={() => setFerie(v)}><b style={{ display: 'block', fontWeight: 600 }}>{t}</b><span className="mut liten">{d}</span></button>
        ))}
      </div>
      <label className="felt"><span>Hvilken dato får de lønn?</span>
        <select className="inndata" value={dag} onChange={e => setDag(Number(e.target.value))}>{[1, 5, 10, 12, 15, 20, 25, 28].map(d => <option key={d} value={d}>Den {d}. hver måned</option>)}<option value={31}>Siste dag i måneden</option></select>
      </label>
      <div className="stakk" style={{ gap: 8 }}>
        <span className="mut liten">Har dere tjenestepensjon (OTP)?</span>
        <div className="rad">{[['ingen', 'Ikke ennå'], ['2', 'Ja, 2 %'], ['annet', 'Ja, annen sats']].map(([v, t]) => <button type="button" key={v} className={`knapp ${otp === v ? '' : 'hvit'} liten`} onClick={() => setOtp(v)}>{t}</button>)}</div>
        <span className="hint">{otp === 'ingen' ? 'Alle AS med ansatte må ha OTP når noen har over 20 % stilling og er over 13 år. Leverandøren trekker premien selv. Vi fører den når regningen kommer.' : 'Premien føres når regningen fra pensjonsleverandøren kommer, under Penger ut.'}</span>
      </div>
      <label className="felt"><span>Sone for arbeidsgiveravgift</span>
        <select className="inndata" value={sone} onChange={e => setSone(e.target.value)}>{Object.entries(AGA_SONER).map(([k, v]) => <option key={k} value={k}>{v.navn} · {String(v.sats).replace('.', ',')} %</option>)}</select>
        <span className="hint">Bestemmes av kommunen der foretaket er registrert. Sone 1 gjelder det meste av Sør-Norge.</span>
      </label>
      {!forste && (
        <div className="stakk" style={{ gap: 8 }}>
          <span className="mut liten">Utlegg fra ansatte: hvordan får de pengene tilbake?</span>
          <div className="rad">{([[null, 'Spør hver gang'], ['neste_lonn', 'Alltid med neste lønn'], ['na', 'Alltid med en gang']] as const).map(([v, t]) => (
            <button type="button" key={String(v)} className={`knapp ${tilbake === v ? '' : 'hvit'} liten`} onClick={async () => { const r = await settFastTilbakebetaling(v); if (r.ok) { setTilbake(v); router.refresh(); } }}>{t}</button>
          ))}</div>
          <span className="hint">Med neste lønn kommer utlegget som egen linje på lønnslippen, uten skatt. Med en gang betaler du i nettbanken og krysser av i Innboks.</span>
        </div>
      )}
      {feil && <div className="varsel rod">{feil}</div>}
      {ok && <div className="varsel gronn">{ok}</div>}
      <div><button type="button" className="knapp" onClick={lagre}>{forste ? 'Ferdig, vis lønn' : 'Lagre oppsettet'}</button></div>
    </section>
  );
}
