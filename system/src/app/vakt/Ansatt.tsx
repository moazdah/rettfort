'use client';

// Ansattvisningen av vaktplanen. Fasit: docs/design/prototyper, «Vaktplan v2» (ansatt).
// Oversikt · Vakter · Ledige · Timer · Mer. Det lederen har slått av, vises ikke.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { loggUt } from '@/app/handlinger';
import { byttKnapp, aktiveTyper } from '@/lib/vaktplan-innstillinger';
import {
  interesseHandling, byttBortHandling, byttMedHandling, svarByttHandling, tilgjengeligHandling, soknadHandling,
  kommentarHandling, avvikHandling, oversiktHandling, varselEpostHandling,
} from '@/app/vaktplan-handlinger';
import type { AnsattData } from './data';
import { Ikon, Toast, useMelding, useKjor, Ark, ArkTopp, Seg, Bryter, Avatar, TomTilstand, Teller, DagDm, dagDm, dagKort, dm, nf, periode, fornavn, initialer, plussDag, mndNavn, arbeid as arbeidTid, stor } from '../vp/felles';

type Skjerm = 'oversikt' | 'tilpass' | 'vakter' | 'kalender' | 'ledige' | 'bytter' | 'tilg' | 'fravaer' | 'timer' | 'mer' | 'kolleger' | 'minside';
type Vakt = AnsattData['vakter'][number];
type Art = 'mine' | 'colleague' | 'open' | 'swap';
type Filter = Record<'mine' | 'absence' | 'swap' | 'open' | 'avail' | 'colleague', boolean>;
type Fsel = { sted: string[]; type: string[]; ansatt: string[] };
type Ark_ = null | 'filter' | 'meny' | 'bytt' | 'fri' | 'kommentar' | 'avvik' | 'soknad' | 'tilgform' | { person: string };
const ALLE: Filter = { mine: true, absence: true, swap: true, open: true, avail: true, colleague: true };
const INGEN: Fsel = { sted: [], type: [], ansatt: [] };
const BLOKKER = [{ id: 'next', label: 'Neste vakt' }, { id: 'waiting', label: 'Venter på deg', count: 3 }, { id: 'upcoming', label: 'Kommende vakter', count: 3 }, { id: 'open', label: 'Ledige vakter du kan ta', count: 3 }];
type Blokk = { id: string; label: string; visible: boolean; count?: number };

export function Ansatt({ d }: { d: AnsattData }) {
  const router = useRouter();
  const { m, vis, lukk } = useMelding();
  const etter = useCallback(() => router.refresh(), [router]);
  const { opptatt, kjor } = useKjor(vis, etter);
  const inn = d.inn;
  const [skjerm, setSkjerm] = useState<Skjerm>('oversikt');
  const [hist, setHist] = useState<Skjerm[]>([]);
  const [valgt, setValgt] = useState<string | null>(null);
  const [ark, setArk] = useState<Ark_>(null);
  const [filter, setFilter] = useState<Filter>(ALLE);
  const [fsel, setFsel] = useState<Fsel>(INGEN);
  const [aktivtFilter, setAktivtFilter] = useState('alle');
  const [valgtDag, setValgtDag] = useState<string | null>(null);
  const [visning, setVisning] = useState<'liste' | 'uke' | null>(null);
  const [ukeNr, setUkeNr] = useState(0);
  const scroll = useRef<HTMLDivElement>(null);

  const ga = useCallback((s: Skjerm) => { setHist(h => [...h, skjerm]); setSkjerm(s); setValgt(null); setArk(null); window.scrollTo({ top: 0 }); scroll.current?.scrollTo({ top: 0 }); }, [skjerm]);
  const tilbake = () => { setSkjerm(hist[hist.length - 1] ?? 'mer'); setHist(h => h.slice(0, -1)); };
  const apneVakt = (id: string) => setValgt(id);

  const kollega = (id: string | null) => d.kolleger.find(k => k.id === id);
  const art = (v: Vakt): Art => (v.ansattId === d.meg.id ? 'mine' : !v.ansattId ? 'open' : v.utlagt ? 'swap' : 'colleague');
  const friSokt = (dato: string) => d.fri.some(f => f.dato === dato && f.status === 'venter');
  const tilgjFor = (dato: string) => d.tilgj.find(t => t.dato === dato);
  const fravaerFor = (dato: string) => d.fravaer.find(f => f.status === 'godkjent' && f.fra <= dato && f.til >= dato);
  const ledig = (id: string) => d.ledige.find(l => l.id === id);
  const publiserteDager = new Set(d.uker.filter(u => u.publisert).flatMap(u => u.dager));

  // Teller-merker: ledige vakter, timer som venter, bytter som venter på meg.
  const nLedige = d.vakter.filter(v => !v.ansattId && v.dato >= d.idag).length;
  const nBytter = d.bytter.filter(b => b.tilId === d.meg.id && b.status === 'venter_kollega').length + d.vakter.filter(v => art(v) === 'swap' && v.dato >= d.idag && !v.interessert).length;
  const nTimer = d.timer.filter(u => !u.godkjent).length ? 1 : 0;
  const nav: [Skjerm, string, string, number][] = [
    ['oversikt', 'Oversikt', 'home', 0], ['vakter', 'Vakter', 'calendar_month', 0],
    ...(inn.open.on ? [['ledige', 'Ledige', 'front_hand', nLedige] as [Skjerm, string, string, number]] : []),
    ...(inn.hours.on ? [['timer', 'Timer', 'schedule', nTimer] as [Skjerm, string, string, number]] : []),
    ['mer', 'Mer', 'menu', inn.swap.on || inn.give.on ? nBytter : 0],
  ];
  const mer: [Skjerm, string, string, number][] = [
    ...(inn.avail.on ? [['tilg', 'Tilgjengelighet', 'event_available', 0] as [Skjerm, string, string, number]] : []),
    ...(inn.absence.on ? [['fravaer', 'Fravær', 'beach_access', 0] as [Skjerm, string, string, number]] : []),
    ...(inn.swap.on || inn.give.on ? [['bytter', 'Bytter', 'swap_horiz', nBytter] as [Skjerm, string, string, number]] : []),
    ...(inn.colleagues.on ? [['kolleger', 'Kolleger', 'group', 0] as [Skjerm, string, string, number]] : []),
  ];
  const aktivFane = ({ tilpass: 'oversikt', kalender: 'vakter' } as Record<string, Skjerm>)[skjerm] ?? skjerm;

  // ---------- Handlinger ----------
  const settTilgj = (dato: string, ny: 'kan' | 'kan_ikke' | null, grunn?: string) => {
    const for_ = tilgjFor(dato), harVakt = d.vakter.some(v => v.ansattId === d.meg.id && v.dato === dato), dag = dagDm(dato).split(' ')[0];
    const forrige = for_?.status ?? null, forrigeGrunn = for_?.grunn ?? undefined;
    void kjor('tilg', () => tilgjengeligHandling(dato, ny, grunn), () => {
      const angre = () => { void kjor('angre', () => tilgjengeligHandling(dato, forrige, forrigeGrunn), () => vis('Angret.')); };
      if (ny === 'kan_ikke' && harVakt) vis(`Du har bedt om fri ${dag}. Lederen får beskjed.`, angre);
      else if (ny === 'kan_ikke') vis(`Lagret: du kan ikke jobbe ${dag}.`, angre);
      else if (ny === 'kan') vis(`Lagret: du kan jobbe ${dag}.`, angre);
      else vis(harVakt ? `Forespørselen om fri ${dag} er trukket.` : `Tilgjengeligheten for ${dag} er fjernet.`, angre);
    });
  };
  const interesse = (v: Vakt) => {
    const pa = !v.interessert;
    void kjor('int', () => interesseHandling(v.id, pa), r => vis(r?.melding ?? 'Lagret.', r?.fikk ? null : () => { void kjor('angre', () => interesseHandling(v.id, !pa), () => vis('Angret.')); }));
  };

  const ctx: Ctx = { d, art, kollega, friSokt, tilgjFor, fravaerFor, ledig, apneVakt, ga, settTilgj, interesse, opptatt, kjor, vis, setArk };
  const valgtVakt = valgt ? d.vakter.find(v => v.id === valgt) ?? null : null;

  return (
    <div className={`v2 v2a ${valgtVakt ? 'med-detalj' : ''}`}>
      <nav className="v2a-side" aria-label="Hovedmeny">
        <div className="v2a-merke"><Logo bredde={92} /><span className="v2-skille" /><span>Vaktplan</span></div>
        <div className="v2a-gruppe"><div className="v2-sm">Vaktplan</div>
          {nav.filter(n => n[0] !== 'mer').map(([k, l, i, n]) => <NavKnapp key={k} pa={aktivFane === k} ikon={i} tekst={l} n={n} onClick={() => ga(k)} />)}
        </div>
        {mer.length > 0 && <div className="v2a-gruppe"><div className="v2-sm">Arbeid</div>{mer.map(([k, l, i, n]) => <NavKnapp key={k} pa={aktivFane === k} ikon={i} tekst={l} n={n} onClick={() => ga(k)} />)}</div>}
        <div className="v2a-gruppe"><div className="v2-sm">Meg</div><NavKnapp pa={aktivFane === 'minside'} ikon="person" tekst="Min side" onClick={() => ga('minside')} /></div>
        <div className="v2a-side-bunn"><Avatar navn={d.meg.navn} art="mork" s={36} /><div className="fyll"><div className="v2a-side-navn">{d.meg.navn}</div><div className="v2-hjelp">{d.foretak}</div></div></div>
      </nav>
      <nav className="v2a-rail" aria-label="Hovedmeny">
        {nav.map(([k, l, i, n]) => <button key={k} type="button" aria-current={aktivFane === k || (k === 'mer' && ['tilg', 'fravaer', 'bytter', 'kolleger', 'minside'].includes(skjerm)) ? 'page' : undefined} onClick={() => ga(k)}><span className="v2-nav-ikon"><Ikon n={i} s={23} /></span><span>{l}</span>{n > 0 && <span className="v2-nav-merke">{n}</span>}</button>)}
      </nav>

      <main className="v2a-innhold" ref={scroll}>
        <div className={`v2a-side-innhold v2a-${skjerm} ${skjerm === 'vakter' && (visning ?? 'auto') !== 'liste' ? 'bred' : ''}`}>
          {skjerm === 'oversikt' && <Oversikt c={ctx} tilpass={() => ga('tilpass')} />}
          {skjerm === 'tilpass' && <Tilpass c={ctx} ferdig={() => { setSkjerm('oversikt'); setHist([]); }} />}
          {skjerm === 'vakter' && <Vakter c={ctx} filter={filter} fsel={fsel} visning={visning} setVisning={setVisning} valgtDag={valgtDag} setValgtDag={setValgtDag} ukeNr={ukeNr} setUkeNr={setUkeNr}
            aktivtFilter={aktivtFilter} fjernFilter={() => { setAktivtFilter('alle'); setFilter(ALLE); setFsel(INGEN); }} publiserte={publiserteDager} />}
          {skjerm === 'kalender' && <Kalender c={ctx} tilbake={() => ga('vakter')} velg={x => { setValgtDag(x); const i = d.uker.findIndex(u => u.dager.includes(x)); if (i >= 0) setUkeNr(i); ga('vakter'); }} />}
          {skjerm === 'ledige' && <Ledige c={ctx} />}
          {skjerm === 'bytter' && <Bytter c={ctx} tilbake={tilbake} />}
          {skjerm === 'tilg' && <Tilgjengelighet c={ctx} tilbake={tilbake} />}
          {skjerm === 'fravaer' && <Fravaer c={ctx} tilbake={tilbake} />}
          {skjerm === 'timer' && <Timer c={ctx} />}
          {skjerm === 'mer' && <Mer c={ctx} mer={mer} />}
          {skjerm === 'kolleger' && <Kolleger c={ctx} tilbake={tilbake} />}
          {skjerm === 'minside' && <MinSide c={ctx} tilbake={tilbake} />}
        </div>
      </main>

      {valgtVakt && <Detalj c={ctx} v={valgtVakt} lukk={() => setValgt(null)} />}

      <nav className="v2a-bunn" aria-label="Hovedmeny">
        {nav.map(([k, l, i, n]) => <button key={k} type="button" aria-current={aktivFane === k || (k === 'mer' && ['tilg', 'fravaer', 'bytter', 'kolleger', 'minside'].includes(skjerm)) ? 'page' : undefined} onClick={() => ga(k)}><span className="v2-nav-ikon"><Ikon n={i} s={23} fyll={aktivFane === k} /></span><span>{l}</span>{n > 0 && <span className="v2-nav-merke">{n}</span>}</button>)}
      </nav>

      <Toast m={m} lukk={lukk} />

      <Ark apen={ark === 'filter'} lukk={() => setArk(null)} tittel="Filter" art="panel">
        <FilterArk c={ctx} filter={filter} setFilter={setFilter} fsel={fsel} setFsel={setFsel} aktivt={aktivtFilter} setAktivt={setAktivtFilter} lukk={() => setArk(null)} />
      </Ark>
      <Ark apen={ark === 'meny'} lukk={() => setArk(null)} tittel="Uka" art="panel" hoy={false}>
        <UkeMeny c={ctx} lukk={() => setArk(null)} />
      </Ark>
      <Ark apen={typeof ark === 'object' && !!ark && 'person' in ark} lukk={() => setArk(null)} tittel="Kollega" art="panel" hoy={false}>
        {typeof ark === 'object' && ark && 'person' in ark && <PersonArk c={ctx} id={ark.person} dato={valgtVakt?.dato ?? d.idag} lukk={() => setArk(null)} />}
      </Ark>
      <Ark apen={ark === 'bytt' && !!valgtVakt} lukk={() => setArk(null)} tittel={byttKnapp(inn) ?? 'Bytt'} art="panel">
        {ark === 'bytt' && valgtVakt && <ByttArk c={ctx} v={valgtVakt} lukk={() => setArk(null)} />}
      </Ark>
      <Ark apen={(ark === 'fri' || ark === 'kommentar') && !!valgtVakt} lukk={() => setArk(null)} tittel={ark === 'fri' ? 'Be om fri' : 'Legg til kommentar'} art="panel" hoy={false}>
        {(ark === 'fri' || ark === 'kommentar') && valgtVakt && <TekstArk c={ctx} hva={ark} v={valgtVakt} lukk={() => setArk(null)} />}
      </Ark>
      <Ark apen={ark === 'avvik'} lukk={() => setArk(null)} tittel="Meld inn timer som avviker" art="panel">
        {ark === 'avvik' && <AvvikArk c={ctx} lukk={() => setArk(null)} />}
      </Ark>
      <Ark apen={ark === 'soknad'} lukk={() => setArk(null)} tittel="Ny søknad" art="panel">
        {ark === 'soknad' && <SoknadArk c={ctx} lukk={() => setArk(null)} />}
      </Ark>
      <Ark apen={ark === 'tilgform'} lukk={() => setArk(null)} tittel="Legg til tilgjengelighet" art="panel">
        {ark === 'tilgform' && <TilgForm c={ctx} lukk={() => setArk(null)} />}
      </Ark>
    </div>
  );
}

