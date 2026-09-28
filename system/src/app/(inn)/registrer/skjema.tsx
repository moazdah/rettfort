'use client';

import { useActionState, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { registrer } from '@/app/handlinger';

export function RegistrerSkjema({ startRolle }: { startRolle: 'bedrift' | 'regnskapsforer' }) {
  const [hvem, setHvem] = useState(startRolle);
  const [res, handling, venter] = useActionState(registrer, null);
  const router = useRouter();
  useEffect(() => {
    if (res?.ok) {
      const kode = (res.data as { kode?: string } | undefined)?.kode;
      // E-post er ikke koblet til ennå: koden vises på neste side (testmodus).
      router.push(hvem === 'regnskapsforer' ? '/byra' : `/velkommen${kode ? `?kode=${kode}` : ''}`);
    }
  }, [res, hvem, router]);
  return (
    <form action={handling} className="stakk" style={{ marginTop: 24 }}>
      <div className="rutenett to" role="radiogroup" aria-label="Hvem er du?">
        {([['bedrift', 'Egen bedrift', 'Jeg fører regnskapet for mitt eget foretak.'], ['regnskapsforer', 'Regnskapsfører', 'Jeg fører for kunder.']] as const).map(([v, t, d]) => (
          <button type="button" key={v} className={`valgkort ${hvem === v ? 'valgt' : ''}`} onClick={() => setHvem(v)} aria-pressed={hvem === v}>
            <b style={{ display: 'block' }}>{t}</b><span className="mut liten">{d}</span>
          </button>
        ))}
      </div>
      <input type="hidden" name="hvem" value={hvem} />
      <label className="felt"><span>Navnet ditt</span><input className="inndata" name="navn" autoComplete="name" required /></label>
      <label className="felt"><span>E-post</span><input className="inndata" name="epost" type="email" autoComplete="email" required /></label>
      <label className="felt"><span>Passord</span><input className="inndata" name="passord" type="password" minLength={8} autoComplete="new-password" required /><span className="hint">Minst 8 tegn.</span></label>
      {res && !res.ok && <div className="varsel rod" role="alert">{res.feil}</div>}
      <button className="knapp" disabled={venter}>{venter ? 'Lager kontoen …' : 'Lag kontoen'}</button>
    </form>
  );
}
