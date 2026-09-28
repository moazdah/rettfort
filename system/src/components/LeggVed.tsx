'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { lastOppVedlegg, kobleVedlegg } from '@/app/handlinger';

export function LeggVed({ kjopId }: { kjopId: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [status, setStatus] = useState('');
  return (
    <>
      <input ref={ref} type="file" hidden accept="image/*,application/pdf,.xml" onChange={async e => {
        const f = e.target.files?.[0]; if (!f) return;
        setStatus('Laster opp …');
        const fd = new FormData(); fd.set('fil', f);
        const r = await lastOppVedlegg(fd);
        if (!r.ok) { setStatus(r.feil); return; }
        const k = await kobleVedlegg(kjopId, r.data!.id);
        setStatus(k.ok ? '' : k.feil);
        router.refresh();
      }} />
      <button type="button" className="lenke" onClick={() => ref.current?.click()}>Legg ved kvittering</button>
      {status && <span className="mut liten"> {status}</span>}
    </>
  );
}
