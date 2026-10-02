'use client';

import { useEffect, useState } from 'react';
import { assistentForslag, assistentUtfor, angreHandling, type Forslag } from '@/app/vaktplan-handlinger';
import { useLeder } from './ctx';
import { Ikon, fornavn } from './felles';

type Melding = { id: number; bruker?: string; kort?: Forslag; ferdig?: string; laster?: boolean; feil?: string };
type Art = 'uke' | 'ledig' | 'overtid';
const SPORSMAL: [Art, string][] = [['uke', 'Lag vaktplan for neste uke'], ['ledig', 'Hvem bør ta lørdag?'], ['overtid', 'Får noen overtid denne uka?']];

let bestilt: Art | null = null;
/** Lar «Be assistenten om et forslag» i en tom uke åpne panelet med et spørsmål. */
export function bestillForslag(a: Art) { bestilt = a; }

/** Assistenten lager forslag. Lederen godkjenner, og ingenting publiseres av assistenten. */
export function AssistentInnhold() {
  const { d, vis, opptatt } = useLeder();
  const [meldinger, setMeldinger] = useState<Melding[]>([]);
  const [jobber, setJobber] = useState(false);
  // Den ledige vakten assistenten tenker på (for spørsmålsteksten).
  const ledig = d.vakter.find(v => !v.ansattId && v.dato >= d.idag) ?? d.vakter.find(v => !v.ansattId);
  const tekst = (a: Art, t: string) => (a === 'ledig' && ledig ? `Hvem bør ta ${new Intl.DateTimeFormat('nb-NO', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${ledig.dato}T12:00:00Z`))}?` : t);

  const spor = async (a: Art, fraTom = false) => {
    const id = Date.now();
    setMeldinger(m => [...m, { id: id - 1, bruker: tekst(a, SPORSMAL.find(x => x[0] === a)![1]) }, { id, laster: true }]);
    // I en tom uke lages forslaget for denne uka, ut fra forrige.
    const u = fraTom ? d.forrige : { aar: d.aar, uke: d.uke };
    const r = await assistentForslag(a, u.aar, u.uke);
    setMeldinger(m => m.map(x => (x.id === id ? (r.ok ? { id, kort: r.data! } : { id, feil: r.feil }) : x)));
  };
  useEffect(() => { if (bestilt) { const a = bestilt; bestilt = null; void spor(a, true); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const utfor = async (m: Melding) => {
    if (!m.kort?.handling) return;
    setJobber(true);
    const r = await assistentUtfor(m.kort.handling.art, m.kort.handling.data);
    setJobber(false);
    if (!r.ok) { vis(r.feil, null, true); return; }
    setMeldinger(x => x.map(y => (y.id === m.id ? { ...y, ferdig: m.kort!.handling!.art === 'uke' ? 'Lagret som utkast' : 'Godkjent' } : y)));
    const angre = r.data?.angre;
    vis(r.data?.melding ?? 'Lagret.', angre ? async () => { await angreHandling(angre); location.reload(); } : null);
    window.dispatchEvent(new Event('v2:oppdater'));
  };
  const spurt = new Set(meldinger.filter(m => m.bruker).map(m => m.bruker));
  const forslag = SPORSMAL.filter(([a, t]) => !spurt.has(tekst(a, t)));

  return (
    <div className="v2-asst">
      <div className="v2-asst-liste">
        <div className="v2-asst-intro">Hei, {fornavn(d.leder.navn)}. Jeg lager forslag til vaktplanen. Du godkjenner, og jeg publiserer aldri noe selv.</div>
        {meldinger.map(m => m.bruker ? <div key={m.id} className="v2-asst-bruker">{m.bruker}</div>
          : m.laster ? <div key={m.id} className="v2-asst-laster"><span /><span /><span /></div>
          : m.feil ? <div key={m.id} className="v2-notat rod"><Ikon n="error" s={18} />{m.feil}</div>
          : m.kort && (
            <div key={m.id} className="v2-forslag">
              <div className="v2-forslag-merke">Forslag</div>
              <div className="v2-forslag-tittel">{m.kort.tittel}</div>
              <div className="v2-forslag-tekst">{m.kort.tekst}</div>
              {m.kort.punkter.map(p => <div key={p} className="v2-forslag-punkt"><Ikon n="check" s={16} />{p}</div>)}
              {!m.ferdig && m.kort.handling && (
                <div className="v2-knapprad">
                  <button type="button" className="v2-knapp primar liten" disabled={jobber || !!opptatt} onClick={() => utfor(m)}>{m.kort.handling.tekst}</button>
                  <button type="button" className="v2-knapp liten" onClick={() => setMeldinger(x => x.map(y => (y.id === m.id ? { ...y, ferdig: 'Forkastet' } : y)))}>Forkast</button>
                </div>
              )}
              {m.ferdig && <span className={`v2-flagg ${m.ferdig === 'Forkastet' ? 'gra' : 'gronn'}`}>{m.ferdig}</span>}
            </div>
          ))}
      </div>
      <div className="v2-asst-forslag">
        {forslag.map(([a, t]) => <button key={a} type="button" className="v2-pille" disabled={jobber} onClick={() => spor(a)}>{tekst(a, t)}</button>)}
        {!forslag.length && <span className="v2-hjelp">Assistenten lager bare forslag. Ingenting publiseres uten deg.</span>}
        <button type="button" className="v2-lenkeknapp" onClick={() => window.dispatchEvent(new CustomEvent('rf:assistent', { detail: { sporsmal: '' } }))}>Spør om noe annet</button>
      </div>
    </div>
  );
}
