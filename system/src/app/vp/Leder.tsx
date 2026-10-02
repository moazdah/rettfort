'use client';

// Ledervisningen av vaktplanen (vaktplan.rettført.no). Fasit: docs/design/prototyper, «Vaktplan v2 Leder».
// Uke · Forespørsler · Ansatte · Innstillinger, pluss Assistent i Selskap.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { loggUt } from '@/app/handlinger';
import { publiserHandling, angreHandling, gjorLedigHandling, beholdHandling, tildelHandling, lederByttHandling, godkjennTimerHandling, flyttVaktHandling, kopierUkeHandling } from '@/app/vaktplan-handlinger';
import type { LederData } from './data';
import { Ctx, useLeder, utseende, aria, fravaerPa, tidsrom, type Skjerm, type Overlegg, type Vakt, type LederCtx } from './ctx';
import { Ikon, Toast, useMelding, useKjor, Seg, Avatar, TomTilstand, Teller, DagDm, dagDm, dm, nf, kort, periode, fornavn, initialer, ukedagNr, dagKort, mndNavn, plussDag } from './felles';
import { VaktSkjema } from './VaktSkjema';
import { FravaerSkjema } from './FravaerSkjema';
import { Foresporsler } from './Foresporsler';
import { AnsatteSkjerm, Inviter, Administrer, Fjern } from './AnsatteSkjerm';
import { Innstillinger } from './Innstillinger';
import { AssistentInnhold, bestillForslag } from './AssistentPanel';
import { AnsattPanel } from './AnsattPanel';
import { Ark } from './felles';

