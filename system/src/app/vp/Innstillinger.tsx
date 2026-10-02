'use client';

import { useState } from 'react';
import { lagreInnstillingerHandling, lagreStederHandling, lagreMalerHandling } from '@/app/vaktplan-handlinger';
import { STANDARD_INNSTILLINGER, FRAVAERSTYPER, like, erStandard, byttKnapp, type VaktInnstillinger } from '@/lib/vaktplan-innstillinger';
import { useLeder } from './ctx';
import { Ikon, Bryter, nf } from './felles';

type K = keyof VaktInnstillinger;
type Under =
  | { t: 'seg'; f: string; label: string; opts: [string | number, string][] }
  | { t: 'check'; f: string; label: string }
  | { t: 'num'; f: string; label: string; unit: string; step: number; min: number; max: number }
  | { t: 'pay'; label: string };

const RADER: { k: K; navn: string; tekst: string; under?: Under[]; selskap?: boolean }[] = [
  { k: 'colleagues', navn: 'Ansatte ser kollegers vakter', tekst: 'De ansatte ser hvem som jobber samtidig med dem.', under: [{ t: 'seg', f: 'mode', label: 'Vis', opts: [['navn', 'Navn'], ['opptatt', 'Bare «opptatt»']] }] },
  { k: 'open', navn: 'Ledige vakter', tekst: 'De ansatte ser ledige vakter og kan melde interesse.', under: [{ t: 'seg', f: 'who', label: 'Hvem får vakten', opts: [['leder', 'Lederen velger'], ['forst', 'Først til mølla']] }, { t: 'check', f: 'warn', label: 'Vis advarsel om overtid' }] },
  { k: 'swap', navn: 'Bytte vakter', tekst: 'De ansatte kan bytte vakt med en kollega.', under: [{ t: 'check', f: 'approve', label: 'Lederen må godkjenne byttet' }, { t: 'check', f: 'sameType', label: 'Bare med kolleger som har samme vakttype' }] },
  { k: 'give', navn: 'Gi bort vakt', tekst: 'De ansatte kan gi bort en vakt, så den blir ledig.', under: [{ t: 'num', f: 'hours', label: 'Frist: minst', unit: 'timer før vakten', step: 12, min: 0, max: 168 }] },
  { k: 'avail', navn: 'Tilgjengelighet', tekst: 'De ansatte sier fra når de kan og ikke kan jobbe.', under: [{ t: 'seg', f: 'mode', label: 'Hvordan', opts: [['enkel', 'Enkel (dager)'], ['detaljert', 'Detaljert (tidsrom)']] }, { t: 'num', f: 'days', label: 'Frist: senest', unit: 'dager før uka publiseres', step: 1, min: 0, max: 30 }] },
  { k: 'absence', navn: 'Fravær', tekst: 'De ansatte søker om ferie og annet fravær.', under: [{ t: 'pay', label: 'Typer de kan søke om, og om de er med eller uten lønn som standard' }, { t: 'check', f: 'saldo', label: 'Vis saldo (feriedager igjen)' }] },
  { k: 'hours', navn: 'Timeregistrering og godkjenning', tekst: 'Du godkjenner timene før de går til lønn.', under: [{ t: 'check', f: 'dev', label: 'Ansatte kan melde avvik' }, { t: 'check', f: 'auto', label: 'Godkjenn automatisk når timene stemmer med vakten' }] },
  { k: 'ot', navn: 'Overtid og merarbeid', tekst: 'Systemet regner ut overtid og merarbeid og advarer deg.', under: [{ t: 'seg', f: 'add', label: 'Overtidstillegg', opts: [[40, '40 %'], [50, '50 %'], [100, '100 %']] }, { t: 'num', f: 'day', label: 'Grense per dag', unit: 't', step: 0.5, min: 6, max: 13 }, { t: 'num', f: 'week', label: 'Grense per uke', unit: 't', step: 0.5, min: 30, max: 48 }] },
  { k: 'rest', navn: 'Hviletid', tekst: 'Du får en advarsel hvis det er under 11 t mellom to vakter.' },
  { k: 'comments', navn: 'Kommentarer på vakter', tekst: 'Du og de ansatte kan skrive en kommentar på en vakt.' },
  { k: 'notif', navn: 'Varsler', tekst: 'De ansatte får beskjed på e-post. SMS kommer senere.', under: [{ t: 'check', f: 'pub', label: 'Ny uke er publisert' }, { t: 'check', f: 'chg', label: 'Endringer i vaktene deres' }, { t: 'check', f: 'ans', label: 'Svar på forespørsler' }] },
  { k: 'assistant', navn: 'Assistent i vaktplanen', tekst: 'Assistenten foreslår vaktplaner og hvem som kan ta ledige vakter.', selskap: true },
];

