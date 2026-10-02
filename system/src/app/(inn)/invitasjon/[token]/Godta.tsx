'use client';

import { useState } from 'react';
import { godtaInvitasjon } from '@/app/handlinger';

export function GodtaKnapp({ token }: { token: string }) {
  const [feil, setFeil] = useState('');
  const [venter, setVenter] = useState(false);
  return (
    <div className="stakk">
      <button type="button" className="knapp" disabled={venter} onClick={async () => { setVenter(true); const r = await godtaInvitasjon(token); setVenter(false); if (r && !r.ok) setFeil(r.feil); }}>{venter ? 'Et øyeblikk …' : 'Godta invitasjonen'}</button>
      {feil && <div className="varsel rod">{feil}</div>}
    </div>
  );
}
