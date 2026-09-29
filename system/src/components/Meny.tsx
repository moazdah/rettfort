'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from './Logo';
import { loggUt, settTestPakke, testByra, testfirma, byttForetak } from '@/app/handlinger';

import { MENY } from './menyvalg';
export { MENY };

const PAKKE: Record<string, string> = { gratis: 'Gratis', start: 'Start', selskap: 'Selskap', byra: 'Byrå' };
const ROLLE: Record<string, string> = { eier: 'Eier', full: 'Full tilgang', les: 'Kan se', kvittering: 'Kvitteringer', regnskapsforer_full: 'Regnskapsfører', regnskapsforer_les: 'Regnskapsfører (se)' };
// Valgene som står direkte i linjen. Resten ligger under «Mer».
const HOVED = ['/hjem', '/kjop/ny', '/salg/ny', '/bank', '/lonn', '/rapporter', '/mva'];

/** Lukker en nedtrekksmeny ved klikk utenfor, Escape eller når siden byttes. */
function useNedtrekk() {
  const [apen, setApen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const sti = usePathname();
  useEffect(() => { setApen(false); }, [sti]);
  useEffect(() => {
    if (!apen) return;
    const klikk = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setApen(false); };
    const tast = (e: KeyboardEvent) => { if (e.key === 'Escape') setApen(false); };
    document.addEventListener('mousedown', klikk); document.addEventListener('keydown', tast);
    return () => { document.removeEventListener('mousedown', klikk); document.removeEventListener('keydown', tast); };
  }, [apen]);
  return { apen, setApen, ref };
}

export function Meny({ firma, pakke, bruker, rolle, mvaTeller, harByra, testbruker = false, foretak = [], orgId = '', epost = '', innboksTeller = 0 }: { firma: string; pakke: string; bruker: string; rolle: string | null; mvaTeller: number; harByra: boolean; testbruker?: boolean; foretak?: { orgId: string; navn: string }[]; orgId?: string; epost?: string; innboksTeller?: number }) {
  const sti = usePathname();
  const aktiv = (m: (typeof MENY)[number]) => m.aktivPa.some(p => sti === p || sti.startsWith(p + '/'));
  const initialer = bruker.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase();
  const hoved = MENY.filter(m => HOVED.includes(m.href));
  const mer = MENY.filter(m => !HOVED.includes(m.href));
  const merAktiv = mer.some(aktiv);
  const merMeny = useNedtrekk();
  const profil = useNedtrekk();
  const [lager, setLager] = useState(false);
  // Lukk profilmenyen når foretaket byttes (adressen kan være den samme).
  const { setApen: lukkProfil } = profil;
  useEffect(() => { lukkProfil(false); setLager(false); }, [orgId, lukkProfil]);
  const teller = (m: (typeof MENY)[number]) => m.href === '/mva' && mvaTeller > 0 ? <span className="teller" aria-label={`${mvaTeller} ting mangler`}>{mvaTeller}</span>
    : m.href === '/kjop/ny' && innboksTeller > 0 ? <span className="teller" aria-label={`${innboksTeller} i innboksen`}>{innboksTeller}</span> : null;

  return (
    <>
      <header className="toppmeny">
        <div className="toppmeny-indre">
          <Link href="/hjem" className="logo" aria-label="Rettført, til Hjem"><Logo bredde={92} /></Link>
          <nav className="valg-rad" aria-label="Hovedmeny">
            {harByra && <Link href="/byra" className="valg tilbake">← Alle kunder</Link>}
            {hoved.map(m => (
              <Link key={m.href} href={m.href} className={`valg ${aktiv(m) ? 'aktiv' : ''}`} aria-current={aktiv(m) ? 'page' : undefined}>{m.navn}{teller(m)}</Link>
            ))}
            <div className="nedtrekk" ref={merMeny.ref}>
              <button type="button" className={`valg ${merAktiv ? 'aktiv' : ''}`} aria-expanded={merMeny.apen} aria-haspopup="true" onClick={() => merMeny.setApen(!merMeny.apen)}>Mer <span className="pil" aria-hidden>▾</span></button>
              {merMeny.apen && (
                <div className="nedtrekk-panel" role="menu">
                  {mer.map(m => <Link key={m.href} href={m.href} role="menuitem" className={aktiv(m) ? 'aktiv' : ''}>{m.navn}</Link>)}
                </div>
              )}
            </div>
          </nav>
          <div className="nedtrekk profil" ref={profil.ref}>
            <button type="button" className="profil-knapp" aria-expanded={profil.apen} aria-haspopup="true" onClick={() => profil.setApen(!profil.apen)}>
              <span className="firma-navn">{firma}</span>
              <span className="avatar">{initialer}</span>
            </button>
            {profil.apen && (
              <div className="nedtrekk-panel hoyre" role="menu">
                <div className="profil-info"><b>{bruker}</b>{epost && <span>{epost}</span>}<span>{rolle ? ROLLE[rolle] ?? rolle : ''}</span><span>{firma} · Pakke: {PAKKE[pakke] ?? pakke}</span></div>
                {testbruker && (
                  <div className="testpakke">
                    <small>Testtilgang: se pakken som</small>
                    <div className="rad">
                      {(['gratis', 'start', 'selskap'] as const).map(p => <button key={p} type="button" className={pakke === p ? 'valgt' : ''} onClick={() => settTestPakke(p)}>{PAKKE[p]}</button>)}
                      <button type="button" onClick={() => testByra()}>Byrå</button>
                    </div>
                    <button type="button" className="testfirma-knapp" disabled={lager} onClick={async () => { setLager(true); const r = await testfirma(); if (r && !r.ok) { setLager(false); alert(r.feil); } }}>
                      {lager ? 'Lager testfirma … (tar litt tid)' : 'Åpne Testfirma AS med eksempeldata'}
                    </button>
                  </div>
                )}
                {foretak.length > 1 && (
                  <div className="foretak-bytt">
                    <small>Bytt foretak</small>
                    {foretak.map(f => <button key={f.orgId} type="button" role="menuitem" className={f.orgId === orgId ? 'valgt' : ''} disabled={f.orgId === orgId} onClick={() => byttForetak(f.orgId)}>{f.navn}{f.orgId === orgId ? ' ✓' : ''}</button>)}
                  </div>
                )}
                <Link href="/innstillinger" role="menuitem">Innstillinger</Link>
                <form action={loggUt}><button className="logg-ut" role="menuitem">Logg ut</button></form>
              </div>
            )}
          </div>
        </div>
      </header>
      <nav className="mobilmeny" aria-label="Meny">
        {[MENY[0], MENY[1], MENY[2], MENY[6]].map(m => (
          <Link key={m.href} href={m.href} className={aktiv(m) ? 'aktiv' : ''}><span className="ikon">{m.ikon}</span>{m.navn}{m.href === '/mva' && mvaTeller > 0 ? ` (${mvaTeller})` : m.href === '/kjop/ny' && innboksTeller > 0 ? ` (${innboksTeller})` : ''}</Link>
        ))}
        <Link href="/meny" className={sti === '/meny' ? 'aktiv' : ''}><span className="ikon">···</span>Mer</Link>
      </nav>
    </>
  );
}
