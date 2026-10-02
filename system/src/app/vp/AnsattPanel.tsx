'use client';

import { useLeder, utseende, fravaerPa, tidsrom } from './ctx';
import { Ikon, Avatar, nf, dagKort, DagDm, periode, fornavn } from './felles';

/** Ansatt-panelet: uka, vaktene, tilgjengelighet, kontakt og fravær med saldo. */
export function AnsattPanel({ id, lukk }: { id: string; lukk: () => void }) {
  const { d, apne } = useLeder();
  const a = d.ansatte.find(x => x.id === id);
  if (!a) return null;
  const p = d.perAnsatt[id] ?? { arbeid: 0, overtid: 0, merarbeid: 0, avtalt: null };
  const ot = d.innstillinger.ot.on ? p.overtid : 0, mer = d.innstillinger.ot.on ? p.merarbeid : 0;
  const vakter = d.vakter.filter(v => v.ansattId === id).sort((x, y) => (x.dato + x.start).localeCompare(y.dato + y.start));
  const tilgj = d.tilgj.filter(t => t.ansattId === id && !fravaerPa(d, id, t.dato).length).sort((x, y) => x.dato.localeCompare(y.dato));
  const s = d.saldo[id];
  const fravaer = d.alleFravaer.filter(f => f.ansattId === id);
  const tlf = a.mobil ?? (a.kontakt && !a.kontakt.includes('@') ? a.kontakt : null);
  return (
    <div className="v2-panel">
      <div className="v2-ark-topp">
        <Avatar navn={a.navn} art="mork" s={52} />
        <div className="fyll"><div className="v2-ark-tittel">{a.navn}</div><div className="v2-ark-under">{a.stilling ?? 'Ansatt'}</div><div className="v2-ark-under">{a.lonnType === 'time' ? 'Timelønn' : `Fast ${a.stillingsprosent} % (${nf(Math.round(2250 * a.stillingsprosent / 100))} t/uke)`}</div></div>
        <button type="button" className="v2-rund liten" aria-label="Lukk" data-lukk onClick={lukk}><Ikon n="close" /></button>
      </div>
      <div className="v2-panel-innhold">
        <div className="v2-kort liten">
          <div className="v2-rad"><span className="v2-sm fyll">Uke {d.uke}</span><span className="v2-mono">{p.avtalt ? `${nf(p.arbeid)} / ${nf(p.avtalt)} t` : `${nf(p.arbeid)} t`}</span></div>
          {p.avtalt != null && <span className="v2-strek"><span style={{ width: `${Math.min(100, (p.arbeid / p.avtalt) * 100)}%` }} className={ot || mer ? 'gul' : ''} /></span>}
          {(ot > 0 || mer > 0) && <div className="v2-flagg gul">{ot > 0 ? `${nf(ot)} t overtid` : `${nf(mer)} t merarbeid`}</div>}
        </div>
        <div className="v2-stakk liten">
          <span className="v2-sm">Vakter</span>
          {!vakter.length && <div className="v2-tomlinje">Ingen vakter denne uka.</div>}
          {vakter.map(v => (
            <button key={v.id} type="button" className={`v2-panel-vakt ${utseende(d, v).art}`} onClick={() => d.endre && apne({ k: 'vakt', id: v.id, ansattId: v.ansattId, dato: v.dato })}>
              <span className="v2-panel-dag">{dagKort(v.dato)}. {Number(v.dato.slice(8))}</span><span className="v2-mono fyll">{v.start}–{v.slutt}</span><span className="v2-hjelp">{v.sted ?? v.type ?? ''}</span>
            </button>
          ))}
        </div>
        {d.innstillinger.avail.on && tilgj.length > 0 && (
          <div className="v2-stakk liten"><span className="v2-sm">Tilgjengelighet</span>
            {tilgj.map(t => <div key={t.dato} className={`v2-notat ${t.status === 'kan' ? 'gronn' : 'rod'}`}><Ikon n={t.status === 'kan' ? 'check_circle' : 'block'} s={18} />{DagDm(t.dato)}: {t.status === 'kan' ? `kan jobbe${tidsrom(t.timer, 'kan') ? ` ${tidsrom(t.timer, 'kan')}` : ''}` : `kan ikke${t.grunn ? ` (${t.grunn})` : ''}`}</div>)}
          </div>
        )}
        <div className="v2-stakk liten"><span className="v2-sm">Kontakt</span>
          {tlf && <a className="v2-kontakt" href={`tel:${tlf.replace(/\s/g, '')}`}><Ikon n="call" s={20} /><span className="v2-mono">{tlf}</span></a>}
          {a.epost && <a className="v2-kontakt" href={`mailto:${a.epost}`}><Ikon n="mail" s={20} />{a.epost}</a>}
          {!tlf && !a.epost && <div className="v2-hjelp">Ingen kontaktinfo. Legg den inn under Administrer ansatt.</div>}
        </div>
        {d.innstillinger.absence.on && (
          <div className="v2-stakk liten"><span className="v2-sm">Fravær og saldo</span>
            {s && <div className="v2-kort liten v2-saldoliste">
              <div><span>Ferie</span><span className="v2-mono">{s.ferieIgjen} dager igjen</span></div>
              <div><span>Avspasering</span><span className="v2-mono">{nf(s.avspMin)} t</span></div>
              <div><span>Egenmelding</span><span className="v2-mono">{s.egenBrukt} av 24 dager brukt</span></div>
            </div>}
            {fravaer.slice(0, 8).map(f => (
              <div key={f.id} className="v2-fravaer-linje"><Ikon n="event_busy" s={18} /><div className="fyll"><div>{f.type} · {f.fra === f.til ? DagDm(f.fra) : periode(f.fra, f.til, false)}</div><div className="v2-hjelp">{f.medLonn ? 'Med' : 'Uten'} lønn · {nf(f.timerMin)} t</div></div></div>
            ))}
            {d.endre && <button type="button" className="v2-knapp" onClick={() => apne({ k: 'fravaer', b: { kilde: 'ny', ansattId: id } })}><Ikon n="event_busy" s={18} />Registrer fravær</button>}
          </div>
        )}
        {d.endre && <button type="button" className="v2-knapp primar" onClick={() => apne({ k: 'vakt', ansattId: id, dato: d.dager.includes(d.idag) ? d.idag : d.dager[0] })}><Ikon n="add" s={18} />Lag vakt for {fornavn(a.navn)}</button>}
        {d.endre && <button type="button" className="v2-knapp" onClick={() => apne({ k: 'admin', id })}><Ikon n="manage_accounts" s={18} />Administrer ansatt</button>}
      </div>
    </div>
  );
}
