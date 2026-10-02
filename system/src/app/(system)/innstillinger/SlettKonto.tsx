'use client';

import { useActionState, useState } from 'react';
import { slettMinKonto } from '@/app/handlinger';

/** Slett kontoen: krever passord og at man skriver SLETT. */
export function SlettKonto({ hindring, foretakAlene }: { hindring: string | null; foretakAlene: string[] }) {
  const [apen, setApen] = useState(false);
  const [r, handling, venter] = useActionState(slettMinKonto, null);
  if (hindring) return <div className="varsel gul liten">{hindring}</div>;
  if (!apen) return <div><button type="button" className="knapp rod" onClick={() => setApen(true)}>Slett kontoen min</button></div>;
  return (
    <form action={handling} className="stakk" style={{ gap: 12 }}>
      <div className="varsel rod liten" style={{ display: 'block' }}>
        <b>Dette kan ikke angres.</b> Navnet, e-posten, passordet, innloggingene og samtalene med assistenten slettes, og du mister tilgangen til alle foretak.
        {foretakAlene.length > 0 && <> Regnskapet til {foretakAlene.join(', ')} oppbevares i 5 år fordi bokføringsloven krever det, og slettes deretter. Last ned SAF-T over før du sletter.</>}
      </div>
      <label className="felt"><span>Passord</span><input className="inndata" type="password" name="passord" autoComplete="current-password" required /></label>
      <label className="felt"><span>Skriv SLETT for å bekrefte</span><input className="inndata" name="bekreft" autoComplete="off" required /></label>
      {r && !r.ok && <div className="varsel rod liten">{r.feil}</div>}
      <div className="rad" style={{ gap: 10 }}>
        <button className="knapp rod" disabled={venter}>{venter ? 'Sletter …' : 'Slett kontoen for godt'}</button>
        <button type="button" className="knapp hvit" onClick={() => setApen(false)} disabled={venter}>Avbryt</button>
      </div>
    </form>
  );
}
