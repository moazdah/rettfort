'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Logo } from './Logo';
import { AssistentKnapp } from './Assistent';
import { loggUt, settTestPakke, testByra, testfirma, byttForetak, settAiLeverandor } from '@/app/handlinger';
import { MENY, MER, erGruppe, aktivPa, type MenyPunkt } from './menyvalg';

export { MENY };

const PAKKE: Record<string, string> = { gratis: 'Gratis', start: 'Start', selskap: 'Selskap', byra: 'Byrå' };
const ROLLE: Record<string, string> = { eier: 'Eier', full: 'Full tilgang', les: 'Kan se', kvittering: 'Kvitteringer', regnskapsforer_full: 'Regnskapsfører', regnskapsforer_les: 'Regnskapsfører (se)' };
// «NY» ved Vaktplan de første 30 dagene etter lansering, når det ikke er noe å svare på.
const VAKTPLAN_NY_TIL = '2026-11-01';
const NY = [{ t: 'Faktura', href: '/salg/ny', k: 'F' }, { t: 'Kjøp eller kvittering', href: '/kjop/ny', k: 'K' }, { t: 'Vakt', href: '/vaktplan?ny=1', k: 'V', vakt: true }, { t: 'Kontoutskrift', href: '/bank', k: 'B' }];

/** Én nedtrekksmeny åpen om gangen. Lukkes ved klikk utenfor, Escape og sidebytte. */
function useApen() {
  const [apen, setApen] = useState<string | null>(null);
  const ref = useRef<HTMLElement>(null);
  const sti = usePathname();
  useEffect(() => { setApen(null); }, [sti]);
  useEffect(() => {
    if (!apen) return;
    const klikk = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setApen(null); };
    const tast = (e: KeyboardEvent) => { if (e.key === 'Escape') setApen(null); };
    document.addEventListener('mousedown', klikk); document.addEventListener('keydown', tast);
    return () => { document.removeEventListener('mousedown', klikk); document.removeEventListener('keydown', tast); };
  }, [apen]);
  return { apen, setApen, bytt: (k: string) => setApen(a => (a === k ? null : k)), ref };
}

const Pil = ({ apen }: { apen: boolean }) => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden style={{ transform: apen ? 'rotate(180deg)' : undefined, transition: 'transform .15s', color: 'var(--mut)' }}><path d="M6 9l6 6 6-6" /></svg>;
const Teller = ({ n, ny }: { n: number; ny?: boolean }) => (n > 0 ? <span className="teller">{n}</span> : ny ? <span className="teller ny">NY</span> : null);

// Ikoner til bunnmenyen på mobil (22 px).
const I = {
  hjem: <path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1z" />,
  inn: <><path d="M12 4v12M6 10l6 6 6-6" /><path d="M4 20h16" /></>,
  ut: <><path d="M12 20V8M6 14l6-6 6 6" /><path d="M4 4h16" /></>,
  vakter: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  mer: <><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></>,
};
const Ikon = ({ d }: { d: ReactNode }) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>;

