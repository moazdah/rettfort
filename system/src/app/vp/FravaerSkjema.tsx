'use client';

import { useMemo, useState } from 'react';
import { behandleFravaerHandling } from '@/app/vaktplan-handlinger';
import type { Behandling } from '@/lib/tjenester/vaktplan';
import { analyserUke } from '@/lib/vaktplan';
import { FRAVAERSTYPER, grenser, type Fravaerstype } from '@/lib/vaktplan-innstillinger';
import { useLeder } from './ctx';
import { Ikon, ArkTopp, Seg, DagDm, dagKort, nf, fornavn, periode, plussDag } from './felles';

const hverdager = (fra: string, til: string) => { let n = 0; for (let x = fra; x <= til; x = plussDag(x, 1)) { const u = new Date(`${x}T12:00:00Z`).getUTCDay(); if (u && u !== 6) n++; } return n; };
const dager = (fra: string, til: string) => { let n = 0; for (let x = fra; x <= til; x = plussDag(x, 1)) n++; return n; };

/** Godkjenn eller avslå fri og fravær, eller registrer fravær (for eksempel en egenmelding). */
export function FravaerSkjema({ b, lukk }: { b: Behandling & { avslag?: boolean }; lukk: () => void }) {
  const { d, endre, opptatt } = useLeder();
  const inn = d.innstillinger, cfg = inn.absence.cfg;
  const fri = b.kilde === 'fri' ? d.foresp.fri.find(f => f.id === b.id) : null;
  const sok = b.kilde === 'fravaer' ? d.foresp.fravaer.find(f => f.id === b.id) : null;
  const ansattId = fri?.ansattId ?? sok?.ansattId ?? b.ansattId ?? '';
  const a = d.ansatte.find(x => x.id === ansattId);
  const [fra, setFra] = useState(fri?.dato ?? sok?.fra ?? (b.fra && d.dager.includes(b.fra) ? b.fra : d.dager.includes(d.idag) ? d.idag : d.dager[0]));
  const til = fri?.dato ?? sok?.til ?? fra;
  const aktive = FRAVAERSTYPER.filter(t => cfg[t].on);
  const startType: Fravaerstype = sok && (FRAVAERSTYPER as readonly string[]).includes(sok.type) ? (sok.type as Fravaerstype) : fri ? (cfg['Fri uten lønn'].on ? 'Fri uten lønn' : aktive[0] ?? 'Fri uten lønn') : cfg['Egenmelding'].on ? 'Egenmelding' : aktive[0] ?? 'Egenmelding';
  const [type, setType] = useState<Fravaerstype>(startType);
  const [lonn, setLonn] = useState(cfg[startType].pay);
  const [avslag, setAvslag] = useState(!!b.avslag);
  const [handling, setHandling] = useState<'ledig' | 'gi' | 'slett'>('ledig');
  const [giTil, setGiTil] = useState<string | null>(null);
  const [kommentar, setKommentar] = useState('');

  const n = fornavn(a?.navn ?? '');
  const iUka = fra >= d.dager[0] && til <= d.dager[6];
  const vakter = d.vakter.filter(v => v.ansattId === ansattId && v.dato >= fra && v.dato <= til);
  const antallVakter = iUka ? vakter.length : sok?.vakter ?? 0;
  const hh = vakter.reduce((s, v) => s + v.arbeid, 0);
  const datoTekst = fra === til ? DagDm(fra) : periode(fra, til, false);

  const payText = !hh && iUka ? 'Ingen planlagte timer denne dagen, så ingenting går til Lønn.'
    : lonn ? (type === 'Ferie' ? `Ferie: ${nf(hh)} t trekkes i lønn og dekkes av feriepenger.` : `Med lønn: ${nf(hh)} t går til Lønn som fravær med lønn.`)
    : `Uten lønn: ${nf(hh)} t trekkes, og ingenting betales.`;

  const s = d.saldo[ansattId];
  let saldo = '', minus = false;
  if (inn.absence.saldo && s) {
    if (type === 'Ferie') { const x = hverdager(fra, til); saldo = `Ferie: ${s.ferieIgjen} dager igjen → ${s.ferieIgjen - x}`; minus = s.ferieIgjen - x < 0; }
    if (type === 'Avspasering') { saldo = `Avspasering: ${nf(s.avspMin)} t → ${nf(s.avspMin - hh)} t`; minus = s.avspMin - hh < 0; }
    if (type === 'Egenmelding') { const x = dager(fra, til); saldo = `Egenmelding: ${s.egenBrukt} → ${s.egenBrukt + x} av 24 dager brukt`; minus = s.egenBrukt + x > 24; }
  }

  // Kolleger som kan ta vakten: ledige den dagen, de som kan jobbe først.
  const kandidater = useMemo(() => {
    const v = vakter[0];
    if (!v) return [];
    return d.ansatte.filter(x => x.id !== ansattId && !d.vakter.some(y => y.ansattId === x.id && y.dato === v.dato)).map(x => {
      const mine = d.vakter.filter(y => y.ansattId === x.id);
      const for_ = analyserUke(mine, [x], grenser(inn)).perAnsatt.get(x.id)!;
      const etter = analyserUke([...mine, { ...v, ansattId: x.id }], [x], grenser(inn)).perAnsatt.get(x.id)!;
      const t = d.tilgj.find(y => y.ansattId === x.id && y.dato === v.dato);
      const merknad = t?.status === 'kan_ikke' ? 'kan ikke' : t?.status === 'kan' ? 'kan jobbe' : inn.ot.on && etter.overtid > for_.overtid ? 'overtid' : inn.ot.on && etter.merarbeid > for_.merarbeid ? 'merarbeid' : '';
      return { id: x.id, navn: x.navn, merknad, rang: merknad === 'kan jobbe' ? 0 : merknad ? 2 : 1 };
    }).sort((p, q) => p.rang - q.rang);
  }, [vakter, d, ansattId, inn]);

  if (!a || (b.kilde !== 'ny' && !fri && !sok)) {
    return <div className="v2-skjema"><ArkTopp tittel="Forespørsel" lukk={lukk} /><div className="v2-skjema-innhold"><p>Forespørselen er allerede besvart.</p></div></div>;
  }
  const kanIkkeLagre = !avslag && antallVakter > 0 && handling === 'gi' && !giTil;
  const tittel = avslag ? 'Avslå forespørsel' : b.kilde === 'ny' ? 'Registrer fravær' : 'Godkjenn fravær';
  const lagre = () => endre('fravaer', () => behandleFravaerHandling({ kilde: b.kilde, id: b.id ?? null, ansattId, fra, til, avslag, type, medLonn: lonn, handling, giTil, kommentar }), lukk);
  const typer = FRAVAERSTYPER.filter(t => cfg[t].on || t === type);

  return (
    <div className="v2-skjema">
      <ArkTopp tittel={tittel} under={`${a.navn} · ${datoTekst}`} lukk={lukk} />
      <div className="v2-skjema-innhold">
        {(fri || sok) && <div className="v2-notat gra"><Ikon n="forum" s={18} />Søkte om: {fri ? 'Fri' : sok!.type}{(fri?.grunn || sok?.grunn) ? ` · «${fri?.grunn ?? sok?.grunn}»` : ''}</div>}
        {b.kilde === 'ny' && (
          <div className="v2-felt"><span className="v2-etikett">Dato</span>
            <div className="v2-dagvalg">{d.dager.map(x => <button key={x} type="button" aria-pressed={fra === x} aria-label={DagDm(x)} onClick={() => { setFra(x); setGiTil(null); }}><span>{dagKort(x)}.</span><b>{Number(x.slice(8))}</b></button>)}</div>
          </div>
        )}
        {!avslag ? (
          <>
            <div className="v2-felt"><span className="v2-etikett">Registrer som</span>
              <div className="v2-piller">{typer.map(t => <button key={t} type="button" className="v2-pille" aria-pressed={type === t} onClick={() => { setType(t); setLonn(cfg[t].pay); }}>{t}</button>)}</div>
            </div>
            <div className="v2-felt"><span className="v2-etikett">Lønn</span>
              <Seg etikett="Lønn" valg={[[true, 'Med lønn'], [false, 'Uten lønn']]} verdi={lonn} sett={setLonn} />
              <div className={`v2-notat ${lonn ? 'gronn' : 'gra'}`}><Ikon n={lonn ? 'payments' : 'money_off'} s={18} />{payText}</div>
              {lonn !== cfg[type].pay && <div className="v2-hjelp">Standard for {type.toLowerCase()} er {cfg[type].pay ? 'med' : 'uten'} lønn. Du har endret det for dette fraværet.</div>}
            </div>
            {saldo && (
              <div className="v2-felt"><span className="v2-etikett">Saldo</span>
                <div className={`v2-saldo ${minus ? 'minus' : ''}`}><Ikon n={minus ? 'warning' : 'account_balance_wallet'} s={18} /><span className="v2-mono">{saldo}</span></div>
                {minus && <div role="alert" className="v2-hjelp rod">Saldoen går under null.</div>}
              </div>
            )}
            {antallVakter > 0 && (
              <div className="v2-felt"><span className="v2-etikett">Vakten den dagen</span>
                <div className="v2-hjelp">{vakter.length === 1 ? `${n} har vakt ${vakter[0].start}–${vakter[0].slutt}${vakter[0].type || vakter[0].sted ? ` (${[vakter[0].type, vakter[0].sted].filter(Boolean).join(', ')})` : ''}. Hva skal skje med den?` : `${n} har ${antallVakter} vakter i perioden. Hva skal skje med dem?`}</div>
                <Seg etikett="Vakten" valg={[['ledig', 'Gjør ledig'], ...(vakter.length === 1 ? [['gi', 'Gi til …'] as ['gi', string]] : []), ['slett', vakter.length > 1 || !iUka ? 'Slett vaktene' : 'Slett vakten']]} verdi={handling} sett={setHandling} />
                {handling === 'gi' && (
                  <div className="v2-piller">
                    {kandidater.map(k => <button key={k.id} type="button" className="v2-pille" aria-pressed={giTil === k.id} onClick={() => setGiTil(k.id)}>{fornavn(k.navn)}{k.merknad && <span className={`v2-flagg ${k.merknad === 'kan jobbe' ? 'gronn' : k.merknad === 'kan ikke' ? 'rod' : 'gul'}`}>{k.merknad}</span>}</button>)}
                    {!kandidater.length && <span className="v2-hjelp">Alle andre har vakt den dagen.</span>}
                  </div>
                )}
              </div>
            )}
            <label className="v2-felt"><span className="v2-etikett">Kommentar til {n} (valgfritt)</span><textarea className="v2-input" rows={2} value={kommentar} onChange={e => setKommentar(e.target.value)} /></label>
          </>
        ) : (
          <label className="v2-felt"><span className="v2-etikett">Grunn (sendes til {n})</span><textarea className="v2-input" rows={3} placeholder="For eksempel: Vi er for få på jobb den dagen." value={kommentar} onChange={e => setKommentar(e.target.value)} /></label>
        )}
      </div>
      <div className="v2-skjema-bunn">
        {b.kilde !== 'ny' && <button type="button" className="v2-knapp tekst" onClick={() => setAvslag(x => !x)}>{avslag ? 'Godkjenn i stedet' : 'Avslå i stedet'}</button>}
        <span className="fyll" />
        <button type="button" className="v2-knapp" onClick={lukk}>Avbryt</button>
        <button type="button" className={`v2-knapp ${avslag ? 'rod' : 'primar'}`} disabled={kanIkkeLagre || !!opptatt} onClick={lagre}>{avslag ? 'Avslå' : b.kilde === 'ny' ? 'Registrer' : 'Godkjenn'}</button>
      </div>
    </div>
  );
}
