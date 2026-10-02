'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { startTotrinn, bekreftTotrinn, slaAvTotrinn } from '@/app/handlinger';

export function Totrinn({ pa }: { pa: boolean }) {
  const router = useRouter();
  const [oppsett, setOppsett] = useState<{ qr: string; hemmelighet: string; uri: string } | null>(null);
  const [kode, setKode] = useState('');
  const [feil, setFeil] = useState('');
  const [ok, setOk] = useState('');
  const [av, setAv] = useState(false);
  const kjor = async (fn: () => Promise<{ ok: boolean; feil?: string; melding?: string }>) => {
    setFeil(''); setOk('');
    const r = await fn();
    if (!r.ok) { setFeil(r.feil ?? 'Noe gikk galt.'); return; }
    setOk(r.melding ?? ''); setOppsett(null); setKode(''); setAv(false); router.refresh();
  };

  if (pa) return (
    <div className="stakk">
      <div className="varsel gronn">Totrinns innlogging er på. Ved innlogging trenger du både passordet og koden fra appen.</div>
      {ok && <div className="varsel gronn">{ok}</div>}
      {!av ? <div><button type="button" className="knapp hvit liten" onClick={() => setAv(true)}>Slå av</button></div> : (
        <div className="rad" style={{ flexWrap: 'nowrap' }}>
          <input className="inndata mono" inputMode="numeric" maxLength={7} value={kode} onChange={e => setKode(e.target.value)} placeholder="Kode fra appen" aria-label="Kode fra appen" />
          <button type="button" className="knapp hvit" onClick={() => kjor(() => slaAvTotrinn(kode))}>Slå av</button>
        </div>
      )}
      {feil && <div className="varsel rod">{feil}</div>}
    </div>
  );

  return (
    <div className="stakk">
      <p className="mut" style={{ margin: 0 }}>Med totrinns innlogging trenger man både passordet ditt og en kode fra mobilen for å komme inn. Du bruker en gratis autentiseringsapp, for eksempel Google Authenticator eller Microsoft Authenticator.</p>
      {ok && <div className="varsel gronn">{ok}</div>}
      {!oppsett ? <div><button type="button" className="knapp" onClick={async () => { setFeil(''); const r = await startTotrinn(); if (r.ok) setOppsett(r.data!); else setFeil(r.feil); }}>Slå på totrinns innlogging</button></div> : (
        <div className="stakk">
          <ol className="mut liten" style={{ margin: 0, paddingLeft: 18 }}>
            <li>Åpne autentiseringsappen og velg «Legg til konto» eller «+».</li>
            <li>Skann QR-koden. På mobilen kan du trykke på lenken under i stedet.</li>
            <li>Skriv inn de 6 sifrene appen viser for Rettført.</li>
          </ol>
          <div className="rad" style={{ alignItems: 'flex-start', gap: 20 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={oppsett.qr} alt="QR-kode for autentiseringsappen" width={180} height={180} style={{ borderRadius: 8, border: '1px solid var(--linje)' }} />
            <div className="stakk" style={{ gap: 8, flex: 1, minWidth: 220 }}>
              <a className="lenke liten" href={oppsett.uri}>Åpne i autentiseringsappen (på mobilen)</a>
              <div className="liten mut">Eller skriv inn nøkkelen:<div className="mono" style={{ color: 'var(--ink)', marginTop: 4, wordBreak: 'break-all' }}>{oppsett.hemmelighet}</div></div>
              <div className="rad" style={{ flexWrap: 'nowrap' }}>
                <input className="inndata mono" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={kode} onChange={e => setKode(e.target.value)} placeholder="000000" aria-label="Kode fra appen" />
                <button type="button" className="knapp" onClick={() => kjor(() => bekreftTotrinn(kode))}>Bekreft</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {feil && <div className="varsel rod">{feil}</div>}
    </div>
  );
}
