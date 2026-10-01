'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { hentUke, Trenger } from '@/lib/tjenester/vaktplan';
import { arbeidMin, kortTid, timer } from '@/lib/vaktplan';
import { lagreVaktHandling, sjekkVakt, slettVaktHandling, gjorLedigHandling, beholdHandling, tildelHandling, publiserHandling, kopierUkeHandling, svarFriHandling } from '@/app/vaktplan-handlinger';

type Data = Awaited<ReturnType<typeof hentUke>>;
type Vakt = Data['vakter'][number];
type Uke = { aar: number; uke: number };

const KORT = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
const MND = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
const dm = (d: string) => `${Number(d.slice(8))}. ${MND[Number(d.slice(5, 7)) - 1]}`;
const dagNavn = (d: string) => KORT[(new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7];
const initialer = (n: string) => n.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase();

/** Lederens ukevisning: rutenett med ansatte og dager, forespørsler og publisering. */
export function VaktUke({ data, trenger, idag, forrige, neste, assistent, endre }: { data: Data; trenger: Trenger; idag: string; forrige: Uke; neste: Uke; assistent: boolean; endre: boolean }) {
  const router = useRouter();
  const [modal, setModal] = useState<{ vakt?: Vakt; ansattId: string | null; dato: string } | null>(null);
  const [melding, setMelding] = useState<{ tekst: string; feil?: boolean } | null>(null);
  const [opptatt, setOpptatt] = useState('');
  const { aar, uke, dager, status, ansatte, vakter, tilgj, perAnsatt, maler } = data;

  const kjor = async (navn: string, fn: () => Promise<{ ok: boolean; feil?: string; melding?: string }>, ok?: string) => {
    setOpptatt(navn); setMelding(null);
    const r = await fn();
    setOpptatt('');
    if (!r.ok) setMelding({ tekst: r.feil!, feil: true }); else if (ok ?? r.melding) setMelding({ tekst: (ok ?? r.melding)! });
    router.refresh();
  };

  const celle = (ansattId: string | null, dato: string) => vakter.filter(v => v.ansattId === ansattId && v.dato === dato);
  const pa = (dato: string) => vakter.filter(v => v.dato === dato && v.ansattId).length;
  const ledige = (dato: string) => vakter.filter(v => v.dato === dato && !v.ansattId).length;
  const harTrenger = trenger.fri.length + trenger.bytte.length + trenger.ledigeMedInteresse.length > 0;
  const statusMerke = status === 'publisert' ? <span className="merke gronn">Publisert</span> : status === 'endret' ? <span className="merke gul">Endringer ikke publisert</span> : <span className="merke">Utkast</span>;
  const sporAssistent = (q: string) => window.dispatchEvent(new CustomEvent('rf:assistent', { detail: { sporsmal: q } }));

  return (
    <div className="stakk" style={{ gap: 18 }}>
      <div className="vp-topp">
        <div className="rad" style={{ gap: 6, flexWrap: 'nowrap' }}>
          <Link href={`/vaktplan?uke=${forrige.aar}-${forrige.uke}`} className="vp-pil" aria-label="Forrige uke">‹</Link>
          <div><b className="vp-uke">Uke {uke}</b> <span className="mut">· {dm(dager[0])} – {dm(dager[6])}</span></div>
          <Link href={`/vaktplan?uke=${neste.aar}-${neste.uke}`} className="vp-pil" aria-label="Neste uke">›</Link>
        </div>
        <div className="rad" style={{ gap: 10 }}>
          {statusMerke}
          {endre && status !== 'publisert' && vakter.some(v => v.ansattId) && (
            <button type="button" className="knapp" disabled={!!opptatt} onClick={() => kjor('pub', async () => {
              const r = await publiserHandling(aar, uke);
              return r.ok ? { ok: true, melding: `Publisert. ${r.data!.varslet} fikk e-post${r.data!.uten ? `, ${r.data!.uten} har ikke e-post (send lenken selv under Ansatte)` : ''}.` } : r;
            })}>{opptatt === 'pub' ? 'Publiserer …' : status === 'endret' ? 'Publiser endringene' : 'Publiser og varsle'}</button>
          )}
        </div>
      </div>
      {melding && <div className={`varsel ${melding.feil ? 'rod' : 'gronn'} liten`}>{melding.tekst}</div>}

      {harTrenger && endre && (
        <section className="kort stakk vp-trenger">
          <h2>Trenger svar</h2>
          <div className="liste">
            {trenger.fri.map(f => (
              <div key={f.id} className="linje">
                <span className="merke gul">Fri</span>
                <span className="fyll"><b>{f.navn}</b> ber om fri {dagNavn(f.dato).toLowerCase()} {dm(f.dato)}{f.grunn ? `: ${f.grunn}` : ''}{f.harVakt && <small className="mut" style={{ display: 'block' }}>Vakten blir ledig hvis du godkjenner.</small>}</span>
                <button type="button" className="knapp liten" disabled={!!opptatt} onClick={() => kjor('f' + f.id, () => svarFriHandling(f.id, true))}>Godkjenn</button>
                <button type="button" className="knapp hvit liten" disabled={!!opptatt} onClick={() => kjor('f' + f.id, () => svarFriHandling(f.id, false))}>Avslå</button>
              </div>
            ))}
            {trenger.bytte.map(v => (
              <div key={v.id} className="linje">
                <span className="merke">Bytte</span>
                <span className="fyll"><b>{v.navn}</b> vil bytte bort {dagNavn(v.dato).toLowerCase()} {dm(v.dato)} <span className="mono">{kortTid(v.start, v.slutt)}</span></span>
                <button type="button" className="knapp liten" disabled={!!opptatt} onClick={() => kjor('b' + v.id, () => gjorLedigHandling(v.id))}>Gjør ledig</button>
                <button type="button" className="knapp hvit liten" disabled={!!opptatt} onClick={() => kjor('b' + v.id, () => beholdHandling(v.id))}>Behold</button>
              </div>
            ))}
            {trenger.ledigeMedInteresse.map(v => (
              <div key={v.id} className="linje" style={{ flexWrap: 'wrap' }}>
                <span className="merke gronn">Ledig</span>
                <span className="fyll">{dagNavn(v.dato)} {dm(v.dato)} <span className="mono">{kortTid(v.start, v.slutt)}</span> · {v.interessenter.length} vil ta den</span>
                <span className="rad" style={{ gap: 6 }}>
                  {v.interessenter.map(i => (
                    <button key={i.id} type="button" className="knapp hvit liten" title={i.merknad ?? undefined} disabled={!!opptatt} onClick={() => kjor('l' + v.id, () => tildelHandling(v.id, i.id))}>
                      Gi til {i.navn.split(' ')[0]}{i.merknad ? ' ⚠' : ''}
                    </button>
                  ))}
                </span>
                {v.interessenter.some(i => i.merknad) && <small className="mut" style={{ flexBasis: '100%' }}>{v.interessenter.filter(i => i.merknad).map(i => i.merknad).join(' ')}</small>}
              </div>
            ))}
          </div>
        </section>
      )}

      {!ansatte.length ? (
        <section className="kort tom stakk">
          <b>Ingen ansatte ennå</b>
          <p className="mut">Legg til de ansatte først. De blir også med i Lønn.</p>
          <div><Link href="/vaktplan?vis=ansatte" className="knapp">Legg til ansatt</Link></div>
        </section>
      ) : (
        <div className="vp-rutenett-ramme">
          <div className="vp-rutenett" role="grid" aria-label={`Vaktplan uke ${uke}`}>
            <div className="vp-hode vp-hjorne" />
            {dager.map(d => (
              <div key={d} className={`vp-hode ${d === idag ? 'idag' : ''}`}>
                <b>{dagNavn(d)} {dm(d)}</b>
                <small>{pa(d)} på jobb{ledige(d) ? `, ${ledige(d)} ledig` : ''}</small>
              </div>
            ))}

            <div className="vp-radhode ledig-rad"><span className="vp-avatar tom">+</span><b>Ledige vakter</b></div>
            {dager.map(d => (
              <div key={d} className="vp-celle ledig-rad" onClick={() => endre && setModal({ ansattId: null, dato: d })}>
                {celle(null, d).map(v => <Brikke key={v.id} v={v} onClick={() => endre && setModal({ vakt: v, ansattId: null, dato: d })} />)}
              </div>
            ))}

            {ansatte.map(a => {
              const u = perAnsatt[a.id];
              const avtalt = u?.avtalt ?? null;
              const andel = avtalt ? Math.min(100, ((u?.arbeid ?? 0) / avtalt) * 100) : Math.min(100, ((u?.arbeid ?? 0) / 2400) * 100);
              const varm = (u?.overtid ?? 0) > 0 || (u?.merarbeid ?? 0) > 0;
              return [
                <div key={a.id} className="vp-radhode">
                  <span className="vp-avatar">{initialer(a.navn)}</span>
                  <span className="fyll">
                    <b>{a.navn}</b>
                    <small>{avtalt ? `${timer(u?.arbeid ?? 0).replace(' t', '')} av ${timer(avtalt)}` : `${timer(u?.arbeid ?? 0)} · timelønn`}</small>
                    <span className="vp-strek"><span className={varm ? 'varm' : ''} style={{ width: `${andel}%` }} /></span>
                    {(u?.overtid ?? 0) > 0 && <small className="tekst-gul">{timer(u.overtid)} overtid</small>}
                    {!u?.overtid && (u?.merarbeid ?? 0) > 0 && <small className="tekst-gul">{timer(u.merarbeid)} merarbeid</small>}
                  </span>
                </div>,
                ...dager.map(d => {
                  const t = tilgj.find(x => x.ansattId === a.id && x.dato === d);
                  return (
                    <div key={a.id + d} className={`vp-celle ${t?.status === 'kan' ? 'kan' : t?.status === 'kan_ikke' ? 'kan-ikke' : ''}`} title={t?.status === 'kan_ikke' ? `Kan ikke${t.grunn ? `: ${t.grunn}` : ''}` : t?.status === 'kan' ? 'Kan jobbe' : undefined}
                      onClick={() => endre && setModal({ ansattId: a.id, dato: d })}>
                      {celle(a.id, d).map(v => <Brikke key={v.id} v={v} kanIkke={t?.status === 'kan_ikke'} onClick={() => endre && setModal({ vakt: v, ansattId: a.id, dato: d })} />)}
                      {!celle(a.id, d).length && t?.status === 'kan_ikke' && <small className="vp-grunn">{t.grunn || 'Kan ikke'}</small>}
                    </div>
                  );
                }),
              ];
            })}
          </div>
        </div>
      )}

      {ansatte.length > 0 && !vakter.length && endre && (
        <section className="kort stakk vp-tom">
          <b>Uke {uke} er tom</b>
          <div className="rad" style={{ gap: 10 }}>
            <button type="button" className="knapp" disabled={!!opptatt} onClick={() => kjor('kop', async () => {
              const r = await kopierUkeHandling(forrige, { aar, uke });
              return r.ok ? { ok: true, melding: `Kopierte ${r.data} vakter fra uke ${forrige.uke}.` } : r;
            })}>Kopier uke {forrige.uke}</button>
            {assistent && <button type="button" className="knapp hvit" onClick={() => sporAssistent(`Lag vaktplan for uke ${uke}`)}>Lag forslag med assistenten</button>}
          </div>
          {assistent && (
            <div className="rad" style={{ gap: 6 }}>
              {[`Lag vaktplan for uke ${uke}`, 'Hvem bør ta en ledig vakt?', `Får noen overtid i uke ${uke}?`].map(q => <button key={q} type="button" className="vp-chip" onClick={() => sporAssistent(q)}>{q}</button>)}
            </div>
          )}
        </section>
      )}

      <div className="vp-forklaring">
        <span><i className="vanlig" /> Vakt</span>
        <span><i className="overtid" /> Overtid</span>
        <span><i className="kan-ikke-brikke" /> Har sagt «kan ikke»</span>
        <span><i className="kan" /> Kan jobbe</span>
        <span><i className="kan-ikke" /> Kan ikke</span>
      </div>

      {modal && <VaktModal key={modal.vakt?.id ?? modal.ansattId + modal.dato} start={modal} ansatte={ansatte} dager={dager} maler={maler} onLukk={() => setModal(null)} onFerdig={(t) => { setModal(null); setMelding(t ? { tekst: t } : null); router.refresh(); }} />}
    </div>
  );
}

function Brikke({ v, kanIkke, onClick }: { v: Vakt; kanIkke?: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`vp-brikke ${v.overtid > 0 ? 'overtid' : ''} ${kanIkke ? 'kan-ikke' : ''} ${v.ansattId ? '' : 'ledig'}`} onClick={e => { e.stopPropagation(); onClick(); }}
      title={`${kortTid(v.start, v.slutt)} · ${timer(v.arbeid)}${v.overtid ? ` · ${timer(v.overtid)} overtid` : ''}${v.merarbeid ? ` · ${timer(v.merarbeid)} merarbeid` : ''}`}>
      <span className="mono">{kortTid(v.start, v.slutt)}</span>
      {v.utlagt && <small>Vil bytte</small>}
      {!v.ansattId && v.interesse.length > 0 && <small>{v.interesse.length} vil ta</small>}
    </button>
  );
}