export function Leder({ d, start }: { d: LederData; start: { vis?: string; visning?: string; dag?: string; fane?: string } }) {
  const router = useRouter();
  const { m, vis, lukk } = useMelding();
  const etter = useCallback(() => router.refresh(), [router]);
  const { opptatt, kjor } = useKjor(vis, etter);
  const asst = d.selskap && d.innstillinger.assistant.on;
  const [skjerm, setSkjerm] = useState<Skjerm>(() => (['uke', 'foresp', 'ansatte', 'innst', 'asst'] as const).find(x => x === start.vis) ?? 'uke');
  const [fane, setFane] = useState<'req' | 'timer'>(start.fane === 'timer' ? 'timer' : 'req');
  const [ov, setOv] = useState<Overlegg | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => { const f = () => router.refresh(); window.addEventListener('v2:oppdater', f); return () => window.removeEventListener('v2:oppdater', f); }, [router]);

  const gaTil = useCallback((s: Skjerm, ekstra?: { fane?: 'req' | 'timer' }) => {
    setOv(null);
    // Assistenten er et sidepanel på store skjermer og en egen skjerm ellers.
    if (s === 'asst' && window.matchMedia('(min-width: 1024px)').matches) { setOv({ k: 'asst' }); return; }
    setSkjerm(s); if (ekstra?.fane) setFane(ekstra.fane);
    const u = new URL(window.location.href); u.searchParams.set('vis', s); if (s !== 'uke') u.searchParams.delete('visning');
    window.history.replaceState(null, '', u.toString());
    scroll.current?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  }, []);

  const endre: LederCtx['endre'] = useCallback(async (navn, fn, etterOk) => kjor(navn, fn, data => {
    etterOk?.();
    const angreId = data?.angre;
    vis(data?.melding ?? 'Lagret.', angreId ? async () => { const r = await angreHandling(angreId); if (!r.ok) vis(r.feil, null, true); else { vis('Angret.'); router.refresh(); } } : null);
  }), [kjor, vis, router]);

  const ctx: LederCtx = useMemo(() => ({ d, apne: setOv, gaTil, vis, opptatt, kjor, endre }), [d, gaTil, vis, opptatt, kjor, endre]);
  const antallSvar = d.foresp.fri.length + d.foresp.fravaer.length + d.foresp.bytte.length + d.foresp.bytteKollega.length + d.foresp.ledigeMedInteresse.length;
  const ventTimer = d.timer.reduce((s, u) => s + u.rader.filter(r => r.status === 'venter').length, 0);
  const merke = antallSvar + ventTimer;

  const faner: [Skjerm, string, string, string, number][] = [
    ['uke', 'Uke', 'Uke', 'calendar_view_week', 0], ['foresp', 'Forespørsler', 'Svar', 'inbox', merke],
    ['ansatte', 'Ansatte', 'Ansatte', 'group', 0], ['innst', 'Innstillinger', 'Innstillinger', 'tune', 0],
  ];
  const navKnapper = [...faner, ...(asst ? [['asst', 'Assistent', 'Assistent', 'auto_awesome', 0] as [Skjerm, string, string, string, number]] : [])];

  return (
    <Ctx.Provider value={ctx}>
      <div className="v2 v2l">
        <header className="v2l-topp">
          <Link href="/" className="v2l-merke" aria-label="Rettført Vaktplan, til uka"><Logo bredde={96} /><span className="v2-skille" aria-hidden /><span className="v2l-produkt">Vaktplan</span></Link>
          <div className="v2l-firma">{d.org.navn}</div>
          <nav className="v2l-faner" aria-label="Hovedmeny">
            {faner.map(([k, l, , i, n]) => (
              <button key={k} type="button" aria-current={skjerm === k ? 'page' : undefined} onClick={() => gaTil(k)}>
                <Ikon n={i} s={20} fyll={skjerm === k} />{l}<Teller n={n} />
              </button>
            ))}
          </nav>
          <div className="v2l-hoyre">
            <a href={`${d.regnskap}/hjem`} target="_blank" rel="noopener" className="v2l-regnskap" aria-label="Til regnskapet (åpnes i ny fane)"><span>Til regnskapet</span><Ikon n="open_in_new" s={18} /></a>
            {asst && <button type="button" className="v2l-asst-knapp" aria-pressed={ov?.k === 'asst'} onClick={() => (ov?.k === 'asst' ? setOv(null) : gaTil('asst'))}><Ikon n="auto_awesome" s={18} />Assistent</button>}
            <Profil navn={d.leder.navn} epost={d.leder.epost} regnskap={d.regnskap} />
          </div>
        </header>

        <nav className="v2l-rail" aria-label="Hovedmeny">
          {navKnapper.map(([k, , s, i, n]) => (
            <button key={k} type="button" aria-current={skjerm === k ? 'page' : undefined} onClick={() => gaTil(k)}>
              <span className="v2-nav-ikon"><Ikon n={i} s={23} fyll={skjerm === k} /></span><span>{s}</span>{n > 0 && <span className="v2-nav-merke">{n}</span>}
            </button>
          ))}
        </nav>

        <main className="v2l-innhold" ref={scroll}>
          <div className={`v2l-side v2l-side-${skjerm}`}>
            {!d.endre && <div className="v2-banner info"><Ikon n="visibility" s={20} />Du har lesetilgang. Bare eier og brukere med full tilgang kan endre vaktplanen.</div>}
            {skjerm === 'uke' && <UkeSkjerm start={start} />}
            {skjerm === 'foresp' && <Foresporsler fane={fane} setFane={setFane} />}
            {skjerm === 'ansatte' && <AnsatteSkjerm />}
            {skjerm === 'innst' && <Innstillinger />}
            {skjerm === 'asst' && asst && <div className="v2l-asst-skjerm"><h1><Ikon n="auto_awesome" s={26} />Assistent</h1><AssistentInnhold /></div>}
          </div>
        </main>

        <nav className="v2l-bunn" aria-label="Hovedmeny">
          {navKnapper.map(([k, , s, i, n]) => (
            <button key={k} type="button" aria-current={skjerm === k ? 'page' : undefined} onClick={() => gaTil(k)}>
              <span className="v2-nav-ikon"><Ikon n={i} s={23} fyll={skjerm === k} /></span><span>{s}</span>{n > 0 && <span className="v2-nav-merke">{n}</span>}
            </button>
          ))}
        </nav>

        <Toast m={m} lukk={lukk} />

        <Ark apen={ov?.k === 'vakt'} lukk={() => setOv(null)} tittel={ov?.k === 'vakt' && ov.id ? 'Endre vakt' : 'Ny vakt'} bredde={620}>
          {ov?.k === 'vakt' && <VaktSkjema key={`${ov.id}-${ov.ansattId}-${ov.dato}`} o={ov} lukk={() => setOv(null)} />}
        </Ark>
        <Ark apen={ov?.k === 'fravaer'} lukk={() => setOv(null)} tittel="Fravær" bredde={580}>
          {ov?.k === 'fravaer' && <FravaerSkjema key={JSON.stringify(ov.b)} b={ov.b} lukk={() => setOv(null)} />}
        </Ark>
        <Ark apen={ov?.k === 'person'} lukk={() => setOv(null)} tittel="Ansatt" art="panel">
          {ov?.k === 'person' && <AnsattPanel id={ov.id} lukk={() => setOv(null)} />}
        </Ark>
        <Ark apen={ov?.k === 'inviter'} lukk={() => setOv(null)} tittel="Inviter ansatt" bredde={560}>
          {ov?.k === 'inviter' && <Inviter lukk={() => setOv(null)} />}
        </Ark>
        <Ark apen={ov?.k === 'admin'} lukk={() => setOv(null)} tittel="Administrer ansatt" bredde={580}>
          {ov?.k === 'admin' && <Administrer key={ov.id} id={ov.id} lukk={() => setOv(null)} />}
        </Ark>
        <Ark apen={ov?.k === 'fjern'} lukk={() => setOv(null)} tittel="Fjern ansatt" bredde={460} hoy={false}>
          {ov?.k === 'fjern' && <Fjern id={ov.id} lukk={() => setOv(null)} />}
        </Ark>
        <Ark apen={ov?.k === 'asst'} lukk={() => setOv(null)} tittel="Assistent" art="panel">
          {ov?.k === 'asst' && <div className="v2-panel"><div className="v2-ark-topp"><Ikon n="auto_awesome" s={22} /><div className="fyll v2-ark-tittel">Assistent</div><button type="button" className="v2-rund liten" aria-label="Lukk" data-lukk onClick={() => setOv(null)}><Ikon n="close" /></button></div><AssistentInnhold /></div>}
        </Ark>
      </div>
    </Ctx.Provider>
  );
}

