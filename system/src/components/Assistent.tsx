'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { chatMedAssistent, samtaler, hentSamtale, lagreSamtale } from '@/app/handlinger';
import type { Kort } from '@/lib/ai/verktoy';
import type { Tur } from '@/lib/ai/agent';
import type { SamtaleMelding as Melding, SamtaleListe } from '@/lib/ai/samtale';
import { VisKort } from './AssistentKort';

// Forslag i tom samtale, tilpasset siden brukeren står på.
const FORSLAG_FOR: [RegExp, string[]][] = [
  [/^\/salg/, ['Lag en faktura', 'Hvem har ikke betalt?', 'Send purring på det som er forfalt', 'Hvor mye har vi fakturert i år?']],
  [/^\/kjop/, ['Registrer en kostnad', 'Hva er de største kostnadene i år?', 'Send en skannelenke til en ansatt', 'Hvilke regninger forfaller snart?']],
  [/^\/bank/, ['Har vi nok penger de neste 30 dagene?', 'Hvem har ikke betalt?', 'Registrer en innbetaling']],
  [/^\/lonn/, ['Kjør lønn for denne måneden', 'Vis lønn og ansatte', 'Send lønnslippen til en ansatt']],
  [/^\/($|vaktplan|vp)/, ['Lag vaktplan for neste uke', 'Hvem bør ta en ledig vakt?', 'Får noen overtid denne uka?']],
  [/^\/(mva|frister|rapporter|aarsavslutning)/, ['Hvordan ligger vi an med MVA?', 'Hvilke frister kommer?', 'Vis resultatet per måned']],
];
const FORSLAG_STD = ['Lag en faktura', 'Hvem har ikke betalt?', 'Kjør lønn for denne måneden', 'Hvordan går det i år?'];

// Korte svar som gjelder det siste forslaget som venter, så man slipper å trykke.
const UTFOR = /^(ja[,!. ]*)?(godkjenn|godkjent|send( den| det| fakturaen| purringen)?|registrer( den| det)?|før( den| det)?|utfør|kjør( på)?|gjør det|ok,? send)[.! ]*$/i;
const VENT = /^(sett (den |det )?på vent|vent|ikke ennå|senere)[.! ]*$/i;
const AVBRYT = /^(avbryt|nei,? avbryt|glem det|slett (den|det))[.! ]*$/i;

const TITTEL: Record<string, string> = { faktura: 'fakturaforslag', kostnad: 'kostnadsforslag', betaling: 'innbetaling', purring: 'purring', kreditnota: 'kreditnota', mva: 'MVA-melding', skannelenke: 'skannelenke på e-post', invitasjon: 'invitasjon', lonn: 'lønnskjøring', lonnslipp: 'lønnslipp på e-post', kunde: 'ny kunde', vaktplan: 'utkast til vaktplan', tildel_vakt: 'tildeling av ledig vakt', publiser_uke: 'publisering av vaktplan' };
const STATUSORD: Record<string, string> = { venter: 'venter på brukeren', utfort: 'utført', pa_vent: 'satt på vent', avbrutt: 'avbrutt' };
const HUSK = 'rf-assistent';

const naa = () => new Date().toISOString();
const klokke = (iso: string) => new Date(iso).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
const dagNokkel = (iso: string) => new Date(iso).toLocaleDateString('sv-SE');
function dagNavn(iso: string): string {
  const d = dagNokkel(iso), i = new Date();
  if (d === dagNokkel(i.toISOString())) return 'I dag';
  if (d === dagNokkel(new Date(i.getTime() - 86400000).toISOString())) return 'I går';
  return new Date(iso).toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' });
}
const lagTittel = (t: string) => { const s = t.trim().replace(/\s+/g, ' '); const k = s.length > 38 ? s.slice(0, 36) + ' …' : s; return k.charAt(0).toUpperCase() + k.slice(1); };

