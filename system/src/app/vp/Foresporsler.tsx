'use client';

import { useState } from 'react';
import { godkjennAlleHandling, godkjennTimerHandling } from '@/app/vaktplan-handlinger';
import { useLeder } from './ctx';
import { useSvarRader, SvarKort } from './Leder';
import { Ikon, TomTilstand, Teller, Avatar, nf, periode } from './felles';

/** Forespørsler (fri, bytter, ledige, fravær) og Timer, med teller på begge. */
export function Foresporsler({ fane, setFane }: { fane: 'req' | 'timer'; setFane: (f: 'req' | 'timer') => void }) {
  const { d, endre, opptatt } = useLeder();
  const alle = useSvarRader().filter(r => r.kind !== 'timer');
  const [filter, setFilter] = useState<'alle' | 'fri' | 'bytte' | 'ledig' | 'fravaer'>('alle');
  const liste = alle.filter(r => filter === 'alle' || r.kind === filter);
  const ventTimer = d.timer.flatMap(u => u.rader.filter(r => r.status === 'venter'));
  const iOrden = alle.filter(r => r.iOrden).length + ventTimer.filter(r => !r.avvik.length).length;
  const FILT: [typeof filter, string][] = [['alle', 'Alle'], ['fri', 'Fri'], ['bytte', 'Bytter'], ['ledig', 'Ledige'], ['fravaer', 'Fravær']];

  return (
    <div className="v2-stakk">
      <h1 className="v2-h1">Forespørsler og timer</h1>
      <div role="tablist" className="v2-faner">
        <button type="button" role="tab" aria-selected={fane === 'req'} onClick={() => setFane('req')}>Forespørsler<Teller n={alle.length} /></button>
        <button type="button" role="tab" aria-selected={fane === 'timer'} onClick={() => setFane('timer')}>Timer<Teller n={ventTimer.length} /></button>
      </div>
      {fane === 'req' ? (
        <>
          <div className="v2-filterrad">
            <div className="v2-piller rull">
              {FILT.map(([k, l]) => <button key={k} type="button" className="v2-pille" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l} ({k === 'alle' ? alle.length : alle.filter(r => r.kind === k).length})</button>)}
            </div>
            {d.endre && iOrden > 0 && <button type="button" className="v2-knapp" disabled={!!opptatt} onClick={() => endre('alle', () => godkjennAlleHandling())}><Ikon n="done_all" s={18} />Godkjenn alle som er i orden</button>}
          </div>
          {!liste.length ? <TomTilstand tittel="Alt er besvart." tekst="Du får beskjed på e-post når noen spør om noe." /> : <div className="v2-kortliste">{liste.map(r => <SvarKort key={r.key} r={r} visType />)}</div>}
        </>
      ) : (
        <div className="v2-stakk">
          <div className="v2-notat gronn"><Ikon n="payments" s={18} />Godkjente timer går rett til Lønn i regnskapet.</div>
          {d.timer.map(u => {
            const venter = u.rader.filter(r => r.status === 'venter');
            const stemmer = venter.filter(r => !r.avvik.length);
            return (
              <section key={`${u.aar}-${u.uke}`} className="v2-kort v2-timer">
                <div className="v2-timer-topp">
                  <div className="fyll"><div className="v2-timer-tittel">Uke {u.uke}, {periode(u.dager[0], u.dager[6], false)}</div><div className="v2-hjelp">{venter.length ? `${venter.length} venter på godkjenning` : u.rader.length ? 'Alt er godkjent' : 'Ingen timer denne uka'}</div></div>
                  <span className="v2-mono v2-timer-sum">{nf(u.rader.reduce((s, r) => s + r.arbeid + r.fravaer, 0))} t</span>
                  {d.endre && stemmer.length > 0 && <button type="button" className="v2-knapp primar liten" disabled={!!opptatt} onClick={() => endre('timer', () => godkjennTimerHandling(u.aar, u.uke, 'stemmer'))}>Godkjenn de som stemmer</button>}
                </div>
                {u.rader.map(r => (
                  <div key={r.ansattId} className="v2-timer-rad">
                    <Avatar navn={r.navn} s={36} />
                    <div className="fyll">
                      <div className="v2-timer-navn">{r.navn}</div>
                      <div className={`v2-timer-status ${r.status}`}><Ikon n={r.status === 'godkjent' ? 'check_circle' : 'radio_button_unchecked'} s={16} />{r.status === 'godkjent' ? 'Godkjent av leder' : 'Venter på godkjenning'}</div>
                      {r.avvikTekst.map(t => <div key={t} className="v2-flagg gul stor"><Ikon n="warning" s={14} />{t}</div>)}
                      {r.avvik.filter(x => x.tekst).map(x => <div key={x.id} className="v2-hjelp">«{x.tekst}»</div>)}
                    </div>
                    <span className="v2-mono">{nf(r.arbeid + r.fravaer)} t</span>
                    {d.endre && r.status === 'venter' && <button type="button" className="v2-knapp liten" disabled={!!opptatt} onClick={() => endre(`t${r.ansattId}`, () => godkjennTimerHandling(u.aar, u.uke, [r.ansattId]))}>Godkjenn</button>}
                  </div>
                ))}
              </section>
            );
          })}
          {d.alleFravaer.length > 0 && (
            <section className="v2-kort v2-timer">
              <div className="v2-timer-topp"><div className="fyll"><div className="v2-timer-tittel">Fravær til Lønn</div><div className="v2-hjelp">Godkjent fravær følger med timene til Lønn.</div></div></div>
              {d.alleFravaer.slice(0, 12).map(f => (
                <div key={f.id} className="v2-timer-rad">
                  <span className="v2-avatar rod" style={{ width: 36, height: 36 }}><Ikon n="event_busy" s={18} /></span>
                  <div className="fyll"><div className="v2-timer-navn">{f.navn}</div><div className="v2-hjelp">{f.type} · {f.fra === f.til ? periode(f.fra, f.til, false).replace(/^.*?–/, '') : periode(f.fra, f.til, false)}</div></div>
                  <span className={`v2-flagg ${f.medLonn ? 'gronn' : 'gra'}`}>{f.medLonn ? (f.type === 'Ferie' ? 'Feriepenger' : 'Med lønn') : 'Uten lønn'}</span>
                  <span className="v2-mono">{nf(f.timerMin)} t</span>
                </div>
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
