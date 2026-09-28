'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { lastOppKontoutskrift } from '@/app/handlinger';
import { manedNavn } from '@/lib/vis';

export function Opplasting({ tekst }: { tekst: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [status, setStatus] = useState<{ t: string; feil?: boolean } | null>(null);
  const [venter, setVenter] = useState(false);
  const last = async (f: File) => {
    setVenter(true); setStatus({ t: 'Leser kontoutskriften …' });
    const fd = new FormData(); fd.set('fil', f);
    const r = await lastOppKontoutskrift(fd);
    setVenter(false);
    if (!r.ok) { setStatus({ t: r.feil, feil: true }); return; }
    setStatus({ t: `${r.data!.nye} nye bevegelser lest for ${manedNavn(r.data!.maned)}. Se forslagene under.` });
    router.push(`/bank?maned=${r.data!.maned}`);
    router.refresh();
  };
  return (
    <div className="kort tom stakk" style={{ borderStyle: 'dashed', borderWidth: 2, alignItems: 'center', padding: '30px 20px' }}
      onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) last(f); }}>
      <input ref={ref} type="file" hidden accept=".csv,.txt,.xml,.xlsx,.xls,.pdf,image/*" onChange={e => { const f = e.target.files?.[0]; if (f) last(f); e.target.value = ''; }} />
      <h2>{tekst}</h2>
      <p className="mut" style={{ maxWidth: 520 }}>CSV eller CAMT.053 fra nettbanken. Du finner den under «Kontoutskrift» eller «Eksporter transaksjoner» i banken din.</p>
      <button type="button" className="knapp" disabled={venter} onClick={() => ref.current?.click()}>{venter ? 'Leser …' : 'Velg fil'}</button>
      {status && <div className={`varsel ${status.feil ? 'rod' : 'gronn'}`} role="status">{status.t}</div>}
    </div>
  );
}
