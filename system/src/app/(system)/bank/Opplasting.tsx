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
      <details className="liten" style={{ maxWidth: 520, textAlign: 'left' }}>
        <summary className="lenke" style={{ cursor: 'pointer' }}>Slik henter du filen i din bank</summary>
        <ul className="mut" style={{ margin: '8px 0 0', paddingLeft: 18, lineHeight: 1.6 }}>
          <li><b>DNB:</b> Kontoen → Transaksjoner → velg måned → Last ned → CSV (eller «Excel/CSV»).</li>
          <li><b>Nordea:</b> Kontoen → Transaksjoner → Eksporter → CSV.</li>
          <li><b>SpareBank 1:</b> Kontoen → Transaksjoner → Last ned → CSV.</li>
          <li><b>Sbanken, Handelsbanken, Danske Bank, Bulder:</b> Kontoen → Transaksjoner → Eksporter eller Last ned → CSV.</li>
          <li><b>Bedriftsnettbank:</b> Se etter «Kontoutskrift» eller «Kontoinformasjon» og velg CAMT.053 (ISO 20022) hvis du får valget. Det er det sikreste formatet.</li>
        </ul>
        <p className="mut" style={{ marginTop: 8 }}>Menyene heter litt forskjellig fra bank til bank. Finner vi ikke kolonnene i filen, får du beskjed med én gang, og ingenting blir ført.</p>
      </details>
      <button type="button" className="knapp" disabled={venter} onClick={() => ref.current?.click()}>{venter ? 'Leser …' : 'Velg fil'}</button>
      {status && <div className={`varsel ${status.feil ? 'rod' : 'gronn'}`} role="status">{status.t}</div>}
    </div>
  );
}