interface Ctx {
  d: AnsattData; art: (v: Vakt) => Art; kollega: (id: string | null) => AnsattData['kolleger'][number] | undefined;
  friSokt: (dato: string) => boolean; tilgjFor: (dato: string) => AnsattData['tilgj'][number] | undefined; fravaerFor: (dato: string) => AnsattData['fravaer'][number] | undefined;
  ledig: (id: string) => AnsattData['ledige'][number] | undefined; apneVakt: (id: string) => void; ga: (s: Skjerm) => void;
  settTilgj: (dato: string, ny: 'kan' | 'kan_ikke' | null, grunn?: string) => void; interesse: (v: Vakt) => void;
  opptatt: string; kjor: ReturnType<typeof useKjor>['kjor']; vis: (t: string, a?: (() => void | Promise<void>) | null, feil?: boolean) => void; setArk: (a: Ark_) => void;
}

function NavKnapp({ pa, ikon, tekst, n = 0, onClick }: { pa: boolean; ikon: string; tekst: string; n?: number; onClick: () => void }) {
  return <button type="button" className="v2a-navknapp" aria-current={pa ? 'page' : undefined} onClick={onClick}><Ikon n={ikon} s={21} fyll={pa} /><span className="fyll">{tekst}</span>{n > 0 && <Teller n={n} />}</button>;
}

function Topp({ tittel, tilbake, children }: { tittel: ReactNode; tilbake?: () => void; children?: ReactNode }) {
  return (
    <div className="v2a-topp">
      {tilbake && <button type="button" className="v2-rund v2a-tilbake" aria-label="Tilbake" onClick={tilbake}><Ikon n="arrow_back" s={22} /></button>}
      <h1 className="fyll">{tittel}</h1>
      {children}
    </div>
  );
}

/** Kortet for en vakt, med statusstripe og merke. */
function kortInfo(c: Ctx, v: Vakt) {
  const a = c.art(v);
  let pille = '', pa = '';
  if (a === 'mine' && c.friSokt(v.dato)) { pille = 'Fri søkt'; pa = 'rod'; }
  else if (a === 'mine' && v.utlagt) { pille = 'Gitt bort'; pa = 'bla'; }
  if (a === 'open') { pille = v.interessert ? 'Meldt interesse' : 'Ledig'; pa = 'gul'; }
  if (a === 'swap') { pille = v.interessert ? 'Du har sagt ja' : 'Vil bytte'; pa = 'bla'; }
  const n = v.andreInteressert + (v.interessert ? 1 : 0);
  const navn = a === 'mine' ? 'Deg' : a === 'open' ? (n ? `${n} har meldt interesse` : 'Ingen har meldt interesse ennå') : c.kollega(v.ansattId)?.navn ?? 'Opptatt';
  const ini = a === 'mine' ? initialer(c.d.meg.navn) : a === 'open' ? '?' : c.kollega(v.ansattId)?.navn === 'Opptatt' ? '' : initialer(c.kollega(v.ansattId)?.navn ?? '');
  const under = [v.type, v.sted].filter(Boolean).join(' · ');
  return { a, pille, pa, navn, ini, under, aria: `${navn}, ${dagDm(v.dato)}, ${v.start} til ${v.slutt}${v.type ? `, ${v.type}` : ''}${v.sted ? `, ${v.sted}` : ''}${pille ? `, ${pille}` : ''}` };
}

function VaktKort({ c, v, kompakt }: { c: Ctx; v: Vakt; kompakt?: boolean }) {
  const k = kortInfo(c, v);
  return (
    <button type="button" className={`v2a-kort ${k.a} ${kompakt ? 'kompakt' : ''}`} aria-label={k.aria} onClick={() => c.apneVakt(v.id)}>
      {!kompakt && <span className={`v2-avatar ${k.a === 'mine' ? 'mork' : k.a === 'open' ? 'gul' : ''}`} style={{ width: 36, height: 36, fontSize: 13 }}>{k.ini}</span>}
      <span className="fyll v2a-kort-tekst">
        <span className="v2a-kort-tid v2-mono">{v.start}–{v.slutt}</span>
        {k.under && <span className="v2a-kort-under">{kompakt ? v.type ?? v.sted : k.under}</span>}
        <span className={`v2a-kort-navn ${k.a === 'mine' ? 'meg' : ''}`}>{k.navn}</span>
        {kompakt && k.pille && <span className={`v2-flagg ${k.pa}`}>{k.pille}</span>}
      </span>
      {!kompakt && (k.pille || (v.kommentar && c.d.inn.comments.on)) && <span className="v2a-kort-hoyre">{k.pille && <span className={`v2-flagg ${k.pa}`}>{k.pille}</span>}{v.kommentar && c.d.inn.comments.on && <Ikon n="chat_bubble" s={18} className="v2a-kommentar" />}</span>}
    </button>
  );
}

/** Raden under hver dag: «Kan du jobbe?» / «Får du ikke jobbet?» med Kan og Kan ikke. */
function TilgRad({ c, dato, kompakt }: { c: Ctx; dato: string; kompakt?: boolean }) {
  const t = c.tilgjFor(dato), harVakt = c.d.vakter.some(v => v.ansattId === c.d.meg.id && v.dato === dato);
  const verdi = t?.status ?? null;
  const tekst = verdi === 'kan' ? 'Du kan jobbe' : verdi === 'kan_ikke' ? `Kan ikke${t?.grunn ? `: ${t.grunn}` : ''}${harVakt ? ' · fri søkt' : ''}` : harVakt ? 'Får du ikke jobbet?' : 'Kan du jobbe?';
  const valg: ['kan' | 'kan_ikke', string, string][] = harVakt ? [['kan_ikke', 'Kan ikke', 'block']] : [['kan', 'Kan', 'check'], ['kan_ikke', 'Kan ikke', 'block']];
  const fortid = dato < c.d.idag;
  if (fortid) return null;
  return (
    <div className={`v2a-tilgrad ${verdi ?? ''} ${kompakt ? 'kompakt' : ''}`}>
      <span className="v2a-tilgrad-tekst"><Ikon n={verdi === 'kan' ? 'check_circle' : verdi === 'kan_ikke' ? 'block' : 'event_available'} s={kompakt ? 15 : 18} /><span>{tekst}</span></span>
      <div role="group" aria-label={`Tilgjengelighet ${dagDm(dato)}`} className="v2a-tilgrad-knapper">
        {valg.map(([k, l, i]) => <button key={k} type="button" aria-pressed={verdi === k} className={k} disabled={!!c.opptatt} onClick={() => c.settTilgj(dato, verdi === k ? null : k)}><Ikon n={verdi === k ? i : k === 'kan' ? 'add' : i} s={15} />{l}</button>)}
      </div>
    </div>
  );
}

function FravaerKort({ f }: { f: AnsattData['fravaer'][number] }) {
  return <div className="v2a-kort absence"><span className="v2-avatar rod" style={{ width: 36, height: 36 }}><Ikon n="event_busy" s={18} /></span><span className="fyll v2a-kort-tekst"><span className="v2a-kort-tid">Hele dagen</span><span className="v2a-kort-under">{f.type}</span><span className="v2a-kort-navn">Godkjent</span></span></div>;
}

// ---------- Oversikt ----------

function Oversikt({ c, tilpass }: { c: Ctx; tilpass: () => void }) {
  const { d } = c;
  const blokker: Blokk[] = (d.oversikt?.length ? d.oversikt.map(b => ({ ...BLOKKER.find(x => x.id === b.id)!, ...b })).filter(b => b.label) : BLOKKER.map(b => ({ ...b, visible: true })));
  const mine = d.vakter.filter(v => v.ansattId === d.meg.id && v.dato >= d.idag).sort((a, b) => (a.dato + a.start).localeCompare(b.dato + b.start));
  const neste = mine.find(v => v.dato > d.idag || v.slutt > naaTid()) ?? null;
  const venter = [
    ...d.bytter.filter(b => b.tilId === d.meg.id && b.status === 'venter_kollega').map(b => ({ ikon: 'swap_horiz', art: 'bla', tittel: `${fornavn(b.fraNavn)} vil bytte ${dagDm(b.dato)}`, under: `${b.start}–${b.slutt}${b.type ? ` · ${b.type}` : ''}${b.sted ? ` · ${b.sted}` : ''}`, go: () => c.ga('bytter') })),
    ...(d.inn.swap.on || d.inn.give.on ? d.vakter.filter(v => c.art(v) === 'swap' && v.dato >= d.idag && !v.interessert).map(v => ({ ikon: 'swap_horiz', art: 'bla', tittel: `${fornavn(c.kollega(v.ansattId)?.navn ?? 'En kollega')} vil gi bort ${dagDm(v.dato)}`, under: `${v.start}–${v.slutt}${v.type ? ` · ${v.type}` : ''}${v.sted ? ` · ${v.sted}` : ''}`, go: () => c.ga('bytter') })) : []),
    ...(d.inn.avail.on || d.inn.absence.on ? d.fri.filter(f => f.status === 'venter').map(f => ({ ikon: 'event_busy', art: 'rod', tittel: `Fri ${dagDm(f.dato)}`, under: 'Venter på lederen', go: () => { const v = mine.find(x => x.dato === f.dato); if (v) c.apneVakt(v.id); } })) : []),
    ...(d.inn.open.on ? d.vakter.filter(v => !v.ansattId && v.interessert).map(v => ({ ikon: 'front_hand', art: 'gul', tittel: `${stor(dagDm(v.dato))}: du har meldt interesse`, under: 'Lederen bestemmer hvem som får vakten', go: () => c.ga('ledige') })) : []),
  ];
  const apne = d.vakter.filter(v => !v.ansattId && v.dato >= d.idag);
  const ingen = !d.vakter.some(v => v.ansattId === d.meg.id);
  return (
    <div className="v2a-oversikt">
      <div className="v2a-hei">
        <div><h1>Hei, {fornavn(d.meg.navn)}.</h1><div className="v2-hjelp stor">Uke {d.uker[0].uke} · {dagDm(d.idag).replace(/\. (\w+)$/, (_, m) => `. ${mndNavn(d.idag)}`)}</div></div>
        <button type="button" className="v2-rund" aria-label="Tilpass oversikten" onClick={tilpass}><Ikon n="tune" s={22} /></button>
      </div>
      {ingen && !apne.length ? <TomTilstand tittel="Ingen vakter denne uka." tekst="Du får beskjed på e-post når lederen publiserer neste uke." /> : (
        <div className="v2a-blokker">
          {blokker.filter(b => b.visible).map(b => {
            if (b.id === 'next') return neste ? <NesteVakt key="next" c={c} v={neste} /> : null;
            if (b.id === 'waiting' && venter.length) return (
              <div key="waiting" className="v2a-blokk">
                <div className="v2-seksjon"><span className="v2-sm">Venter på deg</span><Teller n={venter.length} /><button type="button" className="v2-lenkeknapp" onClick={() => c.ga('bytter')}>Se alle</button></div>
                <div className="v2a-liste">{venter.slice(0, b.count ?? 3).map(w => <button key={w.tittel} type="button" className="v2a-linje" onClick={w.go}><span className={`v2a-rundikon ${w.art}`}><Ikon n={w.ikon} s={21} /></span><span className="fyll"><span className="v2a-linje-tittel">{w.tittel}</span><span className="v2-hjelp">{w.under}</span></span><Ikon n="chevron_right" s={20} /></button>)}</div>
              </div>
            );
            if (b.id === 'upcoming' && mine.length) return (
              <div key="upcoming" className="v2a-blokk">
                <div className="v2-seksjon"><span className="v2-sm">Kommende vakter</span><button type="button" className="v2-lenkeknapp" onClick={() => c.ga('vakter')}>Se alle</button></div>
                {mine.slice(0, b.count ?? 3).map(v => <div key={v.id} className="v2a-dagkort"><div className="v2a-dato"><span>{dagKort(v.dato)}.</span><b>{Number(v.dato.slice(8))}</b></div><VaktKort c={c} v={v} kompakt /></div>)}
              </div>
            );
            if (b.id === 'open' && d.inn.open.on && apne.length) return (
              <div key="open" className="v2a-blokk">
                <div className="v2-seksjon"><span className="v2-sm">Ledige vakter du kan ta</span><button type="button" className="v2-lenkeknapp" onClick={() => c.ga('ledige')}>Se alle</button></div>
                {apne.slice(0, b.count ?? 3).map(v => <LedigKort key={v.id} c={c} v={v} liten />)}
              </div>
            );
            return null;
          })}
        </div>
      )}
    </div>
  );
}

