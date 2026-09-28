'use client';

import { useActionState } from 'react';
import { loggInn } from '@/app/handlinger';

export function LoggInnSkjema() {
  const [res, handling, venter] = useActionState(loggInn, null);
  return (
    <form action={handling} className="stakk" style={{ marginTop: 24 }}>
      <label className="felt"><span>E-post</span><input className="inndata" name="epost" type="email" autoComplete="email" required /></label>
      <label className="felt"><span>Passord</span><input className="inndata" name="passord" type="password" autoComplete="current-password" required /></label>
      {res && !res.ok && <div className="varsel rod" role="alert">{res.feil}</div>}
      <button className="knapp" disabled={venter}>{venter ? 'Logger inn …' : 'Logg inn'}</button>
    </form>
  );
}
