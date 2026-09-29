'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { kjorLonnHandling } from '@/app/handlinger';
import { beregnLonnslipp, grunntimesats, type LonnInput } from '@/lib/tjenester/lonn';
import { Maskot } from '@/components/Logo';
import { AnsattSkjema, type AnsattData } from './Ansatt';
import { kr, tilOre } from '@/lib/penger';
import { formaterKontonr, manedNavn, nd } from '@/lib/vis';

type A = AnsattData & { id: string };

export function LonnKjoring({ ansatte, periode, dato, ferie, agaSats, firma, orgnr, kanEndre }: { ansatte: A[]; periode: string; dato: string; ferie: number; agaSats: number; firma: string; orgnr: string | null; kanEndre: boolean }) {
  const router = useRouter();
  const [valgt, setValgt] = useState(ansatte[0]?.id ?? '');
  const [timer, setTimer] = useState<Record<string, string>>({});
  const [overtid, setOvertid] = useState<Record<string, string>>({});
  const [salg, setSalg] = useState<Record<string, string>>({});
  const [tillegg, setTillegg] = useState<Record<string, { tekst: string; belop: string }[]>>({});
  const [utbetaling, setUtbetaling] = useState(dato);
  const [ny, setNy] = useState(false);
  const [endre, setEndre] = useState(false);
  const [feil, setFeil] = useState('');
  const [venter, setVenter] = useState(false);
  const [ferdig, setFerdig] = useState<number | null>(null);

  const tall = (v: string | undefined) => Number((v ?? '0').replace(/\s/g, '').replace(',', '.')) || 0;
  const input: LonnInput[] = ansatte.map(a => ({ ansattId: a.id, timer: a.lonn_type === 'time' ? tall(timer[a.id]) : undefined, overtidTimer: tall(overtid[a.id]) || undefined, provisjonGrunnlag: a.lonn_type === 'provisjon' ? tilOre(salg[a.id] ?? '') ?? 0 : undefined, tillegg: (tillegg[a.id] ?? []).filter(t => t.tekst && tilOre(t.belop)).map(t => ({ tekst: t.tekst, belop: tilOre(t.belop) ?? 0 })) }));
  const slipper = useMemo(() => ansatte.map(a => { try { return beregnLonnslipp(a, input.find(i => i.ansattId === a.id)!, ferie, agaSats); } catch { return null; } }), [ansatte, input, ferie, agaSats]);
  const a = ansatte.find(x => x.id === valgt);
  const slipp = slipper[ansatte.findIndex(x => x.id === valgt)];
  const sumNetto = slipper.reduce((s, x) => s + (x?.netto ?? 0), 0);
  const sumAga = slipper.reduce((s, x) => s + (x?.aga ?? 0), 0);
  const kontroll: { t: string; ok: boolean }[] = [
    ...ansatte.filter(x => !x.kontonr).map(x => ({ t: `${x.navn} mangler kontonummer.`, ok: false })),
    ...ansatte.filter(x => !x.skatteprosent).map(x => ({ t: `${x.navn} har 0 % skattetrekk. Sjekk skattekortet.`, ok: false })),
    ...slipper.flatMap(x => x?.advarsler.map(t => ({ t, ok: false })) ?? []),
    ...ansatte.filter(x => x.lonn_type === 'time' && !tall(timer[x.id])).map(x => ({ t: `${x.navn} har ingen timer denne måneden. Får ikke lønn.`, ok: false })),
    ...ansatte.filter(x => x.lonn_type === 'provisjon' && !tilOre(salg[x.id] ?? '')).map(x => ({ t: `${x.navn} har ikke fått lagt inn salg denne måneden, så det blir ingen provisjon.`, ok: false })),
  ];
  if (!kontroll.length) kontroll.push({ t: 'Alt ser riktig ut. Lønnen føres i regnskapet når du kjører den.', ok: true });

  const kjor = async () => {
    setVenter(true); setFeil('');
    const r = await kjorLonnHandling(periode, utbetaling, input);
    setVenter(false);
    if (!r.ok) { setFeil(r.feil); return; }
    setFerdig(r.data!.bilagNr); router.refresh();
  };

  if (ferdig != null) return (
    <div className="kort rad" style={{ flexWrap: 'nowrap', alignItems: 'flex-start', gap: 18 }}>
      <Maskot storrelse={72} />
      <div><h2>Lønn for {manedNavn(periode)} er kjørt.</h2><p className="mut" style={{ marginTop: 6 }}>Ført som bilag {ferdig}. Betal {kr(sumNetto)} kr til de ansatte {nd(utbetaling)}. Skattetrekk og arbeidsgiveravgift finner du under Frister. A-meldingen sendes innen den 5. i neste måned. Tallene står klare under «Tidligere».</p></div>
    </div>
  );
  if (ny || !ansatte.length) return ny || kanEndre ? <AnsattSkjema onFerdig={() => setNy(false)} ferie={ferie} agaSats={agaSats} /> : <p className="mut">Ingen ansatte.</p>;
  if (endre && a) return <AnsattSkjema a={a} onFerdig={() => setEndre(false)} ferie={ferie} agaSats={agaSats} />;

  return (
    <div className="rutenett delt">
      <div className="stakk" style={{ gap: 16 }}>
        <section className="kort stakk">
          <div className="rad" style={{ justifyContent: 'space-between' }}><h2>{manedNavn(periode)[0].toUpperCase() + manedNavn(periode).slice(1)}</h2><label className="rad liten mut">Utbetales <input className="inndata" style={{ width: 160, padding: '6px 10px' }} type="date" value={utbetaling} onChange={e => setUtbetaling(e.target.value)} /></label></div>
          <div className="stakk" style={{ gap: 6 }}>
            {ansatte.map((x, i) => (
              <button type="button" key={x.id} className={`valgkort ${valgt === x.id ? 'valgt' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: 12 }} onClick={() => setValgt(x.id)}>
                <span className="avatar">{x.navn.split(' ').map(n => n[0]).slice(0, 2).join('')}</span>
                <span style={{ flex: 1 }}><b style={{ display: 'block', fontWeight: 600 }}>{x.navn}</b><span className="mut liten">{x.lonn_type === 'fast' ? `Fast · ${kr(x.manedslonn)} kr` : x.lonn_type === 'time' ? `Timelønn · ${kr(x.timesats)} kr/t` : `Provisjon ${String(x.provisjon_prosent ?? 0).replace('.', ',')} %${x.manedslonn ? ` + ${kr(x.manedslonn)} kr fast` : ''}`}</span></span>
                <span style={{ textAlign: 'right' }}><b className="belop" style={{ display: 'block' }}>{kr(slipper[i]?.netto ?? 0)}</b><span className="mut liten">utbetales</span></span>
              </button>
            ))}
          </div>
          {kanEndre && <button type="button" className="lenke" style={{ alignSelf: 'flex-start' }} onClick={() => setNy(true)}>+ Legg til ansatt</button>}
        </section>

        {a && (
          <section className="kort stakk">
            <div className="rad" style={{ justifyContent: 'space-between' }}><h2>{a.navn}</h2>{kanEndre && <button type="button" className="knapp hvit liten" onClick={() => setEndre(true)}>Endre</button>}</div>
            <div className="rutenett to">
              {a.lonn_type === 'time' && <label className="felt"><span>Timer i {manedNavn(periode, false)}</span><input className="inndata mono" inputMode="decimal" value={timer[a.id] ?? ''} onChange={e => setTimer({ ...timer, [a.id]: e.target.value })} placeholder="0" /></label>}
              {a.lonn_type === 'provisjon' && <label className="felt"><span>Salg som gir provisjon (kr)</span><input className="inndata mono" inputMode="decimal" value={salg[a.id] ?? ''} onChange={e => setSalg({ ...salg, [a.id]: e.target.value })} placeholder="0,00" /><span className="hint">{String(a.provisjon_prosent ?? 0).replace('.', ',')} % gir {kr(Math.round(((tilOre(salg[a.id] ?? '') ?? 0) * (a.provisjon_prosent ?? 0)) / 100))} kr i provisjon.</span></label>}
              <label className="felt"><span>Overtidstimer</span><input className="inndata mono" inputMode="decimal" value={overtid[a.id] ?? ''} onChange={e => setOvertid({ ...overtid, [a.id]: e.target.value })} placeholder="0" /><span className="hint">{kr(Math.round(grunntimesats(a) * (1 + (a.overtid_prosent ?? 40) / 100)))} kr per time ({String(a.overtid_prosent ?? 40).replace('.', ',')} % tillegg).</span></label>
            </div>
            <span className="mut liten">Legg til på lønnslippen denne måneden</span>
            {(tillegg[a.id] ?? []).map((t, i) => (
              <div key={i} className="rad" style={{ flexWrap: 'nowrap' }}>
                <input className="inndata" style={{ flex: 2 }} value={t.tekst} onChange={e => setTillegg({ ...tillegg, [a.id]: tillegg[a.id].map((x, j) => (j === i ? { ...x, tekst: e.target.value } : x)) })} placeholder="F.eks. bonus eller overtid" />
                <input className="inndata mono" style={{ flex: 1 }} inputMode="decimal" value={t.belop} onChange={e => setTillegg({ ...tillegg, [a.id]: tillegg[a.id].map((x, j) => (j === i ? { ...x, belop: e.target.value } : x)) })} placeholder="0,00" />
                <button type="button" className="knapp hvit liten" aria-label="Fjern" onClick={() => setTillegg({ ...tillegg, [a.id]: tillegg[a.id].filter((_, j) => j !== i) })}>×</button>
              </div>
            ))}
            <div className="rad">{['Bonus', 'Annet tillegg'].map(t => <button type="button" key={t} className="knapp hvit liten" onClick={() => setTillegg({ ...tillegg, [a.id]: [...(tillegg[a.id] ?? []), { tekst: t, belop: '' }] })}>+ {t}</button>)}</div>
            <p className="mut liten">Skattetrekk: {String(a.skatteprosent).replace('.', ',')} % fra skattekortet.</p>
          </section>
        )}

        <section className="kort stakk">
          <h2>Kontroll før du kjører lønn</h2>
          {kontroll.map((c, i) => <div key={i} className={`varsel ${c.ok ? 'gronn' : 'gul'}`}>{c.t}</div>)}
          <div className="mut liten">Arbeidsgiveravgift {kr(sumAga)} kr ({String(agaSats).replace('.', ',')} %) kommer i tillegg.</div>
        </section>
        {feil && <div className="varsel rod" role="alert">{feil}</div>}
        {kanEndre && (
          <div className="rad" style={{ justifyContent: 'space-between' }}>
            <span>Totalt til utbetaling <b className="belop">{kr(sumNetto)} kr</b></span>
            <button type="button" className="knapp" disabled={venter || sumNetto <= 0} onClick={() => { if (confirm(`Kjøre lønn for ${manedNavn(periode)}? Den føres i regnskapet og kan bare rettes med en korrigering.`)) kjor(); }}>{venter ? 'Kjører …' : `Kjør lønn for ${manedNavn(periode, false)}`}</button>
          </div>
        )}
      </div>

      {a && slipp && (
        <div className="forhandsvisning">
          <div className="stikk mut" style={{ marginBottom: 10 }}>Lønnslipp som {a.navn.split(' ')[0].toUpperCase()} får</div>
          <div className="dokument">
            <div className="rad" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div><b>{firma}</b><div className="mut">{orgnr ? `Org.nr ${orgnr.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')}` : ''}</div></div>
              <div style={{ textAlign: 'right' }}><b style={{ fontSize: 16 }}>Lønnslipp</b><div className="mut">{manedNavn(periode)}</div><div className="mut">Utbetalt {nd(utbetaling)}</div></div>
            </div>
            <div style={{ margin: '14px 0' }}><b>{a.navn}</b><div className="mut">{a.stilling ?? ''}{a.kontonr ? ` · konto ${formaterKontonr(a.kontonr)}` : ''}</div></div>
            <table><thead><tr><th>Beskrivelse</th><th style={{ textAlign: 'right' }}>Beløp</th></tr></thead>
              <tbody>
                {slipp.linjer.map((l, i) => <tr key={i}><td>{l.tekst}{l.antall != null ? ` · ${String(l.antall).replace('.', ',')} t à ${kr(l.sats ?? 0)}` : ''}</td><td className="belop" style={{ textAlign: 'right' }}>{kr(l.belop)}</td></tr>)}
                <tr><td>Skattetrekk {String(a.skatteprosent).replace('.', ',')} %</td><td className="belop" style={{ textAlign: 'right' }}>−{kr(slipp.skatt)}</td></tr>
              </tbody>
            </table>
            <div className="rad" style={{ justifyContent: 'space-between', fontWeight: 700, fontSize: 15, marginTop: 10 }}><span>Utbetalt</span><span className="belop">{kr(slipp.netto)} kr</span></div>
            <div className="mut liten" style={{ marginTop: 10 }}>Feriepenger opptjent denne måneden: {kr(slipp.feriepenger)} kr ({String(ferie).replace('.', ',')} %)</div>
          </div>
        </div>
      )}
    </div>
  );
}
