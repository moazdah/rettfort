'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { velgForslag, sendPurringDirekte } from '@/app/handlinger';
import { svarFriHandling, gjorLedigHandling, tildelHandling } from '@/app/vaktplan-handlinger';

/** En handling på Hjem: lenke til riktig side, eller en knapp som gjør det med en gang. */
export type VenterHandling =
  | { type: 'lenke'; href: string }
  | { type: 'forslag'; id: string }
  | { type: 'fri'; id: string }
  | { type: 'bytte'; id: string }
  | { type: 'tildel'; id: string; ansattId: string }
  | { type: 'purring'; nr: number };

export interface Ventende { id: string; merke: string; farge?: 'gul' | 'gronn' | 'rod' | ''; tekst: string; under?: string; knapp: string; handling: VenterHandling; sperret?: string; fjern?: string }

/** Én samlet liste over det som venter: vaktplan, purringer, MVA, regninger og forslag fra assistenten. */
export function VenterPaDeg({ rader }: { rader: Ventende[] }) {
  const router = useRouter();
  const [opptatt, setOpptatt] = useState('');
  const [melding, setMelding] = useState<{ tekst: string; feil?: boolean } | null>(null);
  const kjor = async (r: Ventende, fjern = false) => {
    const h = r.handling;
    setOpptatt(r.id); setMelding(null);
    const res = h.type === 'forslag' ? await velgForslag(h.id, fjern ? 'avbryt' : 'utfor')
      : h.type === 'fri' ? await svarFriHandling(h.id, !fjern)
      : h.type === 'bytte' ? await gjorLedigHandling(h.id)
      : h.type === 'tildel' ? await tildelHandling(h.id, h.ansattId)
      : h.type === 'purring' ? await sendPurringDirekte(h.nr) : null;
    setOpptatt('');
    if (res) setMelding(res.ok ? { tekst: (res.data as { melding?: string } | undefined)?.melding ?? res.melding ?? 'Gjort.' } : { tekst: res.feil, feil: true });
    router.refresh();
  };
  return (
    <section className="venter-pa-deg">
      <h2 style={{ marginBottom: 10 }}>Venter på deg</h2>
      <div className="liste">
        {rader.map(r => (
          <div key={r.id} className="linje">
            <span className={`merke ${r.farge ?? ''}`} style={{ minWidth: 76, justifyContent: 'center' }}>{r.merke}</span>
            <span className="fyll tittel">{r.tekst}{(r.under || r.sperret) && <small className="mut" style={{ display: 'block' }}>{r.sperret ?? r.under}</small>}</span>
            {r.handling.type === 'lenke'
              ? <Link href={r.handling.href} className="knapp liten">{r.knapp}</Link>
              : <button type="button" className="knapp liten" disabled={!!opptatt || !!r.sperret} onClick={() => kjor(r)}>{opptatt === r.id ? '…' : r.knapp}</button>}
            {r.fjern && <button type="button" className="lenke liten" disabled={!!opptatt} onClick={() => kjor(r, true)}>{r.fjern}</button>}
          </div>
        ))}
      </div>
      {melding && <div className={`varsel ${melding.feil ? 'rod' : 'gronn'} liten`} style={{ marginTop: 10 }}>{melding.tekst}</div>}
    </section>
  );
}
