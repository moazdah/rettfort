'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { registrerBetalingHandling, krediterHandling } from '@/app/handlinger';
import { kr, tilOre } from '@/lib/penger';

export function SalgHandlinger({ id, type, status, rest, idag, kanEndre }: { id: string; type: string; status: string; rest: number; idag: string; kanEndre: boolean }) {
  const router = useRouter();
  const [apen, setApen] = useState<'' | 'betal' | 'krediter'>('');
  const [belop, setBelop] = useState(kr(rest));
  const [dato, setDato] = useState(idag);
  const [grunn, setGrunn] = useState('');
  const [hele, setHele] = useState(true);
  const [kBelop, setKBelop] = useState('');
  const [feil, setFeil] = useState('');
  const [ok, setOk] = useState('');
  const [venter, setVenter] = useState(false);
  const kjor = async (fn: () => Promise<{ ok: boolean; feil?: string; melding?: string; data?: unknown }>, etter?: (d: unknown) => void) => {
    setVenter(true); setFeil(''); setOk('');
    const r = await fn();
    setVenter(false);
    if (!r.ok) { setFeil(r.feil ?? 'Noe gikk galt.'); return; }
    setOk(r.melding ?? 'Ferdig.'); setApen('');
    etter?.(r.data);
    router.refresh();
  };
  const aktivFaktura = type === 'faktura' && ['sendt', 'delvis_betalt', 'betalt'].includes(status);
  return (
    <div className="stakk ikke-utskrift" style={{ gap: 10 }}>
      <div className="rad">
        <a href={`/api/faktura/${id}/pdf`} className="knapp hvit">Last ned PDF</a>
        {(type === 'faktura' || type === 'kreditnota') && status !== 'utkast' && <a href={`/api/faktura/${id}/ehf`} className="knapp hvit" title="Peppol BIS Billing 3.0. Last den opp i kundens fakturaportal, eller send den som vedlegg.">Last ned EHF</a>}
        <button type="button" className="knapp hvit" onClick={() => window.print()}>Skriv ut</button>
        {kanEndre && type === 'faktura' && rest > 0 && ['sendt', 'delvis_betalt'].includes(status) && <button type="button" className="knapp" onClick={() => setApen(apen === 'betal' ? '' : 'betal')}>Registrer betaling</button>}
        {kanEndre && aktivFaktura && status !== 'kreditert' && <button type="button" className="knapp hvit" onClick={() => setApen(apen === 'krediter' ? '' : 'krediter')}>Lag kreditnota</button>}
        {kanEndre && type === 'tilbud' && <Link href={`/salg/ny?tilbud=${id}`} className="knapp">Gjør om til faktura</Link>}
        {kanEndre && type !== 'tilbud' && <Link href={`/salg/ny?kopi=${id}`} className="knapp hvit">Kopier som ny</Link>}
      </div>
      {apen === 'betal' && (
        <div className="kort stakk" style={{ maxWidth: 520 }}>
          <h2>Registrer betaling</h2>
          <p className="mut liten">Bruk dette når kunden har betalt uten at det kom via bankavstemmingen. Delbetaling er lov.</p>
          <div className="rutenett to">
            <label className="felt"><span>Beløp</span><input className="inndata mono" inputMode="decimal" value={belop} onChange={e => setBelop(e.target.value)} /></label>
            <label className="felt"><span>Dato</span><input className="inndata" type="date" value={dato} onChange={e => setDato(e.target.value)} /></label>
          </div>
          <div className="rad"><button type="button" className="knapp" disabled={venter} onClick={() => kjor(() => registrerBetalingHandling(id, tilOre(belop) ?? 0, dato))}>Registrer {belop} kr</button><button type="button" className="lenke" onClick={() => setApen('')}>Avbryt</button></div>
        </div>
      )}
      {apen === 'krediter' && (
        <div className="kort stakk" style={{ maxWidth: 560 }}>
          <h2>Lag kreditnota</h2>
          <p className="mut liten">En sendt faktura kan ikke endres. Kreditnotaen nuller ut hele eller deler av den, og føres i regnskapet i dag.</p>
          <div className="rad">
            <label className="rad liten"><input type="radio" checked={hele} onChange={() => setHele(true)} /> Hele fakturaen</label>
            <label className="rad liten"><input type="radio" checked={!hele} onChange={() => setHele(false)} /> Et beløp</label>
          </div>
          {!hele && <label className="felt"><span>Beløp med MVA</span><input className="inndata mono" inputMode="decimal" value={kBelop} onChange={e => setKBelop(e.target.value)} placeholder="0,00" /></label>}
          <label className="felt"><span>Hvorfor? Kunden ser dette.</span><input className="inndata" value={grunn} onChange={e => setGrunn(e.target.value)} placeholder="F.eks. feil antall timer" /></label>
          <div className="rad"><button type="button" className="knapp" disabled={venter || !grunn.trim()} onClick={() => kjor(() => krediterHandling(id, grunn, hele ? undefined : tilOre(kBelop) ?? 0), d => { const x = d as { id: string } | undefined; if (x?.id) router.push(`/salg/${x.id}`); })}>Lag kreditnota</button><button type="button" className="lenke" onClick={() => setApen('')}>Avbryt</button></div>
        </div>
      )}
      {feil && <div className="varsel rod" role="alert">{feil}</div>}
      {ok && <div className="varsel gronn" role="status">{ok}</div>}
    </div>
  );
}
