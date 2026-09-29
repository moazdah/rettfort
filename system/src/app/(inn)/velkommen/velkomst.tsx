'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo, Maskot } from '@/components/Logo';
import { BrregSok } from '@/components/BrregSok';
import { bekreftEpost, nyKode, byttEpost, opprettForetak, type NyttForetak } from '@/app/handlinger';
import type { Enhet } from '@/lib/brreg';
import { fristerForAr, norskDato, type Orgform } from '@/lib/frister';
import { lagSlugKlient } from './slug';

const ORGFORMER: [string, string][] = [['AS', 'Aksjeselskap (AS)'], ['ENK', 'Enkeltpersonforetak (ENK)'], ['ANS', 'Ansvarlig selskap (ANS)'], ['DA', 'Selskap med delt ansvar (DA)'], ['NUF', 'Norskregistrert utenlandsk foretak (NUF)'], ['ANNET', 'Annet']];
const SYSTEMER = ['Fiken', 'Tripletex', 'PowerOffice Go', 'Visma eAccounting', 'Xledger', '24SevenOffice', 'Annet'];

export function Velkomst({ navn, epost, bekreftet, testkode }: { navn: string; epost: string; bekreftet: boolean; testkode: string | null }) {
  const router = useRouter();
  const [steg, setSteg] = useState(bekreftet ? 3 : 2);
  const [kode, setKode] = useState('');
  const [visKode, setVisKode] = useState(testkode);
  const [nySendt, setNySendt] = useState(false);
  const [adresse, setAdresse] = useState(epost);
  const [endrer, setEndrer] = useState(false);
  const [nyAdresse, setNyAdresse] = useState(epost);
  const lagreAdresse = async () => {
    setFeil('');
    const r = await byttEpost(nyAdresse);
    if (!r.ok) { setFeil(r.feil); return; }
    setAdresse(r.data!.epost); setVisKode(r.data!.kode || null); setNySendt(true); setEndrer(false); setKode('');
  };
  const [feil, setFeil] = useState('');
  const [f, setF] = useState<NyttForetak>({ navn: '', orgnr: '', orgform: 'AS', stiftet: '', mvaTermin: 'tomnd', start: 'nytt' });
  const [fraBrreg, setFraBrreg] = useState(false);
  const [venter, setVenter] = useState(false);
  const [slug, setSlug] = useState('');

  const sjekkKode = async (v: string) => {
    setKode(v); setFeil('');
    if (v.replace(/\D/g, '').length === 6) {
      const r = await bekreftEpost(v.replace(/\D/g, ''));
      if (r.ok) setSteg(3); else setFeil(r.feil);
    }
  };
  const velgEnhet = (e: Enhet) => {
    setF({ ...f, navn: e.navn, orgnr: e.orgnr, orgform: ORGFORMER.some(o => o[0] === e.orgform) ? e.orgform : 'ANNET', stiftet: e.stiftet ?? '', adresse: e.adresse, postnr: e.postnr, poststed: e.poststed, kommunenr: e.kommunenr, mvaTermin: e.mvaRegistrert ? 'tomnd' : 'ingen', nace: e.nace });
    setFraBrreg(true); setSteg(4);
  };
  const fullfor = async () => {
    setVenter(true); setFeil('');
    const r = await opprettForetak(f);
    setVenter(false);
    if (!r.ok) { setFeil(r.feil); return; }
    setSlug(r.data?.slug ?? lagSlugKlient(f.navn)); setSteg(6);
  };
  const ar = new Date().getFullYear();
  const frister = fristerForAr(ar, { orgform: (f.orgform as Orgform), mvaTermin: f.mvaTermin, harAnsatte: false }).filter(x => x.dato >= new Date().toISOString().slice(0, 10)).slice(0, 3);

  return (
    <main className="midt">
      <div className="boks" style={{ maxWidth: 560 }}>
        <div className="rad" style={{ justifyContent: 'space-between', marginBottom: 24 }}>
          <Logo bredde={110} />
          {steg < 6 && <span className="mut liten">Steg {steg - 1} av 4</span>}
        </div>

        {steg === 2 && (
          <div className="stakk">
            <h1>Bekreft e-posten</h1>
            <p className="mut">Vi har sendt en kode på 6 siffer til <b>{adresse}</b>.</p>
            {endrer && (
              <div className="rad" style={{ flexWrap: 'nowrap' }}>
                <input className="inndata" type="email" autoComplete="email" value={nyAdresse} onChange={e => setNyAdresse(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') lagreAdresse(); }} autoFocus aria-label="Riktig e-postadresse" />
                <button type="button" className="knapp" onClick={lagreAdresse}>Send kode</button>
              </div>
            )}
            {visKode && <div className="testmodus">E-posten kom ikke frem ennå. Koden din er <b className="mono">{visKode}</b>.</div>}
            {nySendt && !visKode && <div className="varsel gronn liten">En ny kode er sendt. Sjekk også søppelposten.</div>}
            <input className="inndata mono" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={kode} onChange={e => sjekkKode(e.target.value)} placeholder="000000" style={{ fontSize: 22, letterSpacing: '.3em', textAlign: 'center' }} autoFocus />
            {feil && <div className="varsel rod">{feil}</div>}
            <div className="rad">
              <button type="button" className="lenke" onClick={async () => { const r = await nyKode(); if (r.ok) { setVisKode(r.data!.kode || null); setNySendt(true); } }}>Send på nytt</button>
              <span className="faint">·</span>
              <button type="button" className="lenke" onClick={() => { setEndrer(true); setNyAdresse(adresse); }}>Feil e-post?</button>
            </div>
          </div>
        )}

        {steg === 3 && (
          <div className="stakk">
            <h1>Hei, {navn}. Finn foretaket</h1>
            <p className="mut">Søk på navn eller org.nr. Vi henter resten fra Brønnøysundregistrene, så du slipper å skrive det.</p>
            <BrregSok onVelg={velgEnhet} autoFocus />
            <button type="button" className="lenke" style={{ alignSelf: 'flex-start' }} onClick={() => { setFraBrreg(false); setF({ ...f, orgnr: '' }); setSteg(4); }}>Foretaket er ikke registrert ennå</button>
          </div>
        )}

        {steg === 4 && (
          <div className="stakk">
            <h1>{fraBrreg ? 'Stemmer dette?' : 'Om foretaket'}</h1>
            {fraBrreg && <p className="mut">Hentet fra Brønnøysundregistrene. Du kan endre alt senere.</p>}
            <label className="felt"><span>Navn</span><input className="inndata" value={f.navn} onChange={e => setF({ ...f, navn: e.target.value })} /></label>
            <div className="rutenett to">
              <label className="felt"><span>Organisasjonsform</span>
                <select className="inndata" value={f.orgform} onChange={e => setF({ ...f, orgform: e.target.value })}>{ORGFORMER.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                <span className="hint">Bestemmer hvilke frister du får, for eksempel årsregnskap for AS.</span>
              </label>
              <label className="felt"><span>Stiftelsesdato</span><input className="inndata" type="date" value={f.stiftet ?? ''} onChange={e => setF({ ...f, stiftet: e.target.value })} /><span className="hint">Regnskapet starter tidligst denne datoen.</span></label>
            </div>
            <label className="felt"><span>Org.nr</span><input className="inndata mono" style={{ textAlign: 'left' }} value={f.orgnr ?? ''} onChange={e => setF({ ...f, orgnr: e.target.value })} placeholder="Tomt hvis dere ikke er registrert ennå" /><span className="hint">Må stå på alle fakturaer.</span></label>
            <label className="felt"><span>MVA-termin</span>
              <select className="inndata" value={f.mvaTermin} onChange={e => setF({ ...f, mvaTermin: e.target.value as NyttForetak['mvaTermin'] })}>
                <option value="tomnd">Annenhver måned</option><option value="aar">Én gang i året</option><option value="ingen">Ikke MVA-registrert</option>
              </select>
              <span className="hint">{f.mvaTermin === 'tomnd' ? 'Det vanlige. Frister 10. april, 10. juni, 31. august, 10. oktober, 10. desember og 10. februar.' : f.mvaTermin === 'aar' ? 'For foretak med under 1 million i omsetning som har søkt om det. Frist 10. mars.' : 'Du må registrere deg når salget passerer 50 000 kr på 12 måneder. Vi sier fra.'}</span>
            </label>
            <div className="rad" style={{ justifyContent: 'space-between' }}>
              <button type="button" className="lenke" onClick={() => setSteg(3)}>Tilbake</button>
              <button type="button" className="knapp" disabled={!f.navn.trim()} onClick={() => setSteg(5)}>Stemmer</button>
            </div>
          </div>
        )}

        {steg === 5 && (
          <div className="stakk">
            <h1>Hvor starter du?</h1>
            {([['nytt', 'Nytt foretak', 'Vi starter med tomt regnskap fra stiftelsesdatoen.'], ['annet_system', 'Har regnskap et annet sted', 'Vi henter saldoene fra systemet du bruker i dag.'], ['excel', 'Excel eller papir', 'Du legger inn saldoene ved årsskiftet, eller regnskapsføreren gjør det.']] as const).map(([v, t, d]) => (
              <button type="button" key={v} className={`valgkort ${f.start === v ? 'valgt' : ''}`} onClick={() => setF({ ...f, start: v })}><b style={{ display: 'block' }}>{t}</b><span className="mut liten">{d}</span></button>
            ))}
            {f.start === 'annet_system' && (
              <label className="felt"><span>Hvilket system?</span>
                <select className="inndata" value={f.system ?? ''} onChange={e => setF({ ...f, system: e.target.value })}><option value="">Velg</option>{SYSTEMER.map(s => <option key={s}>{s}</option>)}</select>
                <span className="hint">Eksporter SAF-T fra {f.system || 'systemet'} og last den opp etter at du er ferdig her.</span>
              </label>
            )}
            {feil && <div className="varsel rod">{feil}</div>}
            <div className="rad" style={{ justifyContent: 'space-between' }}>
              <button type="button" className="lenke" onClick={() => setSteg(4)}>Tilbake</button>
              <button type="button" className="knapp" disabled={venter} onClick={fullfor}>{venter ? 'Setter opp …' : 'Fortsett'}</button>
            </div>
          </div>
        )}

        {steg === 6 && (
          <div className="stakk">
            <div style={{ textAlign: 'center' }}><Maskot storrelse={96} /></div>
            <h1 style={{ textAlign: 'center' }}>Ferdig. Dette har vi satt opp</h1>
            <div className="liste">
              <div className="linje"><div className="fyll"><div className="tittel">Bilag-e-post</div><div className="mut liten mono">{slug}@bilag.rettfort.no</div></div><span className="merke gronn">Klar</span></div>
              <div className="linje"><div className="fyll"><div className="tittel">Frister</div><div className="mut liten">{frister.map(x => `${x.tittel} ${norskDato(x.dato, false)}`).join(' · ') || 'Ut fra organisasjonsform og MVA-termin'}</div></div><span className="merke gronn">Klar</span></div>
              <div className="linje"><div className="fyll"><div className="tittel">Kontoplan og fakturanummer</div><div className="mut liten">Norsk standard kontoplan. Første faktura får nummer 10001.</div></div><span className="merke gronn">Klar</span></div>
              <div className="linje"><div className="fyll"><div className="tittel">Neste steg</div><div className="mut liten">{f.start === 'nytt' ? 'Send din første faktura eller registrer et kjøp.' : f.start === 'annet_system' ? 'Last opp SAF-T fra forrige system under Innstillinger.' : 'Legg inn saldoene fra forrige år under Innstillinger.'}</div></div></div>
            </div>
            <button type="button" className="knapp" onClick={() => router.push('/hjem')}>Gå til Hjem</button>
          </div>
        )}
      </div>
    </main>
  );
}
