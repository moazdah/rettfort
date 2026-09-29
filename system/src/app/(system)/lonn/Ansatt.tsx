'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { lagreAnsatt } from '@/app/handlinger';
import { kr, tilOre } from '@/lib/penger';
import { TIMER_PER_MANED, type LonnTillegg, type LonnType } from '@/lib/tjenester/lonn';

export interface AnsattData {
  id?: string; navn: string; epost: string | null; stilling: string | null; lonn_type: LonnType; manedslonn: number; timesats: number; skatteprosent: number; kontonr: string | null; startdato: string | null;
  provisjon_prosent?: number; overtid_prosent?: number; stillingsprosent?: number; faste_tillegg?: LonnTillegg[] | string | null;
}

const TYPER: { k: LonnType; tittel: string; tekst: string }[] = [
  { k: 'fast', tittel: 'Fast månedslønn', tekst: 'Samme lønn hver måned.' },
  { k: 'time', tittel: 'Timelønn', tekst: 'Du skriver inn timene hver måned.' },
  { k: 'provisjon', tittel: 'Provisjon', tekst: 'Andel av salget, med eller uten fastlønn i bunn.' },
];

const pst = (v: string) => Number(v.replace(',', '.').replace('%', '').trim());
const pstTekst = (n: number | undefined, std: number) => String(n ?? std).replace('.', ',');
const tilleggFra = (v: AnsattData['faste_tillegg']): LonnTillegg[] => { try { const x = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(x) ? x : []; } catch { return []; } };