function VaktModal({ start, ansatte, dager, maler, onLukk, onFerdig }: { start: { vakt?: Vakt; ansattId: string | null; dato: string }; ansatte: Data['ansatte']; dager: string[]; maler: Data['maler']; onLukk: () => void; onFerdig: (melding?: string) => void }) {
  const v = start.vakt;
  const [ansattId, setAnsattId] = useState<string | null>(v?.ansattId ?? start.ansattId);
  const [dato, setDato] = useState(v?.dato ?? start.dato);
  const [fra, setFra] = useState(v?.start ?? maler[0]?.start ?? '07:00');
  const [til, setTil] = useState(v?.slutt ?? maler[0]?.slutt ?? '15:00');
  const [advarsler, setAdvarsler] = useState<string[]>([]);
  const [feil, setFeil] = useState('');
  const [venter, setVenter] = useState(false);
  const gyldig = /^\d{2}:\d{2}$/.test(fra) && /^\d{2}:\d{2}$/.test(til) && fra !== til;
  const arbeid = useMemo(() => (gyldig ? arbeidMin({ start: fra, slutt: til }) : 0), [fra, til, gyldig]);
  const pause = gyldig ? (arbeidMin({ start: fra, slutt: til, pauseMin: 0 }) - arbeid) : 0;

  useEffect(() => {
    if (!gyldig) return;
    const t = setTimeout(async () => { const r = await sjekkVakt({ id: v?.id, ansattId, dato, start: fra, slutt: til }); setAdvarsler(r.ok ? r.data! : []); }, 200);
    return () => clearTimeout(t);
  }, [ansattId, dato, fra, til, gyldig, v?.id]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onLukk(); }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [onLukk]);

  const lagre = async () => {
    setVenter(true); setFeil('');
    const r = await lagreVaktHandling({ id: v?.id, ansattId, dato, start: fra, slutt: til });
    setVenter(false);
    if (!r.ok) { setFeil(r.feil); return; }
    onFerdig(v ? 'Vakten er endret.' : 'Vakten er lagt til.');
  };
  const handling = async (fn: () => Promise<{ ok: boolean; feil?: string }>, ok: string) => {
    setVenter(true); setFeil('');
    const r = await fn();
    setVenter(false);
    if (!r.ok) { setFeil(r.feil!); return; }
    onFerdig(ok);
  };

  return (
    <div className="modal-bak" onClick={onLukk}>
      <div className="modal kort stakk vp-modal" onClick={e => e.stopPropagation()} role="dialog" aria-label={v ? 'Endre vakt' : 'Ny vakt'}>
        <div className="rad" style={{ justifyContent: 'space-between' }}><h2>{v ? 'Endre vakt' : 'Ny vakt'}</h2><button type="button" className="lenke" onClick={onLukk}>Lukk</button></div>
        <label className="felt"><span>Hvem</span>
          <select className="inndata" value={ansattId ?? ''} onChange={e => setAnsattId(e.target.value || null)}>
            <option value="">Ledig vakt</option>
            {ansatte.map(a => <option key={a.id} value={a.id}>{a.navn}</option>)}
          </select>
        </label>
        <label className="felt"><span>Dag</span>
          <select className="inndata" value={dato} onChange={e => setDato(e.target.value)}>{dager.map(d => <option key={d} value={d}>{dagNavn(d)} {dm(d)}</option>)}</select>
        </label>
        <div className="stakk" style={{ gap: 8 }}>
          <span className="mut liten">Tid</span>
          <div className="rad" style={{ gap: 6 }}>{maler.map(m => <button key={m.navn} type="button" className={`vp-chip ${fra === m.start && til === m.slutt ? 'valgt' : ''}`} onClick={() => { setFra(m.start); setTil(m.slutt); }}>{m.navn} {kortTid(m.start, m.slutt)}</button>)}</div>
          <div className="rad" style={{ gap: 10, flexWrap: 'nowrap' }}>
            <label className="felt fyll"><span>Fra</span><input className="inndata mono" type="time" value={fra} onChange={e => setFra(e.target.value)} /></label>
            <label className="felt fyll"><span>Til</span><input className="inndata mono" type="time" value={til} onChange={e => setTil(e.target.value)} /></label>
          </div>
          {gyldig && <span className="mut liten">{timer(arbeid)} arbeid{pause ? `, ${pause} min pause trukket fra` : ''}{til < fra ? ' · over midnatt' : ''}</span>}
        </div>
        {advarsler.length > 0 && <div className="varsel gul liten" style={{ display: 'block' }}>{advarsler.map(a => <div key={a}>{a}</div>)}</div>}
        {feil && <div className="varsel rod liten">{feil}</div>}
        <div className="rad" style={{ gap: 8 }}>
          <button type="button" className="knapp" disabled={venter || !gyldig} onClick={lagre}>{venter ? 'Lagrer …' : 'Lagre'}</button>
          {v?.ansattId && <button type="button" className="knapp hvit" disabled={venter} onClick={() => handling(() => gjorLedigHandling(v.id), 'Vakten er ledig.')}>Gjør ledig</button>}
          {v && <button type="button" className="knapp rod" disabled={venter} onClick={() => handling(() => slettVaktHandling(v.id), 'Vakten er slettet.')}>Slett</button>}
        </div>
      </div>
    </div>
  );
}
