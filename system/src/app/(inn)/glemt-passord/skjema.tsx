'use client';

import { useActionState, useState } from 'react';
import { glemtPassord } from '@/app/handlinger';

export function GlemtSkjema() {
  const [res, handling, venter] = useActionState(glemtPassord, null);
  const [epost, setEpost] = useState('');
  if (res?.ok) {
    return (
      <div className="stakk" style={{ marginTop: 24 }}>
        <div className="varsel gronn" role="status">Hvis det finnes en konto for <b>{epost}</b>, har vi sendt en lenke dit. Lenken gjelder i én time.</div>
        <p className="mut liten">Finner du ikke e-posten? Sjekk søppelposten, eller prøv igjen om litt.</p>
        {res.data?.lenke && <div className="testmodus">Testmodus: e-post sendes ikke. <a href={res.data.lenke}>Åpne lenken her</a>.</div>}
      </div>
    );
  }
  return (
    <form action={handling} className="stakk" style={{ marginTop: 24 }}>
      <label className="felt"><span>E-post</span><input className="inndata" name="epost" type="email" autoComplete="email" required autoFocus value={epost} onChange={e => setEpost(e.target.value)} /></label>
      {res && !res.ok && <div className="varsel rod" role="alert">{res.feil}</div>}
      <button className="knapp" disabled={venter}>{venter ? 'Sender …' : 'Send lenke'}</button>
    </form>
  );
}
