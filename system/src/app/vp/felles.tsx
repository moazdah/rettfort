'use client';

// Felles byggeklosser for vaktplanen (leder og ansatt): ikoner, melding med Angre, ark/modal, brytere og formatering.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import '../vaktplan.css';

/** Material Symbols Rounded. Ikonet er pynt; teksten ved siden av bærer betydningen. */
export function Ikon({ n, s = 20, fyll = false, className = '' }: { n: string; s?: number; fyll?: boolean; className?: string }) {
  return <span aria-hidden="true" className={`v2-ikon ${className}`} style={{ fontSize: s, fontVariationSettings: fyll ? "'FILL' 1" : undefined }}>{n}</span>;
}

// ---------- Formatering ----------

const MND = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
const MND_LANG = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const DAG = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const dt = (d: string) => new Date(`${d}T12:00:00Z`);
export const ukedagNr = (d: string) => (dt(d).getUTCDay() + 6) % 7;
export const dagNavn = (d: string) => DAG[dt(d).getUTCDay()];
export const dagKort = (d: string) => dagNavn(d).slice(0, 3);
export const stor = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
/** «5. okt» */
export const dm = (d: string) => `${Number(d.slice(8))}. ${MND[Number(d.slice(5, 7)) - 1]}`;
/** «mandag 5. okt» */
export const dagDm = (d: string) => `${dagNavn(d)} ${dm(d)}`;
/** «Mandag 5. okt» */
export const DagDm = (d: string) => stor(dagDm(d));
export const mndNavn = (ym: string) => MND_LANG[Number(ym.slice(5, 7)) - 1];
/** «5.–11. okt 2026» */
export function periode(fra: string, til: string, aar = true) {
  const s = fra.slice(5, 7) === til.slice(5, 7) ? `${Number(fra.slice(8))}.–${dm(til)}` : `${dm(fra)}–${dm(til)}`;
  return aar ? `${s} ${til.slice(0, 4)}` : s;
}
/** Timer med komma og uten unødvendige desimaler: «45», «22,5». */
export const nf = (min: number) => { const t = Math.round((min / 60) * 10) / 10; return String(t).replace('.', ','); };
/** «13–21» */
export const kort = (t: string) => (t.endsWith(':00') ? t.slice(0, 2) : t);
export const initialer = (n: string) => n.split(/\s+/).filter(Boolean).map(x => x[0]).slice(0, 2).join('').toUpperCase();
export const fornavn = (n: string) => n.split(' ')[0];
export const plussDag = (d: string, n: number) => { const x = dt(d); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
export const tilMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
export const varighet = (s: string, e: string) => { const a = tilMin(s), b = tilMin(e); return b > a ? b - a : b + 1440 - a; };
export const arbeid = (s: string, e: string) => { const v = varighet(s, e); return v > 330 ? v - 30 : v; };

// ---------- Melding (toast) med Angre ----------

export type Melding = { tekst: string; angre?: (() => void | Promise<void>) | null; feil?: boolean } | null;

export function useMelding() {
  const [m, setM] = useState<Melding>(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vis = useCallback((tekst: string, angre?: (() => void | Promise<void>) | null, feil = false) => {
    if (t.current) clearTimeout(t.current);
    setM({ tekst, angre, feil });
    t.current = setTimeout(() => setM(null), feil ? 7000 : 5000);
  }, []);
  const lukk = useCallback(() => { if (t.current) clearTimeout(t.current); setM(null); }, []);
  return { m, vis, lukk };
}

export function Toast({ m, lukk, bunn = 24, venstre = 0 }: { m: Melding; lukk: () => void; bunn?: number; venstre?: number }) {
  if (!m) return null;
  return (
    <div className="v2-toast-ramme" style={{ bottom: bunn, left: venstre }}>
      <div role="status" className={`v2-toast ${m.feil ? 'feil' : ''}`}>
        <Ikon n={m.feil ? 'error' : 'check_circle'} s={20} className="v2-toast-ikon" />
        <span className="fyll">{m.tekst}</span>
        {m.angre && <button type="button" onClick={async () => { const a = m.angre!; lukk(); await a(); }}>Angre</button>}
      </div>
    </div>
  );
}

// ---------- Ark, modal og sidepanel ----------

/**
 * Overlegg som tilpasser seg formatet: modal (`modal`) eller sidepanel (`panel`) på nettbrett liggende og PC,
 * ark nedenfra ellers. På mobil liggende fyller arket hele høyden.
 */
export function Ark({ apen, lukk, tittel, art = 'modal', bredde = 620, children, hoy = true }: { apen: boolean; lukk: () => void; tittel: string; art?: 'modal' | 'panel'; bredde?: number; children: ReactNode; hoy?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!apen) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') lukk(); };
    document.addEventListener('keydown', esc);
    const forrige = document.activeElement as HTMLElement | null;
    setTimeout(() => ref.current?.querySelector<HTMLElement>('input,textarea,button:not([data-lukk])')?.focus({ preventScroll: true }), 30);
    document.body.classList.add('v2-laast');
    return () => { document.removeEventListener('keydown', esc); document.body.classList.remove('v2-laast'); forrige?.focus?.({ preventScroll: true }); };
  }, [apen, lukk]);
  if (!apen) return null;
  return (
    <div className={`v2-ov v2-ov-${art} ${hoy ? 'hoy' : 'lav'}`}>
      <div className="v2-ov-bak" onClick={lukk} />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={tittel} className="v2-ov-boks" style={{ ['--bredde' as string]: `${bredde}px` }}>
        <div className="v2-handtak" />
        {children}
      </div>
    </div>
  );
}