function Profil({ navn, epost, regnskap }: { navn: string; epost: string; regnskap: string }) {
  const [apen, setApen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!apen) return;
    const lukk = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setApen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setApen(false); };
    document.addEventListener('mousedown', lukk); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', lukk); document.removeEventListener('keydown', esc); };
  }, [apen]);
  return (
    <div className="v2l-profil" ref={ref}>
      <button type="button" className="v2l-profil-knapp" aria-label={navn} aria-expanded={apen} aria-haspopup="true" onClick={() => setApen(x => !x)}>{initialer(navn)}</button>
      {apen && (
        <div className="v2l-profil-meny" role="menu">
          <div className="v2l-profil-info"><b>{navn}</b><span>{epost}</span></div>
          <a href={`${regnskap}/hjem`} role="menuitem">Regnskapet</a>
          <a href={`${regnskap}/lonn`} role="menuitem">Lønn</a>
          <a href={`${regnskap}/innstillinger`} role="menuitem">Innstillinger for kontoen</a>
          <form action={loggUt}><button role="menuitem" className="rod">Logg ut</button></form>
        </div>
      )}
    </div>
  );
}

// ---------- Uke ----------

function UkeSkjerm({ start }: { start: { visning?: string; dag?: string } }) {
  const { d, apne, endre, kjor, vis, opptatt, gaTil } = useLeder();
  const router = useRouter();
  const [visning, setVisning] = useState<'dag' | 'uke' | 'mnd'>(start.visning === 'dag' || start.visning === 'mnd' ? start.visning : 'uke');
  const [dag, setDag] = useState(start.dag && d.dager.includes(start.dag) ? start.dag : d.dager.includes(d.idag) ? d.idag : d.dager[0]);
  const [sted, setSted] = useState('alle');
  const vakter = d.vakter.filter(v => sted === 'alle' || v.sted === sted);
  const nDraft = d.endringer;
  const ws = d.status === 'utkast' ? ['Utkast', 'edit_note', 'gra'] : d.status === 'endret' ? ['Endringer ikke publisert', 'pending', 'gul'] : ['Publisert', 'check_circle', 'gronn'];
  const publisert = d.status === 'publisert';
  const tom = !d.vakter.length;
  const velgVisning = (v: 'dag' | 'uke' | 'mnd') => { setVisning(v); const u = new URL(window.location.href); u.searchParams.set('visning', v); window.history.replaceState(null, '', u.toString()); };
  const tilDag = (x: string) => { setDag(x); velgVisning('dag'); };
  const forrigeUke = `?uke=${d.forrige.aar}-${d.forrige.uke}&visning=${visning}`;
  const nesteUke = `?uke=${d.neste.aar}-${d.neste.uke}&visning=${visning}`;

  return (
    <div className="v2-stakk">
      <div className="v2l-uketopp">
        <div className="v2l-ukevelger">
          <Link href={forrigeUke} className="v2-rund" aria-label="Forrige uke"><Ikon n="chevron_left" s={22} /></Link>
          <div className="v2l-uketittel"><h1>Uke {d.uke}</h1><div>{periode(d.dager[0], d.dager[6])}</div></div>
          <Link href={nesteUke} className="v2-rund" aria-label="Neste uke"><Ikon n="chevron_right" s={22} /></Link>
        </div>
        <span className={`v2-status ${ws[2]}`}><Ikon n={ws[1]} s={18} />{ws[0]}</span>
        {d.endre && (
          <button type="button" className="v2-knapp primar v2l-publiser" disabled={publisert || tom || !!opptatt} onClick={() => kjor('pub', () => publiserHandling(d.aar, d.uke), x => vis(x?.melding ?? 'Publisert.'))}>
            <Ikon n="send" s={18} />{publisert ? 'Publisert' : opptatt === 'pub' ? 'Publiserer …' : 'Publiser og varsle'}
          </button>
        )}
      </div>
      <div className="v2l-valg">
        <Seg etikett="Visning" valg={[['dag', 'Dag'], ['uke', 'Uke'], ['mnd', 'Måned']]} verdi={visning} sett={velgVisning} />
        {d.steder.length > 1 && <Seg etikett="Sted" valg={[['alle', 'Alle steder'], ...d.steder.map(s => [s, s] as [string, string])]} verdi={sted} sett={setSted} mork={false} />}
      </div>
      {d.status === 'utkast' && !tom && <div className="v2-banner stiplet"><Ikon n="visibility_off" s={20} /><span>Uka er et utkast. De ansatte ser den ikke før du publiserer. Vakter med stiplet kant er ikke publisert.</span></div>}
      {d.status === 'endret' && nDraft > 0 && <div className="v2-banner stiplet"><Ikon n="visibility_off" s={20} /><span>{nDraft} {nDraft === 1 ? 'endring er' : 'endringer er'} ikke publisert (stiplet kant). De ansatte ser fortsatt forrige versjon.</span></div>}

      {d.endre && <TrengerSvar />}

      {!d.ansatte.length ? (
        <TomTilstand tittel="Ingen ansatte ennå" tekst="Inviter de ansatte først. De blir også med i Lønn.">
          <button type="button" className="v2-knapp primar" onClick={() => apne({ k: 'inviter' })}><Ikon n="person_add" s={18} />Inviter ansatt</button>
        </TomTilstand>
      ) : tom && visning !== 'mnd' ? (
        <TomTilstand tittel={`Ingen vakter i uke ${d.uke} ennå.`}>
          {d.endre && <div className="v2-knapprad sentrert">
            <button type="button" className="v2-knapp primar" onClick={() => apne({ k: 'vakt', ansattId: d.ansatte[0]?.id ?? null, dato: d.dager[0] })}>Lag første vakt</button>
            {d.selskap && d.innstillinger.assistant.on && <button type="button" className="v2-knapp" onClick={() => { bestillForslag('uke'); gaTil('asst'); }}><Ikon n="auto_awesome" s={18} />Be assistenten om et forslag</button>}
            <button type="button" className="v2-knapp tekst" disabled={!!opptatt} onClick={() => kjor('kopier', () => kopierUkeHandling(d.forrige, { aar: d.aar, uke: d.uke }), n => vis(`${n} vakter er kopiert fra uke ${d.forrige.uke}. Publiser når du er klar.`))}>Kopier uke {d.forrige.uke}</button>
          </div>}
        </TomTilstand>
      ) : visning === 'uke' ? (
        <>
          <Rutenett vakter={vakter} tilDag={tilDag} endre={endre} />
          <Stripe vakter={vakter} tilDag={tilDag} />
        </>
      ) : visning === 'dag' ? (
        <DagVisning vakter={vakter} dag={dag} setDag={setDag} />
      ) : (
        <MaanedVisning tilDag={(x: string) => { if (d.dager.includes(x)) tilDag(x); else router.push(`?uke=${isoUkeKlient(x)}&visning=dag&dag=${x}`); }} />
      )}
    </div>
  );
}

