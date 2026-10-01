'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { lagreInnstillinger, inviterBruker, byttPakke, apneKundeportal, laasPeriodeHandling, lagreApningsbalanse } from '@/app/handlinger';
import { PAKKER, VAKTPLAN_ANSATTE, EKSTRA_ANSATT } from '@/lib/pakker';
import { KONTOPLAN } from '@/lib/kontoplan';
import { kr, tilOre } from '@/lib/penger';

function useLagre() {
  const router = useRouter();
  const [svar, setSvar] = useState<{ ok: boolean; t: string } | null>(null);
  const [venter, setVenter] = useState(false);
  const kjor = async (fn: () => Promise<{ ok: true; melding?: string } | { ok: false; feil: string }>) => {
    setVenter(true); setSvar(null);
    const r = await fn();
    setVenter(false);
    setSvar(r.ok ? { ok: true, t: r.melding ?? 'Lagret.' } : { ok: false, t: r.feil });
    if (r.ok) router.refresh();
  };
  const vis = svar && <div className={`varsel ${svar.ok ? 'gronn' : 'rod'}`} role="status">{svar.t}</div>;
  return { kjor, vis, venter };
}

type Felt = Record<string, string | number | boolean | null>;

export function FirmaSkjema({ start }: { start: Felt }) {
  const [v, setV] = useState(start);
  const { kjor, vis, venter } = useLagre();
  const f = (k: string, l: string, hint?: string) => <label className="felt"><span>{l}</span><input className="inndata" value={String(v[k] ?? '')} onChange={e => setV({ ...v, [k]: e.target.value })} />{hint && <span className="hint">{hint}</span>}</label>;
  return (
    <div className="stakk">
      {f('adresse', 'Adresse')}
      <div className="rutenett to">{f('postnr', 'Postnr')}{f('poststed', 'Sted')}</div>
      <div className="rutenett to">{f('epost', 'E-post')}{f('telefon', 'Telefon')}</div>
      <div className="stakk" style={{ gap: 8 }}>
        <span className="mut liten">Hvor ofte leverer du MVA-melding?</span>
        <div className="rad">{[['tomnd', 'Annenhver måned'], ['aar', 'Én gang i året'], ['ingen', 'Ikke MVA-registrert']].map(([k, t]) => <button type="button" key={k} className={`knapp liten ${v.mva_termin === k ? '' : 'hvit'}`} onClick={() => setV({ ...v, mva_termin: k })}>{t}</button>)}</div>
        <span className="hint">{v.mva_termin === 'tomnd' ? 'Det vanlige. Seks terminer i året.' : v.mva_termin === 'aar' ? 'For foretak med under 1 million i omsetning som har fått innvilget årstermin.' : 'Du tar ikke MVA på salg og får ikke fradrag på kjøp.'}</span>
      </div>
      {vis}
      <div><button type="button" className="knapp" disabled={venter} onClick={() => kjor(() => lagreInnstillinger({ adresse: v.adresse, postnr: v.postnr, poststed: v.poststed, epost: v.epost, telefon: v.telefon, mva_termin: v.mva_termin }))}>Lagre</button></div>
    </div>
  );
}

export function FakturaInnstillinger({ start }: { start: Felt }) {
  const [v, setV] = useState(start);
  const { kjor, vis, venter } = useLagre();
  return (
    <div className="stakk">
      <div className="rutenett to">
        <label className="felt"><span>Kontonummer kunder betaler til</span><input className="inndata" value={String(v.kontonr ?? '')} onChange={e => setV({ ...v, kontonr: e.target.value })} /></label>
        <label className="felt"><span>Dager til forfall</span><input className="inndata mono" inputMode="numeric" value={String(v.faktura_forfall_dager ?? 14)} onChange={e => setV({ ...v, faktura_forfall_dager: e.target.value })} /></label>
      </div>
      <label className="felt"><span>Tekst nederst</span><input className="inndata" value={String(v.faktura_tekst ?? '')} onChange={e => setV({ ...v, faktura_tekst: e.target.value })} placeholder="F.eks. «Takk for handelen!»" /></label>
      <label className="felt"><span>KID</span>
        <select className="inndata" value={String(v.kid_metode)} onChange={e => setV({ ...v, kid_metode: e.target.value })}><option value="mod10">MOD10 (det vanlige)</option><option value="mod11">MOD11</option></select>
        <span className="hint">Må være det samme som avtalen om KID i banken din.</span>
      </label>
      <p className="mut liten">Dette brukes på alle nye fakturaer, tilbud og kvitteringer. Du kan fortsatt endre det på hvert enkelt dokument.</p>
      {vis}
      <div><button type="button" className="knapp" disabled={venter} onClick={() => kjor(() => lagreInnstillinger({ kontonr: String(v.kontonr ?? '').replace(/[^\d]/g, '') || null, faktura_forfall_dager: Number(v.faktura_forfall_dager), faktura_tekst: v.faktura_tekst || null, kid_metode: v.kid_metode }))}>Lagre</button></div>
    </div>
  );
}

