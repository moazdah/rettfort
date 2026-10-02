'use client';

import { useState } from 'react';
import { apneLonnslippHandling } from '@/app/handlinger';
import type { LonnslippPdfData } from '@/lib/pdf';
import { kr } from '@/lib/penger';
import { formaterKontonr } from '@/lib/vis';

export function ApneLonnslipp({ token, foretak, periode, type, fornavn }: { token: string; foretak: string; periode: string; type: string; fornavn: string }) {
  const [passord, setPassord] = useState('');
  const [feil, setFeil] = useState('');
  const [venter, setVenter] = useState(false);
  const [slipp, setSlipp] = useState<{ data: LonnslippPdfData; pdf: string } | null>(null);
  const fnr = type === 'fnr';

  const apne = async (e: React.FormEvent) => {
    e.preventDefault(); setFeil(''); setVenter(true);
    const r = await apneLonnslippHandling(token, passord);
    setVenter(false);
    if (!r.ok) { setFeil(r.feil); return; }
    setSlipp(r.data!); setPassord('');
  };
  const lastNed = () => {
    if (!slipp) return;
    const b = Uint8Array.from(atob(slipp.pdf), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([b], { type: 'application/pdf' }));
    const a = document.createElement('a'); a.href = url; a.download = `lonnslipp-${periode.replace(/\s+/g, '-')}.pdf`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  if (!slipp) return (
    <form className="stakk" onSubmit={apne}>
      <h1>Hei, {fornavn}</h1>
      <p className="mut" style={{ marginTop: -4 }}>Lønnslippen din for {periode} fra {foretak} er klar. {fnr ? 'Skriv fødselsnummeret ditt for å åpne den.' : 'Skriv passordet du har fått av arbeidsgiveren.'}</p>
      <label className="felt"><span>{fnr ? 'Fødselsnummer (11 siffer)' : 'Passord'}</span>
        <input className="inndata mono" type="password" inputMode={fnr ? 'numeric' : undefined} autoComplete="off" value={passord} onChange={e => setPassord(e.target.value)} autoFocus maxLength={fnr ? 13 : 100} />
      </label>
      {feil && <div className="varsel rod" role="alert">{feil}</div>}
      <button className="knapp" disabled={venter || !passord.trim()}>{venter ? 'Åpner …' : 'Åpne lønnslippen'}</button>
      <p className="mut liten">Lønnslippen vises bare her og sendes ikke videre. Etter 5 feil forsøk må du vente 15 minutter.</p>
    </form>
  );

  const d = slipp.data;
  return (
    <div className="stakk">
      <div className="dokument">
        <div className="rad" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>{d.logoUrl && <img src={d.logoUrl} alt={d.foretak.navn} className="dok-logo" />}<b>{d.foretak.navn}</b>{d.foretak.orgnr && <div className="mut">Org.nr {d.foretak.orgnr.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')}</div>}</div>
          <div style={{ textAlign: 'right' }}><b style={{ fontSize: 16 }}>Lønnslipp</b><div className="mut">{d.periodeTekst}</div><div className="mut">Utbetalt {d.utbetalt.split('-').reverse().join('.')}</div></div>
        </div>
        <div style={{ margin: '14px 0' }}><b>{d.ansatt.navn}</b><div className="mut">{d.ansatt.stilling ?? ''}{d.ansatt.kontonr ? ` · konto ${formaterKontonr(d.ansatt.kontonr)}` : ''}</div></div>
        <table><thead><tr><th>Beskrivelse</th><th style={{ textAlign: 'right' }}>Beløp</th></tr></thead>
          <tbody>
            {d.linjer.map((l, i) => <tr key={i}><td>{l.tekst}{l.antall != null ? ` · ${String(l.antall).replace('.', ',')} t à ${kr(l.sats ?? 0)}` : ''}</td><td className="belop" style={{ textAlign: 'right' }}>{kr(l.belop)}</td></tr>)}
            <tr><td>Skattetrekk {String(d.skatteprosent).replace('.', ',')} %</td><td className="belop" style={{ textAlign: 'right' }}>−{kr(d.skatt)}</td></tr>
            {(d.utlegg ?? []).map((u, i) => <tr key={`u${i}`}><td>Refusjon av utlegg: {u.tekst}</td><td className="belop" style={{ textAlign: 'right' }}>{kr(u.belop)}</td></tr>)}
          </tbody>
        </table>
        <div className="rad" style={{ justifyContent: 'space-between', fontWeight: 700, fontSize: 15, marginTop: 10 }}><span>Utbetalt</span><span className="belop">{kr(d.netto + (d.utlegg ?? []).reduce((a, u) => a + u.belop, 0))} kr</span></div>
        <div className="mut liten" style={{ marginTop: 10 }}>Feriepenger opptjent denne måneden: {kr(d.feriepenger)} kr ({String(d.feriePst).replace('.', ',')} %)</div>
      </div>
      <button type="button" className="knapp" onClick={lastNed}>Last ned PDF</button>
    </div>
  );
}
