'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { sendLonnslippNa } from '@/app/handlinger';

/** Knapp for å sende én lønnslipp på e-post nå, også på nytt. */
export function SendSlipp({ periode, ansattId, sendt }: { periode: string; ansattId: string; sendt: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<'' | 'sender' | 'ok'>('');
  const [feil, setFeil] = useState('');
  const send = async () => {
    setStatus('sender'); setFeil('');
    const r = await sendLonnslippNa(periode, ansattId);
    if (!r.ok) { setStatus(''); setFeil(r.feil); return; }
    setStatus('ok'); router.refresh();
  };
  return (
    <span className="stakk" style={{ gap: 4, alignItems: 'flex-end' }}>
      <button type="button" className="knapp hvit liten" disabled={status === 'sender'} onClick={send}>{status === 'sender' ? 'Sender …' : status === 'ok' ? 'Sendt ✓' : sendt ? 'Send på nytt' : 'Send på e-post'}</button>
      {feil && <span className="liten" style={{ color: 'var(--rod)', maxWidth: 260, textAlign: 'right' }}>{feil}</span>}
    </span>
  );
}