const naaTid = () => new Date().toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Oslo' });

function NesteVakt({ c, v }: { c: Ctx; v: Vakt }) {
  const { d } = c;
  const dager = Math.round((Date.parse(`${v.dato}T12:00:00Z`) - Date.parse(`${d.idag}T12:00:00Z`)) / 86400000);
  const [h, m] = v.start.split(':').map(Number), [nh, nm] = naaTid().split(':').map(Number);
  const om = dager === 0 ? (h * 60 + m <= nh * 60 + nm ? 'nå' : `om ${Math.max(1, Math.round((h * 60 + m - nh * 60 - nm) / 60))} ${Math.round((h * 60 + m - nh * 60 - nm) / 60) === 1 ? 'time' : 'timer'}`) : dager === 1 ? 'i morgen' : `om ${dager} dager`;
  const nar = dager === 0 ? `I dag, ${dagDm(v.dato)}` : dager === 1 ? `I morgen, ${dagDm(v.dato)}` : DagDm(v.dato);
  const avtalt = d.uka.avtalt;
  return (
    <button type="button" className="v2a-neste" onClick={() => c.apneVakt(v.id)}>
      <div className="v2a-neste-topp"><span className="v2-sm lys">Neste vakt</span><span className="v2a-neste-om">{om}</span></div>
      <div><div className="v2a-neste-nar">{nar}</div><div className="v2a-neste-tid v2-mono">{v.start}–{v.slutt}</div><div>{[v.type, v.sted].filter(Boolean).join(' · ')}</div></div>
      <div className="v2a-neste-uke">
        <div className="v2-rad"><span className="fyll lys">Denne uka</span><span className="v2-mono">{avtalt ? `${nf(d.uka.arbeid)} av ${nf(avtalt)} t` : `${nf(d.uka.arbeid)} t`}</span></div>
        {avtalt != null && <div className="v2a-neste-strek"><span style={{ width: `${Math.min(100, (d.uka.arbeid / avtalt) * 100)}%` }} /></div>}
      </div>
    </button>
  );
}

