'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { VaktRad } from '@/lib/tjenester/vaktplan';
import { timer, arbeidMin, plussDager, type Tilgjengelig } from '@/lib/vaktplan';
import { interesseHandling, byttBortHandling, tilgjengeligHandling } from '@/app/vaktplan-handlinger';

type Ledig = VaktRad & { interessert: boolean; overtid: boolean; merarbeid: boolean; totalEtter: number };
const tid = (v: { start: string; slutt: string }) => `${v.start.slice(0, 5)}–${v.slutt.slice(0, 5)}`;
const DAG = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const MND = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
const dagTekst = (d: string) => { const x = new Date(`${d}T12:00:00Z`); const n = DAG[x.getUTCDay()]; return `${n[0].toUpperCase()}${n.slice(1)} ${x.getUTCDate()}. ${MND[x.getUTCMonth()]}`; };

const KORT = ['Søn', 'Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør'];
const dm = (d: string) => { const x = new Date(`${d}T12:00:00Z`); return `${x.getUTCDate()}. ${MND[x.getUTCMonth()]}`; };

function Dato({ d }: { d: string }) {
  const x = new Date(`${d}T12:00:00Z`);
  return <span className="vakt-dato"><small>{KORT[x.getUTCDay()]}</small><b>{x.getUTCDate()}</b></span>;
}

export function VaktAnsattFlate({ navn, idag, uke, ukeFra, ukeTil, mine, ledige, tilgj, fri, ukeArbeid, avtalt }: { navn: string; idag: string; uke: number; ukeFra: string; ukeTil: string; mine: VaktRad[]; ledige: Ledig[]; tilgj: Tilgjengelig[]; fri: { dato: string; status: string }[]; ukeArbeid: number; avtalt: number | null }) {
  const router = useRouter();
  const [fane, setFane] = useState<'mine' | 'ledige' | 'kan'>('mine');
  const [melding, setMelding] = useState<{ tekst: string; feil?: boolean } | null>(null);
  const [opptatt, setOpptatt] = useState('');
  const neste = mine[0];
  const kjor = async (id: string, fn: () => Promise<{ ok: boolean; feil?: string; melding?: string }>) => {
    setOpptatt(id); setMelding(null);
    const r = await fn();
    setOpptatt('');
    setMelding(r.ok ? (r.melding ? { tekst: r.melding } : null) : { tekst: r.feil!, feil: true });
    router.refresh();
  };
  const dager = Array.from({ length: 14 }, (_, i) => plussDager(idag, i));

  return (
    <main className="vakt-innhold">
      <div>
        <div className="mut liten">Uke {uke} · {dm(ukeFra)} – {dm(ukeTil)}</div>
        <h1 className="vakt-hei">Hei, {navn.split(' ')[0]}.</h1>
      </div>

      <section className="vakt-neste">
        <span className="vakt-neste-merke">Neste vakt</span>
        {neste ? <><b>{dagTekst(neste.dato)}</b><span className="mono">{tid(neste)}</span></> : <b>Ingen vakter fremover</b>}
        <strong className="mono">{timer(ukeArbeid)}</strong>
        <small>{avtalt ? `av ${timer(avtalt)} ` : ''}denne uka</small>
      </section>

      <nav className="faner vakt-faner">
        <button type="button" className={fane === 'mine' ? 'aktiv' : ''} onClick={() => setFane('mine')}>Mine vakter</button>
        <button type="button" className={fane === 'ledige' ? 'aktiv' : ''} onClick={() => setFane('ledige')}>Ledige{ledige.length ? <span className="teller">{ledige.length}</span> : null}</button>
        <button type="button" className={fane === 'kan' ? 'aktiv' : ''} onClick={() => setFane('kan')}>Kan jobbe</button>
      </nav>
      {melding && <div className={`varsel ${melding.feil ? 'rod' : 'gronn'} liten`}>{melding.tekst}</div>}

      {fane === 'mine' && (
        !mine.length ? <p className="mut">Du har ingen vakter fremover.</p> : (
          <div className="vakt-liste">
            {mine.map(v => (
              <div key={v.id} className="vakt-rad">
                <Dato d={v.dato} />
                <div className="fyll"><span className="mono">{tid(v)}</span><small className="mut">{timer(arbeidMin(v))}</small>
                  {v.utlagt && <small className="tekst-gul">Du vil bytte bort denne. Lederen bestemmer.</small>}</div>
                <button type="button" className="knapp hvit" disabled={!!opptatt} onClick={() => kjor(v.id, () => byttBortHandling(v.id, !v.utlagt))}>{v.utlagt ? 'Angre' : 'Bytt bort'}</button>
              </div>
            ))}
          </div>
        )
      )}

      {fane === 'ledige' && (
        <>
          {!ledige.length ? <p className="mut">Ingen ledige vakter akkurat nå.</p> : (
            <div className="vakt-liste">
              {ledige.map(v => (
                <div key={v.id} className="vakt-rad ledig">
                  <Dato d={v.dato} />
                  <div className="fyll"><span className="mono">{tid(v)}</span>
                    {v.interessert ? <small className="tekst-gronn">Du har meldt interesse</small>
                      : v.overtid ? <small className="mut">Gir deg overtid denne uka</small>
                      : v.merarbeid ? <small className="mut">Mer enn stillingen din ({timer(v.totalEtter)} totalt)</small> : null}</div>
                  <button type="button" className={`knapp ${v.interessert ? 'hvit' : ''}`} disabled={!!opptatt} onClick={() => kjor(v.id, () => interesseHandling(v.id, !v.interessert))}>{v.interessert ? 'Trekk meg' : 'Jeg tar den'}</button>
                </div>
              ))}
            </div>
          )}
          <p className="mut liten" style={{ margin: 0 }}>Når du melder interesse, bestemmer lederen hvem som får vakten. Du får beskjed på e-post.</p>
        </>
      )}

      {fane === 'kan' && (
        <>
          <p className="mut" style={{ margin: 0 }}>Si fra hvilke dager du kan og ikke kan jobbe. Lederen ser det når vaktplanen lages.</p>
          <div className="vakt-liste">
            {dager.map(d => <KanRad key={d} dato={d} t={tilgj.find(x => x.dato === d)} harVakt={mine.some(v => v.dato === d)} venterFri={fri.some(f => f.dato === d && f.status === 'venter')} opptatt={!!opptatt} kjor={kjor} />)}
          </div>
        </>
      )}
    </main>
  );
}

