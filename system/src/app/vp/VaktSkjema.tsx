'use client';

import { useMemo, useState } from 'react';
import { lagreVaktHandling, slettVaktHandling } from '@/app/vaktplan-handlinger';
import { advarsler, gyldigTid } from '@/lib/vaktplan';
import { grenser } from '@/lib/vaktplan-innstillinger';
import { useLeder, type Overlegg } from './ctx';
import { Ikon, ArkTopp, Seg, DagDm, dagKort, nf, varighet, fornavn, Avatar } from './felles';

/** Lag eller endre en vakt. Advarslene regnes ut mens man fyller ut; de stopper ingenting. */
export function VaktSkjema({ o, lukk }: { o: Extract<Overlegg, { k: 'vakt' }>; lukk: () => void }) {
  const { d, endre, opptatt } = useLeder();
  const finnes = o.id ? d.vakter.find(v => v.id === o.id) : null;
  const std = d.maler.find(m => m.navn === 'Kveld') ?? d.maler[0];
  const [ansattId, setAnsatt] = useState<string | null>(finnes ? finnes.ansattId : o.ansattId);
  const [dato, setDato] = useState(finnes?.dato ?? o.dato);
  const [type, setType] = useState<string | null>(finnes ? finnes.type : std?.navn ?? null);
  const [start, setStart] = useState(finnes?.start ?? std?.start ?? '13:00');
  const [slutt, setSlutt] = useState(finnes?.slutt ?? std?.slutt ?? '21:00');
  const [sted, setSted] = useState<string | null>(finnes ? finnes.sted : d.steder[0] ?? null);
  const [gjenta, setGjenta] = useState<'aldri' | 'uke' | 'annenhver'>('aldri');
  const [kommentar, setKommentar] = useState(finnes?.kommentar ?? '');

  const inn = d.innstillinger;
  const gyldig = gyldigTid(start) && gyldigTid(slutt) && start !== slutt;
  const varsler = useMemo(() => {
    if (!gyldig) return [];
    const a = d.ansatte.find(x => x.id === ansattId) ?? null;
    const andre = [...d.vakter, ...d.rundt].filter(v => v.id !== o.id);
    return advarsler({ ansattId, dato, start, slutt }, andre, a, d.tilgj, { grenser: grenser(inn), overtid: inn.ot.on, hviletid: inn.rest.on });
  }, [ansattId, dato, start, slutt, gyldig, d, o.id, inn]);

  const min = gyldig ? varighet(start, slutt) : 0;
  const pause = min > 330 ? `Pause 30 min · ${nf(min - 30)} t arbeid` : `Ingen pause · ${nf(min)} t`;
  const interesse = finnes && !finnes.ansattId ? finnes.interesse : [];
  const dobbeltFornavn = (n: string) => d.ansatte.filter(a => fornavn(a.navn) === fornavn(n)).length > 1;

  const lagre = () => endre('vakt', () => lagreVaktHandling({ id: o.id ?? null, ansattId, dato, start, slutt, type, sted, kommentar: inn.comments.on ? kommentar : finnes?.kommentar ?? null, gjenta: o.id ? 'aldri' : gjenta }), lukk);

  return (
    <div className="v2-skjema">
      <ArkTopp tittel={o.id ? 'Endre vakt' : 'Ny vakt'} under={`${DagDm(dato)}${sted ? ` · ${sted}` : ''}`} lukk={lukk} />
      <div className="v2-skjema-innhold">
        <div className="v2-felt">
          <span className="v2-etikett">Ansatt</span>
          <div className="v2-piller">
            <button type="button" className="v2-pille med-avatar" aria-pressed={ansattId === null} onClick={() => setAnsatt(null)}><span className="v2-avatar gul liten"><Ikon n="front_hand" s={14} /></span>Ledig</button>
            {d.ansatte.map(a => (
              <button key={a.id} type="button" className="v2-pille med-avatar" aria-pressed={ansattId === a.id} onClick={() => setAnsatt(a.id)}>
                <Avatar navn={a.navn} art={ansattId === a.id ? 'lys' : 'mork'} s={24} />{dobbeltFornavn(a.navn) ? a.navn : fornavn(a.navn)}
                {interesse.includes(a.id) && <span className="v2-flagg gul">interessert</span>}
              </button>
            ))}
          </div>
        </div>
        <div className="v2-felt">
          <span className="v2-etikett">Dato</span>
          <div className="v2-dagvalg">
            {d.dager.map(x => <button key={x} type="button" aria-pressed={dato === x} aria-label={DagDm(x)} onClick={() => setDato(x)}><span>{dagKort(x)}.</span><b>{Number(x.slice(8))}</b></button>)}
          </div>
        </div>
        <div className="v2-felt">
          <span className="v2-etikett">Mal</span>
          <div className="v2-maler">
            {d.maler.map(m => (
              <button key={m.navn} type="button" aria-pressed={type === m.navn && start === m.start && slutt === m.slutt} onClick={() => { setType(m.navn); setStart(m.start); setSlutt(m.slutt); }}>
                <span>{m.navn}</span><span className="v2-mono">{m.start}–{m.slutt}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="v2-tider">
          <label className="v2-felt"><span className="v2-etikett">Start</span><input type="time" className="v2-input v2-mono" value={start} onChange={e => setStart(e.target.value)} /></label>
          <label className="v2-felt"><span className="v2-etikett">Slutt</span><input type="time" className="v2-input v2-mono" value={slutt} onChange={e => setSlutt(e.target.value)} /></label>
          <div className="v2-pause"><Ikon n="coffee" s={18} />{gyldig ? pause : 'Skriv klokkeslett som 07:00.'}</div>
        </div>
        <div className="v2-to">
          {d.steder.length > 0 && <div className="v2-felt"><span className="v2-etikett">Sted</span><Seg etikett="Sted" valg={d.steder.map(s => [s, s] as [string, string])} verdi={sted ?? ''} sett={setSted} /></div>}
          {!o.id && <div className="v2-felt"><span className="v2-etikett">Gjenta</span><Seg etikett="Gjenta" valg={[['aldri', 'Aldri'], ['uke', 'Hver uke'], ['annenhver', 'Annenhver uke']]} verdi={gjenta} sett={setGjenta} /></div>}
        </div>
        {inn.comments.on && (
          <label className="v2-felt"><span className="v2-etikett">Kommentar</span><textarea className="v2-input" rows={2} placeholder="Synlig for den ansatte" value={kommentar} onChange={e => setKommentar(e.target.value)} /></label>
        )}
        {finnes?.ansattKommentar && inn.comments.on && <div className="v2-notat gra"><Ikon n="chat_bubble" s={18} />{d.ansatte.find(a => a.id === finnes.ansattId)?.navn ?? 'Den ansatte'}: «{finnes.ansattKommentar}»</div>}
        {interesse.length > 0 && <div className="v2-notat gul"><Ikon n="front_hand" s={18} />{interesse.map(i => d.ansatte.find(a => a.id === i)?.navn).filter(Boolean).join(' og ')} har meldt interesse.</div>}
        {varsler.length > 0 && (
          <div role="alert" className="v2-advarsler">
            {varsler.map(w => <div key={w}><Ikon n="warning" s={18} />{w}</div>)}
          </div>
        )}
      </div>
      <div className="v2-skjema-bunn">
        {o.id && <button type="button" className="v2-knapp rodtekst" disabled={!!opptatt} onClick={() => endre('slett', () => slettVaktHandling(o.id!), lukk)}><Ikon n="delete" s={18} />Slett</button>}
        <span className="fyll" />
        <button type="button" className="v2-knapp" onClick={lukk}>Avbryt</button>
        <button type="button" className="v2-knapp primar" disabled={!gyldig || !!opptatt} onClick={lagre}>{opptatt === 'vakt' ? 'Lagrer …' : varsler.length ? 'Lagre likevel' : 'Lagre'}</button>
      </div>
    </div>
  );
}
