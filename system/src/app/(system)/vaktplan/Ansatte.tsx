'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { VaktAnsatt } from '@/lib/tjenester/vaktplan';
import { avtaltMin, timer, type VaktMal } from '@/lib/vaktplan';
import { kr } from '@/lib/penger';
import { lagreVaktAnsattHandling, inviterAnsattHandling, settOvertidHandling, lagreMalerHandling } from '@/app/vaktplan-handlinger';
import { Kopier } from '@/components/Kopier';
import { VpFaner, type Faner } from '@/components/VpFaner';

const TILGANG: Record<string, [string, string]> = { ingen: ['Ikke invitert', ''], invitert: ['Invitert', 'gul'], aktiv: ['Logget inn', 'gronn'] };

/** Ansatte i vaktplanen. Samme personer som i Lønn. */
export function VaktAnsatte({ faner, ansatte, maler, endre }: { faner: Faner; ansatte: VaktAnsatt[]; maler: VaktMal[]; endre: boolean }) {
  const router = useRouter();
  const [skjema, setSkjema] = useState<VaktAnsatt | 'ny' | null>(null);
  const [lenke, setLenke] = useState<{ navn: string; url: string; sendt: boolean } | null>(null);
  const [melding, setMelding] = useState<{ tekst: string; feil?: boolean } | null>(null);
  const [opptatt, setOpptatt] = useState('');
  const overtid = ansatte[0]?.overtidProsent ?? 40;

  const inviter = async (a: VaktAnsatt) => {
    setOpptatt(a.id); setMelding(null);
    const r = await inviterAnsattHandling(a.id);
    setOpptatt('');
    if (!r.ok) { setMelding({ tekst: r.feil, feil: true }); return; }
    setLenke({ navn: a.navn, url: r.data!.lenke, sendt: r.data!.sendt });
    router.refresh();
  };

  return (
    <div className="stakk" style={{ gap: 18 }}>
      <div className="vp-topp">
        <VpFaner f={faner} />
        {endre && <button type="button" className="knapp" onClick={() => setSkjema('ny')}>Legg til ansatt</button>}
      </div>
      {melding && <div className={`varsel ${melding.feil ? 'rod' : 'gronn'} liten`}>{melding.tekst}</div>}
      {lenke && (
        <div className="varsel info liten" style={{ display: 'block' }}>
          {lenke.sendt ? <>Invitasjonen er sendt til {lenke.navn} på e-post.</> : <>Send lenken til {lenke.navn} på SMS eller e-post. Den logger rett inn i vaktplanen.</>}
          <div className="rad" style={{ marginTop: 8, flexWrap: 'nowrap', gap: 8 }}><span className="mono liten" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{lenke.url}</span><Kopier tekst={lenke.url} /></div>
        </div>
      )}

      {ansatte.length ? (
        <div className="kort" style={{ padding: 0, overflow: 'auto' }}>
          <table className="tabell vp-ansatte">
            <thead><tr><th>Navn</th><th>Lønn</th><th>Stilling</th><th>Avtalt per uke</th><th>Tilgang</th><th /></tr></thead>
            <tbody>
              {ansatte.map(a => {
                const av = avtaltMin(a);
                const [t, farge] = TILGANG[a.tilgang] ?? TILGANG.ingen;
                return (
                  <tr key={a.id}>
                    <td><span className="rad" style={{ gap: 12, flexWrap: 'nowrap' }}><span className="vp-avatar">{a.navn.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase()}</span><span><b>{a.navn}</b><span className="mut liten" style={{ display: 'block' }}>{[a.stilling, a.kontakt ?? a.epost].filter(Boolean).join(' · ') || 'Ingen kontaktinfo'}</span></span></span></td>
                    <td data-l="Lønn">{a.lonnType === 'time' ? `Timelønn, ${kr(a.timesats, { desimaler: false })} kr` : a.lonnType === 'provisjon' ? 'Provisjon' : `Fast, ${kr(a.manedslonn, { desimaler: false })} kr/mnd`}</td>
                    <td data-l="Stilling">{a.lonnType === 'time' ? 'Etter behov' : `${a.stillingsprosent} %`}</td>
                    <td className="mono" data-l="Avtalt">{av ? timer(av) : '–'}</td>
                    <td><span className={`merke ${farge}`}>{t}</span></td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {endre && <button type="button" className="knapp hvit liten" onClick={() => setSkjema(a)}>Endre</button>}
                      {endre && a.tilgang !== 'aktiv' && (a.kontakt || a.epost) && <button type="button" className="knapp liten" style={{ marginLeft: 6 }} disabled={!!opptatt} onClick={() => inviter(a)}>{opptatt === a.id ? '…' : a.tilgang === 'ingen' ? 'Inviter' : 'Send på nytt'}</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <section className="kort tom"><p className="mut">Ingen ansatte ennå. Legg til den første.</p></section>}

      <div className="rutenett to">
        <section className="kort stakk">
          <h2>Overtid</h2>
          <p className="mut liten" style={{ margin: 0 }}>Timer over 9 per dag eller 40 per uke er overtid, med {overtid} % tillegg. Gjelder både faste og timelønnede.</p>
          <p className="mut liten" style={{ margin: 0 }}>For deltid er timer over avtalt stilling merarbeid, med vanlig timelønn, helt til 40 timer.</p>
          <div className="rad" style={{ gap: 10 }}>
            <span className="mut liten">Tillegg</span>
            <span className="faner liten">{[40, 50, 100].map(p => <button key={p} type="button" disabled={!endre} className={overtid === p ? 'aktiv' : ''} onClick={async () => { const r = await settOvertidHandling(p); setMelding(r.ok ? { tekst: `Overtidstillegget er ${p} %.` } : { tekst: r.feil, feil: true }); router.refresh(); }}>{p} %</button>)}</span>
          </div>
        </section>
        <section className="kort stakk">
          <h2>Timer går rett til lønn</h2>
          <p className="mut liten" style={{ margin: 0 }}>Når en uke er over, blir vaktene til timelister under Lønn. Overtid og merarbeid regnes ut for deg. Du godkjenner før lønnen kjøres.</p>
          <p className="mut liten" style={{ margin: 0 }}>De ansatte logger inn med en lenke på SMS eller e-post. De ser bare vaktplanen, ikke regnskapet.</p>
        </section>
      </div>

      <Maler start={maler} endre={endre} onLagret={t => { setMelding({ tekst: t }); router.refresh(); }} />

      {skjema && <AnsattSkjema a={skjema === 'ny' ? null : skjema} onLukk={() => setSkjema(null)} onFerdig={(t, l) => { setSkjema(null); setMelding({ tekst: t }); if (l) setLenke(l); router.refresh(); }} />}
    </div>
  );
}

function Maler({ start, endre, onLagret }: { start: VaktMal[]; endre: boolean; onLagret: (t: string) => void }) {
  const [m, setM] = useState(start);
  const [feil, setFeil] = useState('');
  const sett = (i: number, k: keyof VaktMal, v: string) => setM(x => x.map((y, j) => (j === i ? { ...y, [k]: v } : y)));
  return (
    <section className="kort stakk">
      <h2>Vaktmaler</h2>
      <p className="mut liten" style={{ margin: 0 }}>Snarveiene du får når du lager en vakt.</p>
      {m.map((x, i) => (
        <div key={i} className="vp-mal">
          <input className="inndata" value={x.navn} onChange={e => sett(i, 'navn', e.target.value)} aria-label="Navn på mal" disabled={!endre} />
          <input className="inndata mono" type="time" value={x.start} onChange={e => sett(i, 'start', e.target.value)} aria-label="Fra" disabled={!endre} />
          <input className="inndata mono" type="time" value={x.slutt} onChange={e => sett(i, 'slutt', e.target.value)} aria-label="Til" disabled={!endre} />
          {endre && <button type="button" className="lenke liten" onClick={() => setM(y => y.filter((_, j) => j !== i))}>Fjern</button>}
        </div>
      ))}
      {endre && (
        <div className="rad" style={{ gap: 8 }}>
          {m.length < 8 && <button type="button" className="knapp hvit liten" onClick={() => setM(y => [...y, { navn: 'Ny', start: '09:00', slutt: '17:00' }])}>Legg til mal</button>}
          <button type="button" className="knapp liten" onClick={async () => { setFeil(''); const r = await lagreMalerHandling(m); if (r.ok) onLagret('Malene er lagret.'); else setFeil(r.feil); }}>Lagre malene</button>
        </div>
      )}
      {feil && <div className="varsel rod liten">{feil}</div>}
    </section>
  );
}

function AnsattSkjema({ a, onLukk, onFerdig }: { a: VaktAnsatt | null; onLukk: () => void; onFerdig: (t: string, lenke?: { navn: string; url: string; sendt: boolean }) => void }) {
  const [navn, setNavn] = useState(a?.navn ?? '');
  const [kontakt, setKontakt] = useState(a?.kontakt ?? a?.epost ?? '');
  const [stilling, setStilling] = useState(a?.stilling ?? '');
  const [type, setType] = useState<'fast' | 'time'>(a?.lonnType === 'time' ? 'time' : 'fast');
  const [pst, setPst] = useState(a?.stillingsprosent ?? 100);
  const [sats, setSats] = useState(a ? String((type === 'time' ? a.timesats : a.manedslonn) / 100) : '');
  const [feil, setFeil] = useState('');
  const [venter, setVenter] = useState(false);
  const lagre = async (inviter: boolean) => {
    setVenter(true); setFeil('');
    const r = await lagreVaktAnsattHandling({ id: a?.id, navn, kontakt, stilling, lonnType: type, stillingsprosent: pst, sats: Math.round(Number(sats.replace(/\s/g, '').replace(',', '.')) * 100) || 0, inviter });
    setVenter(false);
    if (!r.ok) { setFeil(r.feil); return; }
    onFerdig(a ? 'Endringene er lagret.' : `${navn} er lagt til. Hen er også med under Lønn.`, inviter && r.data!.lenke ? { navn, url: r.data!.lenke, sendt: r.data!.sendt } : undefined);
  };
  return (
    <div className="modal-bak" onClick={onLukk}>
      <div className="modal kort stakk" onClick={e => e.stopPropagation()} role="dialog" aria-label={a ? 'Endre ansatt' : 'Legg til ansatt'}>
        <div className="rad" style={{ justifyContent: 'space-between' }}><h2>{a ? `Endre ${a.navn}` : 'Legg til ansatt'}</h2><button type="button" className="lenke" onClick={onLukk}>Lukk</button></div>
        <label className="felt"><span>Navn</span><input className="inndata" value={navn} onChange={e => setNavn(e.target.value)} autoFocus /></label>
        <label className="felt"><span>Mobil eller e-post</span><input className="inndata" value={kontakt} onChange={e => setKontakt(e.target.value)} placeholder="900 00 000 eller navn@epost.no" /><span className="hint">Hit sender vi lenken til vaktplanen.</span></label>
        <label className="felt"><span>Stilling</span><input className="inndata" value={stilling} onChange={e => setStilling(e.target.value)} placeholder="Butikkmedarbeider" /></label>
        <div className="rad" style={{ gap: 6 }}>
          <button type="button" className={`knapp liten ${type === 'fast' ? '' : 'hvit'}`} onClick={() => setType('fast')}>Fastlønn</button>
          <button type="button" className={`knapp liten ${type === 'time' ? '' : 'hvit'}`} onClick={() => setType('time')}>Timelønn</button>
        </div>
        <label className="felt"><span>Stillingsprosent: {pst} % {type === 'fast' ? `(${timer(Math.round(37.5 * 60 * pst / 100))} per uke)` : ''}</span><input type="range" min={10} max={100} step={5} value={pst} onChange={e => setPst(Number(e.target.value))} /></label>
        <label className="felt"><span>{type === 'time' ? 'Timelønn (kr)' : 'Månedslønn (kr)'}</span><input className="inndata mono" inputMode="decimal" value={sats} onChange={e => setSats(e.target.value)} /></label>
        {feil && <div className="varsel rod liten">{feil}</div>}
        <div className="rad" style={{ gap: 8 }}>
          {!a && <button type="button" className="knapp" disabled={venter || !kontakt.trim()} onClick={() => lagre(true)}>Lagre og send invitasjon</button>}
          <button type="button" className={`knapp ${a ? '' : 'hvit'}`} disabled={venter} onClick={() => lagre(false)}>{a ? 'Lagre' : 'Lagre uten invitasjon'}</button>
        </div>
      </div>
    </div>
  );
}