const Stjerne = ({ s = 16 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2l1.8 5.6L19.5 9.5l-5.7 1.9L12 17l-1.8-5.6L4.5 9.5l5.7-1.9z" /><path d="M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></svg>;

/** Knappen i toppmenyen. Snakker med panelet via hendelser, så de kan ligge hvor som helst i siden. */
export function AssistentKnapp() {
  const [apen, setApen] = useState(false);
  const [mac, setMac] = useState(false);
  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform));
    const status = (e: Event) => setApen((e as CustomEvent<boolean>).detail);
    window.addEventListener('rf:assistent-status', status);
    return () => window.removeEventListener('rf:assistent-status', status);
  }, []);
  return (
    <button type="button" className={`assistent-topp ikke-utskrift ${apen ? 'apen' : ''}`} aria-label={apen ? 'Lukk assistenten' : 'Åpne assistenten'} aria-expanded={apen} title={`Assistent (${mac ? '⌘K' : 'Ctrl+K'})`}
      onClick={() => window.dispatchEvent(new CustomEvent('rf:assistent', { detail: 'bytt' }))}>
      <Stjerne s={15} /><span className="assistent-topp-tekst">Assistent</span>
    </button>
  );
}

/** Assistenten: svarer, viser tall som grafer og tabeller, og lager forslag du sender eller setter på vent. */
export function Assistent({ tilgang = true }: { tilgang?: boolean }) {
  const sti = usePathname();
  const forslag = FORSLAG_FOR.find(([re]) => re.test(sti))?.[1] ?? FORSLAG_STD;
  const [apen, setApen] = useState(false);
  const [visning, setVisning] = useState<'chat' | 'historikk'>('chat');
  const [bred, setBred] = useState(false);
  const [meldinger, setMeldinger] = useState<Melding[]>([]);
  const [tittel, setTittel] = useState('');
  const [samtaleId, setSamtaleId] = useState<string | null>(null);
  const [tekst, setTekst] = useState('');
  const [venter, setVenter] = useState(false);
  const [igjen, setIgjen] = useState<number | null>(null);
  const [utlos, setUtlos] = useState<{ id: string; valg: 'utfor' | 'vent' | 'avbryt' } | null>(null);
  const [liste, setListe] = useState<SamtaleListe[] | null>(null);
  const [sok, setSok] = useState('');
  const rulle = useRef<HTMLDivElement>(null);
  const skrivefelt = useRef<HTMLTextAreaElement>(null);
  const idRef = useRef<string | null>(null);
  const ko = useRef<Promise<unknown>>(Promise.resolve());
  const skalLagre = useRef(false);
  const startet = useRef(false);
  const [venteSporsmal, setVenteSporsmal] = useState<string | null>(null);

  // Åpne/lukke fra knappen i toppmenyen og med ⌘K / Ctrl+K. Esc lukker.
  useEffect(() => {
    const bytt = (e: Event) => {
      const q = (e as CustomEvent<{ sporsmal?: string } | string>).detail;
      if (q && typeof q === 'object' && q.sporsmal) { setApen(true); setVisning('chat'); setVenteSporsmal(q.sporsmal); } else setApen(a => !a);
    };
    const tast = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setApen(a => !a); }
      else if (e.key === 'Escape') setApen(false);
    };
    window.addEventListener('rf:assistent', bytt);
    window.addEventListener('keydown', tast);
    return () => { window.removeEventListener('rf:assistent', bytt); window.removeEventListener('keydown', tast); };
  }, []);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('rf:assistent-status', { detail: apen }));
    document.body.classList.toggle('assistent-apen', apen);
    if (startet.current) try { localStorage.setItem(HUSK, JSON.stringify({ apen, id: idRef.current })); } catch { /* ikke viktig */ }
    if (apen) setTimeout(() => skrivefelt.current?.focus(), 250);
  }, [apen]);
  useEffect(() => () => document.body.classList.remove('assistent-apen'), []);

  const apneSamtale = useCallback(async (id: string) => {
    const r = await hentSamtale(id);
    if (!r.ok) return false;
    skalLagre.current = false;
    idRef.current = r.data!.id; setSamtaleId(r.data!.id); setTittel(r.data!.tittel); setMeldinger(r.data!.meldinger);
    setVisning('chat'); setSok('');
    try { localStorage.setItem(HUSK, JSON.stringify({ apen: true, id })); } catch { /* ikke viktig */ }
    return true;
  }, []);

  // Fortsett der brukeren slapp, også etter at siden er lastet på nytt.
  useEffect(() => {
    let lagret: { apen?: boolean; id?: string | null } = {};
    try { lagret = JSON.parse(localStorage.getItem(HUSK) ?? '{}'); } catch { /* ikke viktig */ }
    if (lagret.id) apneSamtale(lagret.id);
    if (lagret.apen && window.innerWidth >= 900) setApen(true);
    startet.current = true;
  }, [apneSamtale]);

  useEffect(() => { const el = rulle.current; if (el) el.scrollTop = el.scrollHeight; }, [meldinger, venter, apen, visning]);

  // Lagre samtalen etter hver endring. Køen hindrer at to lagringer lager to samtaler.
  useEffect(() => {
    if (!skalLagre.current || !meldinger.length) return;
    skalLagre.current = false;
    const t = tittel, m = meldinger;
    ko.current = ko.current.then(async () => {
      const r = await lagreSamtale(idRef.current, t, m);
      if (r.ok && r.data) { idRef.current = r.data; setSamtaleId(r.data); try { localStorage.setItem(HUSK, JSON.stringify({ apen: true, id: r.data })); } catch { /* ikke viktig */ } }
    });
  }, [meldinger, tittel]);
  const endre = (f: (m: Melding[]) => Melding[]) => { skalLagre.current = true; setMeldinger(f); };

  // Historikk: hent listen når den vises, søk med litt forsinkelse.
  useEffect(() => {
    if (visning !== 'historikk') return;
    const t = setTimeout(async () => { const r = await samtaler(sok); setListe(r.ok ? r.data! : []); }, sok ? 250 : 0);
    return () => clearTimeout(t);
  }, [visning, sok]);

  const nySamtale = () => { idRef.current = null; setSamtaleId(null); setTittel(''); setMeldinger([]); setVisning('chat'); setTekst(''); setBred(false); try { localStorage.setItem(HUSK, JSON.stringify({ apen: true, id: null })); } catch { /* ikke viktig */ } skrivefelt.current?.focus(); };

  const sisteVentende = () => {
    for (let i = meldinger.length - 1; i >= 0; i--) {
      const m = meldinger[i];
      if (m.fra !== 'assistent') continue;
      for (let j = m.kort.length - 1; j >= 0; j--) { const k = m.kort[j]; if (k.type === 'forslag' && k.status === 'venter') return k; }
    }
    return null;
  };

  // Historikken modellen får: bare tekst, med en kort merknad om hvilke kort som ble vist og hva brukeren valgte.
  const historikk = (liste: Melding[]): Tur[] => liste.flatMap((m): Tur[] => {
    if (m.fra === 'bruker') return [{ role: 'user', content: m.tekst }];
    if (m.fra === 'assistent') {
      const kort = m.kort.map(k => k.type === 'forslag' ? `${TITTEL[k.art] ?? k.art} (${STATUSORD[k.status] ?? k.status})` : k.type === 'graf_maned' ? `graf over resultat ${k.ar}` : k.tittel);
      return [{ role: 'assistant', content: m.tekst + (kort.length ? `\n[Viste kort: ${kort.join('; ')}]` : '') }];
    }
    if (m.fra === 'notat') return [{ role: 'assistant', content: `[${m.tekst}]` }];
    return [];
  });

  // Et kort er sendt, satt på vent eller avbrutt: oppdater det i samtalen og noter det for modellen.
  const ferdig = (id: string, status: string, melding: string, lenke?: string) => {
    setUtlos(null);
    endre(liste => [...liste.map(m => m.fra !== 'assistent' ? m : { ...m, kort: m.kort.map(k => k.type === 'forslag' && k.id === id ? { ...k, status, melding, lenke } : k) }), { fra: 'notat', tekst: melding, tid: naa() }]);
  };

  const spor = async (q: string) => {
    const s = q.trim(); if (!s || venter) return;
    setTekst('');
    if (!meldinger.length) setTittel(lagTittel(s));
    const ventende = sisteVentende();
    const valg = UTFOR.test(s) ? 'utfor' : VENT.test(s) ? 'vent' : AVBRYT.test(s) ? 'avbryt' : null;
    if (ventende && valg) {
      endre(m => [...m, { fra: 'bruker', tekst: s, tid: naa() }]);
      setUtlos({ id: ventende.id, valg });
      return;
    }
    const neste: Melding[] = [...meldinger, { fra: 'bruker', tekst: s, tid: naa() }];
    endre(() => neste); setVenter(true);
    const r = await chatMedAssistent(historikk(neste));
    setVenter(false);
    if (!r.ok) { endre(m => [...m, { fra: 'feil', tekst: r.feil, tid: naa() }]); return; }
    const d = r.data!;
    if (d.igjen !== undefined) setIgjen(d.igjen);
    endre(m => [...m, { fra: 'assistent', tekst: d.tekst, kort: d.kort, kilder: d.kilder, tid: naa() }]);
  };

  // Spørsmål fra en knapp et annet sted i systemet (f.eks. «Lag forslag med assistenten» i vaktplanen).
  useEffect(() => { if (venteSporsmal && !venter) { const q = venteSporsmal; setVenteSporsmal(null); spor(q); } }, [venteSporsmal]); // eslint-disable-line react-hooks/exhaustive-deps

  const nyttKort = (k: Kort) => endre(m => [...m, { fra: 'assistent', tekst: '', kort: [k], tid: naa() }]);
  const tilEndring = () => { setTekst('Endre: '); setTimeout(() => { const el = skrivefelt.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 0); };

  // Grupper historikken: I dag, I går, Tidligere.
  const grupper = (() => {
    if (!liste) return [];
    const g: Record<string, SamtaleListe[]> = { 'I dag': [], 'I går': [], Tidligere: [] };
    for (const s of liste) { const n = dagNavn(s.oppdatert); (g[n === 'I dag' || n === 'I går' ? n : 'Tidligere']).push(s); }
    return Object.entries(g).filter(([, v]) => v.length);
  })();

  const synlige = meldinger.filter(m => m.fra !== 'notat');

  return (
    <aside className={`assistent-panel ikke-utskrift ${apen ? 'apen' : ''} ${bred ? 'bred' : ''}`} aria-label="Assistent" aria-hidden={!apen} inert={!apen}>
      <div className="ap-topp">
        {visning === 'historikk' && <button type="button" className="ap-ikon tilbake" onClick={() => setVisning('chat')} aria-label="Tilbake"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 6l-6 6 6 6" /></svg></button>}
        <div className="ap-tittel">
          <b>{visning === 'historikk' ? 'Tidligere samtaler' : 'Assistent'}</b>
          {visning === 'chat' && <small>{tittel || 'Ny samtale'}</small>}
        </div>
        {visning === 'chat' && tilgang && (
          <button type="button" className="ap-historikk" onClick={() => { setListe(null); setVisning('historikk'); }} title="Tidligere samtaler">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M3 12a9 9 0 103-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></svg>Historikk
          </button>
        )}
        <button type="button" className="ap-ikon" onClick={nySamtale} title="Ny samtale" aria-label="Ny samtale"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></svg></button>
        <button type="button" className="ap-ikon" onClick={() => setApen(false)} aria-label="Lukk"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
      </div>

      {!tilgang ? (
        <div className="ap-rulle ap-meldinger">
          <div className="ap-velkommen">
            <div className="ap-velkommen-tittel">Assistenten er med i Selskap</div>
            <p>Den lager fakturaer, fører kostnader, sender purringer, kjører lønn og lager vaktplanen for deg. Du ser alltid forslaget og bekrefter selv før noe lagres.</p>
            <div><Link href="/innstillinger?vis=abonnement" className="knapp">Oppgrader til Selskap</Link></div>
          </div>
        </div>
      ) : visning === 'historikk' ? (
        <div className="ap-historikk-liste">
          <div className="ap-sok">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <input value={sok} onChange={e => setSok(e.target.value)} placeholder="Søk i tidligere samtaler" aria-label="Søk i tidligere samtaler" autoFocus />
          </div>
          <div className="ap-rulle">
            {liste === null && <div className="ap-tom">Henter …</div>}
            {grupper.map(([navn, rader]) => (
              <div key={navn}>
                <div className="ap-gruppe">{navn}</div>
                {rader.map(s => (
                  <button key={s.id} type="button" className={`ap-samtale ${s.id === samtaleId ? 'aktiv' : ''}`} onClick={() => apneSamtale(s.id)}>
                    <span className="fyll"><b>{s.tittel}</b><span>{s.sisteFraBruker ? 'Du: ' : ''}{s.siste}</span></span>
                    <span className="ap-tid">{navn === 'Tidligere' ? new Date(s.oppdatert).toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit' }) : klokke(s.oppdatert)}</span>
                  </button>
                ))}
              </div>
            ))}
            {liste && !grupper.length && <div className="ap-tom">{sok.trim() ? `Ingen samtaler inneholder «${sok.trim()}».` : 'Ingen tidligere samtaler ennå.'}</div>}
          </div>
        </div>
      ) : (
        <>
          <div className="ap-rulle ap-meldinger" ref={rulle} aria-live="polite">
            {!synlige.length && (
              <div className="ap-velkommen">
                <div className="ap-velkommen-tittel">Hva skal vi gjøre?</div>
                <p>Jeg kan lage fakturaer, føre kostnader, sende purringer, sjekke MVA og svare på spørsmål om tallene dine.</p>
                <div className="ap-forslag">{forslag.map(f => <button key={f} type="button" onClick={() => spor(f)}>{f}</button>)}</div>
              </div>
            )}
            {synlige.map((m, i) => {
              const dag = i === 0 || dagNokkel(synlige[i - 1].tid) !== dagNokkel(m.tid) ? <div className="ap-dag"><span>{dagNavn(m.tid)}</span></div> : null;
              if (m.fra === 'bruker') return <div key={i} className="ap-gruppe-melding">{dag}<div className="ap-bruker"><div className="ap-boble">{m.tekst}</div><span className="ap-tid">{klokke(m.tid)}</span></div></div>;
              return (
                <div key={i} className="ap-gruppe-melding">
                  {dag}
                  <div className="ap-bot">
                    <div className="ap-bot-meta"><span className="ap-avatar"><Stjerne s={10} /></span><b>Assistent</b><span>·</span><span className="ap-tid">{klokke(m.tid)}</span></div>
                    {m.fra === 'feil' ? <div className="ap-tekst feil">{m.tekst}</div> : (
                      <>
                        {m.tekst && <div className="ap-tekst">{m.tekst}</div>}
                        {!!m.kilder?.length && <div className="ap-kilder">Kilde: {m.kilder.map((k, j) => <Link key={j} href={k.href}>{k.tekst}</Link>)}</div>}
                        {m.kort.map((k, j) => (
                          <VisKort key={k.type === 'forslag' ? k.id : `${i}-${j}`} k={k}
                            onUtvid={() => setBred(true)} onNyttKort={nyttKort} onEndre={tilEndring}
                            utlos={k.type === 'forslag' && utlos?.id === k.id ? utlos.valg : null}
                            onFerdig={ferdig} />
                        ))}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            {venter && <div className="ap-skriver" aria-label="Assistenten skriver"><span /><span /><span /></div>}
          </div>

          <div className="ap-skriv">
            <form className="ap-skriv-felt" onSubmit={e => { e.preventDefault(); spor(tekst); }}>
              <textarea ref={skrivefelt} rows={1} value={tekst} maxLength={2000} placeholder="Skriv til assistenten …" aria-label="Melding til assistenten"
                onChange={e => { setTekst(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(120, e.target.scrollHeight)}px`; }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); spor(tekst); } }} />
              <button type="submit" className={`ap-send ${tekst.trim() && !venter ? 'klar' : ''}`} disabled={!tekst.trim() || venter} aria-label="Send">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
              </button>
            </form>
            <div className="ap-fotnote">Assistenten foreslår. Ingenting lagres før du bekrefter.{igjen != null ? ` ${igjen} svar igjen denne måneden.` : ''}</div>
          </div>
        </>
      )}
    </aside>
  );
}
