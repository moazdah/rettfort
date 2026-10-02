'use client';

import { useRef, useState } from 'react';
import { inviterNyHandling, inviterAnsattHandling, oppdaterAnsattHandling, tilbakestillInnloggingHandling, fjernAnsattHandling } from '@/app/vaktplan-handlinger';
import { useLeder, type Ansatt } from './ctx';
import { Ikon, ArkTopp, Seg, Avatar, nf, fornavn, initialer } from './felles';

const STILLINGER = ['Kafémedarbeider', 'Barista', 'Kokk', 'Skiftleder'];
const tilgang = (t: string) => (t === 'aktiv' ? ['Logget inn', 'check_circle', 'gronn'] : t === 'invitert' ? ['Invitert', 'mail', 'gul'] : ['Ikke invitert', 'person_off', 'gra']);
const avtale = (a: Ansatt) => (a.lonnType === 'time' ? 'Timelønn' : `Fast ${a.stillingsprosent} % (${nf(Math.round(2250 * a.stillingsprosent / 100))} t/uke)`);

/** «6 ansatte. Alle er med i Selskap, som har plass til 15.» */
export function plassTekst(n: number, p: { pakke: string; inkludert: number; ekstraKr: number }) {
  const navn = p.pakke === 'selskap' ? 'Selskap' : 'Start';
  if (n <= p.inkludert) return `${n} ${n === 1 ? 'ansatt' : 'ansatte'}. Alle er med i ${navn}, som har plass til ${p.inkludert}.`;
  const x = n - p.inkludert;
  return `${n} ansatte. ${p.inkludert} er med i ${navn}, ${x} er ekstra (${x * p.ekstraKr} kr/mnd)`;
}

/** Når e-posten ikke ble sendt: lenken lederen kan sende selv. */
export function LenkeBoks({ navn, lenke }: { navn: string; lenke: string }) {
  const [kopiert, setKopiert] = useState(false);
  return (
    <div className="v2-notat gul v2-lenkeboks" role="status">
      <Ikon n="link" s={18} />
      <div className="fyll"><div>Send denne lenken til {fornavn(navn)} på SMS eller e-post. Den gjelder i 7 dager.</div><div className="v2-mono v2-lenke">{lenke}</div>
        <button type="button" className="v2-knapp liten" onClick={async () => { try { await navigator.clipboard.writeText(lenke); setKopiert(true); } catch { /* kopiering ikke tillatt */ } }}><Ikon n="content_copy" s={16} />{kopiert ? 'Kopiert' : 'Kopier lenken'}</button></div>
    </div>
  );
}