/** ISO-uke i nettleseren («2026-41»). */
function isoUkeKlient(dato: string) {
  const x = new Date(`${dato}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7) + 3);
  const aar = x.getUTCFullYear(), f = new Date(Date.UTC(aar, 0, 4));
  return `${aar}-${1 + Math.round(((x.getTime() - f.getTime()) / 86400000 - 3 + ((f.getUTCDay() + 6) % 7)) / 7)}`;
}

/** Rader i «Trenger svar» og Forespørsler. Lages her så begge stedene viser det samme. */
export function useSvarRader() {
  const { d, apne, endre, gaTil, kjor, vis } = useLeder();
  type Rad = { key: string; kind: 'fri' | 'bytte' | 'ledig' | 'fravaer' | 'timer'; kindLabel: string; ikon: string; farge: string; tittel: string; under: string; knapper: { tekst: string; primar?: boolean; run: () => void }[]; iOrden?: boolean };
  const rader: Rad[] = [];
  const navn = (id: string | null) => d.ansatte.find(a => a.id === id)?.navn ?? '';
  const vaktTid = (dato: string, ansattId: string) => {
    const v = d.vakter.find(x => x.dato === dato && x.ansattId === ansattId);
    return v ? ` · ${v.start}–${v.slutt}` : '';
  };
  for (const f of d.foresp.fri) rader.push({
    key: `fri-${f.id}`, kind: 'fri', kindLabel: 'Fri', ikon: 'event_busy', farge: 'rod', tittel: `${f.navn} ber om fri`,
    under: `${DagDm(f.dato)}${vaktTid(f.dato, f.ansattId)}${f.grunn ? ` · «${f.grunn}»` : ''}`,
    knapper: [{ tekst: 'Godkjenn', primar: true, run: () => apne({ k: 'fravaer', b: { kilde: 'fri', id: f.id } }) }, { tekst: 'Avslå', run: () => apne({ k: 'fravaer', b: { kilde: 'fri', id: f.id, avslag: true } }) }],
  });
  for (const f of d.foresp.fravaer) rader.push({
    key: `frav-${f.id}`, kind: 'fravaer', kindLabel: 'Fravær', ikon: 'beach_access', farge: 'gronn', tittel: `${f.navn} søker ${f.type.toLowerCase()}`, iOrden: f.vakter === 0,
    under: `${f.fra === f.til ? DagDm(f.fra) : periode(f.fra, f.til, false)}${f.timerMin ? ` · ${nf(f.timerMin)} t` : ' · hele dagen'} · ${f.vakter ? `${f.vakter} ${f.vakter === 1 ? 'vakt' : 'vakter'} i perioden` : f.fra === f.til ? 'Ingen vakter den dagen' : 'Ingen vakter i perioden'}${f.grunn ? ` · «${f.grunn}»` : ''}`,
    knapper: [{ tekst: 'Godkjenn', primar: true, run: () => apne({ k: 'fravaer', b: { kilde: 'fravaer', id: f.id } }) }, { tekst: 'Avslå', run: () => apne({ k: 'fravaer', b: { kilde: 'fravaer', id: f.id, avslag: true } }) }],
  });
  for (const v of d.foresp.bytte) rader.push({
    key: `bytte-${v.id}`, kind: 'bytte', kindLabel: 'Bytte', ikon: 'swap_horiz', farge: 'bla', tittel: `${v.navn} vil bytte bort`,
    under: `${DagDm(v.dato)} · ${v.start}–${v.slutt} · ${v.interessenter.length ? `${v.interessenter.map(i => fornavn(i.navn)).join(' og ')} vil ta den` : 'Ingen kollega har tatt den ennå'}`,
    knapper: [
      ...v.interessenter.slice(0, 2).map((i, n) => ({ tekst: `Gi til ${fornavn(i.navn)}`, primar: n === 0, run: () => endre(`b${v.id}`, () => tildelHandling(v.id, i.id)) })),
      { tekst: 'Gjør vakten ledig', primar: !v.interessenter.length, run: () => endre(`b${v.id}`, () => gjorLedigHandling(v.id)) },
      { tekst: 'Avslå', run: () => endre(`b${v.id}`, () => beholdHandling(v.id)) },
    ],
  });
  for (const b of d.foresp.bytteKollega) rader.push({
    key: `bk-${b.id}`, kind: 'bytte', kindLabel: 'Bytte', ikon: 'swap_horiz', farge: 'bla', tittel: `${b.fraNavn} vil bytte med ${fornavn(b.tilNavn)}`,
    under: `${DagDm(b.dato)} · ${b.start}–${b.slutt}${b.type ? ` · ${b.type}` : ''} · ${fornavn(b.tilNavn)} har sagt ja`,
    knapper: [{ tekst: 'Godkjenn', primar: true, run: () => endre(`bk${b.id}`, () => lederByttHandling(b.id, true)) }, { tekst: 'Avslå', run: () => endre(`bk${b.id}`, () => lederByttHandling(b.id, false)) }],
  });
  for (const v of d.foresp.ledigeMedInteresse) {
    const mer = v.interessenter.filter(i => i.merknad === 'merarbeid' || i.merknad === 'overtid');
    rader.push({
      key: `ledig-${v.id}`, kind: 'ledig', kindLabel: 'Ledig vakt', ikon: 'front_hand', farge: 'gul', tittel: `Ledig ${dagDm(v.dato)} · ${v.start}–${v.slutt}`,
      under: `${v.interessenter.map(i => i.navn).join(' og ')} har meldt interesse.${mer.length ? ` ${mer.map(i => `${fornavn(i.navn)} får ${i.merknad}`).join(', ')}.` : ''}`,
      knapper: v.interessenter.map((i, n) => ({ tekst: `Gi til ${fornavn(i.navn)}`, primar: n === 0, run: () => endre(`l${v.id}`, () => tildelHandling(v.id, i.id)) })),
    });
  }
  const venter = d.timer.flatMap(u => u.rader.filter(r => r.status === 'venter').map(r => ({ ...r, u })));
  if (venter.length && d.innstillinger.hours.on) {
    const ppl = new Set(venter.map(r => r.ansattId)).size, avvik = venter.filter(r => r.avvik.length).length;
    const stemmer = venter.filter(r => !r.avvik.length);
    const uker = [...new Set(venter.map(r => r.u.uke))];
    rader.push({
      key: 'timer', kind: 'timer', kindLabel: 'Timer', ikon: 'schedule', farge: 'gra', tittel: `Timer for uke ${uker.join(' og ')} venter`,
      under: `${ppl} ansatte · ${nf(venter.reduce((s, r) => s + r.arbeid + r.fravaer, 0))} t${avvik ? ` · ${avvik} med avvik` : ''}`,
      knapper: [
        ...(stemmer.length ? [{ tekst: 'Godkjenn de som stemmer', primar: true, run: () => { void (async () => { for (const u of d.timer) if (u.rader.some(r => r.status === 'venter' && !r.avvik.length)) await endre('timer', () => godkjennTimerHandling(u.aar, u.uke, 'stemmer')); })(); } }] : []),
        { tekst: 'Se timer', run: () => gaTil('foresp', { fane: 'timer' }) },
      ],
    });
  }
  void kjor; void vis; void navn;
  return rader;
}

export function SvarKort({ r, visType }: { r: ReturnType<typeof useSvarRader>[number]; visType?: boolean }) {
  const { opptatt } = useLeder();
  return (
    <div className="v2l-svar">
      <div className="v2l-svar-tekst">
        <span className={`v2l-svar-ikon ${r.farge}`}><Ikon n={r.ikon} s={20} /></span>
        <div className="fyll">
          {visType && <div className="v2-sm">{r.kindLabel}</div>}
          <div className="v2l-svar-tittel">{r.tittel}</div>
          <div className="v2l-svar-under">{r.under}</div>
        </div>
      </div>
      <div className="v2l-svar-knapper">
        {r.knapper.map(k => <button key={k.tekst} type="button" className={`v2-knapp liten ${k.primar ? 'primar' : ''}`} disabled={!!opptatt} onClick={k.run}>{k.tekst}</button>)}
      </div>
    </div>
  );
}

function TrengerSvar() {
  const { gaTil } = useLeder();
  const rader = useSvarRader();
  return (
    <section className="v2l-trenger" aria-label="Trenger svar">
      <div className="v2l-trenger-topp">
        <span className="v2-sm">Trenger svar</span><Teller n={rader.length} />
        <button type="button" className="v2-lenkeknapp" onClick={() => gaTil('foresp')}>Se alle</button>
      </div>
      {!rader.length ? <div className="v2l-alt-besvart"><Ikon n="task_alt" s={20} />Alt er besvart.</div> : rader.map(r => <SvarKort key={r.key} r={r} />)}
    </section>
  );
}

// ---------- Rutenett (uke) ----------

function VaktBrikke({ v, kompakt, dra }: { v: Vakt; kompakt?: boolean; dra?: boolean }) {
  const { d, apne } = useLeder();
  const u = utseende(d, v);
  return (
    <button type="button" className={`v2-brikke ${u.art} ${u.utkast ? 'utkast' : ''}`} draggable={dra && d.endre} aria-label={aria(d, v, u.merke)}
      onDragStart={e => { e.dataTransfer.setData('text/plain', v.id); e.dataTransfer.effectAllowed = 'move'; }}
      onClick={() => d.endre && apne({ k: 'vakt', id: v.id, ansattId: v.ansattId, dato: v.dato })}>
      <span className="v2-brikke-tid"><span className="v2-l">{v.start}–{v.slutt}</span><span className="v2-k">{kort(v.start)}–{kort(v.slutt)}</span></span>
      {(v.type || v.sted) && <span className="v2-brikke-under"><span className="v2-l">{[v.type, v.sted].filter(Boolean).join(' · ')}</span><span className="v2-k">{v.type ?? v.sted}</span></span>}
      {u.merke && <span className={`v2-flagg ${u.merkeArt}`}>{u.merke}</span>}
      {v.kommentar && d.innstillinger.comments.on && <Ikon n="chat_bubble" s={14} className="v2-brikke-kommentar" />}
      {!kompakt && null}
    </button>
  );
}

function tagger(d: LederData, ansattId: string, dato: string, harVakt: boolean) {
  const f = fravaerPa(d, ansattId, dato);
  if (f.length) return f.map(x => ({ tekst: x.type, kort: x.type.split(' ')[0], ikon: 'event_busy', art: 'rod' }));
  if (!d.innstillinger.avail.on) return [];
  const t = d.tilgj.find(x => x.ansattId === ansattId && x.dato === dato);
  if (!t) return [];
  if (t.status === 'kan' && !harVakt) { const r = tidsrom(t.timer, 'kan'); return [{ tekst: r ? `Kan jobbe ${r}` : 'Kan jobbe', kort: 'Kan', ikon: 'check_circle', art: 'gronn' }]; }
  if (t.status === 'kan_ikke' && !d.foresp.fri.some(x => x.ansattId === ansattId && x.dato === dato)) return [{ tekst: t.grunn ? `Kan ikke: ${t.grunn}` : 'Kan ikke', kort: 'Kan ikke', ikon: 'block', art: 'rod' }];
  return [];
}

function RadHode({ a }: { a: LederData['ansatte'][number] }) {
  const { d, apne } = useLeder();
  const p = d.perAnsatt[a.id];
  const avtalt = p?.avtalt ?? null, t = p?.arbeid ?? 0;
  const ot = d.innstillinger.ot.on ? (p?.overtid ?? 0) : 0, mer = d.innstillinger.ot.on ? (p?.merarbeid ?? 0) : 0;
  return (
    <button type="button" className="v2l-radhode" onClick={() => apne({ k: 'person', id: a.id })} aria-label={`${a.navn}, ${nf(t)} timer denne uka. Åpne`}>
      <Avatar navn={a.navn} art="mork" s={34} />
      <span className="v2l-radhode-tekst">
        <span className="v2l-radhode-navn">{a.navn}</span>
        <span className="v2l-radhode-timer">{avtalt ? `${nf(t)} / ${nf(avtalt)} t` : `${nf(t)} t`}</span>
        {avtalt != null && <span className="v2-strek"><span style={{ width: `${Math.min(100, (t / avtalt) * 100)}%` }} className={ot || mer ? 'gul' : ''} /></span>}
        {(ot > 0 || mer > 0) && <span className="v2l-radhode-ot">{ot > 0 ? `${nf(ot)} t overtid` : `${nf(mer)} t merarbeid`}</span>}
      </span>
    </button>
  );
}

function Rutenett({ vakter, tilDag, endre }: { vakter: Vakt[]; tilDag: (d: string) => void; endre: LederCtx['endre'] }) {
  const { d, apne } = useLeder();
  const [over, setOver] = useState('');
  const rader: (string | null)[] = [null, ...d.ansatte.map(a => a.id)];
  const slipp = (e: React.DragEvent, ansattId: string | null, dato: string) => {
    e.preventDefault(); setOver('');
    const id = e.dataTransfer.getData('text/plain');
    const v = d.vakter.find(x => x.id === id);
    if (!v || (v.ansattId === ansattId && v.dato === dato)) return;
    void endre('flytt', () => flyttVaktHandling(id, ansattId, dato));
  };
  return (
    <div className="v2l-rutenett-ramme">
      <div className="v2l-rutenett" role="grid" aria-label={`Vaktplan uke ${d.uke}`}>
        <div className="v2l-rh v2l-hjorne">Ansatt</div>
        {d.dager.map(x => (
          <button key={x} type="button" className="v2l-rh v2l-dagknapp" aria-label={`Vis ${dagDm(x)}`} onClick={() => tilDag(x)}>
            <span>{dagKort(x)}.</span><span className={`v2l-dagnr ${x === d.idag ? 'idag' : ''}`}>{Number(x.slice(8))}</span>
          </button>
        ))}
        {rader.map(id => {
          const a = d.ansatte.find(x => x.id === id);
          return (
            <div key={id ?? 'ledig'} className={`v2l-rad ${id ? '' : 'ledig'}`} role="row">
              {a ? <RadHode a={a} /> : (
                <div className="v2l-radhode ledig"><span className="v2-avatar gul" style={{ width: 34, height: 34 }}><Ikon n="front_hand" s={18} /></span>
                  <span className="v2l-radhode-tekst"><span className="v2l-radhode-navn">Ledige vakter</span><span className="v2l-radhode-timer">{vakter.filter(v => !v.ansattId).length} {vakter.filter(v => !v.ansattId).length === 1 ? 'vakt' : 'vakter'}</span></span></div>
              )}
              {d.dager.map(dato => {
                const liste = vakter.filter(v => v.ansattId === id && v.dato === dato).sort((p, q) => p.start.localeCompare(q.start));
                const tg = id ? tagger(d, id, dato, liste.length > 0) : [];
                const key = `${id ?? 'o'}-${dato}`;
                return (
                  <div key={dato} role="gridcell" className={`v2l-celle ${dato === d.idag ? 'idag' : ''} ${over === key ? 'over' : ''} ${liste.length ? 'har' : 'tomt'}`}
                    onDragOver={e => { if (d.endre) { e.preventDefault(); setOver(key); } }} onDragLeave={() => setOver(o => (o === key ? '' : o))} onDrop={e => slipp(e, id, dato)}>
                    {liste.map(v => <VaktBrikke key={v.id} v={v} dra />)}
                    {tg.map(t => <span key={t.tekst} className={`v2-tag ${t.art}`}><Ikon n={t.ikon} s={14} /><span className="v2-l">{t.tekst}</span><span className="v2-k">{t.kort}</span></span>)}
                    {d.endre && <button type="button" className="v2l-pluss" aria-label={`Ny vakt ${a ? `for ${fornavn(a.navn)} ` : ''}${dagDm(dato)}`} onClick={() => apne({ k: 'vakt', ansattId: id, dato })}><Ikon n="add" s={18} /></button>}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Mobil stående: ett kort per ansatt med sju små ruter. */
function Stripe({ vakter, tilDag }: { vakter: Vakt[]; tilDag: (d: string) => void }) {
  const { d, apne } = useLeder();
  const rader: (string | null)[] = [null, ...d.ansatte.map(a => a.id)];
  return (
    <div className="v2l-stripe">
      <div className="v2l-stripe-dager">
        {d.dager.map(x => <button key={x} type="button" aria-label={`Vis ${dagDm(x)}`} onClick={() => tilDag(x)}><span>{dagKort(x)}.</span><span className={`v2l-dagnr ${x === d.idag ? 'idag' : ''}`}>{Number(x.slice(8))}</span></button>)}
      </div>
      {rader.map(id => {
        const a = d.ansatte.find(x => x.id === id);
        const p = id ? d.perAnsatt[id] : null;
        return (
          <div key={id ?? 'ledig'} className={`v2l-stripe-kort ${id ? '' : 'ledig'}`}>
            {a && p ? (
              <button type="button" className="v2l-stripe-hode" onClick={() => apne({ k: 'person', id: a.id })} aria-label={`${a.navn}, ${nf(p.arbeid)} timer denne uka. Åpne`}>
                <Avatar navn={a.navn} art="mork" s={28} /><span className="fyll v2l-stripe-navn">{a.navn}</span>
                {d.innstillinger.ot.on && (p.overtid > 0 || p.merarbeid > 0) && <span className="v2-flagg gul">{p.overtid > 0 ? `${nf(p.overtid)} t overtid` : `${nf(p.merarbeid)} t merarbeid`}</span>}
                <span className="v2-mono liten">{p.avtalt ? `${nf(p.arbeid)} / ${nf(p.avtalt)} t` : `${nf(p.arbeid)} t`}</span>
              </button>
            ) : <div className="v2l-stripe-hode"><Ikon n="front_hand" s={18} /><span className="fyll v2l-stripe-navn">Ledige vakter</span><span className="v2-mono liten">{vakter.filter(v => !v.ansattId).length}</span></div>}
            <div className="v2l-mini">
              {d.dager.map(dato => {
                const v = vakter.filter(x => x.ansattId === id && x.dato === dato)[0];
                if (v) {
                  const u = utseende(d, v);
                  const ikon = u.art === 'fri' ? 'block' : u.art === 'bytte' ? 'swap_horiz' : u.art === 'ledig' ? 'front_hand' : u.art === 'overtid' ? 'warning' : '';
                  return <button key={dato} type="button" className={`v2l-minirute ${u.art} ${u.utkast ? 'utkast' : ''}`} aria-label={aria(d, v, u.merke)} onClick={() => d.endre && apne({ k: 'vakt', id: v.id, ansattId: v.ansattId, dato })}><span>{kort(v.start)}–{kort(v.slutt)}</span>{ikon && <Ikon n={ikon} s={13} />}</button>;
                }
                const t = id ? tagger(d, id, dato, false)[0] : null;
                const lbl = `Ny vakt ${a ? `for ${fornavn(a.navn)} ` : ''}${dagDm(dato)}`;
                if (t) return <button key={dato} type="button" className={`v2l-minirute tag ${t.art}`} aria-label={`${t.tekst}. ${lbl}`} onClick={() => d.endre && apne({ k: 'vakt', ansattId: id, dato })}><span>{t.kort}</span><Ikon n={t.ikon} s={13} /></button>;
                return <button key={dato} type="button" className="v2l-minirute pluss" aria-label={lbl} disabled={!d.endre} onClick={() => apne({ k: 'vakt', ansattId: id, dato })}><Ikon n="add" s={16} /></button>;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Dag ----------

function DagVisning({ vakter, dag, setDag }: { vakter: Vakt[]; dag: string; setDag: (d: string) => void }) {
  const { d, apne } = useLeder();
  const liste = vakter.filter(v => v.dato === dag).sort((a, b) => Number(!!a.ansattId) - Number(!!b.ansattId) || a.start.localeCompare(b.start));
  const notater: { tekst: string; ikon: string; art: string }[] = [];
  for (const f of d.fravaer.filter(x => x.fra <= dag && x.til >= dag)) notater.push({ tekst: `${f.navn}: ${f.type}, ${f.medLonn ? 'med' : 'uten'} lønn`, ikon: 'event_busy', art: 'rod' });
  if (d.innstillinger.avail.on) for (const t of d.tilgj.filter(x => x.dato === dag)) {
    const a = d.ansatte.find(x => x.id === t.ansattId); if (!a || fravaerPa(d, a.id, dag).length) continue;
    const r = tidsrom(t.timer, t.status);
    notater.push(t.status === 'kan' ? { tekst: `${a.navn} kan jobbe${r ? ` ${r}` : ''}`, ikon: 'check_circle', art: 'gronn' } : { tekst: `${a.navn} kan ikke${t.grunn ? `: ${t.grunn}` : ''}`, ikon: 'block', art: 'rod' });
  }
  return (
    <div className="v2-stakk">
      <div className="v2l-dagvelger">
        {d.dager.map(x => {
          const n = vakter.filter(v => v.dato === x).length;
          return <button key={x} type="button" aria-pressed={x === dag} className={x === d.idag ? 'idag' : ''} aria-label={`${DagDm(x)}, ${n} vakter`} onClick={() => setDag(x)}><span>{dagKort(x)}.</span><b>{Number(x.slice(8))}</b><small>{n}</small></button>;
        })}
      </div>
      <div className="v2l-dagtopp"><h2>{DagDm(dag)}</h2><span className="v2-mono">{nf(liste.filter(v => v.ansattId).reduce((s, v) => s + v.arbeid, 0))} t planlagt</span></div>
      {notater.map(n => <div key={n.tekst} className={`v2-notat ${n.art}`}><Ikon n={n.ikon} s={18} />{n.tekst}</div>)}
      <div className="v2l-dagliste">
        {liste.map(v => {
          const u = utseende(d, v);
          const a = d.ansatte.find(x => x.id === v.ansattId);
          return (
            <button key={v.id} type="button" className={`v2l-dagkort ${u.art} ${u.utkast ? 'utkast' : ''}`} aria-label={aria(d, v, u.merke)} onClick={() => d.endre && apne({ k: 'vakt', id: v.id, ansattId: v.ansattId, dato: v.dato })}>
              {a ? <Avatar navn={a.navn} art="mork" s={40} /> : <span className="v2-avatar gul" style={{ width: 40, height: 40 }}><Ikon n="front_hand" s={20} /></span>}
              <span className="fyll"><span className="v2l-dagkort-navn">{a?.navn ?? 'Ledig vakt'}</span><span className="v2l-dagkort-under">{[v.type, v.sted].filter(Boolean).join(' · ') || 'Vakt'}</span>{u.merke && <span className={`v2-flagg ${u.merkeArt}`}>{u.merke}</span>}</span>
              <span className="v2-mono v2l-dagkort-tid">{v.start}–{v.slutt}</span>
            </button>
          );
        })}
      </div>
      {!liste.length && <div className="v2-tomlinje">Ingen vakter denne dagen.</div>}
      {d.endre && <button type="button" className="v2-knapp stiplet" onClick={() => apne({ k: 'vakt', ansattId: null, dato: dag })}><Ikon n="add" s={20} />Ny vakt {dagDm(dag)}</button>}
    </div>
  );
}

// ---------- Måned ----------

function MaanedVisning({ tilDag }: { tilDag: (d: string) => void }) {
  const { d } = useLeder();
  const celler: string[] = [];
  for (let x = d.maaned.fra; x <= d.maaned.til; x = plussDag(x, 1)) celler.push(x);
  return (
    <div className="v2l-mnd">
      <div className="v2l-mnd-tittel">{mndNavn(d.maaned.mnd).replace(/^./, c => c.toUpperCase())} {d.maaned.mnd.slice(0, 4)}</div>
      <div className="v2l-mnd-grid">
        {['man', 'tir', 'ons', 'tor', 'fre', 'lør', 'søn'].map(h => <div key={h} className="v2l-mnd-hode">{h}</div>)}
        {celler.map(x => {
          const m = d.maaned.dager[x];
          const iMnd = x.slice(0, 7) === d.maaned.mnd;
          return (
            <button key={x} type="button" className={`v2l-mnd-dag ${iMnd ? '' : 'utenfor'} ${x === d.idag ? 'idag' : ''} ${d.dager.includes(x) ? 'denne' : ''}`} aria-label={`${Number(x.slice(8))}. ${mndNavn(x)}${m?.n ? `, ${m.n} vakter` : ''}${m?.ledige ? `, ${m.ledige} ledige` : ''}`} onClick={() => tilDag(x)}>
              <span className="v2l-mnd-nr">{Number(x.slice(8))}</span>
              {m?.n ? <span className="v2l-mnd-n"><span className="v2-l">{m.n} vakter</span><span className="v2-k">{m.n}</span></span> : null}
              {m?.ledige ? <span className="v2l-mnd-ledig"><span className="v2-l">{m.ledige} ledig</span><span className="v2-k">{m.ledige}</span></span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function UkeTittel({ children }: { children: ReactNode }) { return <div className="v2-sm">{children}</div>; }
void ukedagNr; void dm;
