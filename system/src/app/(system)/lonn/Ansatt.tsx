'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { lagreAnsatt } from '@/app/handlinger';
import { kr, tilOre } from '@/lib/penger';

export interface AnsattData { id?: string; navn: string; epost: string | null; stilling: string | null; lonn_type: 'fast' | 'time'; manedslonn: number; timesats: number; skatteprosent: number; kontonr: string | null; startdato: string | null }

export function AnsattSkjema({ a, onFerdig }: { a?: AnsattData; onFerdig: () => void }) {
  const router = useRouter();
  const [v, setV] = useState({ navn: a?.navn ?? '', epost: a?.epost ?? '', stilling: a?.stilling ?? '', kontonr: a?.kontonr ?? '', startdato: a?.startdato ?? '', lonnType: a?.lonn_type ?? 'fast', belop: a ? kr(a.lonn_type === 'fast' ? a.manedslonn : a.timesats) : '', skatt: String(a?.skatteprosent ?? 30).replace('.', ',') });
  const [feil, setFeil] = useState('');
  const lagre = async () => {
    setFeil('');
    const b = tilOre(v.belop) ?? 0;
    const r = await lagreAnsatt({ id: a?.id, navn: v.navn, epost: v.epost, stilling: v.stilling, kontonr: v.kontonr, startdato: v.startdato || undefined, lonnType: v.lonnType as 'fast' | 'time', manedslonn: v.lonnType === 'fast' ? b : 0, timesats: v.lonnType === 'time' ? b : 0, skatteprosent: Number(v.skatt.replace(',', '.')) });
    if (!r.ok) { setFeil(r.feil); return; }
    router.refresh(); onFerdig();
  };
  return (
    <section className="kort stakk">
      <h2>{a ? `Endre ${a.navn}` : 'Ny ansatt'}</h2>
      <div className="rutenett to">
        <label className="felt"><span>Navn</span><input className="inndata" value={v.navn} onChange={e => setV({ ...v, navn: e.target.value })} /></label>
        <label className="felt"><span>E-post (lønnslippen sendes hit)</span><input className="inndata" type="email" value={v.epost} onChange={e => setV({ ...v, epost: e.target.value })} /></label>
        <label className="felt"><span>Stilling</span><input className="inndata" value={v.stilling} onChange={e => setV({ ...v, stilling: e.target.value })} /></label>
        <label className="felt"><span>Kontonummer</span><input className="inndata" value={v.kontonr} onChange={e => setV({ ...v, kontonr: e.target.value })} /></label>
        <label className="felt"><span>Startdato</span><input className="inndata" type="date" value={v.startdato} onChange={e => setV({ ...v, startdato: e.target.value })} /></label>
      </div>
      <div className="stakk" style={{ gap: 8 }}>
        <span className="mut liten">Hvordan får de lønn?</span>
        <div className="rad">{[['fast', 'Fast månedslønn'], ['time', 'Timelønn']].map(([k, t]) => <button type="button" key={k} className={`knapp liten ${v.lonnType === k ? '' : 'hvit'}`} onClick={() => setV({ ...v, lonnType: k as 'fast' | 'time' })}>{t}</button>)}</div>
      </div>
      <div className="rutenett to">
        <label className="felt"><span>{v.lonnType === 'fast' ? 'Månedslønn (kr)' : 'Timelønn (kr)'}</span><input className="inndata mono" inputMode="decimal" value={v.belop} onChange={e => setV({ ...v, belop: e.target.value })} /></label>
        <label className="felt"><span>Skattetrekk i prosent</span><input className="inndata mono" inputMode="decimal" value={v.skatt} onChange={e => setV({ ...v, skatt: e.target.value })} /><span className="hint">Fra skattekortet. Henting direkte fra Skatteetaten slås på når koblingen er klar.</span></label>
      </div>
      {feil && <div className="varsel rod">{feil}</div>}
      <div className="rad"><button type="button" className="knapp" onClick={lagre}>Lagre ansatt</button><button type="button" className="lenke" onClick={onFerdig}>Avbryt</button></div>
    </section>
  );
}
