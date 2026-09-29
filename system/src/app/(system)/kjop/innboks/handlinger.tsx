'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { avvisInnsending, velgTilbakebetaling, merkUtleggBetalt, sendSkannelenkePaNytt, slettSkannelenke, lagSkannelenke } from '@/app/handlinger';

export function Avvis({ id }: { id: string }) {
  const router = useRouter();
  const [apen, setApen] = useState(false);
  const [grunn, setGrunn] = useState('');
  const [feil, setFeil] = useState('');
  if (!apen) return <button type="button" className="knapp hvit liten" onClick={() => setApen(true)}>Avvis</button>;
  return (
    <div className="stakk" style={{ gap: 6, minWidth: 240 }}>
      <input className="inndata" value={grunn} onChange={e => setGrunn(e.target.value)} placeholder="Hvorfor? F.eks. «Bildet er uskarpt»" autoFocus />
      <div className="rad" style={{ gap: 6 }}>
        <button type="button" className="knapp liten" onClick={async () => { const r = await avvisInnsending(id, grunn); if (!r.ok) { setFeil(r.feil); return; } router.refresh(); }}>Avvis med beskjed</button>
        <button type="button" className="lenke liten" onClick={() => setApen(false)}>Avbryt</button>
      </div>
      {feil && <span className="liten tekst-rod">{feil}</span>}
    </div>
  );
}

export function VelgTilbake({ id }: { id: string }) {
  const router = useRouter();
  const [husk, setHusk] = useState(false);
  const velg = async (t: 'neste_lonn' | 'na') => { const r = await velgTilbakebetaling(id, t, husk); if (r.ok) router.refresh(); };
  return (
    <div className="stakk" style={{ gap: 6, alignItems: 'flex-end' }}>
      <div className="rad" style={{ gap: 6 }}>
        <button type="button" className="knapp liten" onClick={() => velg('neste_lonn')}>Med neste lønn</button>
        <button type="button" className="knapp hvit liten" onClick={() => velg('na')}>Med en gang</button>
      </div>
      <label className="rad liten mut"><input type="checkbox" checked={husk} onChange={e => setHusk(e.target.checked)} /> Gjør fast, ikke spør igjen</label>
    </div>
  );
}

export function BetaltKnapp({ id }: { id: string }) {
  const router = useRouter();
  const [venter, setVenter] = useState(false);
  return <button type="button" className="knapp liten" disabled={venter} onClick={async () => { setVenter(true); const r = await merkUtleggBetalt(id); setVenter(false); if (r.ok) router.refresh(); }}>{venter ? 'Fører …' : 'Jeg har betalt'}</button>;
}

export function LenkeHandlinger({ id, url, harEpost }: { id: string; url: string; harEpost: boolean }) {
  const router = useRouter();
  const [melding, setMelding] = useState('');
  return (
    <div className="stakk" style={{ gap: 4, alignItems: 'flex-end' }}>
      <div className="innboks-handling">
        <button type="button" className="knapp hvit liten" onClick={async () => { await navigator.clipboard?.writeText(url); setMelding('Kopiert'); }}>Kopier lenke</button>
        {harEpost && <button type="button" className="knapp hvit liten" onClick={async () => { const r = await sendSkannelenkePaNytt(id); setMelding(r.ok ? `Sendt til ${r.data!.til}` : r.feil); }}>Send på e-post</button>}
        <button type="button" className="knapp hvit liten" onClick={async () => { if (!confirm('Slette lenken? Den slutter å virke med en gang.')) return; const r = await slettSkannelenke(id); if (r.ok) router.refresh(); }}>Slett</button>
      </div>
      {melding && <span className="liten mut">{melding}</span>}
    </div>
  );
}

export function NyLenke({ ansatte }: { ansatte: { id: string; navn: string; epost: string | null }[] }) {
  const router = useRouter();
  const [type, setType] = useState<'' | 'ansatt' | 'klient'>('');
  const [ansattId, setAnsattId] = useState('');
  const [navn, setNavn] = useState('');
  const [epost, setEpost] = useState('');
  const [send, setSend] = useState(true);
  const [feil, setFeil] = useState('');
  const [ferdig, setFerdig] = useState<{ url: string; sendt: boolean } | null>(null);
  const valgtAnsatt = ansatte.find(a => a.id === ansattId);
  const lag = async () => {
    setFeil('');
    const r = await lagSkannelenke({ type: type as 'ansatt' | 'klient', ansattId: ansattId || undefined, navn, epost: epost || undefined, send });
    if (!r.ok) { setFeil(r.feil); return; }
    setFerdig(r.data!); router.refresh();
  };
  if (ferdig) return (
    <div className="varsel gronn stakk" style={{ gap: 8 }}>
      <b>Lenken er laget.{ferdig.sendt ? ' Den er sendt på e-post.' : ''}</b>
      <div className="rad" style={{ gap: 6, flexWrap: 'nowrap' }}><input className="inndata mono liten" readOnly value={ferdig.url} onFocus={e => e.target.select()} /><button type="button" className="knapp hvit liten" onClick={() => navigator.clipboard?.writeText(ferdig.url)}>Kopier</button></div>
      <button type="button" className="lenke liten" style={{ alignSelf: 'flex-start' }} onClick={() => { setFerdig(null); setType(''); setAnsattId(''); setNavn(''); setEpost(''); }}>Lag en til</button>
    </div>
  );
  if (!type) return (
    <div className="rad" style={{ gap: 8 }}>
      <button type="button" className="knapp hvit" onClick={() => setType('ansatt')} disabled={!ansatte.length} title={ansatte.length ? '' : 'Legg til ansatte under Lønn først'}>+ Lenke til ansatt (utlegg)</button>
      <button type="button" className="knapp hvit" onClick={() => setType('klient')}>+ Lenke til klient eller andre</button>
    </div>
  );
  return (
    <div className="stakk valgt-kunde-endre">
      <b>{type === 'ansatt' ? 'Lenke til en ansatt' : 'Lenke til en klient eller andre'}</b>
      {type === 'ansatt' ? (
        <label className="felt"><span>Hvem?</span><select className="inndata" value={ansattId} onChange={e => { setAnsattId(e.target.value); setEpost(''); }}><option value="">Velg ansatt</option>{ansatte.map(a => <option key={a.id} value={a.id}>{a.navn}</option>)}</select></label>
      ) : (
        <label className="felt"><span>Navn</span><input className="inndata" value={navn} onChange={e => setNavn(e.target.value)} placeholder="F.eks. Kari Nordmann eller Butikken AS" /></label>
      )}
      <label className="felt"><span>E-post</span><input className="inndata" type="email" value={epost || valgtAnsatt?.epost || ''} onChange={e => setEpost(e.target.value)} placeholder="navn@eksempel.no" /></label>
      <label className="rad liten"><input type="checkbox" checked={send} onChange={e => setSend(e.target.checked)} /> Send lenken på e-post nå</label>
      {type === 'ansatt' && <p className="mut liten" style={{ margin: 0 }}>Har den ansatte en lenke fra før, slutter den gamle å virke.</p>}
      {feil && <div className="varsel rod">{feil}</div>}
      <div className="rad"><button type="button" className="knapp liten" disabled={type === 'ansatt' ? !ansattId : !navn.trim()} onClick={lag}>Lag lenke</button><button type="button" className="lenke liten" onClick={() => setType('')}>Avbryt</button></div>
    </div>
  );
}