function KanRad({ dato, t, harVakt, venterFri, opptatt, kjor }: { dato: string; t?: Tilgjengelig; harVakt: boolean; venterFri: boolean; opptatt: boolean; kjor: (id: string, fn: () => Promise<{ ok: boolean; feil?: string; melding?: string }>) => void }) {
  const [grunn, setGrunn] = useState(t?.grunn ?? '');
  const [visGrunn, setVisGrunn] = useState(false);
  const status = t?.status ?? null;
  const sett = (s: 'kan' | 'kan_ikke' | null, g?: string) => kjor(dato, async () => {
    const r = await tilgjengeligHandling(dato, s, g);
    return r.ok && r.data?.friForesporsel ? { ok: true, melding: 'Du har vakt den dagen. Lederen har fått en forespørsel om fri.' } : r;
  });
  // Med vakt den dagen blir «Kan ikke» en forespørsel om fri. Da spør vi om grunn før vi sender.
  const kanIkke = () => { if (harVakt) setVisGrunn(true); else sett('kan_ikke', grunn); };
  const lagreGrunn = () => { if (status === 'kan_ikke' && grunn !== (t?.grunn ?? '')) sett('kan_ikke', grunn); };
  return (
    <div className="vakt-rad kan-rad">
      <div className="fyll"><b>{dagTekst(dato)}</b>
        {harVakt && <small className="mut">Du har vakt</small>}
        {venterFri && <small className="tekst-gul">Venter på svar om fri</small>}</div>
      <div className="vakt-valg" role="group" aria-label={`Kan du jobbe ${dagTekst(dato)}?`}>
        <button type="button" className={status === 'kan' ? 'valgt kan' : ''} disabled={opptatt} onClick={() => { setVisGrunn(false); sett('kan'); }}>Kan</button>
        <button type="button" className={status === null ? 'valgt' : ''} disabled={opptatt} onClick={() => { setVisGrunn(false); sett(null); }}>Ikke satt</button>
        <button type="button" className={status === 'kan_ikke' || visGrunn ? 'valgt kan-ikke' : ''} disabled={opptatt} onClick={kanIkke}>Kan ikke</button>
      </div>
      {visGrunn ? (
        <div className="rad" style={{ gap: 6, width: '100%', flexWrap: 'nowrap' }}>
          <input className="inndata" value={grunn} onChange={e => setGrunn(e.target.value)} placeholder="Grunn (valgfritt)" maxLength={120} autoFocus />
          <button type="button" className="knapp" disabled={opptatt} onClick={() => { setVisGrunn(false); sett('kan_ikke', grunn); }}>Be om fri</button>
        </div>
      ) : status === 'kan_ikke' && (
        <input className="inndata" value={grunn} onChange={e => setGrunn(e.target.value)} onBlur={lagreGrunn} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} placeholder="Grunn (valgfritt)" maxLength={120} aria-label="Grunn" />
      )}
    </div>
  );
}