export function Inviter() {
  const [epost, setEpost] = useState('');
  const [rolle, setRolle] = useState<'full' | 'les' | 'kvittering'>('full');
  const [lenke, setLenke] = useState('');
  const [sendtTil, setSendtTil] = useState('');
  const { kjor, vis, venter } = useLagre();
  return (
    <div className="stakk">
      <label className="felt"><span>E-post</span><input className="inndata" type="email" value={epost} onChange={e => setEpost(e.target.value)} placeholder="navn@firma.no" /></label>
      {([['full', 'Full tilgang', 'Kan registrere, sende fakturaer og kjøre lønn.'], ['les', 'Kan se', 'Ser alt, men kan ikke endre noe.'], ['kvittering', 'Bare kvitteringer', 'Kan laste opp kvitteringer. For ansatte med utlegg.']] as const).map(([k, t, d]) => (
        <button type="button" key={k} className={`valgkort ${rolle === k ? 'valgt' : ''}`} onClick={() => setRolle(k)}><b style={{ display: 'block', fontWeight: 600 }}>{t}</b><span className="mut liten">{d}</span></button>
      ))}
      {vis}
      {lenke && <div className="varsel info"><div className="fyll">{sendtTil ? `Invitasjonen er sendt på e-post til ${sendtTil}. Du kan også sende lenken selv:` : `E-posten kunne ikke sendes. Send denne lenken til ${epost}:`}<div className="mono liten" style={{ wordBreak: 'break-all', marginTop: 4 }}>{lenke}</div></div></div>}
      <div><button type="button" className="knapp" disabled={venter} onClick={() => kjor(async () => { const r = await inviterBruker(epost, rolle); if (r.ok) { setLenke(location.origin + r.data!.lenke); setSendtTil(r.data!.sendt ? epost : ''); } return r; })}>Lag invitasjon</button></div>
    </div>
  );
}

