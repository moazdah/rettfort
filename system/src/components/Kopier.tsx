'use client';

import { useState } from 'react';

export function Kopier({ tekst, etikett = 'Kopier' }: { tekst: string; etikett?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className="knapp hvit liten" onClick={async () => { try { await navigator.clipboard.writeText(tekst); setOk(true); setTimeout(() => setOk(false), 1800); } catch { /* ingen tilgang */ } }}>
      {ok ? 'Kopiert' : etikett}
    </button>
  );
}
