'use client';

import { useEffect, useState } from 'react';

/**
 * Veiledning for å fylle ut et skjema hos Skatteetaten eller Altinn selv, felt for felt.
 * Hvert tall kan kopieres, og hver rad krysses av når den er fylt inn. Avkrysningen huskes i nettleseren.
 */
export function Utfylling({ id, rader, lenke, lenketekst }: {
  id: string;
  rader: { kode?: string; tekst: string; verdier: { etikett: string; verdi: string }[] }[];
  lenke: string; lenketekst: string;
}) {
  const nokkel = `rf-utfylling-${id}`;
  const [ferdig, setFerdig] = useState<Record<number, boolean>>({});
  const [kopiert, setKopiert] = useState('');
  useEffect(() => { try { setFerdig(JSON.parse(localStorage.getItem(nokkel) || '{}')); } catch { /* ingen lagring */ } }, [nokkel]);
  const kryss = (i: number) => {
    const ny = { ...ferdig, [i]: !ferdig[i] }; setFerdig(ny);
    try { localStorage.setItem(nokkel, JSON.stringify(ny)); } catch { /* ingen lagring */ }
  };
  const kopier = async (v: string, k: string) => {
    // Tall kopieres uten mellomrom, slik skjemaene vil ha dem.
    try { await navigator.clipboard.writeText(v.replace(/\s/g, '')); setKopiert(k); setTimeout(() => setKopiert(''), 1600); } catch { /* ingen tilgang */ }
  };
  const antall = rader.length, gjort = rader.filter((_, i) => ferdig[i]).length;

  return (
    <div className="utfylling">
      <div className="rad" style={{ justifyContent: 'space-between' }}>
        <a className="knapp" href={lenke} target="_blank" rel="noreferrer">{lenketekst} ↗</a>
        <span className="mut liten">{gjort} av {antall} fylt inn</span>
      </div>
      <div className="utfylling-rader">
        {rader.map((r, i) => (
          <div key={i} className={`utfylling-rad ${ferdig[i] ? 'gjort' : ''}`}>
            <label className="utfylling-kryss"><input type="checkbox" checked={!!ferdig[i]} onChange={() => kryss(i)} aria-label={`Fylt inn: ${r.tekst}`} /></label>
            <div className="fyll" style={{ minWidth: 0 }}>{r.kode && <span className="mono utfylling-kode">{r.kode}</span>}<span>{r.tekst}</span></div>
            <div className="utfylling-verdier">
              {r.verdier.map((v, j) => (
                <button type="button" key={j} className="utfylling-verdi" onClick={() => kopier(v.verdi, `${i}-${j}`)} title="Trykk for å kopiere">
                  <small>{v.etikett}</small><b className="mono">{kopiert === `${i}-${j}` ? 'Kopiert' : v.verdi}</b>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