function Tilpass({ c, ferdig }: { c: Ctx; ferdig: () => void }) {
  const { d } = c;
  const [blokker, setBlokker] = useState<Blokk[]>(() => (d.oversikt?.length ? d.oversikt.map(b => ({ ...BLOKKER.find(x => x.id === b.id)!, ...b })).filter(b => b.label) : BLOKKER.map(b => ({ ...b, visible: true }))));
  const [dra, setDra] = useState<number | null>(null);
  const flytt = (fra: number, til: number) => setBlokker(x => { const a = [...x]; const [m] = a.splice(fra, 1); a.splice(til, 0, m); return a; });
  const synlige = blokker.filter(b => !(b.id === 'open' && !d.inn.open.on));
  return (
    <div className="v2-stakk">
      <div className="v2a-tilpass-topp">
        <button type="button" className="v2-knapp tekst" onClick={ferdig}>Avbryt</button>
        <div className="v2a-tilpass-tittel">Tilpass oversikten</div>
        <button type="button" className="v2-knapp primar liten" disabled={!!c.opptatt} onClick={() => c.kjor('oversikt', () => oversiktHandling(blokker.map(({ id, visible, count }) => ({ id, visible, count }))), (_, m) => { c.vis(m ?? 'Oversikten er lagret.'); ferdig(); })}>Lagre</button>
      </div>
      <div className="v2-hjelp">Dra for å endre rekkefølgen. Trykk på øyet for å skjule en blokk.</div>
      <div className="v2-kort v2a-tilpass">
        {synlige.map(b => {
          const i = blokker.indexOf(b);
          return (
            <div key={b.id} className={`v2a-tilpass-rad ${dra === i ? 'drar' : ''}`} draggable onDragStart={() => setDra(i)} onDragOver={e => e.preventDefault()} onDrop={() => { if (dra != null) flytt(dra, i); setDra(null); }}>
              <span className="v2a-handtak" aria-hidden><Ikon n="drag_indicator" s={22} /></span>
              <span className={`fyll ${b.visible ? '' : 'skjult'}`}>{b.label}</span>
              {b.count != null && <div className="v2-stepper liten"><button type="button" aria-label="Færre" onClick={() => setBlokker(x => x.map(y => (y.id === b.id ? { ...y, count: Math.max(1, (y.count ?? 3) - 1) } : y)))}>−</button><span className="v2-mono">{b.count}</span><button type="button" aria-label="Flere" onClick={() => setBlokker(x => x.map(y => (y.id === b.id ? { ...y, count: Math.min(5, (y.count ?? 3) + 1) } : y)))}>+</button></div>}
              <div className="v2a-pilknapper">
                <button type="button" aria-label="Flytt opp" disabled={i === 0} onClick={() => flytt(i, i - 1)}><Ikon n="expand_less" s={20} /></button>
                <button type="button" aria-label="Flytt ned" disabled={i === blokker.length - 1} onClick={() => flytt(i, i + 1)}><Ikon n="expand_more" s={20} /></button>
              </div>
              <button type="button" className="v2-rund liten" aria-label={b.visible ? 'Skjul' : 'Vis'} onClick={() => setBlokker(x => x.map(y => (y.id === b.id ? { ...y, visible: !y.visible } : y)))}><Ikon n={b.visible ? 'visibility' : 'visibility_off'} s={22} /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Vakter ----------

function Vakter({ c, filter, fsel, visning, setVisning, valgtDag, setValgtDag, ukeNr, setUkeNr, aktivtFilter, fjernFilter, publiserte }: {
  c: Ctx; filter: Filter; fsel: Fsel; visning: 'liste' | 'uke' | null; setVisning: (v: 'liste' | 'uke') => void; valgtDag: string | null; setValgtDag: (d: string | null) => void;
  ukeNr: number; setUkeNr: (n: number) => void; aktivtFilter: string; fjernFilter: () => void; publiserte: Set<string>;
}) {
  const { d } = c;
  const [mobil, setMobil] = useState(true);
  useEffect(() => { const mq = window.matchMedia('(max-width: 639px)'); const f = () => setMobil(mq.matches); f(); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f); }, []);
  const vis = visning ?? (mobil ? 'liste' : 'uke');
  const inn = d.inn;
  const synlig = (v: Vakt) => {
    const a = c.art(v);
    if ((a === 'colleague' || a === 'swap') && (!inn.colleagues.on || !filter.colleague && a === 'colleague' || !filter.swap && a === 'swap')) return false;
    if (a === 'open' && (!inn.open.on || !filter.open)) return false;
    if (a === 'mine' && !filter.mine) return false;
    if (v.sted && fsel.sted.includes(v.sted)) return false;
    if (v.type && fsel.type.includes(v.type)) return false;
    if (v.ansattId && fsel.ansatt.includes(v.ansattId)) return false;
    return true;
  };
  const rekke = (v: Vakt) => ({ mine: 0, open: 1, swap: 2, colleague: 3 })[c.art(v)];
  const dagVakter = (dato: string) => d.vakter.filter(v => v.dato === dato && synlig(v)).sort((a, b) => rekke(a) - rekke(b) || a.start.localeCompare(b.start));
  const visTilg = inn.avail.on && filter.avail && filter.absence;
  const filterAktiv = Object.values(filter).some(x => !x) || Object.values(fsel).some(a => a.length);
  const uker = d.uker.filter(u => u.publisert);
  const listeRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (valgtDag) setTimeout(() => document.querySelector(`[data-dag="${valgtDag}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 50); }, [valgtDag]);
  const mnd = mndNavn(d.uker[Math.min(ukeNr, d.uker.length - 1)].dager[3]);
  const u = d.uker[ukeNr] ?? d.uker[0];

  return (
    <div className="v2a-vakter">
      <div className="v2a-vakter-topp">
        <h1 className="fyll">{stor(vis === 'uke' ? mndNavn(u.dager[3]) : mnd)}</h1>
        <div className="v2a-visvalg"><Seg etikett="Visning" valg={[['liste', 'Liste'], ['uke', 'Uke']]} verdi={vis} sett={setVisning} mork={false} /></div>
        <button type="button" className="v2-rund" aria-label="Kalender" onClick={() => c.ga('kalender')}><Ikon n="calendar_month" s={22} /></button>
        <button type="button" className="v2-rund v2a-filterknapp" aria-label="Filter" onClick={() => c.setArk('filter')}><Ikon n="filter_list" s={22} />{filterAktiv && <span className="v2a-prikk" />}</button>
        <button type="button" className="v2-rund" aria-label="Mer" onClick={() => c.setArk('meny')}><Ikon n="more_horiz" s={22} /></button>
      </div>
      {aktivtFilter !== 'alle' && <div className="v2a-aktivtfilter"><button type="button" onClick={fjernFilter} aria-label="Fjern filter"><Ikon n="filter_list" s={16} />{aktivtFilter === 'mine' ? 'Bare mine vakter' : aktivtFilter}<Ikon n="close" s={18} /></button></div>}
      {!uker.length ? <TomTilstand tittel="Ingen vakter denne uka." tekst="Du får beskjed på e-post når lederen publiserer neste uke." /> : vis === 'liste' ? (
        <div className="v2a-liste-vakter" ref={listeRef}>
          {uker.map(uu => (
            <div key={uu.uke} className="v2a-uke">
              <div className="v2-sm v2a-ukehode">Uke {uu.uke} · {periode(uu.dager[0], uu.dager[6], false)}</div>
              {uu.dager.map(dato => {
                const liste = dagVakter(dato), f = filter.absence ? c.fravaerFor(dato) : undefined;
                return (
                  <div key={dato} data-dag={dato} className={`v2a-dagrad ${valgtDag === dato ? 'valgt' : ''}`}>
                    <button type="button" className={`v2a-dato ${dato === d.idag ? 'idag' : ''}`} aria-label={DagDm(dato)} onClick={() => setValgtDag(dato)}><span>{dagKort(dato)}.</span><b>{Number(dato.slice(8))}</b></button>
                    <div className="fyll v2a-dag-innhold">
                      {f && <FravaerKort f={f} />}
                      {!liste.length && !f && <div className="v2a-ingen">Ingen vakter denne dagen</div>}
                      {liste.map(v => <VaktKort key={v.id} c={c} v={v} />)}
                      {visTilg && !f && <TilgRad c={c} dato={dato} />}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          <div className="v2a-slutt"><span />Slutt på publisert periode<span /></div>
        </div>
      ) : (
        <div className="v2a-ukevisning">
          <div className="v2a-ukevisning-topp">
            <button type="button" className="v2-rund liten" aria-label="Forrige uke" disabled={ukeNr === 0} onClick={() => setUkeNr(ukeNr - 1)}><Ikon n="chevron_left" s={20} /></button>
            <span className="v2-sm">Uke {u.uke} · {periode(u.dager[0], u.dager[6], false)}</span>
            <button type="button" className="v2-rund liten" aria-label="Neste uke" disabled={ukeNr >= d.uker.length - 1} onClick={() => setUkeNr(ukeNr + 1)}><Ikon n="chevron_right" s={20} /></button>
            <span className="v2a-dinetimer">Dine timer <span className="v2-mono">{(() => { const t = d.vakter.filter(v => v.ansattId === d.meg.id && u.dager.includes(v.dato)).reduce((s, v) => s + v.arbeid, 0); return d.meg.avtalt ? `${nf(t)} av ${nf(d.meg.avtalt)} t` : `${nf(t)} t`; })()}</span></span>
          </div>
          {!u.publisert ? <TomTilstand tittel={`Uke ${u.uke} er ikke publisert ennå.`} tekst="Du får beskjed på e-post når lederen publiserer den." /> : (
            <div className="v2a-ukegrid-ramme">
              <div className="v2a-ukegrid">
                {u.dager.map(dato => {
                  const liste = dagVakter(dato), f = filter.absence ? c.fravaerFor(dato) : undefined;
                  return (
                    <div key={dato} className={`v2a-ukekol ${valgtDag === dato ? 'valgt' : dato === d.idag ? 'idag' : ''}`}>
                      <button type="button" className="v2a-ukekol-hode" aria-label={DagDm(dato)} onClick={() => setValgtDag(dato)}><span>{dagKort(dato)}.</span><b className={dato === d.idag ? 'idag' : ''}>{Number(dato.slice(8))}</b></button>
                      {f && <div className="v2a-kort absence kompakt"><span className="fyll v2a-kort-tekst"><span className="v2a-kort-tid">Hele dagen</span><span className="v2a-kort-under">{f.type}</span></span></div>}
                      {!liste.length && !f && <div className="v2a-ingen sentrert">Ingen vakter</div>}
                      {liste.map(v => <VaktKort key={v.id} c={c} v={v} kompakt />)}
                      {visTilg && !f && <TilgRad c={c} dato={dato} kompakt />}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <Forklaring c={c} />
        </div>
      )}
      {void publiserte}
    </div>
  );
}

function Forklaring({ c }: { c: Ctx }) {
  const i = c.d.inn;
  const l = [['#0B2545', 'Min vakt'], i.open.on && ['#F6DF6E', 'Ledig'], i.avail.on && ['#1F7D52', 'Kan jobbe'], (i.avail.on || i.absence.on) && ['#A2371C', 'Fravær']].filter(Boolean) as string[][];
  return <div className="v2a-forklaring">{l.map(([f, t]) => <span key={t}><span style={{ background: f }} />{t}</span>)}</div>;
}

function Kalender({ c, tilbake, velg }: { c: Ctx; tilbake: () => void; velg: (d: string) => void }) {
  const { d } = c;
  const [mnd, setMnd] = useState(d.idag.slice(0, 7));
  const forste = `${mnd}-01`, start = plussDag(forste, -((new Date(`${forste}T12:00:00Z`).getUTCDay() + 6) % 7));
  const celler = Array.from({ length: 42 }, (_, i) => plussDag(start, i)).filter((x, i) => i < 35 || x.slice(0, 7) === mnd);
  const flytt = (n: number) => { const [y, m] = mnd.split('-').map(Number); const x = new Date(Date.UTC(y, m - 1 + n, 1)); setMnd(x.toISOString().slice(0, 7)); };
  return (
    <div className="v2-stakk">
      <div className="v2a-kal-topp">
        <button type="button" className="v2-rund" aria-label="Tilbake til listen" onClick={tilbake}><Ikon n="view_agenda" s={22} /></button>
        <h1 className="fyll sentrert">{stor(mndNavn(mnd))} {mnd.slice(0, 4)}</h1>
        <button type="button" className="v2-rund" aria-label="Forrige måned" onClick={() => flytt(-1)}><Ikon n="chevron_left" s={22} /></button>
        <button type="button" className="v2-rund" aria-label="Neste måned" onClick={() => flytt(1)}><Ikon n="chevron_right" s={22} /></button>
      </div>
      <div className="v2-kort v2a-kal">
        {['man', 'tir', 'ons', 'tor', 'fre', 'lør', 'søn'].map(x => <div key={x} className="v2a-kal-hode">{x}</div>)}
        {celler.map(x => {
          const ute = x.slice(0, 7) !== mnd;
          const mine = d.vakter.filter(v => v.ansattId === d.meg.id && v.dato === x);
          const led = d.inn.open.on ? d.vakter.filter(v => !v.ansattId && v.dato === x).length : 0;
          const t = c.tilgjFor(x), f = c.fravaerFor(x) || (t?.status === 'kan_ikke');
          const chips = [...mine.map(v => ({ t: v.start.slice(0, 2), k: 'mine' })), led ? { t: `${led} led`, k: 'open' } : null, d.inn.avail.on && t?.status === 'kan' ? { t: 'kan', k: 'kan' } : null, (d.inn.avail.on || d.inn.absence.on) && f ? { t: 'fri', k: 'fri' } : null].filter(Boolean).slice(0, 2) as { t: string; k: string }[];
          return (
            <button key={x} type="button" className={`v2a-kal-dag ${ute ? 'ute' : ''} ${d.uker.some(u => u.dager.includes(x)) ? 'lastet' : ''}`} aria-label={`${Number(x.slice(8))}. ${mndNavn(x)}`} onClick={() => velg(x)}>
              <span className={`v2a-kal-nr ${x === d.idag ? 'idag' : ''}`}>{Number(x.slice(8))}</span>
              {chips.map(ch => <span key={ch.t + ch.k} className={`v2a-kal-chip ${ch.k}`}>{ch.t}</span>)}
            </button>
          );
        })}
      </div>
      <Forklaring c={c} />
      <div className="v2-hjelp">Trykk på en dag for å se den i listen.</div>
    </div>
  );
}

function FilterArk({ c, filter, setFilter, fsel, setFsel, aktivt, setAktivt, lukk }: { c: Ctx; filter: Filter; setFilter: (f: Filter) => void; fsel: Fsel; setFsel: (f: Fsel) => void; aktivt: string; setAktivt: (s: string) => void; lukk: () => void }) {
  const { d } = c;
  const [lagrede, setLagrede] = useState<{ id: string; navn: string; filter: Filter; fsel: Fsel }[]>([]);
  useEffect(() => { try { setLagrede(JSON.parse(localStorage.getItem('v2-filtre') ?? '[]')); } catch { /* lagring utilgjengelig */ } }, []);
  const lagre = (l: typeof lagrede) => { setLagrede(l); try { localStorage.setItem('v2-filtre', JSON.stringify(l)); } catch { /* ignorer */ } };
  const [lag, setLag] = useState(false);
  const [navn, setNavn] = useState('');
  const [apen, setApen] = useState<keyof Fsel | null>(null);
  const forrige = useRef({ filter, fsel, aktivt });
  const inn = d.inn;
  const rader: [keyof Filter, string, string, string][] = ([
    ['mine', 'Mine vakter', 'person', 'mork'], (inn.avail.on || inn.absence.on) && ['absence', 'Fravær', 'block', 'rod'], inn.colleagues.on && ['swap', 'Byttbar', 'swap_horiz', 'bla'],
    inn.open.on && ['open', 'Ledig', 'front_hand', 'gul'], inn.avail.on && ['avail', 'Tilgjengelighet', 'check_circle', 'gronn'], inn.colleagues.on && ['colleague', 'Kollegers vakter', 'group', 'gra'],
  ].filter(Boolean)) as [keyof Filter, string, string, string][];
  const steder = [...new Set(d.vakter.map(v => v.sted).filter((x): x is string => !!x))], typer = [...new Set(d.vakter.map(v => v.type).filter((x): x is string => !!x))];
  const folk = [{ id: d.meg.id, navn: 'Meg' }, ...(inn.colleagues.on && inn.colleagues.mode === 'navn' ? d.kolleger.map(k => ({ id: k.id, navn: fornavn(k.navn) })) : [])];
  const mer: [keyof Fsel, string, { k: string; l: string }[]][] = [['sted', 'Sted', steder.map(s => ({ k: s, l: s }))], ['type', 'Vakttype', typer.map(t => ({ k: t, l: t }))], ['ansatt', 'Ansatt', folk.map(f => ({ k: f.id, l: f.navn }))]];
  const antall = d.vakter.filter(v => !(v.sted && fsel.sted.includes(v.sted)) && !(v.type && fsel.type.includes(v.type)) && !(v.ansattId && fsel.ansatt.includes(v.ansattId))).length;
  const valg = [{ id: 'alle', navn: 'Alle vakter', besk: 'Standard', filter: ALLE, fsel: INGEN }, { id: 'mine', navn: 'Bare mine vakter', besk: 'Skjuler kollegers og ledige vakter', filter: { ...ALLE, colleague: false, swap: false, open: false }, fsel: INGEN }, ...lagrede.map(l => ({ ...l, besk: 'Ditt filter' }))];
  if (!lag) return (
    <div className="v2-skjema">
      <ArkTopp tittel="Filter" lukk={lukk} />
      <div className="v2-skjema-innhold">
        <div className="v2-sm">Mine filtre</div>
        <div role="radiogroup" aria-label="Mine filtre" className="v2-kort v2a-valgliste">
          {valg.map(x => (
            <div key={x.id} className="v2a-valgrad">
              <button type="button" role="radio" aria-checked={aktivt === x.id} onClick={() => { setAktivt(x.id === 'alle' || x.id === 'mine' ? x.id : x.navn); setFilter(x.filter); setFsel(x.fsel); }}><span className="v2a-radio" /><span className="fyll"><b>{x.navn}</b><span className="v2-hjelp">{x.besk}</span></span></button>
              {lagrede.some(l => l.id === x.id) && <button type="button" className="v2-rund liten" aria-label="Slett filter" onClick={() => { lagre(lagrede.filter(l => l.id !== x.id)); c.vis(`Filteret «${x.navn}» er slettet.`); }}><Ikon n="delete" s={20} /></button>}
            </div>
          ))}
        </div>
        <button type="button" className="v2-knapp stiplet" onClick={() => { forrige.current = { filter, fsel, aktivt }; setFilter(ALLE); setFsel(INGEN); setNavn(''); setLag(true); }}><Ikon n="add" s={20} />Opprett filter</button>
      </div>
      <div className="v2-skjema-bunn"><button type="button" className="v2-knapp primar fyll" onClick={lukk}>Vis {antall} {antall === 1 ? 'vakt' : 'vakter'}</button></div>
    </div>
  );
  return (
    <div className="v2-skjema">
      <div className="v2a-tilpass-topp"><button type="button" className="v2-knapp tekst" onClick={() => { setFilter(forrige.current.filter); setFsel(forrige.current.fsel); setAktivt(forrige.current.aktivt); setLag(false); }}>Avbryt</button><div className="v2a-tilpass-tittel">Opprett filter</div>
        <button type="button" className="v2-knapp primar liten" disabled={!navn.trim()} onClick={() => { lagre([...lagrede, { id: `f${Date.now()}`, navn: navn.trim(), filter, fsel }]); setAktivt(navn.trim()); setLag(false); c.vis(`Filteret «${navn.trim()}» er lagret.`); }}>Lagre</button></div>
      <div className="v2-skjema-innhold">
        <label className="v2-felt"><span className="v2-etikett">Navn på filteret</span><input className="v2-input" placeholder="F.eks. Mine vakter på Brygga" value={navn} onChange={e => setNavn(e.target.value)} /></label>
        <div className="v2-etikett">Vis</div>
        <div className="v2-kort v2a-valgliste">
          {rader.map(([k, l, i, f]) => <button key={k} type="button" role="checkbox" aria-checked={filter[k]} className="v2a-filterrad" onClick={() => setFilter({ ...filter, [k]: !filter[k] })}><span className={`v2a-filterikon ${f}`}><Ikon n={i} s={17} /></span><span className="fyll">{l}</span><span className={`v2a-boks ${filter[k] ? 'pa' : ''}`}>{filter[k] && <Ikon n="check" s={18} />}</span></button>)}
        </div>
        <div className="v2-kort v2a-valgliste">
          {mer.map(([k, l, opts]) => {
            const n = opts.filter(o => !fsel[k].includes(o.k)).length;
            return (
              <div key={k}>
                <button type="button" className="v2a-filterrad" aria-expanded={apen === k} onClick={() => setApen(apen === k ? null : k)}><span className="fyll">{l}</span><span className="v2-hjelp">{n === opts.length ? 'Alle' : `${n} av ${opts.length}`}</span><Ikon n={apen === k ? 'expand_less' : 'expand_more'} s={20} /></button>
                {apen === k && <div className="v2-piller v2a-filterchips">{opts.map(o => { const pa = !fsel[k].includes(o.k); return <button key={o.k} type="button" role="checkbox" aria-checked={pa} className="v2-pille" aria-pressed={pa} onClick={() => setFsel({ ...fsel, [k]: pa ? [...fsel[k], o.k] : fsel[k].filter(x => x !== o.k) })}><Ikon n={pa ? 'check' : 'add'} s={17} />{o.l}</button>; })}</div>}
              </div>
            );
          })}
        </div>
        <div className="v2-rad"><button type="button" className="v2-knapp tekst" onClick={() => { setFilter(ALLE); setFsel(INGEN); }}>Tilbakestill</button><span className="fyll" /><span className="v2-hjelp">{antall} {antall === 1 ? 'vakt' : 'vakter'} passer</span></div>
      </div>
    </div>
  );
}

function UkeMeny({ c, lukk }: { c: Ctx; lukk: () => void }) {
  const { d } = c;
  const u = d.uker[0];
  const mine = d.vakter.filter(v => v.ansattId === d.meg.id && u.dager.includes(v.dato));
  const router = useRouter();
  return (
    <div className="v2-skjema">
      <ArkTopp tittel={`Uke ${u.uke} · ${periode(u.dager[0], u.dager[6], false)}`} lukk={lukk} />
      <div className="v2-skjema-innhold">
        <div className="v2a-tall">
          <div><span className="v2-hjelp">Timer</span><b className="v2-mono">{nf(d.uka.arbeid)} t</b></div>
          <div><span className="v2-hjelp">Vakter</span><b className="v2-mono">{mine.length}</b></div>
          <div><span className="v2-hjelp">Overtid</span><b className="v2-mono">{nf(d.uka.overtid)} t</b></div>
        </div>
        <button type="button" className="v2-knapp" onClick={() => { router.refresh(); lukk(); c.vis('Vaktplanen er oppdatert.'); }}><Ikon n="refresh" s={20} />Oppdater</button>
      </div>
    </div>
  );
}

// ---------- Vaktdetalj ----------

function Detalj({ c, v, lukk }: { c: Ctx; v: Vakt; lukk: () => void }) {
  const { d } = c;
  const k = kortInfo(c, v), inn = d.inn;
  const mine = k.a === 'mine';
  const l = c.ledig(v.id);
  const tittel = { mine: 'Min vakt', open: 'Ledig vakt', swap: 'Vil bytte bort', colleague: 'Kollegas vakt' }[k.a];
  const hvem = k.a === 'open' ? 'Ledig vakt' : mine ? `${d.meg.navn} (deg)` : c.kollega(v.ansattId)?.navn ?? 'Opptatt';
  const samtidig = inn.colleagues.on ? d.vakter.filter(x => x.dato === v.dato && x.id !== v.id && x.ansattId && x.ansattId !== d.meg.id) : [];
  const rader = [
    v.sted && ['location_on', 'Sted', v.sted], v.type && ['sell', 'Vakttype', v.type],
    ['schedule', 'Tid og pause', `${v.start}–${v.slutt}${v.arbeid < arbeidVarighet(v) ? ' · pause 30 min' : ''}`, true], ['timelapse', 'Varighet', `${nf(v.arbeid)} t`, true],
    mine && ['badge', 'Avtale', d.meg.lonnType === 'time' ? 'Timelønn' : `Fast ${d.meg.stillingsprosent} % · ${nf(d.meg.avtalt ?? 0)} t/uke`],
  ].filter(Boolean) as [string, string, string, boolean?][];
  const fri = c.friSokt(v.dato);
  let status: [string, string, string] | null = null;
  const handlinger: { t: string; i: string; run: () => void; primar?: boolean }[] = [];
  const bk = byttKnapp(inn);
  if (mine) {
    if (v.utlagt) { status = ['Du har gitt bort vakten. Du har den til lederen har godkjent.', 'swap_horiz', 'bla']; handlinger.push({ t: 'Angre', i: 'undo', run: () => c.kjor('bort', () => byttBortHandling(v.id, false), () => c.vis('Angret.')) }); }
    else if (bk && v.dato >= d.idag) handlinger.push({ t: bk, i: 'swap_horiz', run: () => c.setArk('bytt'), primar: true });
    if ((inn.avail.on || inn.absence.on) && !fri && v.dato >= d.idag) handlinger.push({ t: 'Be om fri denne dagen', i: 'event_busy', run: () => c.setArk('fri') });
    if (inn.comments.on) handlinger.push({ t: v.ansattKommentar ? 'Endre kommentaren din' : 'Legg til kommentar', i: 'add_comment', run: () => c.setArk('kommentar') });
    if (fri) { status = ['Du har bedt om fri. Lederen har ikke svart ennå.', 'hourglass_top', 'gul']; handlinger.push({ t: 'Trekk forespørselen', i: 'undo', run: () => c.settTilgj(v.dato, null) }); }
  } else if (k.a === 'open') {
    handlinger.push(v.interessert ? { t: 'Trekk meg', i: 'undo', run: () => c.interesse(v) } : { t: 'Jeg tar den', i: 'front_hand', run: () => c.interesse(v), primar: true });
    status = v.interessert ? ['Du har meldt interesse. Lederen bestemmer hvem som får vakten.', 'check_circle', 'gronn'] : l && (l.overtid || l.merarbeid) && inn.open.warn ? [l.overtid ? `Gir deg overtid. Du har ${nf(l.forUka)} t denne uka.` : `Gir deg merarbeid. Du har ${nf(l.forUka)} t denne uka, avtalen din er ${nf(d.meg.avtalt ?? 0)} t.`, 'trending_up', 'gul'] : inn.open.who === 'forst' ? ['Den som trykker først, får vakten.', 'bolt', 'gul'] : null;
  } else if (k.a === 'swap') {
    handlinger.push(v.interessert ? { t: 'Trekk meg', i: 'undo', run: () => c.interesse(v) } : { t: 'Ta vakten', i: 'check', run: () => c.interesse(v), primar: true });
    status = [`${fornavn(c.kollega(v.ansattId)?.navn ?? 'En kollega')} vil gi bort denne vakten.`, 'swap_horiz', 'bla'];
  }
  return (
    <div className="v2a-detalj" role="dialog" aria-label={`${tittel}, ${dagDm(v.dato)}`}>
      <div className={`v2a-detalj-hode ${k.a}`}>
        <div className="v2a-detalj-rad"><button type="button" className="v2a-detalj-lukk" aria-label="Lukk" onClick={lukk}><Ikon n="arrow_back" s={22} className="v2a-pil" /><Ikon n="close" s={22} className="v2a-kryss" /></button><div className="v2a-detalj-tittel">{tittel}</div><span style={{ width: 44 }} /></div>
        <div className="v2a-detalj-hvem">
          <button type="button" className="v2a-detalj-avatar" disabled={mine || !v.ansattId || !inn.colleagues.on} onClick={() => v.ansattId && c.setArk({ person: v.ansattId })}>{k.ini || <Ikon n="person" s={22} />}</button>
          <div><div>{hvem}</div><div>{DagDm(v.dato)}</div></div>
        </div>
        <div className="v2a-detalj-tid v2-mono">{v.start}–{v.slutt}</div>
        {(v.type || v.sted) && <div className="v2a-detalj-art">{[v.type, v.sted].filter(Boolean).join(' · ')}</div>}
      </div>
      <div className="v2a-detalj-innhold">
        {status && <div role="status" className={`v2-notat ${status[2]}`}><Ikon n={status[1]} s={20} />{status[0]}</div>}
        <div className="v2-kort v2a-detalj-kort">
          {rader.map(([i, l2, verdi, mono]) => <div key={l2} className="v2a-detalj-linje"><Ikon n={i} s={21} /><div className="fyll"><div className="v2-hjelp">{l2}</div><div className={mono ? 'v2-mono' : ''}>{verdi}</div></div></div>)}
          {samtidig.length > 0 && (
            <div className="v2a-detalj-linje"><Ikon n="group" s={21} /><div className="fyll"><div className="v2-hjelp">Jobber samtidig</div>
              <div className="v2-piller" style={{ marginTop: 6 }}>{samtidig.map(x => { const kk = c.kollega(x.ansattId); return <button key={x.id} type="button" className="v2-pille med-avatar" onClick={() => x.ansattId && c.setArk({ person: x.ansattId })}><span className="v2-avatar" style={{ width: 28, height: 28, fontSize: 11 }}>{kk?.navn === 'Opptatt' ? '' : initialer(kk?.navn ?? '')}</span>{fornavn(kk?.navn ?? 'Opptatt')}</button>; })}</div>
            </div></div>
          )}
          {v.kommentar && inn.comments.on && <div className="v2a-detalj-linje kommentar"><Ikon n="chat_bubble" s={21} /><div className="fyll"><div className="v2-hjelp">Kommentar fra lederen</div><div>{v.kommentar}</div></div></div>}
          {v.ansattKommentar && inn.comments.on && <div className="v2a-detalj-linje kommentar"><Ikon n="chat" s={21} /><div className="fyll"><div className="v2-hjelp">Din kommentar</div><div>{v.ansattKommentar}</div></div></div>}
        </div>
        {handlinger.length > 0 && (
          <div className="v2-stakk liten">
            <div className="v2-sm">Hva vil du gjøre?</div>
            {handlinger.map(h => <button key={h.t} type="button" className={`v2a-handling ${h.primar ? 'primar' : ''}`} disabled={!!c.opptatt} onClick={h.run}><Ikon n={h.i} s={22} />{h.t}</button>)}
          </div>
        )}
      </div>
    </div>
  );
}

const arbeidVarighet = (v: Vakt) => { const a = Number(v.start.slice(0, 2)) * 60 + Number(v.start.slice(3)), b = Number(v.slutt.slice(0, 2)) * 60 + Number(v.slutt.slice(3)); return b > a ? b - a : b + 1440 - a; };

function PersonArk({ c, id, dato, lukk }: { c: Ctx; id: string; dato: string; lukk: () => void }) {
  const k = c.kollega(id);
  if (!k) return null;
  const vakter = c.d.vakter.filter(v => v.ansattId === id && v.dato === dato);
  return (
    <div className="v2-skjema">
      <ArkTopp venstre={<Avatar navn={k.navn === 'Opptatt' ? '' : k.navn} s={52} />} tittel={k.navn} under={[k.stilling, k.avtale].filter(Boolean).join(' · ')} lukk={lukk} />
      <div className="v2-skjema-innhold">
        <div className="v2-kort liten"><div className="v2-hjelp">Vakter {dagDm(dato)}</div>
          {vakter.map(v => <div key={v.id} className="v2-rad"><span className="v2-mono fyll"><b>{v.start}–{v.slutt}</b></span><span className="v2-hjelp">{[v.type, v.sted].filter(Boolean).join(' · ')}</span></div>)}
          {!vakter.length && <div className="v2-hjelp">Ingen vakter denne dagen</div>}
        </div>
        {k.mobil ? <div className="v2-to"><a className="v2-knapp" href={`tel:${k.mobil.replace(/\s/g, '')}`}><Ikon n="call" s={20} />Ring</a><a className="v2-knapp" href={`sms:${k.mobil.replace(/\s/g, '')}`}><Ikon n="sms" s={20} />Send SMS</a></div>
          : <div className="v2-hjelp">Lederen har ikke delt kontaktinfo.</div>}
      </div>
    </div>
  );
}

function ByttArk({ c, v, lukk }: { c: Ctx; v: Vakt; lukk: () => void }) {
  const { d } = c, inn = d.inn;
  const [modus, setModus] = useState<'give' | 'with'>(inn.give.on ? 'give' : 'with');
  const uka = d.uker.find(u => u.dager.includes(v.dato))?.dager ?? [];
  const folk = d.byttKolleger.filter(k => !inn.swap.sameType || k.typer.some(t => t.split('|')[1] === (v.type ?? '') && uka.includes(t.split('|')[0])))
    .map(k => { const t = k.typer.find(x => x.startsWith(`${v.dato}|`)); return { ...k, note: t ? `Har ${t.split('|')[1] || 'vakt'} samme dag` : k.dager.some(x => uka.includes(x)) ? 'Har vakt samme uke' : 'Ingen vakt denne dagen', rang: t ? 2 : k.dager.some(x => uka.includes(x)) ? 1 : 0 }; })
    .sort((a, b) => a.rang - b.rang);
  const [valgt, setValgt] = useState<string | null>(folk[0]?.id ?? null);
  const send = () => modus === 'give'
    ? c.kjor('bytt', () => byttBortHandling(v.id, true), () => { lukk(); c.vis('Forespørselen er sendt.', () => { void c.kjor('angre', () => byttBortHandling(v.id, false), () => c.vis('Angret.')); }); })
    : valgt && c.kjor('bytt', () => byttMedHandling(v.id, valgt), () => { lukk(); c.vis('Forespørselen er sendt.'); });
  return (
    <div className="v2-skjema">
      <ArkTopp tittel={byttKnapp(inn) ?? 'Bytt vakt'} under={<span className="v2-mono">{DagDm(v.dato)} · {v.start}–{v.slutt}</span>} lukk={lukk} />
      <div className="v2-skjema-innhold">
        {inn.give.on && inn.swap.on && <Seg valg={[['give', 'Gi bort'], ['with', 'Bytt med kollega']]} verdi={modus} sett={setModus} mork={false} />}
        {modus === 'give' ? <div className="v2-hjelp stor">Vakten blir ledig, og kollegene dine kan melde interesse. Du har vakten til lederen har godkjent.{inn.give.hours ? ` Du må gi den bort minst ${inn.give.hours} timer før den starter.` : ''}</div> : (
          <div role="radiogroup" className="v2-kort v2a-valgliste">
            {folk.map(p => <button key={p.id} type="button" role="radio" aria-checked={valgt === p.id} className="v2a-valgrad enkel" onClick={() => setValgt(p.id)}><Avatar navn={p.navn} s={36} /><span className="fyll"><b>{p.navn}</b><span className="v2-hjelp">{p.note}</span></span><span className="v2a-radio" /></button>)}
            {!folk.length && <div className="v2-hjelp" style={{ padding: 14 }}>Ingen kolleger kan bytte denne vakten.</div>}
            {inn.swap.approve && folk.length > 0 && <div className="v2-hjelp" style={{ padding: '0 14px 12px' }}>Kollegaen svarer først, og så må lederen godkjenne byttet.</div>}
          </div>
        )}
      </div>
      <div className="v2-skjema-bunn"><button type="button" className="v2-knapp primar fyll" disabled={!!c.opptatt || (modus === 'with' && !valgt)} onClick={send}>Send forespørsel</button></div>
    </div>
  );
}

function TekstArk({ c, hva, v, lukk }: { c: Ctx; hva: 'fri' | 'kommentar'; v: Vakt; lukk: () => void }) {
  const [tekst, setTekst] = useState(hva === 'kommentar' ? v.ansattKommentar ?? '' : '');
  const send = () => hva === 'fri'
    ? c.kjor('fri', () => tilgjengeligHandling(v.dato, 'kan_ikke', tekst), () => { lukk(); c.vis('Du har bedt om fri. Lederen får beskjed.', () => { void c.kjor('angre', () => tilgjengeligHandling(v.dato, null), () => c.vis('Angret.')); }); })
    : c.kjor('kommentar', () => kommentarHandling(v.id, tekst), () => { lukk(); c.vis('Kommentaren er lagret.'); });
  return (
    <div className="v2-skjema">
      <ArkTopp tittel={hva === 'fri' ? 'Be om fri' : 'Legg til kommentar'} under={hva === 'fri' ? `${DagDm(v.dato)} · ${v.start}–${v.slutt}` : 'Lederen og kollegene på vakten ser kommentaren.'} lukk={lukk} />
      <div className="v2-skjema-innhold"><input className="v2-input" aria-label={hva === 'fri' ? 'Grunn' : 'Kommentar'} placeholder={hva === 'fri' ? 'Grunn (valgfritt)' : 'Skriv en kommentar'} value={tekst} onChange={e => setTekst(e.target.value)} /></div>
      <div className="v2-skjema-bunn"><button type="button" className="v2-knapp primar fyll" disabled={!!c.opptatt} onClick={send}>{hva === 'fri' ? 'Send forespørsel' : 'Lagre kommentar'}</button></div>
    </div>
  );
}

// ---------- Ledige ----------

function LedigKort({ c, v, liten }: { c: Ctx; v: Vakt; liten?: boolean }) {
  const l = c.ledig(v.id), inn = c.d.inn;
  const n = v.andreInteressert;
  const merknad = l && inn.open.warn && (l.overtid || l.merarbeid) ? (l.overtid ? `Gir deg overtid (${nf(l.totalEtter)} t totalt)` : `Mer enn stillingen din (${nf(l.totalEtter)} t totalt)`) : l?.harVakt ? 'Du har en vakt samme dag' : '';
  const notater = [v.interessert && { t: 'Du har meldt interesse', i: 'check', k: 'gronn' }, merknad && { t: merknad, i: 'trending_up', k: 'gul' }, !liten && { t: n ? `${n} ${n === 1 ? 'annen' : 'andre'} har meldt interesse` : 'Ingen andre har meldt interesse', i: 'group', k: 'gra' }].filter(Boolean) as { t: string; i: string; k: string }[];
  return (
    <div className="v2a-ledig">
      <button type="button" className="v2a-ledig-topp" onClick={() => c.apneVakt(v.id)}>
        <span className="fyll"><span className="v2-hjelp">{DagDm(v.dato)}</span><span className="v2a-ledig-tid v2-mono">{v.start}–{v.slutt}</span><span className="v2-hjelp">{[v.type, v.sted].filter(Boolean).join(' · ')}</span></span>
        <Ikon n="chevron_right" s={20} />
      </button>
      {notater.length > 0 && <div className="v2-piller">{notater.map(x => <span key={x.t} className={`v2a-merknad ${x.k}`}><Ikon n={x.i} s={16} />{x.t}</span>)}</div>}
      <button type="button" className={`v2-knapp ${v.interessert ? '' : 'primar'} ${liten ? 'liten' : 'v2a-stor'}`} disabled={!!c.opptatt} onClick={() => c.interesse(v)}>{v.interessert ? 'Trekk meg' : 'Jeg tar den'}</button>
    </div>
  );
}

function Ledige({ c }: { c: Ctx }) {
  const liste = c.d.vakter.filter(v => !v.ansattId && v.dato >= c.d.idag);
  return (
    <div className="v2-stakk">
      <Topp tittel="Ledige vakter" />
      {!liste.length && <TomTilstand tittel="Ingen ledige vakter nå." tekst="Du får beskjed på e-post når lederen legger ut en vakt." />}
      <div className="v2a-ledigliste">{liste.map(v => <LedigKort key={v.id} c={c} v={v} />)}</div>
      <div className="v2-notat"><Ikon n="info" s={20} />{c.d.inn.open.who === 'forst' ? 'Den som trykker først, får vakten. Du får beskjed på e-post når den er publisert.' : 'Når du melder interesse, bestemmer lederen hvem som får vakten. Du får beskjed på e-post.'}</div>
    </div>
  );
}

// ---------- Bytter ----------

function Bytter({ c, tilbake }: { c: Ctx; tilbake: () => void }) {
  const { d } = c;
  const [fane, setFane] = useState<'mottatt' | 'sendt'>('mottatt');
  const ST: Record<string, [string, string, string]> = { venter_kollega: ['Venter på kollega', 'hourglass_top', 'gul'], venter_leder: ['Venter på leder', 'hourglass_top', 'bla'], godkjent: ['Godkjent', 'check_circle', 'gronn'], avslatt: ['Avslått', 'cancel', 'rod'] };
  const mottatt = [
    ...d.bytter.filter(b => b.tilId === d.meg.id).map(b => ({ key: b.id, ini: initialer(b.fraNavn), tittel: `${fornavn(b.fraNavn)} vil bytte ${dagDm(b.dato)}`, tid: `${b.start}–${b.slutt}`, under: [b.type, b.sted].filter(Boolean).join(' · '), st: b.status === 'venter_kollega' ? (['Venter på deg', 'hourglass_top', 'gul'] as [string, string, string]) : ST[b.status], svar: b.status === 'venter_kollega' ? b.id : null, vakt: null as Vakt | null })),
    ...d.vakter.filter(v => c.art(v) === 'swap' && v.dato >= d.idag).map(v => ({ key: v.id, ini: initialer(c.kollega(v.ansattId)?.navn ?? ''), tittel: `${fornavn(c.kollega(v.ansattId)?.navn ?? 'En kollega')} vil gi bort ${dagDm(v.dato)}`, tid: `${v.start}–${v.slutt}`, under: [v.type, v.sted].filter(Boolean).join(' · '), st: v.interessert ? (['Venter på leder', 'hourglass_top', 'bla'] as [string, string, string]) : (['Venter på deg', 'hourglass_top', 'gul'] as [string, string, string]), svar: null, vakt: v })),
  ];
  const sendt = [
    ...d.bytter.filter(b => b.fraId === d.meg.id).map(b => ({ key: b.id, tittel: `Bytt med ${fornavn(b.tilNavn)}`, tid: `${b.start}–${b.slutt}`, under: `${DagDm(b.dato)}${b.type ? ` · ${b.type}` : ''}`, st: ST[b.status] })),
    ...d.vakter.filter(v => v.ansattId === d.meg.id && v.utlagt).map(v => ({ key: v.id, tittel: `Gi bort ${dagDm(v.dato)}`, tid: `${v.start}–${v.slutt}`, under: [v.type, v.sted].filter(Boolean).join(' · '), st: ['Venter på leder', 'hourglass_top', 'bla'] as [string, string, string] })),
  ];
  return (
    <div className="v2-stakk">
      <Topp tittel="Bytter" tilbake={tilbake} />
      <div role="tablist" className="v2-faner full"><button type="button" role="tab" aria-selected={fane === 'mottatt'} onClick={() => setFane('mottatt')}>Mottatt</button><button type="button" role="tab" aria-selected={fane === 'sendt'} onClick={() => setFane('sendt')}>Sendt</button></div>
      {fane === 'mottatt' ? (mottatt.length ? mottatt.map(m => (
        <div key={m.key} className="v2a-byttkort">
          <div className="v2-rad"><span className="v2-avatar" style={{ width: 40, height: 40, fontSize: 13 }}>{m.ini}</span><div className="fyll"><div className="v2a-linje-tittel">{m.tittel}</div><div className="v2-mono">{m.tid}</div><div className="v2-hjelp">{m.under}</div></div></div>
          <span className={`v2a-merknad ${m.st[2]}`}><Ikon n={m.st[1]} s={16} />{m.st[0]}</span>
          {m.svar && <div className="v2-to"><button type="button" className="v2-knapp primar" disabled={!!c.opptatt} onClick={() => c.kjor('svar', () => svarByttHandling(m.svar!, true), r => c.vis(r?.melding ?? 'Lagret.'))}>Ta vakten</button><button type="button" className="v2-knapp" disabled={!!c.opptatt} onClick={() => c.kjor('svar', () => svarByttHandling(m.svar!, false), r => c.vis(r?.melding ?? 'Lagret.'))}>Nei takk</button></div>}
          {m.vakt && !m.vakt.interessert && <div className="v2-to"><button type="button" className="v2-knapp primar" disabled={!!c.opptatt} onClick={() => c.interesse(m.vakt!)}>Ta vakten</button><button type="button" className="v2-knapp" onClick={() => c.apneVakt(m.vakt!.id)}>Se vakten</button></div>}
        </div>
      )) : <TomTilstand tittel="Ingen har spurt deg om å bytte." />) : (sendt.length ? sendt.map(m => (
        <div key={m.key} className="v2a-byttkort">
          <div className="v2-rad"><span className="v2-avatar mork" style={{ width: 40, height: 40, fontSize: 13 }}>{initialer(d.meg.navn)}</span><div className="fyll"><div className="v2a-linje-tittel">{m.tittel}</div><div className="v2-mono">{m.tid}</div><div className="v2-hjelp">{m.under}</div></div></div>
          <span className={`v2a-merknad ${m.st[2]}`}><Ikon n={m.st[1]} s={16} />{m.st[0]}</span>
        </div>
      )) : <TomTilstand tittel="Du har ikke sendt noen bytter." tekst="Åpne en av vaktene dine og trykk «Gi bort / bytt vakt»." />)}
    </div>
  );
}

// ---------- Tilgjengelighet ----------

function Tilgjengelighet({ c, tilbake }: { c: Ctx; tilbake: () => void }) {
  const { d } = c;
  const detaljert = d.inn.avail.mode === 'detaljert';
  const [nr, setNr] = useState(d.uker.findIndex(u => u.dager[6] >= d.idag) || 0);
  const u = d.uker[Math.max(0, nr)];
  const start = (dato: string) => { const t = c.tilgjFor(dato); return { s: (t?.status ?? 'unset') as 'kan' | 'kan_ikke' | 'unset', g: t?.grunn ?? '', timer: (t?.timer ?? {}) as Record<string, 'kan' | 'kan_ikke'> }; };
  const [utkast, setUtkast] = useState<Record<string, ReturnType<typeof start>>>(() => Object.fromEntries(d.uker.flatMap(x => x.dager).map(x => [x, start(x)])));
  const harVakt = (dato: string) => d.vakter.find(v => v.ansattId === d.meg.id && v.dato === dato);
  const endret = d.uker.flatMap(x => x.dager).filter(x => JSON.stringify(utkast[x]) !== JSON.stringify(start(x)) && x >= d.idag);
  const lagre = async () => {
    let fri = 0;
    for (const x of endret) {
      const e = utkast[x];
      const timer = detaljert && Object.keys(e.timer).length ? e.timer : null;
      const status = timer ? (Object.values(timer).includes('kan') ? 'kan' : 'kan_ikke') : e.s === 'unset' ? null : e.s;
      const ok = await c.kjor('tilg', () => tilgjengeligHandling(x, status, e.g, timer));
      if (!ok) return;
      if (status === 'kan_ikke' && !timer && harVakt(x) && !c.friSokt(x)) fri++;
    }
    c.vis(fri ? `Lagret. ${fri} ${fri === 1 ? 'forespørsel' : 'forespørsler'} om fri er sendt til lederen.` : 'Tilgjengeligheten er lagret.');
  };
  const sum = detaljert
    ? { ja: `${nf(u.dager.reduce((s, x) => s + Object.values(utkast[x].timer).filter(v => v === 'kan').length * 60, 0))} t`, nei: `${nf(u.dager.reduce((s, x) => s + Object.values(utkast[x].timer).filter(v => v === 'kan_ikke').length * 60, 0))} t` }
    : { ja: (n => `${n} ${n === 1 ? 'dag' : 'dager'}`)(u.dager.filter(x => utkast[x].s === 'kan').length), nei: (n => `${n} ${n === 1 ? 'dag' : 'dager'}`)(u.dager.filter(x => utkast[x].s === 'kan_ikke').length) };
  return (
    <div className="v2-stakk">
      <Topp tittel="Tilgjengelighet" tilbake={tilbake} />
      {d.inn.avail.days > 0 && <div className="v2-hjelp">Frist: senest {d.inn.avail.days} {d.inn.avail.days === 1 ? 'dag' : 'dager'} før uka publiseres.</div>}
      <div className="v2a-ukevelger">
        <button type="button" className="v2-rund" aria-label="Forrige uke" disabled={nr <= 0} onClick={() => setNr(nr - 1)}><Ikon n="chevron_left" s={22} /></button>
        <div className="fyll sentrert"><b>Uke {u.uke} · {periode(u.dager[0], u.dager[6], false)}</b></div>
        <button type="button" className="v2-rund" aria-label="Neste uke" disabled={nr >= d.uker.length - 1} onClick={() => setNr(nr + 1)}><Ikon n="chevron_right" s={22} /></button>
      </div>
      {!detaljert ? (
        <div className="v2-stakk liten">
          {u.dager.map(x => {
            const e = utkast[x], v = harVakt(x), fortid = x < d.idag;
            return (
              <div key={x} className={`v2-kort v2a-tilgdag ${fortid ? 'fortid' : ''}`}>
                <div className="v2-rad"><b className="v2a-tilgdag-navn">{stor(dagKort(x))} {Number(x.slice(8))}.</b>{v && <span className="v2-mono v2-hjelp">Vakt {v.start}–{v.slutt}</span>}</div>
                <div role="radiogroup" aria-label={DagDm(x)} className="v2a-treknapp">
                  {([['kan', 'Kan', 'check'], ['unset', 'Ikke satt', 'remove'], ['kan_ikke', 'Kan ikke', 'block']] as const).map(([k, l, i]) => (
                    <button key={k} type="button" role="radio" aria-checked={e.s === k} className={k} disabled={fortid} onClick={() => setUtkast(s => ({ ...s, [x]: { ...s[x], s: k } }))}><Ikon n={i} s={17} />{l}</button>
                  ))}
                </div>
                {e.s === 'kan_ikke' && <input className="v2-input liten" placeholder="Grunn (valgfritt)" aria-label="Grunn" value={e.g} onChange={ev => setUtkast(s => ({ ...s, [x]: { ...s[x], g: ev.target.value } }))} />}
                {e.s === 'kan_ikke' && v && <div className="v2-notat rod"><Ikon n="warning" s={18} />{c.friSokt(x) ? 'Du har vakt denne dagen. Forespørselen om fri er sendt til lederen.' : `Du har vakt ${dagDm(x).split(' ')[0]} ${v.start}–${v.slutt}. Når du lagrer, sender vi en forespørsel om fri til lederen.`}</div>}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="v2-kort v2a-tidsrom">
          <div className="v2a-tidsrom-grid hode"><span />{u.dager.map(x => <span key={x}><small>{dagKort(x)}</small><b className={x === d.idag ? 'idag' : ''}>{Number(x.slice(8))}</b></span>)}</div>
          {Array.from({ length: 18 }, (_, i) => i + 6).map(h => (
            <div key={h} className="v2a-tidsrom-grid">
              <span className="v2-mono">{h % 2 === 0 ? String(h).padStart(2, '0') : ''}</span>
              {u.dager.map(x => { const val = utkast[x].timer[String(h)]; return <button key={x} type="button" className={val ?? (h % 2 ? 'odde' : '')} disabled={x < d.idag} aria-label={`${DagDm(x)} kl. ${h}: ${val === 'kan' ? 'Kan jobbe' : val === 'kan_ikke' ? 'Kan ikke' : 'ikke satt'}`} onClick={() => setUtkast(s => { const t = { ...s[x].timer }; const n = t[String(h)] === 'kan' ? 'kan_ikke' : t[String(h)] === 'kan_ikke' ? undefined : 'kan'; if (n) t[String(h)] = n; else delete t[String(h)]; return { ...s, [x]: { ...s[x], timer: t } }; })} />; })}
            </div>
          ))}
          <div className="v2-hjelp">Trykk i en rute for å bytte mellom Kan jobbe, Kan ikke og tom.</div>
        </div>
      )}
      <div className="v2a-sum"><div><span><i className="gronn" />Kan jobbe</span><b className="v2-mono">{sum.ja}</b></div><div><span><i className="rod" />Kan ikke</span><b className="v2-mono">{sum.nei}</b></div></div>
      <button type="button" className="v2-knapp primar v2a-stor" disabled={!endret.length || !!c.opptatt} onClick={lagre}>Lagre</button>
      <button type="button" className="v2a-fab" aria-label="Legg til tilgjengelighet" onClick={() => c.setArk('tilgform')}><Ikon n="add" s={28} /></button>
    </div>
  );
}

function TilgForm({ c, lukk }: { c: Ctx; lukk: () => void }) {
  const { d } = c;
  const [dato, setDato] = useState(d.idag);
  const [kan, setKan] = useState<'kan' | 'kan_ikke'>('kan');
  const [hel, setHel] = useState(true);
  const [fra, setFra] = useState('10:00'), [til, setTil] = useState('18:00');
  const [gjenta, setGjenta] = useState<'aldri' | 'uke' | 'annenhver'>('aldri');
  const [grunn, setGrunn] = useState('');
  const sisteDag = d.uker[d.uker.length - 1].dager[6];
  const lagre = async () => {
    const datoer = [dato];
    if (gjenta !== 'aldri') for (let x = plussDag(dato, gjenta === 'uke' ? 7 : 14); x <= sisteDag; x = plussDag(x, gjenta === 'uke' ? 7 : 14)) datoer.push(x);
    const timer = hel ? null : Object.fromEntries(Array.from({ length: 24 }, (_, h) => h).filter(h => h >= Number(fra.slice(0, 2)) && h < Number(til.slice(0, 2))).map(h => [String(h), kan]));
    for (const x of datoer) if (!(await c.kjor('tilg', () => tilgjengeligHandling(x, kan, grunn, timer)))) return;
    lukk(); c.vis('Tilgjengeligheten er lagret.');
  };
  return (
    <div className="v2-skjema">
      <div className="v2a-tilpass-topp"><button type="button" className="v2-knapp tekst" onClick={lukk}>Avbryt</button><div className="v2a-tilpass-tittel">Legg til tilgjengelighet</div><button type="button" className="v2-knapp primar liten" disabled={!!c.opptatt || dato < d.idag} onClick={lagre}>Lagre</button></div>
      <div className="v2-skjema-innhold">
        <Seg valg={[['kan', 'Kan jobbe'], ['kan_ikke', 'Kan ikke']]} verdi={kan} sett={setKan} mork={false} />
        <div className="v2-kort v2a-skjemaliste">
          <label className="v2a-skjemarad"><span className="fyll">Dato</span><input type="date" className="v2-input kompakt" min={d.idag} value={dato} onChange={e => setDato(e.target.value)} /></label>
          <div className="v2a-skjemarad"><span className="fyll">Hele dagen</span><Bryter pa={hel} sett={setHel} etikett="Hele dagen" /></div>
          {!hel && <><label className="v2a-skjemarad"><span className="fyll">Start</span><input type="time" className="v2-input kompakt v2-mono" value={fra} onChange={e => setFra(e.target.value)} /></label><label className="v2a-skjemarad"><span className="fyll">Slutt</span><input type="time" className="v2-input kompakt v2-mono" value={til} onChange={e => setTil(e.target.value)} /></label></>}
          <div className="v2a-skjemarad"><span className="fyll">Gjenta</span><div className="v2-piller">{([['aldri', 'Aldri'], ['uke', 'Hver uke'], ['annenhver', 'Annenhver uke']] as const).map(([k, l]) => <button key={k} type="button" className="v2-pille" aria-pressed={gjenta === k} onClick={() => setGjenta(k)}>{l}</button>)}</div></div>
        </div>
        <input className="v2-input" placeholder="Kommentar (valgfritt)" aria-label="Kommentar" value={grunn} onChange={e => setGrunn(e.target.value)} />
      </div>
    </div>
  );
}

// ---------- Fravær ----------

function Fravaer({ c, tilbake }: { c: Ctx; tilbake: () => void }) {
  const { d } = c;
  const [fane, setFane] = useState<'list' | 'saldo'>('list');
  const ST = { venter: ['Venter', 'hourglass_top', 'gul'], godkjent: ['Godkjent', 'check_circle', 'gronn'], avslatt: ['Avslått', 'cancel', 'rod'] } as const;
  const rader = [
    ...d.fri.filter(f => f.status === 'venter').map(f => ({ key: `fri${f.dato}`, type: `Fri${f.grunn ? `: ${f.grunn}` : ''}`, periode: DagDm(f.dato) + ` ${f.dato.slice(0, 4)}`, st: ST.venter, svar: null as string | null })),
    ...d.fravaer.map(f => ({ key: f.id, type: f.type, periode: `${f.fra === f.til ? `${dm(f.fra)} ${f.fra.slice(0, 4)}` : `${periode(f.fra, f.til)}`} · ${f.fra === f.til && f.timerMin && f.type === 'Avspasering' ? `${nf(f.timerMin)} t` : `${dagerMellom(f.fra, f.til)} ${dagerMellom(f.fra, f.til) === 1 ? 'dag' : 'dager'}`}`, st: ST[f.status], svar: f.svar })),
  ];
  const s = d.saldo;
  return (
    <div className="v2-stakk">
      <Topp tittel="Fravær" tilbake={tilbake} />
      {d.inn.absence.saldo && <div role="tablist" className="v2-faner full"><button type="button" role="tab" aria-selected={fane === 'list'} onClick={() => setFane('list')}>Søknader</button><button type="button" role="tab" aria-selected={fane === 'saldo'} onClick={() => setFane('saldo')}>Saldo</button></div>}
      {fane === 'list' || !d.inn.absence.saldo ? (
        <>
          {rader.length ? <div className="v2-kort v2a-liste">{rader.map(r => <div key={r.key} className="v2a-linje statisk"><span className={`v2a-rundikon ${r.st[2]}`}><Ikon n={r.st[1]} s={21} /></span><span className="fyll"><span className="v2a-linje-tittel">{r.type}</span><span className="v2-hjelp">{r.periode}</span>{r.svar && <span className="v2-hjelp">«{r.svar}»</span>}</span><span className={`v2a-status ${r.st[2]}`}>{r.st[0]}</span></div>)}</div> : <TomTilstand tittel="Du har ikke søkt om fravær." />}
          <button type="button" className="v2-knapp primar v2a-stor" onClick={() => c.setArk('soknad')}><Ikon n="add" s={22} />Ny søknad</button>
        </>
      ) : (
        <>
          <div className="v2a-saldokort">
            <div className="v2-sm lys">Feriedager igjen i {d.idag.slice(0, 4)}</div>
            <div className="v2-mono v2a-saldo-stor">{s.ferieIgjen}<span> av {s.ferieTotal}</span></div>
            <div className="v2a-neste-strek"><span style={{ width: `${Math.max(0, Math.min(100, (s.ferieIgjen / Math.max(1, s.ferieTotal)) * 100))}%` }} /></div>
          </div>
          <div className="v2-kort v2a-liste">
            <div className="v2a-linje statisk"><span className="fyll">Ferie brukt</span><span className="v2-mono">{s.ferieBrukt} {s.ferieBrukt === 1 ? 'dag' : 'dager'}</span></div>
            <div className="v2a-linje statisk"><span className="fyll">Egenmelding brukt</span><span className="v2-mono">{s.egenBrukt} {s.egenBrukt === 1 ? 'dag' : 'dager'}</span></div>
            <div className="v2a-linje statisk"><span className="fyll">Avspasering til gode</span><span className="v2-mono">{nf(s.avspMin)} t</span></div>
          </div>
        </>
      )}
    </div>
  );
}

const dagerMellom = (fra: string, til: string) => Math.round((Date.parse(`${til}T12:00:00Z`) - Date.parse(`${fra}T12:00:00Z`)) / 86400000) + 1;
const hverdager = (fra: string, til: string) => { let n = 0; for (let x = fra; x <= til; x = plussDag(x, 1)) { const u = new Date(`${x}T12:00:00Z`).getUTCDay(); if (u && u !== 6) n++; } return n; };

function SoknadArk({ c, lukk }: { c: Ctx; lukk: () => void }) {
  const { d } = c;
  const typer = aktiveTyper(d.inn).filter(t => t !== 'Sykmelding' && t !== 'Fri uten lønn');
  const [type, setType] = useState<string>(typer.includes('Ferie') ? 'Ferie' : typer[0] ?? '');
  const [hel, setHel] = useState(true);
  const [fra, setFra] = useState(plussDag(d.idag, 14)), [til, setTil] = useState(plussDag(d.idag, 18));
  const [start, setStart] = useState('08:00'), [slutt, setSlutt] = useState('12:00');
  const [grunn, setGrunn] = useState('');
  const t2 = hel ? (til < fra ? fra : til) : fra;
  const send = () => c.kjor('soknad', () => soknadHandling({ type, fra, til: t2, grunn, start: hel ? null : start, slutt: hel ? null : slutt }), () => { lukk(); c.vis('Søknaden er sendt til lederen.'); });
  const saldo = d.inn.absence.saldo && type === 'Ferie' ? `${hverdager(fra, t2)} av ${d.saldo.ferieIgjen} dager` : d.inn.absence.saldo && type === 'Avspasering' ? `${nf(hel ? 0 : arbeidTid(start, slutt))} t av ${nf(d.saldo.avspMin)} t` : d.inn.absence.saldo && type === 'Egenmelding' ? `${dagerMellom(fra, t2)} → ${d.saldo.egenBrukt + dagerMellom(fra, t2)} av 24 dager` : '';
  return (
    <div className="v2-skjema">
      <div className="v2a-tilpass-topp"><button type="button" className="v2-knapp tekst" onClick={lukk}>Avbryt</button><div className="v2a-tilpass-tittel">Ny søknad</div><button type="button" className="v2-knapp primar liten" disabled={!type || !!c.opptatt} onClick={send}>Send</button></div>
      <div className="v2-skjema-innhold">
        <div className="v2-etikett">Type</div>
        <div className="v2-piller">{typer.map(x => <button key={x} type="button" className="v2-pille" aria-pressed={type === x} onClick={() => setType(x)}>{x}</button>)}</div>
        <div className="v2-kort v2a-skjemaliste">
          <div className="v2a-skjemarad"><span className="fyll">Hele dager</span><Bryter pa={hel} sett={setHel} etikett="Hele dager" /></div>
          <label className="v2a-skjemarad"><span className="fyll">{hel ? 'Fra' : 'Dato'}</span><input type="date" className="v2-input kompakt" min={d.idag} value={fra} onChange={e => { setFra(e.target.value); if (til < e.target.value) setTil(e.target.value); }} /></label>
          {hel ? <label className="v2a-skjemarad"><span className="fyll">Til</span><input type="date" className="v2-input kompakt" min={fra} value={til} onChange={e => setTil(e.target.value)} /></label> : <>
            <label className="v2a-skjemarad"><span className="fyll">Start</span><input type="time" className="v2-input kompakt v2-mono" value={start} onChange={e => setStart(e.target.value)} /></label>
            <label className="v2a-skjemarad"><span className="fyll">Slutt</span><input type="time" className="v2-input kompakt v2-mono" value={slutt} onChange={e => setSlutt(e.target.value)} /></label></>}
          {saldo && <div className="v2a-skjemarad myk"><span className="fyll v2-hjelp">Bruker av saldo</span><span className="v2-mono">{saldo}</span></div>}
        </div>
        <input className="v2-input" placeholder="Kommentar (valgfritt)" aria-label="Kommentar" value={grunn} onChange={e => setGrunn(e.target.value)} />
      </div>
    </div>
  );
}

// ---------- Timer ----------

function Timer({ c }: { c: Ctx }) {
  const { d } = c;
  const siste = d.timer[d.timer.length - 1];
  const sum = (u: AnsattData['timer'][number]) => u.vakter.reduce((s, v) => s + v.arbeid, 0);
  const godkjent = d.timer.filter(u => u.godkjent).reduce((s, u) => s + sum(u), 0), venter = d.timer.filter(u => !u.godkjent).reduce((s, u) => s + sum(u), 0);
  return (
    <div className="v2-stakk">
      <Topp tittel="Timer" />
      {!d.timer.length ? <TomTilstand tittel="Ingen timer ennå." tekst="Timene dine vises her når vaktene er over." /> : (
        <>
          <div className="v2-kort v2a-timersum">
            <div className="v2-rad"><div className="fyll"><div className="v2-hjelp">Periode</div><b>{periode(d.timer[0].dager[0], siste.dager[6], false).replace('–', ' – ')}</b></div><div className="hoyre"><div className="v2-hjelp">Sum</div><b className="v2-mono stor2">{nf(godkjent + venter)} t</b></div></div>
            <div className="v2a-sumrad"><div className="v2a-sumboks gra"><span><Ikon n="check_circle" s={15} />Godkjent</span><b className="v2-mono">{nf(godkjent)} t</b></div><div className="v2a-sumboks gul"><span><Ikon n="radio_button_unchecked" s={15} />Venter</span><b className="v2-mono">{nf(venter)} t</b></div></div>
          </div>
          {[...d.timer].reverse().map(u => (
            <div key={u.uke} className="v2-stakk liten">
              <div className="v2-sm v2a-ukehode rad"><span className="fyll">Uke {u.uke}, {periode(u.dager[0], u.dager[6], false).replace('–', ' – ')}</span><span className="v2-mono">({nf(sum(u))})</span></div>
              <div className="v2-kort v2a-liste">
                {[...u.vakter].reverse().map(v => (
                  <div key={v.id} className="v2a-timerrad">
                    <div className="v2-rad">
                      <div className="v2a-dato liten"><span>{dagKort(v.dato)}.</span><b>{Number(v.dato.slice(8))}</b></div>
                      <div className="fyll"><div className="v2-mono">{v.avvik?.start || v.avvik?.slutt ? `${v.avvik.start ?? v.start}–${v.avvik.slutt ?? v.slutt}` : `${v.start}–${v.slutt}`}</div><div className={`v2a-timerstatus ${u.godkjent ? '' : 'venter'}`}><Ikon n={u.godkjent ? 'check_circle' : 'radio_button_unchecked'} s={16} />{u.godkjent ? 'Godkjent av leder' : 'Venter på godkjenning'}</div></div>
                      <b className="v2-mono">{nf(v.arbeid)}</b>
                    </div>
                    {v.avvik && <div className="v2a-avvik">{v.avvik.diffMin ? `Du jobbet ${Math.abs(v.avvik.diffMin)} min ${v.avvik.diffMin > 0 ? 'lenger' : 'kortere'} enn planlagt (${v.start}–${v.slutt}).` : ''}{v.avvik.tekst ? ` «${v.avvik.tekst}»` : ''}</div>}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {d.inn.hours.dev && <button type="button" className="v2-knapp v2a-stor" onClick={() => c.setArk('avvik')}><Ikon n="edit_note" s={22} />Meld inn timer som avviker</button>}
        </>
      )}
    </div>
  );
}

function AvvikArk({ c, lukk }: { c: Ctx; lukk: () => void }) {
  const kandidater = c.d.timer.filter(u => !u.godkjent).flatMap(u => u.vakter);
  const [vaktId, setVaktId] = useState(kandidater[kandidater.length - 1]?.id ?? '');
  const v = kandidater.find(x => x.id === vaktId);
  const [start, setStart] = useState(v?.start ?? ''), [slutt, setSlutt] = useState(v?.slutt ?? ''), [tekst, setTekst] = useState('');
  return (
    <div className="v2-skjema">
      <ArkTopp tittel="Meld inn timer som avviker" under="Velg vakten og skriv hva som var annerledes." lukk={lukk} />
      <div className="v2-skjema-innhold">
        {!kandidater.length ? <div className="v2-hjelp">Alle timene dine er godkjent. Snakk med lederen hvis noe er feil.</div> : <>
          <label className="v2-felt"><span className="v2-etikett">Vakt</span><select className="v2-input" value={vaktId} onChange={e => { setVaktId(e.target.value); const x = kandidater.find(y => y.id === e.target.value); if (x) { setStart(x.start); setSlutt(x.slutt); } }}>{kandidater.map(x => <option key={x.id} value={x.id}>{DagDm(x.dato)} · {x.start}–{x.slutt}</option>)}</select></label>
          <div className="v2-tider"><label className="v2-felt"><span className="v2-etikett">Startet</span><input type="time" className="v2-input v2-mono" value={start} onChange={e => setStart(e.target.value)} /></label><label className="v2-felt"><span className="v2-etikett">Sluttet</span><input type="time" className="v2-input v2-mono" value={slutt} onChange={e => setSlutt(e.target.value)} /></label></div>
          <input className="v2-input" placeholder="F.eks. Søndag 4. okt: jobbet til 20:30" aria-label="Hva var annerledes" value={tekst} onChange={e => setTekst(e.target.value)} />
        </>}
      </div>
      <div className="v2-skjema-bunn"><button type="button" className="v2-knapp primar fyll" disabled={!v || !!c.opptatt} onClick={() => c.kjor('avvik', () => avvikHandling({ vaktId, start: start !== v?.start ? start : null, slutt: slutt !== v?.slutt ? slutt : null, tekst }), () => { lukk(); c.vis('Timene er sendt til lederen.'); })}>Send til lederen</button></div>
    </div>
  );
}

// ---------- Mer, kolleger og min side ----------

function Mer({ c, mer }: { c: Ctx; mer: [Skjerm, string, string, number][] }) {
  return (
    <div className="v2-stakk">
      <div className="v2a-mer-merke"><Logo bredde={96} /><span className="v2-skille" /><b>Vaktplan</b></div>
      {mer.length > 0 && <div className="v2-stakk liten"><div className="v2-sm">Arbeid</div><div className="v2-kort v2a-liste">{mer.map(([k, l, i, n]) => <button key={k} type="button" className="v2a-linje meny" onClick={() => c.ga(k)}><Ikon n={i} s={22} /><span className="fyll">{l}</span>{n > 0 && <Teller n={n} />}<Ikon n="chevron_right" s={20} /></button>)}</div></div>}
      <div className="v2-stakk liten"><div className="v2-sm">Meg</div><div className="v2-kort v2a-liste"><button type="button" className="v2a-linje meny" onClick={() => c.ga('minside')}><Ikon n="person" s={22} /><span className="fyll">Min side</span><Ikon n="chevron_right" s={20} /></button></div></div>
    </div>
  );
}

function Kolleger({ c, tilbake }: { c: Ctx; tilbake: () => void }) {
  return (
    <div className="v2-stakk">
      <Topp tittel="Kolleger" tilbake={tilbake} />
      <div className="v2-kort v2a-liste">
        {c.d.kolleger.map(k => <button key={k.id} type="button" className="v2a-linje" onClick={() => c.setArk({ person: k.id })}><Avatar navn={k.navn === 'Opptatt' ? '' : k.navn} s={40} /><span className="fyll"><span className="v2a-linje-tittel">{k.navn}</span><span className="v2-hjelp">{[k.stilling, k.avtale].filter(Boolean).join(' · ')}</span></span><Ikon n="chevron_right" s={20} /></button>)}
      </div>
    </div>
  );
}

function MinSide({ c, tilbake }: { c: Ctx; tilbake: () => void }) {
  const { d } = c;
  return (
    <div className="v2-stakk">
      <Topp tittel="Min side" tilbake={tilbake} />
      <div className="v2-rad"><Avatar navn={d.meg.navn} art="mork" s={64} /><div><div className="v2a-minnavn">{d.meg.navn}</div><div className="v2-hjelp">{[d.meg.stilling, d.foretak].filter(Boolean).join(' · ')}</div></div></div>
      <div className="v2-kort v2a-liste">
        <div className="v2a-linje statisk"><Ikon n="mail" s={21} /><span className="fyll"><span className="v2-hjelp">E-post</span><span>{d.meg.epost ?? '–'}</span></span></div>
        <div className="v2a-linje statisk"><Ikon n="call" s={21} /><span className="fyll"><span className="v2-hjelp">Telefon</span><span className="v2-mono">{d.meg.mobil ?? '–'}</span></span></div>
        <div className="v2a-linje statisk"><Ikon n="badge" s={21} /><span className="fyll"><span className="v2-hjelp">Avtale</span><span>{d.meg.lonnType === 'time' ? 'Timelønn' : <>Fast {d.meg.stillingsprosent} % · <span className="v2-mono">{nf(d.meg.avtalt ?? 0)} t/uke</span></>}</span></span></div>
      </div>
      <div className="v2-sm">Innstillinger</div>
      <div className="v2-kort v2a-liste">
        <div className="v2a-linje statisk"><span className="fyll"><span className="v2a-linje-tittel">Varsler på e-post</span><span className="v2-hjelp">Ny uke, endringer og svar</span></span><Bryter pa={d.varselEpost} etikett="Varsler på e-post" sett={x => c.kjor('varsel', () => varselEpostHandling(x), (_, m) => c.vis(m ?? 'Lagret.'))} /></div>
        <div className="v2a-linje statisk"><span className="fyll"><span className="v2a-linje-tittel gra">Varsler på SMS</span><span className="v2-hjelp">Kommer senere</span></span><Bryter pa={false} etikett="Varsler på SMS" deaktivert sett={() => undefined} /></div>
        <div className="v2a-linje statisk"><span className="fyll"><span className="v2a-linje-tittel">Språk</span><span className="v2-hjelp">Engelsk kommer senere</span></span><span className="v2-hjelp">Bokmål</span></div>
      </div>
      <form action={loggUt}><button className="v2-knapp v2a-stor rodtekst fyllbredde"><Ikon n="logout" s={22} />Logg ut</button></form>
    </div>
  );
}

void useMemo;
