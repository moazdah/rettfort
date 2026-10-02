'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { inviterRegnskapsforer } from '@/app/handlinger';

export function InviterRegnskapsforer() {
  const router = useRouter();
  const [epost, setEpost] = useState('');
  const [rolle, setRolle] = useState<'regnskapsforer_full' | 'regnskapsforer_les'>('regnskapsforer_full');
  const [feil, setFeil] = useState('');
  const [lenke, setLenke] = useState('');
  const [sendt, setSendt] = useState(false);
  const send = async () => {
    setFeil('');
    const r = await inviterRegnskapsforer(epost, rolle);
    if (!r.ok) { setFeil(r.feil); return; }
    setLenke(location.origin + r.data!.lenke); setSendt(r.data!.sendt); router.refresh();
  };
  return (
    <div className="stakk">
      <label className="felt"><span>E-posten til regnskapsføreren</span><input className="inndata" type="email" value={epost} onChange={e => setEpost(e.target.value)} placeholder="navn@regnskapsbyra.no" /></label>
      <span className="mut liten">Hva skal de kunne gjøre?</span>
      {([['regnskapsforer_full', 'Føre og rette', 'Kan føre, rette, sende MVA-melding og gjøre årsoppgjøret.'], ['regnskapsforer_les', 'Bare se', 'Ser regnskapet og rapportene, men kan ikke endre noe.']] as const).map(([k, t, d]) => (
        <button type="button" key={k} className={`valgkort ${rolle === k ? 'valgt' : ''}`} onClick={() => setRolle(k)}><b style={{ display: 'block', fontWeight: 600 }}>{t}</b><span className="mut liten">{d}</span></button>
      ))}
      {feil && <div className="varsel rod">{feil}</div>}
      {lenke && <div className="varsel info"><div className="fyll">{sendt ? `Invitasjonen er sendt på e-post til ${epost}. Du kan også sende lenken selv:` : `Invitasjonen er laget, men e-posten kunne ikke sendes. Send lenken til ${epost}:`}<div className="mono liten" style={{ wordBreak: 'break-all', marginTop: 4 }}>{lenke}</div></div></div>}
      <div><button type="button" className="knapp" onClick={send}>Lag invitasjon</button></div>
    </div>
  );
}