export function Meny({ firma, pakke, bruker, rolle, mvaTeller, harByra, testbruker = false, foretak = [], orgId = '', epost = '', innboksTeller = 0, ai, assistent = false, vaktTeller = 0, idag = '' }: { firma: string; pakke: string; bruker: string; rolle: string | null; mvaTeller: number; harByra: boolean; testbruker?: boolean; foretak?: { orgId: string; navn: string }[]; orgId?: string; epost?: string; innboksTeller?: number; ai?: { valgt: 'kina' | 'eu'; kina: boolean; eu: boolean }; assistent?: boolean; vaktTeller?: number; idag?: string }) {
  const sti = usePathname();
  const router = useRouter();
  const meny = useApen();
  const [mer, setMer] = useState(false);
  const [lager, setLager] = useState(false);
  const initialer = bruker.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase();
  const betalt = pakke !== 'gratis';
  // Lukk menyene når foretaket byttes (adressen kan være den samme).
  const { setApen } = meny;
  useEffect(() => { setApen(null); setLager(false); }, [orgId, setApen]);
  useEffect(() => { setMer(false); }, [sti]);
  useEffect(() => {
    if (!mer) return;
    const tast = (e: KeyboardEvent) => { if (e.key === 'Escape') setMer(false); };
    document.addEventListener('keydown', tast);
    return () => document.removeEventListener('keydown', tast);
  }, [mer]);
  // Hurtigtaster når «+ Ny» er åpen: F, K, V, B.
  useEffect(() => {
    if (meny.apen !== 'ny') return;
    const tast = (e: KeyboardEvent) => { const v = NY.find(x => x.k === e.key.toUpperCase() && (!x.vakt || betalt)); if (v) { e.preventDefault(); router.push(v.href); } };
    document.addEventListener('keydown', tast);
    return () => document.removeEventListener('keydown', tast);
  }, [meny.apen, router, betalt]);

  const tellerFor = (m: MenyPunkt) => (m.href === '/mva' ? mvaTeller : m.href === '/kjop/ny' ? innboksTeller : m.href === '/vaktplan' ? vaktTeller : 0);
  const nyMerke = (m: MenyPunkt) => m.href === '/vaktplan' && betalt && !!idag && idag < VAKTPLAN_NY_TIL && !vaktTeller;
  const merTeller = MER.flatMap(g => g.under).filter(m => m.href !== '/vaktplan').reduce((s, m) => s + tellerFor(m), 0);

  return (
    <>
      <header className="toppmeny" ref={meny.ref}>
        <div className="toppmeny-indre">
          <Link href="/hjem" className="logo" aria-label="Rettført, til Hjem"><Logo bredde={100} /></Link>
          <nav className="valg-rad" aria-label="Hovedmeny">
            {harByra && <Link href="/byra" className="valg tilbake">← Alle kunder</Link>}
            {MENY.map(m => {
              if (!erGruppe(m)) return <Link key={m.href} href={m.href} className={`valg ${aktivPa(m, sti) ? 'aktiv' : ''}`} aria-current={aktivPa(m, sti) ? 'page' : undefined}>{m.navn}<Teller n={tellerFor(m)} /></Link>;
              const aktiv = m.under.some(u => aktivPa(u, sti)), apen = meny.apen === m.navn;
              const sum = m.under.reduce((s, u) => s + tellerFor(u), 0);
              return (
                <div key={m.navn} className="nedtrekk">
                  <button type="button" className={`valg ${aktiv || apen ? 'aktiv' : ''}`} aria-expanded={apen} aria-haspopup="true" onClick={() => meny.bytt(m.navn)}>{m.navn}<Teller n={sum} ny={m.under.some(nyMerke)} /><Pil apen={apen} /></button>
                  {apen && (
                    <div className="nedtrekk-panel" role="menu">
                      {m.under.map(u => (
                        <Link key={u.href} href={u.href} role="menuitem" className={`med-tekst ${aktivPa(u, sti) ? 'aktiv' : ''}`}>
                          <span className="fyll"><b>{u.navn}</b><small>{u.tekst}{u.kreverBetalt && !betalt ? ' · Start og Selskap' : ''}</small></span>
                          <Teller n={tellerFor(u)} ny={nyMerke(u)} />
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          <div className="toppmeny-hoyre">
            <div className="nedtrekk">
              <button type="button" className="ny-knapp" aria-label="Ny" aria-expanded={meny.apen === 'ny'} onClick={() => meny.bytt('ny')}><span aria-hidden className="pluss">+</span><span className="ny-tekst">Ny</span></button>
              {meny.apen === 'ny' && (
                <div className="nedtrekk-panel hoyre" role="menu" style={{ minWidth: 230 }}>
                  {NY.filter(v => !v.vakt || betalt).map(v => <Link key={v.k} href={v.href} role="menuitem" className="ny-valg"><span>{v.t}</span><kbd>{v.k}</kbd></Link>)}
                </div>
              )}
            </div>
            {assistent && <AssistentKnapp />}
            <span className="skille" aria-hidden />
            <div className="nedtrekk profil">
              <button type="button" className={`profil-knapp ${meny.apen === 'profil' ? 'apen' : ''}`} aria-expanded={meny.apen === 'profil'} aria-haspopup="true" onClick={() => meny.bytt('profil')}>
                <span className="firma-navn"><b>{firma}</b><small>{PAKKE[pakke] ?? pakke}</small></span>
                <span className="avatar">{initialer}</span>
              </button>
              {meny.apen === 'profil' && (
                <div className="nedtrekk-panel hoyre profil-panel" role="menu">
                  <div className="profil-info"><b>{bruker}</b><span>{[epost, rolle ? ROLLE[rolle] ?? rolle : ''].filter(Boolean).join(' · ')}</span></div>
                  {foretak.length > 1 && (
                    <div className="foretak-bytt">
                      <small>Bytt foretak</small>
                      {foretak.map(f => <button key={f.orgId} type="button" role="menuitem" className={f.orgId === orgId ? 'valgt' : ''} disabled={f.orgId === orgId} onClick={() => byttForetak(f.orgId)}><span>{f.navn}</span>{f.orgId === orgId ? <span>✓</span> : null}</button>)}
                    </div>
                  )}
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
                      {ai && (
                        <>
                          <small style={{ display: 'block', marginTop: 10 }}>Assistentens språkmodell</small>
                          <div className="rad">
                            {(['kina', 'eu'] as const).map(l => <button key={l} type="button" className={ai.valgt === l ? 'valgt' : ''} disabled={!ai[l]} title={ai[l] ? undefined : 'Ikke satt opp'} onClick={async () => { const r = await settAiLeverandor(l); if (r && !r.ok) alert(r.feil); }}>{l === 'kina' ? 'Kina' : 'EU'}{ai[l] ? '' : ' (mangler)'}</button>)}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  <Link href="/innstillinger" role="menuitem">Innstillinger</Link>
                  <Link href="/innstillinger?vis=abonnement" role="menuitem">Pakke og betaling</Link>
                  <form action={loggUt}><button className="logg-ut" role="menuitem">Logg ut</button></form>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <nav className="mobilmeny" aria-label="Meny">
        {[
          { href: '/hjem', t: 'Hjem', i: I.hjem, n: 0, aktiv: sti === '/hjem' },
          { href: '/salg/ny', t: 'Inn', i: I.inn, n: 0, aktiv: sti.startsWith('/salg') },
          { href: '/kjop/ny', t: 'Ut', i: I.ut, n: innboksTeller, aktiv: sti.startsWith('/kjop') },
          { href: '/vaktplan', t: 'Vakter', i: I.vakter, n: vaktTeller, aktiv: sti.startsWith('/vaktplan') },
        ].map(m => (
          <Link key={m.href} href={m.href} className={m.aktiv ? 'aktiv' : ''} aria-current={m.aktiv ? 'page' : undefined}>
            <span className="ikon"><Ikon d={m.i} />{m.n > 0 && <span className="teller">{m.n}</span>}</span>{m.t}
          </Link>
        ))}
        <button type="button" className={mer ? 'aktiv' : ''} onClick={() => setMer(true)} aria-haspopup="dialog">
          <span className="ikon"><Ikon d={I.mer} />{merTeller > 0 && <span className="teller">{merTeller}</span>}</span>Mer
        </button>
      </nav>

      {mer && (
        <div className="mer-bak" onClick={() => setMer(false)}>
          <div className="mer-ark" role="dialog" aria-label="Mer" onClick={e => e.stopPropagation()}>
            <span className="handtak" aria-hidden />
            {harByra && <Link href="/byra" className="mer-rad"><span className="fyll">← Alle kunder</span></Link>}
            {MER.map(g => (
              <div key={g.navn}>
                <div className="mer-gruppe">{g.navn}</div>
                {g.under.map(u => (
                  <Link key={u.href} href={u.href} className={`mer-rad ${aktivPa(u, sti) ? 'aktiv' : ''}`}>
                    <span className="fyll">{u.navn}{u.kreverBetalt && !betalt ? <small> · Start og Selskap</small> : null}</span>
                    <Teller n={tellerFor(u)} /><span className="faint">›</span>
                  </Link>
                ))}
              </div>
            ))}
            <form action={loggUt}><button className="mer-rad logg-ut">Logg ut</button></form>
          </div>
        </div>
      )}
    </>
  );
}
