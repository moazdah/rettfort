'use client';

import { useActionState, useState } from 'react';
import { loggInn } from '@/app/handlinger';

export function LoggInnSkjema({ neste }: { neste?: string }) {
  const [res, handling, venter] = useActionState(loggInn, null);
  // Styrte felt: React tømmer skjemaet etter hver innsending, men e-post og passord må være med når koden sendes.
  const [epost, setEpost] = useState('');
  const [passord, setPassord] = useState('');
  // Har kontoen totrinns innlogging, ber vi om koden i samme skjema. E-post og passord står der fortsatt.
  const totrinn = !!(res && !res.ok && res.totrinn);
  return (
    <form action={handling} className="stakk" style={{ marginTop: 24 }}>
      {neste && <input type="hidden" name="neste" value={neste} />}
      <label className="felt" hidden={totrinn}><span>E-post</span><input className="inndata" name="epost" type="email" autoComplete="email" required value={epost} onChange={e => setEpost(e.target.value)} /></label>
      <label className="felt" hidden={totrinn}><span>Passord</span><input className="inndata" name="passord" type="password" autoComplete="current-password" required value={passord} onChange={e => setPassord(e.target.value)} /></label>
      {totrinn && (
        <label className="felt"><span>Kode fra autentiseringsappen</span>
          <input className="inndata mono" name="kode" inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="000000" autoFocus style={{ fontSize: 22, letterSpacing: '.3em', textAlign: 'center' }} />
          <span className="hint">Åpne appen på mobilen (for eksempel Google eller Microsoft Authenticator) og skriv inn de 6 sifrene for Rettført.</span>
        </label>
      )}
      {res && !res.ok && !(totrinn && res.feil === 'Skriv koden fra autentiseringsappen.') && <div className="varsel rod" role="alert">{res.feil}</div>}
      <button className="knapp" disabled={venter}>{venter ? 'Logger inn …' : totrinn ? 'Bekreft' : 'Logg inn'}</button>
    </form>
  );
}
