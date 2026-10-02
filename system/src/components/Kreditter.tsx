import Link from 'next/link';
import { GRATIS_GRENSE } from '@/lib/pakker';
import type { GratisBruk } from '@/lib/tjenester/bruk';

/** Kredittene i Gratis denne måneden: fakturaer og kvitteringer som leses av. Fylles på den 1. hver måned. */
export function Kreditter({ bruk, bare }: { bruk: GratisBruk; bare?: 'faktura' | 'kvittering' }) {
  const rader = ([['faktura', 'Fakturaer'], ['kvittering', 'Kvitteringer som leses av']] as const).filter(([k]) => !bare || k === bare);
  const tomt = rader.some(([k]) => bruk[k] >= GRATIS_GRENSE[k]);
  return (
    <div className={`varsel ${tomt ? 'gul' : 'info'} kreditter`} role="status">
      <b>Gratis denne måneden</b>
      {rader.map(([k, navn]) => {
        const igjen = Math.max(0, GRATIS_GRENSE[k] - bruk[k]);
        return (
          <span key={k} className="kreditt">
            <span className={`kreditt-mal ${igjen ? '' : 'kreditt-tom'}`} aria-hidden><span style={{ width: `${(igjen / GRATIS_GRENSE[k]) * 100}%` }} /></span>
            {navn}: <b className="belop">{igjen} av {GRATIS_GRENSE[k]}</b> kreditter igjen
          </span>
        );
      })}
      <span className="fyll" />
      <Link className="lenke" href="/innstillinger?vis=abonnement">{tomt ? 'Oppgrader for å fortsette' : 'Ubegrenset med Start'}</Link>
    </div>
  );
}
