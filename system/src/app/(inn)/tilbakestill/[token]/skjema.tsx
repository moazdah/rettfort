'use client';

import { useActionState } from 'react';
import { nyttPassord } from '@/app/handlinger';

export function NyttPassordSkjema({ token, epost }: { token: string; epost: string }) {
  const [res, handling, venter] = useActionState(nyttPassord, null);
  return (
    <form action={handling} className="stakk" style={{ marginTop: 24 }}>
      <input type="hidden" name="token" value={token} />
      {/* Hjelper passordbehandleren å lagre det nye passordet på riktig konto. */}
      <input type="email" name="brukernavn" autoComplete="username" value={epost} readOnly hidden />
      <label className="felt"><span>Nytt passord</span><input className="inndata" name="passord" type="password" autoComplete="new-password" minLength={8} required autoFocus /><span className="hint">Minst 8 tegn.</span></label>
      <label className="felt"><span>Gjenta passordet</span><input className="inndata" name="passord2" type="password" autoComplete="new-password" minLength={8} required /></label>
      {res && !res.ok && <div className="varsel rod" role="alert">{res.feil}</div>}
      <button className="knapp" disabled={venter}>{venter ? 'Lagrer …' : 'Lagre nytt passord'}</button>
    </form>
  );
}