export function Pakker({ pakke, erEier, betalingPa = false, intropris = null, status = null, slutt = null, harKunde = false, betalt = null, avbrutt = false }: {
  pakke: string; erEier: boolean; betalingPa?: boolean; intropris?: number | null; status?: string | null; slutt?: string | null; harKunde?: boolean; betalt?: boolean | null; avbrutt?: boolean;
}) {
  const [venter, setVenter] = useState('');
  const [feil, setFeil] = useState('');
  const [melding, setMelding] = useState('');
  const router = useRouter();
  const velg = async (k: 'gratis' | 'start' | 'selskap') => {
    if (k === 'gratis' && betalingPa && !confirm('Bytte til Gratis? Du beholder pakken du har betalt for ut perioden, og ingenting du har ført blir borte.')) return;
    setVenter(k); setFeil(''); setMelding('');
    const r = await byttPakke(k);
    if (!r.ok) { setVenter(''); setFeil(r.feil); return; }
    if (r.data?.url) { location.href = r.data.url; return; }
    setVenter('');
    setMelding(k === 'gratis' && r.data?.slutt ? `Abonnementet er sagt opp. Du har pakken til ${r.data.slutt.split('-').reverse().join('.')}, deretter Gratis.` : 'Pakken er byttet.');
    router.refresh();
  };
  const portal = async () => {
    setVenter('portal'); setFeil('');
    const r = await apneKundeportal();
    if (!r.ok) { setVenter(''); setFeil(r.feil); return; }
    location.href = r.data!.url;
  };
  const dato = (d: string) => d.split('-').reverse().join('.');
  return (
    <div className="stakk">
      {betalt === true && <div className="varsel gronn">Takk! Betalingen er mottatt, og pakken er aktivert.</div>}
      {betalt === false && <div className="varsel gul">Vi fant ikke betalingen ennå. Last siden på nytt om litt.</div>}
      {avbrutt && <div className="varsel info">Betalingen ble avbrutt. Ingenting er trukket.</div>}
      {status === 'past_due' && <div className="varsel rod">Siste trekk feilet. Oppdater kortet, så beholder du pakken. {harKunde && erEier && <button type="button" className="lenke" onClick={portal}>Oppdater kortet</button>}</div>}
      {slutt && pakke !== 'gratis' && <div className="varsel info">Abonnementet er sagt opp og gjelder til {dato(slutt)}. Deretter går du over til Gratis. Du kan velge pakken igjen for å fortsette.</div>}
      {betalingPa && intropris != null && <div className="varsel gul"><b>Introduksjonspris:</b> {kr(intropris, { desimaler: false })} kr i måneden for alle pakker mens vi bygger ferdig. Du får beskjed i god tid før prisen endres.</div>}
      <p className="mut liten" style={{ margin: 0 }}>Priser uten MVA. Vaktplanen har {VAKTPLAN_ANSATTE.start} ansatte med i Start og {VAKTPLAN_ANSATTE.selskap} i Selskap; flere koster {EKSTRA_ANSATT / 100} kr i måneden per ansatt. <a className="lenke" href="https://xn--rettfrt-u1a.no/vilkar" target="_blank" rel="noreferrer">Se vilkår</a></p>
      <div className="rutenett tre">
        {PAKKER.map(p => (
          <div key={p.k} className="kort stakk" style={{ borderColor: pakke === p.k ? 'var(--ink)' : undefined, gap: 8 }}>
            <div className="rad" style={{ justifyContent: 'space-between' }}><b>{p.n}</b>{pakke === p.k && <span className="merke gronn">Din pakke</span>}</div>
            {p.pris > 0 && betalingPa && intropris != null ? (
              <div><span className="belop" style={{ fontSize: 22, fontWeight: 600 }}>{kr(intropris, { desimaler: false })} kr</span><span className="mut liten"> /mnd</span><div className="faint liten"><s>{kr(p.pris, { desimaler: false })} kr</s> ordinær pris eks. MVA</div></div>
            ) : (
              <div><span className="belop" style={{ fontSize: 22, fontWeight: 600 }}>{kr(p.pris, { desimaler: false })} kr</span><span className="mut liten"> /mnd eks. MVA</span>{p.pris > 0 && <div className="faint liten">{kr(Math.round(p.pris * 1.25), { desimaler: false })} kr inkl. MVA</div>}</div>
            )}
            <p className="mut liten" style={{ flex: 1 }}>{p.d}</p>
            {erEier && (pakke !== p.k || (slutt && p.k !== 'gratis')) && (
              <button type="button" className={`knapp liten ${p.k === 'gratis' ? 'hvit' : ''}`} disabled={!!venter} onClick={() => velg(p.k)}>
                {venter === p.k ? 'Et øyeblikk …' : pakke === p.k ? 'Fortsett abonnementet' : p.k === 'gratis' ? 'Bytt til Gratis' : betalingPa && !harKunde ? `Velg ${p.n} og betal` : `Bytt til ${p.n}`}
              </button>
            )}
          </div>
        ))}
      </div>
      {feil && <div className="varsel rod">{feil}</div>}
      {melding && <div className="varsel gronn">{melding}</div>}
      {betalingPa && harKunde && erEier && <div><button type="button" className="knapp hvit" disabled={!!venter} onClick={portal}>{venter === 'portal' ? 'Åpner …' : 'Kort, kvitteringer og oppsigelse'}</button></div>}
      <p className="mut liten">{betalingPa ? 'Du betaler med kort hos Stripe. Kortopplysningene lagres hos Stripe, ikke hos oss. ' : 'Betaling er ikke koblet til i testmodus. '}Lønn er med i alle pakker, uten ekstra pris per ansatt. Ingen bindingstid. Bytter du ned, beholder du alt som er ført.</p>
    </div>
  );
}