const kopi = (s: VaktInnstillinger): VaktInnstillinger => JSON.parse(JSON.stringify(s));

export function Innstillinger() {
  const { d, kjor, vis, opptatt } = useLeder();
  const [utkast, setUtkast] = useState<VaktInnstillinger>(() => kopi(d.innstillinger));
  const endret = !like(utkast, d.innstillinger);
  const sett = (k: K, f: string, v: unknown) => setUtkast(s => ({ ...s, [k]: { ...(s[k] as object), [f]: v } }));
  const std = erStandard(utkast);

  return (
    <div className="v2-stakk">
      <div className="v2-sidetopp">
        <div className="fyll"><h1 className="v2-h1">Innstillinger for vaktplanen</h1><div className="v2-hjelp">Du bestemmer hva de ansatte kan gjøre. Det du slår av, forsvinner helt for dem.</div></div>
        <div className="v2-knapprad">
          <span className={`v2-status ${std ? 'gronn' : 'gul'}`}><Ikon n={std ? 'verified' : 'tune'} s={18} />{std ? 'Standard' : 'Endret fra standard'}</span>
          {!std && d.endre && <button type="button" className="v2-knapp" onClick={() => setUtkast(kopi(STANDARD_INNSTILLINGER))}>Tilbakestill til standard</button>}
          {d.endre && <button type="button" className="v2-knapp primar" disabled={!endret || !!opptatt} onClick={() => kjor('innst', () => lagreInnstillingerHandling(utkast), (_, m) => vis(m ?? 'Lagret.'))}>Lagre</button>}
        </div>
      </div>
      <div className="v2-innst">
        <div className="v2-kort v2-innst-liste">
          {RADER.map(r => {
            const v = utkast[r.k] as unknown as Record<string, unknown> & { on: boolean };
            const last = r.selskap && !d.selskap;
            const pa = v.on && !last;
            return (
              <div key={r.k} className="v2-innst-rad">
                <div className="v2-innst-hode">
                  <div className="fyll"><div className="v2-innst-navn">{r.navn}</div><div className="v2-hjelp">{r.tekst}</div></div>
                  {last ? <span className="v2-flagg gra">Bare i Selskap</span> : <Bryter pa={v.on} etikett={r.navn} deaktivert={!d.endre} sett={x => sett(r.k, 'on', x)} />}
                </div>
                {pa && r.under && (
                  <div className="v2-innst-under">
                    {r.under.map(u => {
                      if (u.t === 'seg') return (
                        <div key={u.f} className="v2-innst-valg"><span>{u.label}</span>
                          <div className="v2-piller">{u.opts.map(([k, l]) => <button key={String(k)} type="button" className="v2-pille" aria-pressed={v[u.f] === k} onClick={() => sett(r.k, u.f, k)}>{l}</button>)}</div>
                        </div>
                      );
                      if (u.t === 'check') return (
                        <button key={u.f} type="button" role="checkbox" aria-checked={!!v[u.f]} className="v2-sjekk" onClick={() => sett(r.k, u.f, !v[u.f])}>
                          <Ikon n={v[u.f] ? 'check_box' : 'check_box_outline_blank'} s={22} fyll={!!v[u.f]} />{u.label}
                        </button>
                      );
                      if (u.t === 'num') return (
                        <div key={u.f} className="v2-stepper-rad"><span>{u.label}</span>
                          <div className="v2-stepper">
                            <button type="button" aria-label="Mindre" onClick={() => sett(r.k, u.f, Math.max(u.min, Number(v[u.f]) - u.step))}><Ikon n="remove" /></button>
                            <span className="v2-mono">{String(v[u.f]).replace('.', ',')}</span>
                            <button type="button" aria-label="Mer" onClick={() => sett(r.k, u.f, Math.min(u.max, Number(v[u.f]) + u.step))}><Ikon n="add" /></button>
                          </div>
                          <span className="v2-hjelp">{u.unit}</span>
                        </div>
                      );
                      const cfg = utkast.absence.cfg;
                      return (
                        <div key="pay" className="v2-innst-valg"><span>{u.label}</span>
                          <div className="v2-fravaertyper">
                            {FRAVAERSTYPER.map(t => (
                              <div key={t} className="v2-fravaertype">
                                <button type="button" role="checkbox" aria-checked={cfg[t].on} className="v2-sjekk" onClick={() => sett('absence', 'cfg', { ...cfg, [t]: { ...cfg[t], on: !cfg[t].on } })}>
                                  <Ikon n={cfg[t].on ? 'check_box' : 'check_box_outline_blank'} s={22} fyll={cfg[t].on} />{t}
                                </button>
                                {cfg[t].on && (
                                  <div role="group" aria-label={`Lønn for ${t}`} className="v2-seg liten">
                                    {([[true, 'Med lønn'], [false, 'Uten lønn']] as const).map(([k, l]) => <button key={l} type="button" aria-pressed={cfg[t].pay === k} onClick={() => sett('absence', 'cfg', { ...cfg, [t]: { ...cfg[t], pay: k } })}>{l}</button>)}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <Forhandsvisning s={utkast} />
      </div>
      <StederOgTyper />
    </div>
  );
}

/** «Slik ser det ut for de ansatte»: oppdateres mens lederen slår av og på, før lagring. */
function Forhandsvisning({ s }: { s: VaktInnstillinger }) {
  const knapp = byttKnapp(s);
  const knapper = [knapp && { t: knapp, i: 'swap_horiz' }, (s.avail.on || s.absence.on) && { t: 'Be om fri denne dagen', i: 'event_busy' }, s.comments.on && { t: 'Legg til kommentar', i: 'chat_bubble' }].filter(Boolean) as { t: string; i: string }[];
  const nav = [['Oversikt', 'home'], ['Vakter', 'calendar_month'], s.open.on && ['Ledige', 'front_hand'], s.hours.on && ['Timer', 'schedule'], ['Mer', 'menu']].filter(Boolean) as string[][];
  const mer = [s.avail.on && 'Tilgjengelighet', s.absence.on && 'Fravær', (s.swap.on || s.give.on) && 'Bytter', s.colleagues.on && 'Kolleger', 'Min side'].filter(Boolean).join(' · ');
  return (
    <aside className="v2-forh" aria-label="Forhåndsvisning">
      <div className="v2-sm">Slik ser det ut for de ansatte</div>
      <div className="v2-forh-telefon">
        <div className="v2-forh-innhold">
          <div className="v2-forh-vakt"><div className="v2-sm lys">Min vakt</div><div>Mandag 5. okt</div><div className="v2-mono stor">13:00–21:00</div></div>
          {s.colleagues.on && <div className="v2-forh-kollega"><span className="v2-avatar lys" style={{ width: 26, height: 26, fontSize: 10 }}>{s.colleagues.mode === 'navn' ? 'SN' : ''}</span><span className="fyll">{s.colleagues.mode === 'navn' ? 'Sara Nilsen' : 'Opptatt'}</span><span className="v2-mono">07:00–15:00</span></div>}
          {knapper.map(k => <div key={k.t} className="v2-forh-knapp"><Ikon n={k.i} s={16} />{k.t}</div>)}
          {!knapper.length && <div className="v2-hjelp">Den ansatte kan bare se vakten.</div>}
          {s.open.on && (
            <div className="v2-forh-ledig">
              <div className="v2-rad"><span className="fyll">Lør 10. okt · Midt</span><span className="v2-mono">10–18</span></div>
              {s.open.warn && s.ot.on && <span className="v2-flagg gul">Mer enn stillingen din (30 t totalt)</span>}
              <div className="v2-forh-ta">Jeg tar den</div>
              <div className="v2-hjelp">{s.open.who === 'leder' ? 'Lederen bestemmer hvem som får vakten.' : 'Den som trykker først, får vakten.'}</div>
            </div>
          )}
        </div>
        <div className="v2-forh-nav">{nav.map(([l, i]) => <div key={l}><Ikon n={i} s={18} /><span>{l}</span></div>)}</div>
      </div>
      <div className="v2-hjelp"><b>Under «Mer»:</b> {mer}</div>
    </aside>
  );
}

/** Steder (Sentrum, Brygga …) og vakttyper (malene i Lag vakt). */
function StederOgTyper() {
  const { d, kjor, vis, opptatt } = useLeder();
  const [steder, setSteder] = useState<string[]>(d.steder);
  const [nytt, setNytt] = useState('');
  const [maler, setMaler] = useState(d.maler.map(m => ({ ...m })));
  return (
    <div className="v2-to v2-to-topp">
      <section className="v2-kort v2-stakk liten">
        <div><div className="v2-innst-navn">Steder</div><div className="v2-hjelp">Har dere flere steder, kan du velge sted på vaktene og filtrere uka. Med ett eller ingen sted vises det ikke.</div></div>
        <div className="v2-piller">{steder.map(s => <span key={s} className="v2-pille statisk">{s}{d.endre && <button type="button" aria-label={`Fjern ${s}`} onClick={() => setSteder(x => x.filter(y => y !== s))}><Ikon n="close" s={16} /></button>}</span>)}</div>
        {d.endre && <div className="v2-rad"><input className="v2-input fyll" placeholder="Nytt sted, for eksempel Brygga" value={nytt} onChange={e => setNytt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && nytt.trim()) { setSteder(x => [...x, nytt.trim()]); setNytt(''); } }} /><button type="button" className="v2-knapp" disabled={!nytt.trim()} onClick={() => { setSteder(x => [...x, nytt.trim()]); setNytt(''); }}>Legg til</button></div>}
        {d.endre && <div><button type="button" className="v2-knapp primar" disabled={JSON.stringify(steder) === JSON.stringify(d.steder) || !!opptatt} onClick={() => kjor('steder', () => lagreStederHandling(steder), (_, m) => vis(m ?? 'Lagret.'))}>Lagre steder</button></div>}
      </section>
      <section className="v2-kort v2-stakk liten">
        <div><div className="v2-innst-navn">Vakttyper</div><div className="v2-hjelp">Malene du velger mellom når du lager en vakt.</div></div>
        {maler.map((m, i) => (
          <div key={i} className="v2-malrad">
            <input className="v2-input" aria-label="Navn" value={m.navn} onChange={e => setMaler(x => x.map((y, j) => (j === i ? { ...y, navn: e.target.value } : y)))} />
            <input className="v2-input v2-mono" type="time" aria-label="Start" value={m.start} onChange={e => setMaler(x => x.map((y, j) => (j === i ? { ...y, start: e.target.value } : y)))} />
            <input className="v2-input v2-mono" type="time" aria-label="Slutt" value={m.slutt} onChange={e => setMaler(x => x.map((y, j) => (j === i ? { ...y, slutt: e.target.value } : y)))} />
            {d.endre && <button type="button" className="v2-rund liten" aria-label={`Fjern ${m.navn}`} onClick={() => setMaler(x => x.filter((_, j) => j !== i))}><Ikon n="delete" s={18} /></button>}
          </div>
        ))}
        {d.endre && <div className="v2-knapprad"><button type="button" className="v2-knapp" disabled={maler.length >= 8} onClick={() => setMaler(x => [...x, { navn: '', start: '09:00', slutt: '17:00' }])}><Ikon n="add" s={18} />Ny vakttype</button>
          <button type="button" className="v2-knapp primar" disabled={!!opptatt} onClick={() => kjor('maler', () => lagreMalerHandling(maler), (_, m) => vis(m ?? 'Lagret.'))}>Lagre vakttyper</button></div>}
      </section>
      {void nf}
    </div>
  );
}
