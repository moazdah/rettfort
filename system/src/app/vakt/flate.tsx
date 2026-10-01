'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { VaktRad } from '@/lib/tjenester/vaktplan';
import { kortTid, timer, arbeidMin, plussDager, type Tilgjengelig } from '@/lib/vaktplan';
import { interesseHandling, byttBortHandling, tilgjengeligHandling } from '@/app/vaktplan-handlinger';

type Ledig = VaktRad & { interessert: boolean; overtid: boolean; merarbeid: boolean };
const DAG = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const MND = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
const dagTekst = (d: string) => { const x = new Date(`${d}T12:00:00Z`); const n = DAG[x.getUTCDay()]; return `${n[0].toUpperCase()}${n.slice(1)} ${x.getUTCDate()}. ${MND[x.getUTCMonth()]}`; };

export function VaktAnsattFlate({ navn, idag, mine, ledige, tilgj, fri, ukeArbeid, avtalt }: { navn: string; idag: string; mine: VaktRad[]; ledige: Ledig[]; tilgj: Tilgjengelig[]; fri: { dato: string; status: string }[]; ukeArbeid: number; avtalt: number | null }) {
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
      <section className="vakt-neste">
        <small>Hei, {navn.split(' ')[0]}</small>
        {neste ? <><span>Neste vakt</span><b>{dagTekst(neste.dato)} · <span className="mono">{kortTid(neste.start, neste.slutt)}</span></b></> : <b>Ingen vakter fremover</b>}
        <small>{timer(ukeArbeid)}{avtalt ? ` av ${timer(avtalt)}` : ''} denne uka</small>
      </section>

      <nav className="faner vakt-faner">
        <button type="button" className={fane === 'mine' ? 'aktiv' : ''} onClick={() => setFane('mine')}>Mine vakter</button>
        <button type="button" className={fane === 'ledige' ? 'aktiv' : ''} onClick={() => setFane('ledige')}>Ledige{ledige.length ? <span className="teller">{ledige.length}</span> : null}</button>
        <button type="button" className={fane === 'kan' ? 'aktiv' : ''} onClick={() => setFane('kan')}>Kan jobbe</button>
      </nav>
      {melding && <div className={`varsel ${melding.feil ? 'rod' : 'gronn'} liten`}>{melding.tekst}</div>}

      {fane === 'mine' && (
        <div className="stakk" style={{ gap: 10 }}>
          {!mine.length && <p className="mut">Du har ingen vakter fremover.</p>}
          {mine.map(v => (
            <div key={v.id} className="vakt-rad">
              <div className="fyll"><b>{dagTekst(v.dato)}</b><span className="mono">{kortTid(v.start, v.slutt)}</span><small className="mut">{timer(arbeidMin(v))}</small>
                {v.utlagt && <small className="tekst-gul">Du vil bytte bort denne. Lederen bestemmer.</small>}</div>
              <button type="button" className="knapp hvit liten" disabled={!!opptatt} onClick={() => kjor(v.id, () => byttBortHandling(v.id, !v.utlagt))}>{v.utlagt ? 'Angre' : 'Bytt bort'}</button>
            </div>
          ))}
        </div>
      )}

      {fane === 'ledige' && (
        <div className="stakk" style={{ gap: 10 }}>
          {!ledige.length && <p className="mut">Ingen ledige vakter akkurat nå.</p>}
          {ledige.map(v => (
            <div key={v.id} className="vakt-rad">
              <div className="fyll"><b>{dagTekst(v.dato)}</b><span className="mono">{kortTid(v.start, v.slutt)}</span>
                {v.overtid && <small className="tekst-gul">Gir deg overtid denne uka</small>}
                {!v.overtid && v.merarbeid && <small className="tekst-gul">Mer enn stillingen din denne uka</small>}
                {v.interessert && <small className="mut">Du har sagt du kan ta den. Lederen bestemmer.</small>}</div>
              <button type="button" className={`knapp liten ${v.interessert ? 'hvit' : ''}`} disabled={!!opptatt} onClick={() => kjor(v.id, () => interesseHandling(v.id, !v.interessert))}>{v.interessert ? 'Trekk meg' : 'Jeg tar den'}</button>
            </div>
          ))}
        </div>
      )}

      {fane === 'kan' && (
        <div className="stakk" style={{ gap: 8 }}>
          <p className="mut liten" style={{ margin: 0 }}>Si fra hvilke dager du kan jobbe. Setter du «Kan ikke» på en dag du har vakt, blir det en forespørsel om fri til lederen.</p>
          {dager.map(d => <KanRad key={d} dato={d} t={tilgj.find(x => x.dato === d)} harVakt={mine.some(v => v.dato === d)} venterFri={fri.some(f => f.dato === d && f.status === 'venter')} opptatt={!!opptatt} kjor={kjor} />)}
        </div>
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
  return (
    <div className="vakt-rad kan-rad">
      <div className="fyll"><b>{dagTekst(dato)}</b>{harVakt && <small className="mut">Du har vakt</small>}{venterFri && <small className="tekst-gul">Venter på svar om fri</small>}{status === 'kan_ikke' && t?.grunn && <small className="mut">{t.grunn}</small>}</div>
      <div className="vakt-valg" role="group" aria-label={`Kan du jobbe ${dagTekst(dato)}?`}>
        <button type="button" className={status === 'kan' ? 'valgt kan' : ''} disabled={opptatt} onClick={() => sett('kan')}>Kan</button>
        <button type="button" className={status === null ? 'valgt' : ''} disabled={opptatt} onClick={() => sett(null)}>Ikke satt</button>
        <button type="button" className={status === 'kan_ikke' ? 'valgt kan-ikke' : ''} disabled={opptatt} onClick={() => { if (harVakt || status !== 'kan_ikke') setVisGrunn(true); else sett('kan_ikke'); }}>Kan ikke</button>
      </div>
      {visGrunn && (
        <div className="rad" style={{ gap: 6, flexBasis: '100%', flexWrap: 'nowrap' }}>
          <input className="inndata" value={grunn} onChange={e => setGrunn(e.target.value)} placeholder="Grunn (valgfritt)" maxLength={120} autoFocus />
          <button type="button" className="knapp liten" disabled={opptatt} onClick={() => { setVisGrunn(false); sett('kan_ikke', grunn); }}>{harVakt ? 'Be om fri' : 'Lagre'}</button>
        </div>
      )}
    </div>
  );
}
