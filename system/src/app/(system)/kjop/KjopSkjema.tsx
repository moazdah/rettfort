'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { KontoVelger, KJOPSKONTOER } from '@/components/KontoVelger';
import { Maskot } from '@/components/Logo';
import { registrerKjopHandling, lagreKjopUtkastHandling, rettKjopHandling, kontrollKjopHandling, lastOppVedlegg } from '@/app/handlinger';
import type { KjopInput, Funn } from '@/lib/tjenester/kjop';
import { konto as finnKonto } from '@/lib/kontoplan';
import { kr, tilOre, splittBrutto } from '@/lib/penger';
import type { BetaltMed } from '@/lib/hovedbok';

export interface KjopStart {
  id?: string; leverandorNavn?: string; leverandorOrgnr?: string | null; dato?: string; forfall?: string | null; tekst?: string | null;
  total?: number; mva?: number; sats?: number; konto?: number; betaltMed?: BetaltMed; deler?: { konto: number; brutto: number; sats: number }[] | null;
  vedleggId?: string | null; vedleggNavn?: string | null; viderefakturerKontaktId?: string | null; kilde?: string | null;
}

const ore = (t: string) => tilOre(t) ?? 0;
const tekstKr = (o: number | undefined) => (o ? kr(o) : '');

export function KjopSkjema({ start, idag, mvaRegistrert, kunder, bilagEpost, modus, pakke }: {
  start?: KjopStart; idag: string; mvaRegistrert: boolean; kunder: { id: string; navn: string }[]; bilagEpost: string;
  modus: 'ny' | 'utkast' | 'rett'; pakke: string;
}) {
  const router = useRouter();
  const [fase, setFase] = useState<'tom' | 'arbeid' | 'ferdig'>(start ? 'arbeid' : 'tom');
  const [lev, setLev] = useState(start?.leverandorNavn ?? '');
  const [orgnr, setOrgnr] = useState(start?.leverandorOrgnr ?? '');
  const [dato, setDato] = useState(start?.dato ?? idag);
  const [tekst, setTekst] = useState(start?.tekst ?? '');
  const [total, setTotal] = useState(tekstKr(start?.total));
  const [sats, setSats] = useState(start?.sats ?? (mvaRegistrert ? 25 : 0));
  const [mva, setMva] = useState(tekstKr(start?.mva));
  const [mvaRort, setMvaRort] = useState(!!start?.mva);
  const [konto, setKonto] = useState(start?.konto ?? 6800);
  const [kontoValgt, setKontoValgt] = useState(!!start?.konto);
  const [betaltMed, setBetaltMed] = useState<BetaltMed>(start?.betaltMed ?? 'bank');
  const [forfall, setForfall] = useState(start?.forfall ?? '');
  const [deler, setDeler] = useState<{ konto: number; brutto: string }[] | null>(start?.deler?.length ? start.deler.map(d => ({ konto: d.konto, brutto: kr(d.brutto) })) : null);
  const [vf, setVf] = useState(start?.viderefakturerKontaktId ?? '');
  const [vedlegg, setVedlegg] = useState<{ id: string; navn: string } | null>(start?.vedleggId ? { id: start.vedleggId, navn: start.vedleggNavn ?? 'Kvittering' } : null);
  const [kilde, setKilde] = useState(start?.kilde ?? 'manuell');
  const [funn, setFunn] = useState<Funn[]>([]);
  const [forslag, setForslag] = useState<{ nr: number; navn: string; grunn: string } | null>(null);
  const [feil, setFeil] = useState('');
  const [venter, setVenter] = useState(false);
  const [laster, setLaster] = useState(false);
  const [ferdig, setFerdig] = useState<{ bilagNr: number; id: string } | null>(null);
  const [overstyr, setOverstyr] = useState(false);
  const filRef = useRef<HTMLInputElement>(null);

  const totalOre = ore(total);
  // MVA regnes ut fra totalen til brukeren skriver et eget beløp.
  useEffect(() => { if (!mvaRort) setMva(sats && totalOre ? kr(splittBrutto(totalOre, sats).mva) : ''); }, [totalOre, sats, mvaRort]);

  const input = (): KjopInput => ({
    id: modus === 'utkast' ? start?.id : undefined,
    leverandorNavn: lev, leverandorOrgnr: orgnr || null, dato, forfall: betaltMed === 'ubetalt' ? forfall || null : null, tekst: tekst || null,
    total: totalOre, mva: sats ? ore(mva) : 0, sats, konto,
    deler: deler ? deler.map(d => ({ konto: d.konto, brutto: ore(d.brutto), sats })) : undefined,
    betaltMed, fradrag: sats > 0, vedleggId: vedlegg?.id ?? null, viderefakturerKontaktId: vf || null, kilde,
  });

  // Live kontroll mens brukeren skriver.
  useEffect(() => {
    if (fase !== 'arbeid') return;
    const h = setTimeout(async () => {
      const r = await kontrollKjopHandling(input(), modus === 'rett' ? start?.id : undefined);
      if (r.ok && r.data) {
        setFunn(r.data.funn); setForslag(r.data.forslag);
        if (r.data.forslag && !kontoValgt) setKonto(r.data.forslag.nr);
      }
    }, 350);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase, lev, orgnr, dato, total, mva, sats, konto, deler, betaltMed, vedlegg, kilde]);

  const eksempel = () => {
    setLev('Nordlys Kontor AS'); setTekst('Skriverpapir, toner og arkivbokser'); setTotal('1 800,00'); setSats(25); setMvaRort(true); setMva('360,00'); setDato(idag); setKilde('eksempel'); setFase('arbeid');
  };
  const lastOpp = async (f: File) => {
    setLaster(true); setFeil('');
    const fd = new FormData(); fd.set('fil', f);
    const r = await lastOppVedlegg(fd);
    setLaster(false);
    if (!r.ok) { setFeil(r.feil); return; }
    setVedlegg(r.data!); setKilde('kvittering'); setFase('arbeid');
  };
  const utfor = (f: Funn) => {
    if (f.kode === 'mva_sum') { setMvaRort(false); }
    if (f.kode === 'ikke_mva_reg') { setSats(0); setMvaRort(false); }
    if (f.kode === 'kvittering') filRef.current?.click();
  };

  const blokkerer = funn.filter(f => ['leverandor', 'total', 'deling'].includes(f.kode));
  const advarsler = funn.filter(f => f.alvor === 'hoy' && !blokkerer.includes(f));
  const kanRegistrere = !blokkerer.length && (!advarsler.length || overstyr) && !venter;

  const registrer = async () => {
    setVenter(true); setFeil('');
    const r = modus === 'rett' && start?.id ? await rettKjopHandling(start.id, input()) : await registrerKjopHandling(input());
    setVenter(false);
    if (!r.ok) { setFeil(r.feil); return; }
    setFerdig({ bilagNr: r.data!.bilagNr, id: r.data!.id });
    setFase('ferdig');
    router.refresh();
  };
  const lagreUtkast = async () => {
    setVenter(true); setFeil('');
    const r = await lagreKjopUtkastHandling(input());
    setVenter(false);
    if (!r.ok) { setFeil(r.feil); return; }
    router.push('/kjop');
  };
  const nullstill = () => { router.push('/kjop/ny'); router.refresh(); setFase('tom'); setLev(''); setOrgnr(''); setTotal(''); setMva(''); setMvaRort(false); setTekst(''); setVedlegg(null); setDeler(null); setKontoValgt(false); setFunn([]); setFerdig(null); setOverstyr(false); setKilde('manuell'); };

  const delSum = deler ? deler.reduce((s, d) => s + ore(d.brutto), 0) : 0;

  if (fase === 'ferdig' && ferdig) return (
    <div className="kort rad" style={{ flexWrap: 'nowrap', alignItems: 'flex-start', gap: 18 }}>
      <Maskot storrelse={72} />
      <div style={{ flex: 1 }}>
        <h2>{modus === 'rett' ? 'Kjøpet er rettet.' : 'Kjøpet er registrert.'}</h2>
        <p className="mut" style={{ marginTop: 6 }}>{ferdig.bilagNr ? `Bilag ${ferdig.bilagNr} · ` : ''}{lev} · {kr(totalOre)} kr · ført på {finnKonto(konto)?.navn.toLowerCase()}.{vedlegg ? ' Kvitteringen er lagret sammen med bilaget.' : ''}</p>
        <div className="rad" style={{ marginTop: 14 }}>
          <button type="button" className="knapp" onClick={nullstill}>Nytt kjøp</button>
          <Link href={`/kjop/${ferdig.id}`} className="knapp hvit">Se kjøpet</Link>
          <Link href="/kjop" className="knapp hvit">Gå til oversikt</Link>
        </div>
      </div>
    </div>
  );

  const filfelt = <input ref={filRef} type="file" accept="image/*,application/pdf,.xml" capture="environment" hidden onChange={e => { const f = e.target.files?.[0]; if (f) lastOpp(f); e.target.value = ''; }} />;

  if (fase === 'tom') return (
    <div
      className="kort tom stakk" style={{ borderStyle: 'dashed', borderWidth: 2, alignItems: 'center', padding: '44px 20px' }}
      onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) lastOpp(f); }}
    >
      {filfelt}
      <h2>Slipp kvitteringen her</h2>
      <p className="mut" style={{ maxWidth: 480 }}>Bilde, PDF eller EHF. Du kan også ta bilde med mobilen eller videresende til <span className="mono">{bilagEpost}</span>.</p>
      <div className="rad" style={{ justifyContent: 'center' }}>
        <button type="button" className="knapp" onClick={() => filRef.current?.click()} disabled={laster}>{laster ? 'Laster opp …' : 'Velg fil eller ta bilde'}</button>
        <button type="button" className="knapp hvit" onClick={eksempel}>Bruk eksempelkvittering</button>
        <button type="button" className="knapp hvit" onClick={() => { setKilde('uten_kvittering'); setFase('arbeid'); }}>Fyll ut uten kvittering</button>
      </div>
      {feil && <div className="varsel rod">{feil}</div>}
    </div>
  );

  return (
    <div className={`rutenett ${vedlegg ? 'delt kvittering' : ''}`}>
      {filfelt}
      {vedlegg && (
        <div className="forhandsvisning">
          <div className="rad" style={{ justifyContent: 'space-between', marginBottom: 10 }}><b className="liten">{vedlegg.navn}</b><a className="lenke liten" href={`/api/vedlegg/${vedlegg.id}`} target="_blank" rel="noreferrer">Åpne</a></div>
          <object data={`/api/vedlegg/${vedlegg.id}`} style={{ width: '100%', minHeight: 420, borderRadius: 8, background: '#fff' }} aria-label="Kvitteringen">
            <a href={`/api/vedlegg/${vedlegg.id}`}>Åpne kvitteringen</a>
          </object>
        </div>
      )}
      <div className="stakk" style={{ gap: 18 }}>
        <section className="kort stakk">
          <div className="rad" style={{ justifyContent: 'space-between' }}>
            <h2>{kilde === 'kvittering' ? 'Fyll ut fra kvitteringen' : kilde === 'eksempel' ? 'Eksempelkvittering' : 'Om kjøpet'}</h2>
            {!vedlegg && <button type="button" className="lenke" onClick={() => filRef.current?.click()}>{laster ? 'Laster opp …' : 'Legg ved kvittering'}</button>}
          </div>
          {kilde === 'kvittering' && <div className="varsel info liten">Automatisk lesing av kvitteringen slås på når AI-lesing er koblet til{pakke === 'gratis' ? ' (med i Start)' : ''}. Skriv inn tallene i mellomtiden. Kontrollen under sjekker summen.</div>}
          <div className="rutenett to">
            <label className="felt"><span>Hvem har du kjøpt fra?</span><input className="inndata" value={lev} onChange={e => setLev(e.target.value)} placeholder="Butikk eller firma" /></label>
            <label className="felt"><span>Dato på kvitteringen</span><input className="inndata" type="date" value={dato} onChange={e => setDato(e.target.value)} /></label>
          </div>
          <label className="felt"><span>Hva kjøpte du? (valgfritt)</span><input className="inndata" value={tekst} onChange={e => setTekst(e.target.value)} placeholder="For eksempel toner og papir" /></label>
          <div className="rutenett tre">
            <label className="felt"><span>Beløp med MVA</span><input className="inndata mono" inputMode="decimal" value={total} onChange={e => setTotal(e.target.value)} onBlur={() => totalOre && setTotal(kr(totalOre))} placeholder="0,00" /></label>
            <label className="felt"><span>MVA-sats</span>
              <select className="inndata" value={sats} onChange={e => { setSats(Number(e.target.value)); setMvaRort(false); }} disabled={!mvaRegistrert}>
                <option value={25}>25 %</option><option value={15}>15 % (mat)</option><option value={12}>12 % (transport, hotell)</option><option value={0}>Ingen MVA</option>
              </select>
            </label>
            <label className="felt"><span>Herav MVA</span><input className="inndata mono" inputMode="decimal" value={sats ? mva : ''} disabled={!sats} onChange={e => { setMva(e.target.value); setMvaRort(true); }} placeholder="0,00" /></label>
          </div>
          {!mvaRegistrert && <p className="hint">Foretaket er ikke MVA-registrert, så hele beløpet føres som kostnad.</p>}

          {!deler ? (
            <>
              <KontoVelger verdi={konto} onVelg={n => { setKonto(n); setKontoValgt(true); }} forslag={forslag} />
              <button type="button" className="lenke" style={{ alignSelf: 'flex-start' }} onClick={() => setDeler([{ konto, brutto: total }, { konto: 5910, brutto: '' }])}>Del beløpet på flere typer kjøp</button>
            </>
          ) : (
            <div className="stakk" style={{ gap: 8 }}>
              <span className="mut liten">For eksempel en PC og kaffe på samme kvittering. Beløp med MVA.</span>
              {deler.map((d, i) => (
                <div key={i} className="rad" style={{ flexWrap: 'nowrap' }}>
                  <select className="inndata" style={{ flex: 2 }} value={d.konto} onChange={e => setDeler(deler.map((x, j) => (j === i ? { ...x, konto: Number(e.target.value) } : x)))}>
                    {KJOPSKONTOER.map(k => <option key={k.nr} value={k.nr}>{k.navn}</option>)}
                  </select>
                  <input className="inndata mono" style={{ flex: 1 }} inputMode="decimal" value={d.brutto} onChange={e => setDeler(deler.map((x, j) => (j === i ? { ...x, brutto: e.target.value } : x)))} placeholder="0,00" aria-label="Beløp" />
                </div>
              ))}
              <div className="rad" style={{ justifyContent: 'space-between' }}>
                <span className={`liten ${delSum === totalOre ? 'mut' : ''}`} style={{ color: delSum === totalOre ? undefined : 'var(--rod)' }}>{delSum === totalOre ? 'Alt er fordelt.' : `${kr(totalOre - delSum)} kr gjenstår å fordele.`}</span>
                <span className="rad"><button type="button" className="lenke" onClick={() => setDeler([...deler, { konto: 7790, brutto: '' }])}>+ Én til</button><button type="button" className="lenke" onClick={() => setDeler(null)}>Bruk én type</button></span>
              </div>
            </div>
          )}

          <div className="stakk" style={{ gap: 8 }}>
            <span className="mut liten">Hvordan ble det betalt?</span>
            <div className="rutenett to" style={{ gap: 8 }}>
              {([['bank', 'Firmakort eller bank', 'Pengene er trukket fra firmakontoen.'], ['ubetalt', 'Ikke betalt ennå', 'En regning du skal betale senere.'], ['privat', 'Med egne penger', 'Et utlegg firmaet skylder deg.'], ['kontant', 'Kontant', 'Fra kassen.']] as const).map(([v, t, d]) => (
                <button type="button" key={v} className={`valgkort ${betaltMed === v ? 'valgt' : ''}`} style={{ padding: '10px 12px' }} onClick={() => setBetaltMed(v)}><b style={{ fontWeight: 600, display: 'block' }}>{t}</b><span className="mut liten">{d}</span></button>
              ))}
            </div>
            {betaltMed === 'ubetalt' && <label className="felt"><span>Forfallsdato</span><input className="inndata" type="date" value={forfall} onChange={e => setForfall(e.target.value)} /></label>}
          </div>

          {kunder.length > 0 && (
            <label className="felt"><span>Skal faktureres videre til en kunde? (valgfritt)</span>
              <select className="inndata" value={vf} onChange={e => setVf(e.target.value)}><option value="">Nei</option>{kunder.map(k => <option key={k.id} value={k.id}>{k.navn}</option>)}</select>
              {vf && <span className="hint">Neste gang du lager faktura til kunden, foreslår vi å legge det til.</span>}
            </label>
          )}
        </section>

        <section className="kort stakk">
          <h2>Kontroll før du registrerer</h2>
          {funn.length === 0 && <div className="varsel gronn">Alt ser riktig ut.</div>}
          {funn.map(f => (
            <div key={f.kode} className={`varsel ${f.alvor === 'hoy' ? 'rod' : f.alvor === 'middels' ? 'gul' : 'info'}`}>
              <span aria-hidden>{f.alvor === 'hoy' ? '!' : f.alvor === 'middels' ? '·' : 'i'}</span>
              <div className="fyll">{f.tekst}</div>
              {f.handling && ['mva_sum', 'ikke_mva_reg', 'kvittering'].includes(f.kode) && <button type="button" className="knapp hvit liten" onClick={() => utfor(f)}>{f.handling}</button>}
            </div>
          ))}
          {advarsler.length > 0 && !blokkerer.length && (
            <label className="rad liten"><input type="checkbox" checked={overstyr} onChange={e => setOverstyr(e.target.checked)} /> Jeg har sjekket dette og vil registrere likevel</label>
          )}
        </section>

        {feil && <div className="varsel rod" role="alert">{feil}</div>}
        <div className="rad" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="lenke" onClick={() => (modus === 'ny' ? nullstill() : router.back())}>Avbryt</button>
          {modus !== 'rett' && <button type="button" className="knapp hvit" disabled={venter} onClick={lagreUtkast}>Lagre som utkast</button>}
          <button type="button" className="knapp" disabled={!kanRegistrere} onClick={registrer}>{venter ? 'Registrerer …' : modus === 'rett' ? 'Lagre rettelsen' : `Registrer kjøpet${totalOre ? ` · ${kr(totalOre)} kr` : ''}`}</button>
        </div>
      </div>
    </div>
  );
}