export function AnsatteSkjerm() {
  const { d, apne, endre, opptatt } = useLeder();
  const mnd = new Intl.DateTimeFormat('nb-NO', { month: 'short' }).format(new Date(`${d.idag}T12:00:00Z`)).replace('.', '');
  const rader = d.ansatte.map(a => ({ a, t: tilgang(a.tilgang), timer: d.timerMnd[a.id] ?? 0 }));
  const inviter = (a: Ansatt) => endre(`inv${a.id}`, async () => { const r = await inviterAnsattHandling(a.id); if (r.ok && !r.data?.sendt) apne({ k: 'admin', id: a.id }); return r; });
  return (
    <div className="v2-stakk">
      <div className="v2-sidetopp">
        <div className="fyll"><h1 className="v2-h1">Ansatte</h1><div className="v2-hjelp">{plassTekst(d.ansatte.length, d.plass)}{d.plass.intro && d.ansatte.length > d.plass.inkludert ? ' Ekstra ansatte er gratis i introduksjonsperioden.' : ''} <a href="https://xn--rettfrt-u1a.no/vilkar" target="_blank" rel="noopener">Se vilkår</a></div></div>
        {d.endre && <button type="button" className="v2-knapp primar" onClick={() => apne({ k: 'inviter' })}><Ikon n="person_add" s={18} />Inviter ansatt</button>}
      </div>
      <div className="v2-kort v2-ansatt-tabell" role="table" aria-label="Ansatte">
        <div className="v2-at-rad hode" role="row"><span>Navn</span><span>Stilling</span><span>Avtale</span><span>Tilgang</span><span>Timer {mnd}.</span><span /></div>
        <div className="v2-at-rad" role="row">
          <span className="v2-at-navn"><Avatar ini={initialer(d.leder.navn)} art="mork" s={34} /><b>{d.leder.navn}</b><span className="v2-flagg gra">Leder</span></span>
          <span>Daglig leder</span><span>–</span><span className="v2-tilgang gronn"><Ikon n="check_circle" s={16} />Logget inn</span><span className="v2-mono">—</span><span />
        </div>
        {rader.map(({ a, t, timer }) => (
          <div key={a.id} className="v2-at-rad" role="row">
            <button type="button" className="v2-at-navn" onClick={() => apne({ k: 'person', id: a.id })}><Avatar navn={a.navn} s={34} /><b>{a.navn}</b></button>
            <span>{a.stilling ?? '–'}</span><span>{avtale(a)}</span>
            <span className={`v2-tilgang ${t[2]}`}><Ikon n={t[1]} s={16} />{t[0]}</span>
            <span className="v2-mono">{nf(timer)} t</span>
            <span className="v2-at-knapper">
              {d.endre && <button type="button" className="v2-knapp liten" onClick={() => apne({ k: 'admin', id: a.id })}>Endre</button>}
              {d.endre && a.tilgang !== 'aktiv' && <button type="button" className="v2-knapp liten" disabled={!!opptatt} onClick={() => inviter(a)}>{a.tilgang === 'invitert' ? 'Send på nytt' : 'Inviter'}</button>}
            </span>
          </div>
        ))}
      </div>
      <div className="v2-ansatt-kort">
        <div className="v2-kort v2-ak">
          <div className="v2-ak-topp"><Avatar ini={initialer(d.leder.navn)} art="mork" s={40} /><div className="fyll"><div><b>{d.leder.navn}</b> <span className="v2-flagg gra">Leder</span></div><div className="v2-hjelp">Daglig leder</div></div></div>
        </div>
        {rader.map(({ a, t, timer }) => (
          <div key={a.id} className="v2-kort v2-ak">
            <button type="button" className="v2-ak-topp" onClick={() => apne({ k: 'person', id: a.id })}>
              <Avatar navn={a.navn} s={40} /><div className="fyll"><div><b>{a.navn}</b></div><div className="v2-hjelp">{a.stilling ?? 'Ansatt'} · {avtale(a)}</div></div><Ikon n="chevron_right" s={20} />
            </button>
            <div className="v2-ak-bunn">
              <span className={`v2-tilgang ${t[2]}`}><Ikon n={t[1]} s={16} />{t[0]}</span>
              <span className="v2-hjelp v2-mono">{nf(timer)} t i {mnd}.</span>
              <span className="fyll" />
              {d.endre && <button type="button" className="v2-knapp liten" onClick={() => apne({ k: 'admin', id: a.id })}>Endre</button>}
              {d.endre && a.tilgang !== 'aktiv' && <button type="button" className="v2-knapp liten" disabled={!!opptatt} onClick={() => inviter(a)}>{a.tilgang === 'invitert' ? 'Send på nytt' : 'Inviter'}</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Inviter({ lukk }: { lukk: () => void }) {
  const { d, endre, opptatt } = useLeder();
  const [navn, setNavn] = useState(''), [epost, setEpost] = useState(''), [mobil, setMobil] = useState('');
  const [stilling, setStilling] = useState(STILLINGER[0]), [annen, setAnnen] = useState('');
  const [lonnType, setLonnType] = useState<'fast' | 'time'>('time'), [pst, setPst] = useState(50);
  const [feil, setFeil] = useState('');
  const [lenke, setLenke] = useState<string | null>(null);
  const nr = d.ansatte.length + 1, lim = d.plass.inkludert, pakke = d.plass.pakke === 'selskap' ? 'Selskap' : 'Start', ekstra = nr > lim;
  const egne = [...new Set([...STILLINGER, ...d.ansatte.map(a => a.stilling).filter((x): x is string => !!x)])];
  const lenkeVent = useRef(false);
  const send = () => {
    setFeil('');
    if (!navn.trim()) return setFeil('Skriv inn navnet til den ansatte.');
    if (!/^\S+@\S+\.\S+$/.test(epost.trim())) return setFeil('Skriv inn en gyldig e-postadresse.');
    void endre('inviter', async () => {
      const r = await inviterNyHandling({ navn, epost, mobil, stilling: stilling === 'Annen' ? annen : stilling, lonnType, stillingsprosent: pst });
      lenkeVent.current = r.ok && !r.data?.sendt;
      if (!r.ok) setFeil(r.feil);
      else if (!r.data?.sendt) setLenke(r.data?.lenke ?? null);
      return r.ok ? r : { ok: false as const, feil: r.feil };
    }, () => { if (!lenkeVent.current) lukk(); });
  };
  return (
    <div className="v2-skjema">
      <ArkTopp tittel="Inviter ansatt" under="Den ansatte får en lenke på e-post og trenger ikke passord." lukk={lukk} />
      <div className="v2-skjema-innhold">
        <label className="v2-felt"><span className="v2-etikett">Navn</span><input className="v2-input" autoComplete="name" placeholder="Fornavn Etternavn" value={navn} onChange={e => setNavn(e.target.value)} /></label>
        <label className="v2-felt"><span className="v2-etikett">E-post</span><input className="v2-input" type="email" autoComplete="email" placeholder="navn@eksempel.no" value={epost} onChange={e => setEpost(e.target.value)} /></label>
        <label className="v2-felt"><span className="v2-etikett">Mobil (valgfritt, for SMS senere)</span><input className="v2-input" type="tel" autoComplete="tel" value={mobil} onChange={e => setMobil(e.target.value)} /></label>
        <div className="v2-felt"><span className="v2-etikett">Stilling</span>
          <div className="v2-piller">{[...egne, 'Annen'].map(s => <button key={s} type="button" className="v2-pille" aria-pressed={stilling === s} onClick={() => setStilling(s)}>{s}</button>)}</div>
          {stilling === 'Annen' && <input className="v2-input" placeholder="Stilling" aria-label="Annen stilling" value={annen} onChange={e => setAnnen(e.target.value)} />}
        </div>
        <div className="v2-felt"><span className="v2-etikett">Avtale</span>
          <Seg etikett="Avtale" valg={[['fast', 'Fast stilling'], ['time', 'Timelønn']]} verdi={lonnType} sett={setLonnType} />
          {lonnType === 'fast' && (
            <div className="v2-stepper-rad"><span>Stillingsprosent</span>
              <div className="v2-stepper"><button type="button" aria-label="Mindre" onClick={() => setPst(x => Math.max(10, x - 10))}><Ikon n="remove" /></button><span className="v2-mono">{pst} %</span><button type="button" aria-label="Mer" onClick={() => setPst(x => Math.min(100, x + 10))}><Ikon n="add" /></button></div>
              <span className="v2-mono v2-hjelp">{nf(Math.round(2250 * pst / 100))} t/uke</span>
            </div>
          )}
        </div>
        <div className={`v2-notat ${ekstra ? 'gul' : 'hvit'}`}><Ikon n="groups" s={18} /><span>{ekstra ? `Dette blir ansatt nr. ${nr}. ${pakke} har ${lim} inkludert, så det koster ${d.plass.ekstraKr} kr/mnd ekstra.${d.plass.intro ? ' Det er gratis så lenge introduksjonsprisen gjelder.' : ''}` : `Dette blir ansatt nr. ${nr}. Det er inkludert i ${pakke} (${lim} ansatte).`}</span></div>
        <div className="v2-felt"><span className="v2-etikett">Slik ser e-posten ut</span>
          <div className="v2-epost">
            <img src="/rettfort-logo.png" alt="Rettført" width={110} />
            <div>Hei, {fornavn(navn.trim()) || 'Emil'}. {d.leder.navn} har invitert deg til vaktplanen for {d.org.navn}.</div>
            <div className="v2-epost-knapp">Logg inn på vaktplanen</div>
            <div className="v2-hjelp">Lenken gjelder i 7 dager. Du trenger ikke passord.</div>
          </div>
        </div>
        {feil && <div role="alert" className="v2-notat rod"><Ikon n="error" s={18} />{feil}</div>}
        {lenke && <LenkeBoks navn={navn} lenke={lenke} />}
      </div>
      <div className="v2-skjema-bunn"><span className="fyll" /><button type="button" className="v2-knapp" onClick={lukk}>{lenke ? 'Ferdig' : 'Avbryt'}</button>{!lenke && <button type="button" className="v2-knapp primar" disabled={!!opptatt} onClick={send}><Ikon n="send" s={18} />{opptatt === 'inviter' ? 'Sender …' : 'Send invitasjon'}</button>}</div>
    </div>
  );
}

export function Administrer({ id, lukk }: { id: string; lukk: () => void }) {
  const { d, endre, apne, opptatt } = useLeder();
  const a = d.ansatte.find(x => x.id === id);
  const [stilling, setStilling] = useState(a?.stilling ?? ''), [lonnType, setLonnType] = useState<'fast' | 'time'>(a?.lonnType === 'time' ? 'time' : 'fast');
  const [pst, setPst] = useState(a?.stillingsprosent ?? 100), [epost, setEpost] = useState(a?.epost ?? ''), [mobil, setMobil] = useState(a?.mobil ?? '');
  const [lenke, setLenke] = useState<string | null>(null);
  const [ferie, setFerie] = useState(String(a?.ferieDager ?? 25)), [avsp, setAvsp] = useState(nf(a?.avspMin ?? 0).replace(',', '.'));
  if (!a) return null;
  const t = tilgang(a.tilgang), n = fornavn(a.navn);
  const sist = a.sistInne ? new Date(a.sistInne) : null;
  const sistTekst = sist ? `Har logget inn. Sist innlogget ${sist.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })} kl. ${sist.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}.` : 'Har logget inn.';
  const igjen = d.saldo[id]?.avspMin ?? a.avspMin, brukt = a.avspMin - igjen;
  return (
    <div className="v2-skjema">
      <ArkTopp venstre={<Avatar navn={a.navn} art="mork" s={44} />} tittel={a.navn} under="Administrer ansatt" lukk={lukk} />
      <div className="v2-skjema-innhold">
        <div className="v2-to">
          <label className="v2-felt"><span className="v2-etikett">Stilling</span><input className="v2-input" value={stilling} onChange={e => setStilling(e.target.value)} /></label>
          <label className="v2-felt"><span className="v2-etikett">E-post</span><input className="v2-input" type="email" value={epost} onChange={e => setEpost(e.target.value)} /></label>
          <label className="v2-felt"><span className="v2-etikett">Mobil</span><input className="v2-input" type="tel" value={mobil} onChange={e => setMobil(e.target.value)} /></label>
          <label className="v2-felt"><span className="v2-etikett">Feriedager per år</span><input className="v2-input v2-mono" inputMode="numeric" value={ferie} onChange={e => setFerie(e.target.value)} /></label>
        </div>
        <div className="v2-felt"><span className="v2-etikett">Avtale</span>
          <Seg etikett="Avtale" valg={[['fast', 'Fast stilling'], ['time', 'Timelønn']]} verdi={lonnType} sett={setLonnType} />
          {lonnType === 'fast' && <div className="v2-stepper-rad"><span>Stillingsprosent</span><div className="v2-stepper"><button type="button" aria-label="Mindre" onClick={() => setPst(x => Math.max(10, Math.round(x / 10) * 10 - 10))}><Ikon n="remove" /></button><span className="v2-mono">{pst} %</span><button type="button" aria-label="Mer" onClick={() => setPst(x => Math.min(100, Math.round(x / 10) * 10 + 10))}><Ikon n="add" /></button></div><span className="v2-mono v2-hjelp">{nf(Math.round(2250 * pst / 100))} t/uke</span></div>}
        </div>
        <label className="v2-felt"><span className="v2-etikett">Avspasering opptjent (t)</span><input className="v2-input v2-mono" inputMode="decimal" value={avsp} onChange={e => setAvsp(e.target.value)} /><span className="v2-hjelp">{brukt ? `${nf(brukt)} t er tatt ut, så ${nf(igjen)} t er til gode.` : 'Godkjent avspasering trekkes fra automatisk.'}</span></label>
        <div className="v2-kort v2-tilgangsboks">
          <div className="v2-rad"><span className="v2-etikett fyll">Tilgang til vaktplanen</span><span className={`v2-tilgang ${t[2]}`}><Ikon n={t[1]} s={16} />{t[0]}</span></div>
          <div className="v2-hjelp">{a.tilgang === 'aktiv' ? sistTekst : a.tilgang === 'invitert' ? 'Invitasjonen er sendt. Lenken gjelder i 7 dager.' : 'Har ikke fått invitasjon ennå.'}</div>
          <button type="button" className="v2-knapp" disabled={!!opptatt} onClick={() => endre('tilgang', async () => { const r = await (a.tilgang === 'aktiv' ? tilbakestillInnloggingHandling(a.id) : inviterAnsattHandling(a.id)); if (r.ok && !r.data?.sendt) setLenke(r.data?.lenke ?? null); return r; })}>
            <Ikon n={a.tilgang === 'aktiv' ? 'lock_reset' : 'send'} s={18} />{a.tilgang === 'aktiv' ? 'Tilbakestill innlogging' : a.tilgang === 'invitert' ? 'Send invitasjonen på nytt' : 'Send invitasjon'}
          </button>
          {lenke && <LenkeBoks navn={a.navn} lenke={lenke} />}
          <div className="v2-hjelp">{a.tilgang === 'aktiv' ? `Ansatte logger inn uten passord. Tilbakestill sender en ny lenke til ${a.epost ?? 'e-posten deres'}. De gamle lenkene slutter å virke, og ${n} blir logget ut på alle enheter. Bruk dette hvis noen har mistet telefonen eller ikke kommer inn.` : `${n} får en e-post med en lenke og trenger ikke passord.`}</div>
        </div>
        <div className="v2-fjernrad">
          <div className="fyll"><b>Fjern fra vaktplanen</b><div className="v2-hjelp">Hen mister tilgangen. Timer og lønn blir liggende i regnskapet.</div></div>
          <button type="button" className="v2-knapp rodtekst" onClick={() => apne({ k: 'fjern', id: a.id })}><Ikon n="person_remove" s={18} />Fjern</button>
        </div>
      </div>
      <div className="v2-skjema-bunn"><span className="fyll" /><button type="button" className="v2-knapp" onClick={lukk}>Avbryt</button>
        <button type="button" className="v2-knapp primar" disabled={!!opptatt} onClick={() => endre('admin', () => oppdaterAnsattHandling(a.id, { stilling, lonnType, stillingsprosent: pst, epost, mobil, ferieDager: Number(ferie.replace(',', '.')), avspTimer: Number(avsp.replace(',', '.')) }), lukk)}>Lagre</button>
      </div>
    </div>
  );
}

export function Fjern({ id, lukk }: { id: string; lukk: () => void }) {
  const { d, endre, apne, opptatt } = useLeder();
  const a = d.ansatte.find(x => x.id === id);
  if (!a) return null;
  const n = d.vakter.filter(v => v.ansattId === id && v.dato >= d.idag).length;
  const punkter = ['Mister tilgangen til vaktplanen med en gang. Innloggingslenken slutter å virke.', n ? `${n} ${n === 1 ? 'vakt' : 'vakter'} i uke ${d.uke} blir ledige.` : `Har ingen vakter i uke ${d.uke}.`, 'Timer, fravær og lønn blir liggende i regnskapet.', 'Du kan invitere hen igjen senere.'];
  return (
    <div className="v2-skjema">
      <div className="v2-fjern-topp"><span className="v2-avatar rod" style={{ width: 48, height: 48 }}><Ikon n="person_remove" s={24} /></span><div className="v2-ark-tittel">Fjerne {a.navn}?</div></div>
      <div className="v2-skjema-innhold">{punkter.map(p => <div key={p} className="v2-punkt"><Ikon n="chevron_right" s={18} /><span>{p}</span></div>)}</div>
      <div className="v2-skjema-bunn"><span className="fyll" /><button type="button" className="v2-knapp" onClick={() => apne({ k: 'admin', id })}>Avbryt</button>
        <button type="button" className="v2-knapp rod" disabled={!!opptatt} onClick={() => endre('fjern', () => fjernAnsattHandling(id), lukk)}>Fjern {fornavn(a.navn)}</button>
      </div>
    </div>
  );
}
