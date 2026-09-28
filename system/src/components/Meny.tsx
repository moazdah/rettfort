'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from './Logo';
import { loggUt } from '@/app/handlinger';

import { MENY } from './menyvalg';
export { MENY };

const PAKKE: Record<string, string> = { gratis: 'Gratis', start: 'Start', selskap: 'Selskap', byra: 'Byrå' };
const ROLLE: Record<string, string> = { eier: 'Eier', full: 'Full tilgang', les: 'Kan se', kvittering: 'Kvitteringer', regnskapsforer_full: 'Regnskapsfører', regnskapsforer_les: 'Regnskapsfører (se)' };

export function Meny({ firma, pakke, bruker, rolle, mvaTeller, harByra }: { firma: string; pakke: string; bruker: string; rolle: string | null; mvaTeller: number; harByra: boolean }) {
  const sti = usePathname();
  const aktiv = (m: (typeof MENY)[number]) => m.aktivPa.some(p => sti === p || sti.startsWith(p + '/'));
  const initialer = bruker.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase();
  return (
    <>
      <nav className="meny" aria-label="Hovedmeny">
        <Link href="/hjem" className="logo" aria-label="Rettført, til Hjem"><Logo bredde={96} /></Link>
        <div className="firma"><b>{firma}</b>Pakke: {PAKKE[pakke] ?? pakke}</div>
        {harByra && <Link href="/byra" className="valg"><span className="ikon">←</span>Alle kunder</Link>}
        {MENY.map(m => (
          <Link key={m.href} href={m.href} className={`valg ${aktiv(m) ? 'aktiv' : ''}`} aria-current={aktiv(m) ? 'page' : undefined}>
            <span className="ikon">{m.ikon}</span>{m.navn}
            {m.href === '/mva' && mvaTeller > 0 && <span className="teller" aria-label={`${mvaTeller} ting mangler`}>{mvaTeller}</span>}
          </Link>
        ))}
        <div className="bunn">
          <span className="avatar">{initialer}</span>
          <div style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }}><b style={{ display: 'block', fontWeight: 600 }}>{bruker}</b><span className="faint">{rolle ? ROLLE[rolle] ?? rolle : ''}</span></div>
          <form action={loggUt}><button className="knapp hvit liten">Logg ut</button></form>
        </div>
      </nav>
      <nav className="mobilmeny" aria-label="Meny">
        {[MENY[0], MENY[1], MENY[2], MENY[6]].map(m => (
          <Link key={m.href} href={m.href} className={aktiv(m) ? 'aktiv' : ''}><span className="ikon">{m.ikon}</span>{m.navn}{m.href === '/mva' && mvaTeller > 0 ? ` (${mvaTeller})` : ''}</Link>
        ))}
        <Link href="/meny" className={sti === '/meny' ? 'aktiv' : ''}><span className="ikon">···</span>Mer</Link>
      </nav>
    </>
  );
}
