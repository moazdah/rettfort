'use client';

import { useState } from 'react';
import { Logo, Maskot } from '@/components/Logo';
import { Skanner } from '@/components/Skanner';
import { kr } from '@/lib/penger';
import { manedNavn } from '@/lib/vis';
import type { LenkeType } from '@/lib/tjenester/innsending';

type Utlegg = { id: string; opprettet: string; tekst: string | null; betalt_med: string | null; status: string; belop: number | null; tilbake: string | null; avvist_grunn: string | null; periode: string | null };

const dato = (d: string) => d.slice(0, 10).split('-').reverse().join('.');

function utleggStatus(u: Utlegg): { tekst: string; farge: string } {
  if (u.status === 'avvist') return { tekst: `Avvist: ${u.avvist_grunn ?? ''}`, farge: 'rod' };
  if (u.status === 'betalt') return { tekst: u.periode ? `Betalt med lønnen for ${manedNavn(u.periode)}` : u.betalt_med === 'firma' ? 'Registrert' : 'Betalt tilbake', farge: 'gronn' };
  if (u.status === 'registrert') return { tekst: 'Registrert', farge: 'gronn' };
  if (u.status === 'godkjent') return { tekst: u.tilbake === 'neste_lonn' ? 'Godkjent. Betales med neste lønn' : u.tilbake === 'na' ? 'Godkjent. Betales tilbake snart' : 'Godkjent', farge: 'gronn' };
  return { tekst: 'Sendt. Venter på godkjenning', farge: 'gul' };
}