/** Ny eller endret ansatt. Delt i korte bolker, med et regneeksempel så man ser hva lønnen betyr. */
export function AnsattSkjema({ a, onFerdig, ferie = 10.2, agaSats = 14.1 }: { a?: AnsattData; onFerdig: () => void; ferie?: number; agaSats?: number }) {
  const router = useRouter();
  const [v, setV] = useState({
    navn: a?.navn ?? '', epost: a?.epost ?? '', stilling: a?.stilling ?? '', kontonr: a?.kontonr ?? '', startdato: a?.startdato ?? '',
    stillingsprosent: pstTekst(a?.stillingsprosent, 100), lonnType: (a?.lonn_type ?? 'fast') as LonnType,
    manedslonn: a && a.lonn_type !== 'time' && a.manedslonn ? kr(a.manedslonn) : '', timesats: a?.lonn_type === 'time' ? kr(a.timesats) : '',
    provisjon: pstTekst(a?.provisjon_prosent || undefined, 10), overtid: pstTekst(a?.overtid_prosent, 40), skatt: pstTekst(a?.skatteprosent, 30),
  });
  const [faste, setFaste] = useState(tilleggFra(a?.faste_tillegg).map(t => ({ tekst: t.tekst, belop: kr(t.belop), ferie: t.feriepengegrunnlag !== false })));
  const [visTillegg, setVisTillegg] = useState(tilleggFra(a?.faste_tillegg).length > 0 || Number(a?.overtid_prosent ?? 40) !== 40);
  const [feil, setFeil] = useState('');
  const [venter, setVenter] = useState(false);
  const sett = (e: Partial<typeof v>) => setV({ ...v, ...e });

  // Regneeksempel for en vanlig måned
  const fast = tilOre(v.manedslonn) ?? 0, time = tilOre(v.timesats) ?? 0;
  const fasteSum = faste.reduce((s, t) => s + (tilOre(t.belop) ?? 0), 0);
  const eksBrutto = (v.lonnType === 'time' ? Math.round(time * TIMER_PER_MANED * (pst(v.stillingsprosent) || 100) / 100) : fast) + fasteSum;
  const skattPst = pst(v.skatt) || 0;
  const eksNetto = eksBrutto - Math.floor((eksBrutto * skattPst) / 100 / 100) * 100;
  const eksKost = Math.round(eksBrutto * (1 + ferie / 100) * (1 + agaSats / 100));

  const lagre = async () => {
    setFeil(''); setVenter(true);
    const r = await lagreAnsatt({
      id: a?.id, navn: v.navn, epost: v.epost, stilling: v.stilling, kontonr: v.kontonr, startdato: v.startdato || undefined,
      lonnType: v.lonnType, manedslonn: v.lonnType === 'time' ? 0 : fast, timesats: v.lonnType === 'time' ? time : 0,
      skatteprosent: pst(v.skatt), provisjonProsent: v.lonnType === 'provisjon' ? pst(v.provisjon) : 0, overtidProsent: pst(v.overtid), stillingsprosent: pst(v.stillingsprosent),
      fasteTillegg: faste.map(t => ({ tekst: t.tekst, belop: tilOre(t.belop) ?? 0, feriepengegrunnlag: t.ferie })),
    });
    setVenter(false);
    if (!r.ok) { setFeil(r.feil); return; }
    router.refresh(); onFerdig();
  };

  return (
    <section className="kort stakk ansatt-skjema" style={{ gap: 22 }}>
      <div><h2>{a ? `Endre ${a.navn}` : 'Ny ansatt'}</h2><p className="mut liten" style={{ marginTop: 4 }}>Det du fyller inn her brukes hver gang du kjører lønn. Alt kan endres senere.</p></div>

      <div className="stakk" style={{ gap: 12 }}>
        <h3 className="bolk">1. Om den ansatte</h3>
        <div className="rutenett to">
          <label className="felt"><span>Navn</span><input className="inndata" value={v.navn} onChange={e => sett({ navn: e.target.value })} autoFocus={!a} /></label>
          <label className="felt"><span>Stilling</span><input className="inndata" value={v.stilling} onChange={e => sett({ stilling: e.target.value })} placeholder="F.eks. Selger" /></label>
          <label className="felt"><span>E-post</span><input className="inndata" type="email" value={v.epost} onChange={e => sett({ epost: e.target.value })} /><span className="hint">Lønnslippen sendes hit.</span></label>
          <label className="felt"><span>Kontonummer</span><input className="inndata mono" value={v.kontonr} onChange={e => sett({ kontonr: e.target.value })} placeholder="1234 56 78901" /><span className="hint">Lønnen betales hit.</span></label>
          <label className="felt"><span>Startdato</span><input className="inndata" type="date" value={v.startdato} onChange={e => sett({ startdato: e.target.value })} /></label>
          <label className="felt"><span>Stillingsprosent</span><input className="inndata mono" inputMode="decimal" value={v.stillingsprosent} onChange={e => sett({ stillingsprosent: e.target.value })} /><span className="hint">100 er full stilling. Står i a-meldingen.</span></label>
        </div>
      </div>

      <div className="stakk" style={{ gap: 12 }}>
        <h3 className="bolk">2. Hvordan får de lønn?</h3>
        <div className="lonnstyper">
          {TYPER.map(t => (
            <button type="button" key={t.k} className={`valgkort ${v.lonnType === t.k ? 'valgt' : ''}`} aria-pressed={v.lonnType === t.k} onClick={() => sett({ lonnType: t.k })}>
              <b>{t.tittel}</b><span className="mut liten">{t.tekst}</span>
            </button>
          ))}
        </div>
        <div className="rutenett to">
          {v.lonnType === 'fast' && <label className="felt"><span>Månedslønn (kr)</span><input className="inndata mono" inputMode="decimal" value={v.manedslonn} onChange={e => sett({ manedslonn: e.target.value })} placeholder="0,00" /></label>}
          {v.lonnType === 'time' && <label className="felt"><span>Timelønn (kr)</span><input className="inndata mono" inputMode="decimal" value={v.timesats} onChange={e => sett({ timesats: e.target.value })} placeholder="0,00" /></label>}
          {v.lonnType === 'provisjon' && <>
            <label className="felt"><span>Provisjon (% av salget)</span><input className="inndata mono" inputMode="decimal" value={v.provisjon} onChange={e => sett({ provisjon: e.target.value })} /><span className="hint">Du skriver inn salget hver måned, så regner vi ut provisjonen.</span></label>
            <label className="felt"><span>Fastlønn i bunn (kr i måneden)</span><input className="inndata mono" inputMode="decimal" value={v.manedslonn} onChange={e => sett({ manedslonn: e.target.value })} placeholder="0,00" /><span className="hint">La stå tom hvis de bare får provisjon.</span></label>
          </>}
        </div>
      </div>

      <div className="stakk" style={{ gap: 12 }}>
        <h3 className="bolk">3. Skatt</h3>
        <div className="rutenett to">
          <label className="felt"><span>Skattetrekk i prosent</span><input className="inndata mono" inputMode="decimal" value={v.skatt} onChange={e => sett({ skatt: e.target.value })} /><span className="hint">Står på skattekortet. Den ansatte finner det på skatteetaten.no.</span></label>
        </div>
      </div>

      <div className="stakk" style={{ gap: 12 }}>
        <div className="rad" style={{ justifyContent: 'space-between' }}>
          <h3 className="bolk">4. Overtid og faste tillegg <span className="mut" style={{ fontWeight: 400 }}>(valgfritt)</span></h3>
          {!visTillegg && <button type="button" className="lenke liten" onClick={() => setVisTillegg(true)}>Vis</button>}
        </div>
        {visTillegg && <>
          <div className="rutenett to">
            <label className="felt"><span>Overtidstillegg (%)</span><input className="inndata mono" inputMode="decimal" value={v.overtid} onChange={e => sett({ overtid: e.target.value })} /><span className="hint">Minst 40 % etter arbeidsmiljøloven. Du skriver inn overtidstimene når du kjører lønn.</span></label>
          </div>
          <span className="mut liten">Faste tillegg som kommer hver måned, for eksempel stillingstillegg eller skiftillegg:</span>
          {faste.map((t, i) => (
            <div key={i} className="rad fast-tillegg">
              <input className="inndata" value={t.tekst} onChange={e => setFaste(faste.map((x, j) => j === i ? { ...x, tekst: e.target.value } : x))} placeholder="Hva tillegget heter" />
              <input className="inndata mono" inputMode="decimal" value={t.belop} onChange={e => setFaste(faste.map((x, j) => j === i ? { ...x, belop: e.target.value } : x))} placeholder="Kr i måneden" />
              <label className="rad liten mut" style={{ flexWrap: 'nowrap' }}><input type="checkbox" checked={t.ferie} onChange={e => setFaste(faste.map((x, j) => j === i ? { ...x, ferie: e.target.checked } : x))} /> Gir feriepenger</label>
              <button type="button" className="knapp hvit liten" aria-label="Fjern" onClick={() => setFaste(faste.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <button type="button" className="lenke" style={{ alignSelf: 'flex-start' }} onClick={() => setFaste([...faste, { tekst: '', belop: '', ferie: true }])}>+ Fast tillegg</button>
        </>}
      </div>

      {eksBrutto > 0 && (
        <div className="lonn-eksempel">
          <div><small>{v.lonnType === 'time' ? `Vanlig måned (${String(Math.round(TIMER_PER_MANED * (pst(v.stillingsprosent) || 100) / 100 * 10) / 10).replace('.', ',')} timer)` : v.lonnType === 'provisjon' ? 'Uten provisjon' : 'Hver måned'}</small><b className="mono">{kr(eksBrutto)} kr</b><span className="mut liten">før skatt</span></div>
          <div><small>Utbetalt til den ansatte</small><b className="mono">{kr(eksNetto)} kr</b><span className="mut liten">etter {String(skattPst).replace('.', ',')} % skatt</span></div>
          <div><small>Koster bedriften</small><b className="mono">{kr(eksKost)} kr</b><span className="mut liten">med feriepenger og arbeidsgiveravgift</span></div>
        </div>
      )}

      {feil && <div className="varsel rod" role="alert">{feil}</div>}
      <div className="rad"><button type="button" className="knapp" disabled={venter} onClick={lagre}>{venter ? 'Lagrer …' : 'Lagre ansatt'}</button><button type="button" className="lenke" onClick={onFerdig}>Avbryt</button></div>
    </section>
  );
}
