'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Resultat } from '@/lib/server';

/** Knapp som kjører en serverhandling og viser svaret. Kan be om bekreftelse først. */
export function Handling({ handling, tekst, klasse = 'knapp', bekreft, etter }: { handling: () => Promise<Resultat<unknown>>; tekst: string; klasse?: string; bekreft?: string; etter?: string }) {
  const router = useRouter();
  const [venter, start] = useTransition();
  const [svar, setSvar] = useState<{ ok: boolean; t: string } | null>(null);
  return (
    <span className="stakk" style={{ gap: 6, display: 'inline-flex' }}>
      <button type="button" className={klasse} disabled={venter} onClick={() => {
        if (bekreft && !window.confirm(bekreft)) return;
        start(async () => {
          const r = await handling();
          setSvar(r.ok ? { ok: true, t: r.melding ?? 'Ferdig.' } : { ok: false, t: r.feil });
          if (r.ok) { if (etter) router.push(etter); router.refresh(); }
        });
      }}>{venter ? 'Et øyeblikk …' : tekst}</button>
      {svar && <span className={`liten`} role="status" style={{ color: svar.ok ? 'var(--gronn)' : 'var(--rod)' }}>{svar.t}</span>}
    </span>
  );
}
