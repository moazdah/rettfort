'use client';

import { useEffect } from 'react';

/** Laster siden på nytt; sjekker av seg selv noen ganger mens vi venter på Stripe. */
export function LastInnPaNytt({ auto, forsok }: { auto: boolean; forsok: number }) {
  const nyAdresse = () => { const u = new URL(location.href); u.searchParams.set('forsok', String(forsok + 1)); return u.toString(); };
  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => location.replace(nyAdresse()), 3000);
    return () => clearTimeout(t);
  });
  return <button type="button" className="knapp" onClick={() => location.replace(nyAdresse())}>Last inn på nytt</button>;
}

export function ApneAssistent({ tekst }: { tekst: string }) {
  return <button type="button" className="knapp hvit liten" onClick={() => window.dispatchEvent(new CustomEvent('rf:assistent', { detail: 'bytt' }))}>{tekst}</button>;
}