export function SkannSide({ token, type, foretak, navn, utlegg }: { token: string; type: LenkeType; foretak: string; navn: string | null; utlegg: Utlegg[] }) {
  const [fane, setFane] = useState<'ny' | 'mine'>('ny');
  const [sider, setSider] = useState<Blob[] | null>(null);
  const [tekst, setTekst] = useState('');
  const [betaltMed, setBetaltMed] = useState<'eget' | 'firma' | ''>('');
  const [sender, setSender] = useState(false);
  const [feil, setFeil] = useState('');
  const [sendt, setSendt] = useState(0);
  const [nokkel, setNokkel] = useState(0);

  const send = async (s: Blob[]) => {
    setSender(true); setFeil('');
    const fd = new FormData();
    s.forEach((b, i) => fd.append('side', b, `side-${i + 1}.${b.type === 'application/pdf' ? 'pdf' : 'jpg'}`));
    fd.set('tekst', tekst); if (betaltMed) fd.set('betaltMed', betaltMed);
    try {
      const r = await fetch(`/api/skann/${token}`, { method: 'POST', body: fd });
      const j = await r.json();
      if (!j.ok) { setFeil(j.feil ?? 'Kunne ikke sende. Prøv igjen.'); return; }
      setSendt(n => n + 1); setSider(null); setTekst(''); setBetaltMed('');
    } catch { setFeil('Ingen nettforbindelse. Prøv igjen.'); } finally { setSender(false); }
  };

  const ferdigSkannet = (s: Blob[]) => { if (type === 'egen') send(s); else setSider(s); };
  const tittel = type === 'ansatt' ? `Utlegg til ${foretak}` : type === 'klient' ? `Send bilag til ${foretak}` : 'Ta bilde av kvitteringen';
  const under = type === 'ansatt' ? `Hei ${navn?.split(' ')[0] ?? ''}! Ta bilde av kvitteringen for noe du har kjøpt til jobben.` : type === 'klient' ? 'Ta bilde av kvitteringer og fakturaer. De havner rett hos regnskapsføreren.' : 'Hold kvitteringen foran kameraet. Bildet tas av seg selv og dukker opp på PC-en.';

  if (sendt && !sider) return (
    <main className="skann-side">
      <div className="skann-topp"><Logo bredde={96} /></div>
      <div className="stakk" style={{ alignItems: 'center', textAlign: 'center', padding: '40px 20px' }}>
        <Maskot storrelse={96} />
        <h1>{type === 'egen' ? 'Sendt til PC-en' : type === 'ansatt' ? 'Utlegget er sendt' : 'Sendt'}</h1>
        <p className="mut">{type === 'egen' ? 'Kvitteringen dukker opp på PC-skjermen om et øyeblikk.' : type === 'ansatt' ? 'Du ser når det er godkjent under «Mine utlegg».' : `${foretak} har fått dokumentet.`}</p>
        <button type="button" className="knapp stor" onClick={() => { setSendt(0); setNokkel(k => k + 1); }}>Skann en til</button>
      </div>
    </main>
  );

  return (
    <main className="skann-side">
      <div className="skann-topp"><Logo bredde={96} /><span className="mut liten">{foretak}</span></div>
      <div className="skann-innhold stakk">
        <div><h1 style={{ fontSize: 24 }}>{tittel}</h1><p className="mut" style={{ marginTop: 6 }}>{under}</p></div>
        {type === 'ansatt' && (
          <nav className="faner"><button type="button" className={fane === 'ny' ? 'aktiv' : ''} onClick={() => setFane('ny')}>Nytt utlegg</button><button type="button" className={fane === 'mine' ? 'aktiv' : ''} onClick={() => setFane('mine')}>Mine utlegg{utlegg.length ? ` (${utlegg.length})` : ''}</button></nav>
        )}
        {fane === 'mine' ? (
          utlegg.length ? (
            <div className="liste">{utlegg.map(u => { const st = utleggStatus(u); return (
              <div key={u.id} className="linje"><div className="fyll"><div className="tittel">{u.tekst ?? 'Utlegg'}</div><div className="mut liten">{dato(u.opprettet)} · {u.betalt_med === 'firma' ? 'Firmakort' : 'Eget kort'}</div><div className={`liten tekst-${st.farge}`}>{st.tekst}</div></div>{u.belop ? <b className="belop">{kr(u.belop)}</b> : null}</div>
            ); })}</div>
          ) : <p className="mut">Du har ikke sendt noen utlegg ennå.</p>
        ) : sider ? (
          <div className="stakk">
            <div className="varsel info">{sider.length} {sider.length === 1 ? 'side' : 'sider'} klar til å sendes.</div>
            {type === 'ansatt' && (
              <>
                <label className="felt"><span>Hva gjaldt det?</span><input className="inndata" value={tekst} onChange={e => setTekst(e.target.value)} placeholder="F.eks. parkering hos kunde" maxLength={300} /></label>
                <div className="stakk" style={{ gap: 6 }}><span className="mut liten">Hvordan betalte du?</span>
                  <div className="lonnstyper to">
                    <button type="button" className={`valgkort ${betaltMed === 'eget' ? 'valgt' : ''}`} onClick={() => setBetaltMed('eget')}><b>Eget kort</b><span className="mut liten">Du får pengene tilbake.</span></button>
                    <button type="button" className={`valgkort ${betaltMed === 'firma' ? 'valgt' : ''}`} onClick={() => setBetaltMed('firma')}><b>Firmakort</b><span className="mut liten">Bare for regnskapet.</span></button>
                  </div>
                </div>
              </>
            )}
            {type === 'klient' && <label className="felt"><span>Kommentar (valgfritt)</span><input className="inndata" value={tekst} onChange={e => setTekst(e.target.value)} placeholder="F.eks. middag med kunde" maxLength={300} /></label>}
            {feil && <div className="varsel rod" role="alert">{feil}</div>}
            <button type="button" className="knapp stor" disabled={sender || (type === 'ansatt' && (!tekst.trim() || !betaltMed))} onClick={() => send(sider)}>{sender ? 'Sender …' : type === 'ansatt' ? 'Send utlegget' : 'Send'}</button>
            <button type="button" className="lenke" onClick={() => { setSider(null); setNokkel(k => k + 1); }}>Ta bildene på nytt</button>
          </div>
        ) : (
          <>
            {feil && <div className="varsel rod" role="alert">{feil}</div>}
            <Skanner key={nokkel} onFerdig={ferdigSkannet} knappTekst={type === 'egen' ? 'Send til PC-en' : 'Neste'} opptatt={sender} />
          </>
        )}
      </div>
    </main>
  );
}