export function ArkTopp({ tittel, under, lukk, venstre }: { tittel: ReactNode; under?: ReactNode; lukk: () => void; venstre?: ReactNode }) {
  return (
    <div className="v2-ark-topp">
      {venstre}
      <div className="fyll"><div className="v2-ark-tittel">{tittel}</div>{under && <div className="v2-ark-under">{under}</div>}</div>
      <button type="button" className="v2-rund liten" aria-label="Lukk" data-lukk onClick={lukk}><Ikon n="close" s={20} /></button>
    </div>
  );
}

// ---------- Små kontroller ----------

export function Bryter({ pa, sett, etikett, deaktivert }: { pa: boolean; sett: (v: boolean) => void; etikett: string; deaktivert?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={pa} aria-label={etikett} disabled={deaktivert} className={`v2-bryter ${pa ? 'pa' : ''}`} onClick={() => sett(!pa)}>
      <span />
    </button>
  );
}

/** Segmentert valg (piller). */
export function Seg<T extends string | number | boolean>({ valg, verdi, sett, etikett, liten, mork = true }: { valg: [T, string][]; verdi: T; sett: (v: T) => void; etikett?: string; liten?: boolean; mork?: boolean }) {
  return (
    <div role="group" aria-label={etikett} className={`v2-seg ${liten ? 'liten' : ''} ${mork ? '' : 'lys'}`}>
      {valg.map(([k, l]) => <button key={String(k)} type="button" aria-pressed={verdi === k} onClick={() => sett(k)}>{l}</button>)}
    </div>
  );
}

/** Pille-knapper der flere kan velges, eller én (radio). */
export function Piller({ children }: { children: ReactNode }) { return <div className="v2-piller">{children}</div>; }
export function Pille({ pa, onClick, children, merke, label }: { pa: boolean; onClick: () => void; children: ReactNode; merke?: ReactNode; label?: string }) {
  return <button type="button" className="v2-pille" aria-pressed={pa} aria-label={label} onClick={onClick}>{children}{merke}</button>;
}

export function Teller({ n, className = '' }: { n: number; className?: string }) {
  if (!n) return null;
  return <span className={`v2-teller ${className}`}>{n}</span>;
}

export function Avatar({ navn, ini, art = 'lys', s = 36 }: { navn?: string; ini?: string; art?: 'lys' | 'mork' | 'gul' | 'gronn' | 'rod'; s?: number }) {
  return <span className={`v2-avatar ${art}`} style={{ width: s, height: s, fontSize: Math.round(s * 0.36) }}>{ini ?? initialer(navn ?? '')}</span>;
}

export function Seksjon({ tittel, hoyre, children }: { tittel: ReactNode; hoyre?: ReactNode; children?: ReactNode }) {
  return <div className="v2-seksjon"><span className="v2-sm">{tittel}</span>{hoyre}{children}</div>;
}

export function TomTilstand({ tittel, tekst, children, maskot = true }: { tittel: string; tekst?: string; children?: ReactNode; maskot?: boolean }) {
  return (
    <div className="v2-tom">
      {maskot && <img src="/mascot-hip.png" alt="" width={96} height={96} />}
      <div className="v2-tom-tittel">{tittel}</div>
      {tekst && <div className="v2-tom-tekst">{tekst}</div>}
      {children}
    </div>
  );
}

export function Skjelett({ linjer = 3 }: { linjer?: number }) {
  return <div className="v2-skjelett">{Array.from({ length: linjer }, (_, i) => <div key={i} />)}</div>;
}

/** Kjører en serverhandling: viser feil i meldingen og lar knappene vite at noe pågår. */
export function useKjor(vis: (t: string, a?: (() => void | Promise<void>) | null, feil?: boolean) => void, etter: () => void) {
  const [opptatt, setOpptatt] = useState('');
  const kjor = useCallback(async <T,>(navn: string, fn: () => Promise<{ ok: true; data?: T; melding?: string } | { ok: false; feil: string }>, ok?: (d: T | undefined, melding?: string) => void) => {
    setOpptatt(navn);
    try {
      const r = await fn();
      if (!r.ok) { vis(r.feil, null, true); return false; }
      ok?.(r.data, r.melding);
      etter();
      return true;
    } catch {
      vis('Fikk ikke kontakt. Prøv igjen.', null, true);
      return false;
    } finally { setOpptatt(''); }
  }, [vis, etter]);
  return { opptatt, kjor };
}