export function Laas({ laastTil, idag }: { laastTil: string | null; idag: string }) {
  const [dato, setDato] = useState('');
  const { kjor, vis, venter } = useLagre();
  return (
    <div className="stakk">
      <p className="mut liten">Ingen kan føre eller endre noe før datoen du velger. Rettført låser av seg selv når MVA-meldingen er sendt og når en bankmåned er ferdig.</p>
      <div className="rad"><span>Låst til og med</span><input className="inndata" style={{ width: 180 }} type="date" max={idag} value={dato} onChange={e => setDato(e.target.value)} /><button type="button" className="knapp hvit" disabled={venter || !dato} onClick={() => { if (confirm('Låsingen kan ikke oppheves. Fortsette?')) kjor(() => laasPeriodeHandling(dato)); }}>Lås</button></div>
      <p className="faint liten">{laastTil ? `Nå låst til og med ${laastTil.split('-').reverse().join('.')}.` : 'Ingenting er låst ennå.'}</p>
      {vis}
    </div>
  );
}

const BALANSEKONTOER = KONTOPLAN.filter(k => k.nr < 3000 && ![2700, 2710].includes(k.nr));

export function Apningsbalanse({ standardDato }: { standardDato: string }) {
  const [dato, setDato] = useState(standardDato);
  const [rader, setRader] = useState<{ konto: number; belop: string }[]>([{ konto: 1920, belop: '' }, { konto: 2000, belop: '' }]);
  const { kjor, vis, venter } = useLagre();
  const saldoer = rader.map(r => ({ konto: r.konto, saldo: (tilOre(r.belop) ?? 0) * (r.konto >= 2000 ? -1 : 1) }));
  const eiendeler = saldoer.filter(s => s.konto < 2000).reduce((a, s) => a + s.saldo, 0);
  const ekGjeld = -saldoer.filter(s => s.konto >= 2000).reduce((a, s) => a + s.saldo, 0);
  return (
    <div className="stakk">
      <p className="mut liten">Saldoene fra forrige system eller årsregnskap, per dagen før du startet i Rettført. Skriv alle beløp som positive tall. Differansen føres mot annen egenkapital (2050).</p>
      <label className="felt" style={{ maxWidth: 220 }}><span>Dato</span><input className="inndata" type="date" value={dato} onChange={e => setDato(e.target.value)} /></label>
      {rader.map((r, i) => (
        <div key={i} className="rad" style={{ flexWrap: 'nowrap' }}>
          <select className="inndata" style={{ flex: 2 }} value={r.konto} onChange={e => setRader(rader.map((x, j) => (j === i ? { ...x, konto: Number(e.target.value) } : x)))}>{BALANSEKONTOER.map(k => <option key={k.nr} value={k.nr}>{k.nr} {k.navn}</option>)}</select>
          <input className="inndata mono" style={{ flex: 1 }} inputMode="decimal" value={r.belop} onChange={e => setRader(rader.map((x, j) => (j === i ? { ...x, belop: e.target.value } : x)))} placeholder="0,00" />
          <button type="button" className="knapp hvit liten" onClick={() => setRader(rader.filter((_, j) => j !== i))} aria-label="Fjern">×</button>
        </div>
      ))}
      <button type="button" className="lenke" style={{ alignSelf: 'flex-start' }} onClick={() => setRader([...rader, { konto: 1500, belop: '' }])}>+ Én konto til</button>
      <div className="mut liten">Eiendeler {kr(eiendeler)} kr · egenkapital og gjeld {kr(ekGjeld)} kr{eiendeler !== ekGjeld ? ` · ${kr(eiendeler - ekGjeld)} kr føres som annen egenkapital` : ''}</div>
      {vis}
      <div><button type="button" className="knapp" disabled={venter} onClick={() => { if (confirm('Føre åpningsbalansen?')) kjor(() => lagreApningsbalanse(dato, saldoer)); }}>Før åpningsbalansen</button></div>
    </div>
  );
}
