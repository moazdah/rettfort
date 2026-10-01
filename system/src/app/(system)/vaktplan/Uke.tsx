'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { hentUke, Trenger } from '@/lib/tjenester/vaktplan';
import { arbeidMin, kortTid, timer } from '@/lib/vaktplan';
import { VpFaner, type Faner } from '@/components/VpFaner';
import { lagreVaktHandling, sjekkVakt, slettVaktHandling, gjorLedigHandling, beholdHandling, tildelHandling, publiserHandling, kopierUkeHandling, svarFriHandling } from '@/app/vaktplan-handlinger';

type Data = Awaited<ReturnType<typeof hentUke>>;
type Vakt = Data['vakter'][number];
type Uke = { aar: number; uke: number };

const KORT = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
const LANG = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];
const MND = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
const dm = (d: string) => `${Number(d.slice(8))}. ${MND[Number(d.slice(5, 7)) - 1]}`;
const dagNavn = (d: string) => KORT[(new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7];
const initialer = (n: string) => n.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase();

/** Lederens ukevisning: rutenett med ansatte og dager, forespørsler og publisering. */
export function VaktUke({ faner, data, trenger, idag, forrige, neste, assistent, endre, nyVakt = false }: { faner: Faner; data: Data; trenger: Trenger; idag: string; forrige: Uke; neste: Uke; assistent: boolean; endre: boolean; nyVakt?: boolean }) {
  const router = useRouter();
  const { aar, uke, dager, status, ansatte, vakter, tilgj, perAnsatt, maler } = data;
  const [modal, setModal] = useState<{ vakt?: Vakt; ansattId: string | null; dato: string } | null>(nyVakt && endre ? { ansattId: null, dato: dager.includes(idag) ? idag : dager[0] } : null);
  const [melding, setMelding] = useState<{ tekst: string; feil?: boolean } | null>(null);
  const [opptatt, setOpptatt] = useState('');
  const [dagValgt, setDagValgt] = useState(dager.includes(idag) ? idag : dager[0]);

  const kjor = async (navn: string, fn: () => Promise<{ ok: boolean; feil?: string; melding?: string }>, ok?: string) => {
    setOpptatt(navn); setMelding(null);
    const r = await fn();
    setOpptatt('');
    if (!r.ok) setMelding({ tekst: r.feil!, feil: true }); else if (ok ?? r.melding) setMelding({ tekst: (ok ?? r.melding)! });
    router.refresh();
  };

  const navn = (id: string | null) => ansatte.find(a => a.id === id)?.navn ?? '';
  const fornavn = (id: string | null) => navn(id).split(' ')[0];
  const celle = (ansattId: string | null, dato: string) => vakter.filter(v => v.ansattId === ansattId && v.dato === dato);
  const pa = (dato: string) => vakter.filter(v => v.dato === dato && v.ansattId).length;
  const ledige = (dato: string) => vakter.filter(v => v.dato === dato && !v.ansattId).length;
  const antallTrenger = trenger.fri.length + trenger.bytte.length + trenger.ledigeMedInteresse.length;
  const [stTekst, stKlasse] = status === 'publisert' ? ['Publisert', 'gronn'] : status === 'endret' ? ['Endringer ikke publisert', 'gul'] : ['Utkast, ikke publisert', ''];
  const sporAssistent = (q: string) => window.dispatchEvent(new CustomEvent('rf:assistent', { detail: { sporsmal: q } }));
  const dagLang = (d: string) => `${LANG[(new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7]} ${dm(d)}`;
  const paJobbTekst = (d: string) => `${pa(d)} på jobb${ledige(d) ? `, ${ledige(d)} ledig` : ''}`;

  return (
    <div className="stakk" style={{ gap: 18 }}>
      <div className="vp-topp">
        <VpFaner f={faner} />
        <div className="vp-topp-hoyre">
          <div className="vp-ukevelger">
            <Link href={`/vaktplan?uke=${forrige.aar}-${forrige.uke}`} aria-label="Forrige uke">‹</Link>
            <b>Uke {uke} · {dm(dager[0])} – {dm(dager[6])}</b>
            <Link href={`/vaktplan?uke=${neste.aar}-${neste.uke}`} aria-label="Neste uke">›</Link>
          </div>
          <span className={`merke ${stKlasse}`}>{stTekst}</span>
          {endre && status !== 'publisert' && vakter.some(v => v.ansattId) && (
            <button type="button" className="knapp" disabled={!!opptatt} onClick={() => kjor('pub', async () => {
              const r = await publiserHandling(aar, uke);
              return r.ok ? { ok: true, melding: `Publisert. ${r.data!.varslet} fikk e-post${r.data!.uten ? `, ${r.data!.uten} har ikke e-post (send lenken under Ansatte)` : ''}.` } : r;
            })}>{opptatt === 'pub' ? 'Publiserer …' : status === 'endret' ? 'Publiser endringene' : 'Publiser og varsle'}</button>
          )}
        </div>
      </div>
      {melding && <div className={`varsel ${melding.feil ? 'rod' : 'gronn'} liten`}>{melding.tekst}</div>}

      {antallTrenger > 0 && endre && (
        <section className="vp-trenger">
          <div className="vp-trenger-topp"><b>Trenger svar</b><span className="teller">{antallTrenger}</span></div>
          {trenger.fri.map(f => (
            <div key={f.id} className="vp-trenger-rad">
              <span className="vp-avatar">{initialer(f.navn)}</span>
              <span className="fyll"><span>{f.navn} ber om fri {dagLang(f.dato).toLowerCase()}</span>
                <small>{[f.grunn ? `${f.grunn}.` : '', ...celle(f.ansattId, f.dato).map(v => `Har vakt ${kortTid(v.start, v.slutt)}.`), f.harVakt ? 'Vakten blir ledig hvis du godkjenner.' : ''].filter(Boolean).join(' ')}</small></span>
              <span className="vp-trenger-knapper">
                <button type="button" className="knapp liten" disabled={!!opptatt} onClick={() => kjor('f' + f.id, () => svarFriHandling(f.id, true))}>Godkjenn</button>
                <button type="button" className="knapp hvit liten" disabled={!!opptatt} onClick={() => kjor('f' + f.id, () => svarFriHandling(f.id, false))}>Avslå</button>
              </span>
            </div>
          ))}
          {trenger.bytte.map(v => (
            <div key={v.id} className="vp-trenger-rad">
              <span className="vp-avatar">{initialer(v.navn)}</span>
              <span className="fyll"><span>{v.navn} vil bytte bort {dagLang(v.dato).toLowerCase()}, {kortTid(v.start, v.slutt)}</span>
                <small>Gjør vakten ledig så andre kan ta den, eller behold den hos {v.navn.split(' ')[0]}.</small></span>
              <span className="vp-trenger-knapper">
                <button type="button" className="knapp liten" disabled={!!opptatt} onClick={() => kjor('b' + v.id, () => gjorLedigHandling(v.id))}>Gjør ledig</button>
                <button type="button" className="knapp hvit liten" disabled={!!opptatt} onClick={() => kjor('b' + v.id, () => beholdHandling(v.id))}>Behold</button>
              </span>
            </div>
          ))}
          {trenger.ledigeMedInteresse.map(v => (
            <div key={v.id} className="vp-trenger-rad">
              <span className="vp-avatar tom">+</span>
              <span className="fyll"><span>{dagLang(v.dato)}, {kortTid(v.start, v.slutt)} er ledig</span>
                <small>{v.interessenter.map(i => i.navn.split(' ')[0]).join(' og ')} vil ta den.{v.interessenter.filter(i => i.merknad).map(i => ` ${i.navn.split(' ')[0]} får ${/overtid/.test(i.merknad!) ? 'overtid' : /merarbeid/.test(i.merknad!) ? 'merarbeid' : 'en vakt til samme dag'}.`).join('')}</small></span>
              <span className="vp-trenger-knapper">
                {v.interessenter.map((i, n) => (
                  <button key={i.id} type="button" className={`knapp liten ${n ? 'hvit' : ''}`} title={i.merknad ?? undefined} disabled={!!opptatt} onClick={() => kjor('l' + v.id, () => tildelHandling(v.id, i.id))}>Gi til {i.navn.split(' ')[0]}</button>
                ))}
              </span>
            </div>
          ))}
        </section>
      )}

      {!ansatte.length ? (
        <section className="kort tom stakk">
          <b>Ingen ansatte ennå</b>
          <p className="mut">Legg til de ansatte først. De blir også med i Lønn.</p>
          <div><Link href="/vaktplan?vis=ansatte" className="knapp">Legg til ansatt</Link></div>
        </section>
      ) : (
        <>
          <div className="vp-rutenett-ramme">
            <div className="vp-rutenett" role="grid" aria-label={`Vaktplan uke ${uke}`}>
              <div className="vp-hode vp-hjorne"><small>{ansatte.length} ansatte</small></div>
              {dager.map(d => (
                <div key={d} className={`vp-hode ${d === idag ? 'idag' : ''}`}>
                  <b>{dagNavn(d)} {dm(d)}</b>
                  <small>{paJobbTekst(d)}</small>
                </div>
              ))}

              <div className="vp-radhode ledig-rad"><span className="fyll"><b>Ledige vakter</b><small>Alle ansatte ser disse</small></span></div>
              {dager.map(d => (
                <div key={d} className="vp-celle ledig-rad" onClick={() => endre && setModal({ ansattId: null, dato: d })}>
                  {celle(null, d).map(v => <Brikke key={v.id} v={v} onClick={() => endre && setModal({ vakt: v, ansattId: null, dato: d })} />)}
                </div>
              ))}

              {ansatte.map(a => {
                const u = perAnsatt[a.id];
                const avtalt = u?.avtalt ?? null;
                const andel = Math.min(100, ((u?.arbeid ?? 0) / (avtalt ?? 2400)) * 100);
                const varm = (u?.overtid ?? 0) > 0 || (u?.merarbeid ?? 0) > 0;
                return [
                  <div key={a.id} className="vp-radhode">
                    <span className="vp-avatar">{initialer(a.navn)}</span>
                    <span className="fyll">
                      <b>{a.navn}</b>
                      <small>{avtalt ? `${timer(u?.arbeid ?? 0).replace(' t', '')} av ${timer(avtalt)}` : `${timer(u?.arbeid ?? 0)} · timelønn`}{(u?.overtid ?? 0) > 0 ? ` · ${timer(u.overtid)} overtid` : ''}</small>
                      <span className="vp-strek"><span className={varm ? 'varm' : ''} style={{ width: `${andel}%` }} /></span>
                    </span>
                  </div>,
                  ...dager.map(d => {
                    const t = tilgj.find(x => x.ansattId === a.id && x.dato === d);
                    const her = celle(a.id, d);
                    return (
                      <div key={a.id + d} className={`vp-celle ${t?.status === 'kan' ? 'kan' : t?.status === 'kan_ikke' ? 'kan-ikke' : ''} ${her.length ? '' : 'tom'}`} title={t?.status === 'kan_ikke' ? `Kan ikke${t.grunn ? `: ${t.grunn}` : ''}` : undefined}
                        onClick={() => endre && setModal({ ansattId: a.id, dato: d })}>
                        {her.map(v => <Brikke key={v.id} v={v} kanIkke={t?.status === 'kan_ikke'} onClick={() => endre && setModal({ vakt: v, ansattId: a.id, dato: d })} />)}
                        {!her.length && t?.status === 'kan_ikke' && <span className="vp-celletekst rod">{t.grunn || 'Kan ikke'}</span>}
                        {!her.length && t?.status === 'kan' && <span className="vp-celletekst gronn">Kan jobbe</span>}
                        {!her.length && !t && endre && <span className="vp-pluss" aria-hidden>+</span>}
                      </div>
                    );
                  }),
                ];
              })}
            </div>
          </div>

          {/* Mobil: én dag om gangen */}
          <div className="vp-dag">
            <div className="vp-dagvelger" role="tablist" aria-label="Velg dag">
              {dager.map(d => (
                <button key={d} type="button" role="tab" aria-selected={d === dagValgt} className={d === dagValgt ? 'valgt' : ''} onClick={() => setDagValgt(d)}>
                  <small>{dagNavn(d)}</small><b>{Number(d.slice(8))}</b>{ledige(d) > 0 && <i aria-label="ledig vakt" />}
                </button>
              ))}
            </div>
            <div className="rad" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
              <div><b className="vp-dag-tittel">{dagLang(dagValgt)}</b><div className="mut liten">{paJobbTekst(dagValgt)}</div></div>
              {endre && <button type="button" className="knapp" onClick={() => setModal({ ansattId: null, dato: dagValgt })}>+ Vakt</button>}
            </div>
            <div className="vp-dagliste">
              {[...celle(null, dagValgt), ...vakter.filter(v => v.dato === dagValgt && v.ansattId).sort((x, y) => x.start.localeCompare(y.start))].map(v => {
                const t = tilgj.find(x => x.ansattId === v.ansattId && x.dato === dagValgt);
                return (
                  <button key={v.id} type="button" className="vp-dagrad" onClick={() => endre && setModal({ vakt: v, ansattId: v.ansattId, dato: dagValgt })}>
                    <span className={`vp-avatar ${v.ansattId ? '' : 'tom'}`}>{v.ansattId ? initialer(navn(v.ansattId)) : '+'}</span>
                    <span className="fyll"><b>{v.ansattId ? navn(v.ansattId) : 'Ledig vakt'}</b>{!v.ansattId && <small>{v.interesse.length ? `${v.interesse.length} vil ta den` : 'Ingen ennå'}</small>}</span>
                    {v.overtid > 0 && <span className="merke gul">Overtid</span>}
                    {t?.status === 'kan_ikke' && <span className="merke rod">Kan ikke</span>}
                    {v.utlagt && <span className="merke">Vil bytte</span>}
                    <span className="mono">{kortTid(v.start, v.slutt)}</span>
                  </button>
                );
              })}
              {!vakter.some(v => v.dato === dagValgt) && <p className="mut" style={{ padding: '14px 16px', margin: 0 }}>Ingen vakter denne dagen.</p>}
            </div>
            {tilgj.some(x => x.dato === dagValgt && x.status === 'kan_ikke') && (
              <p className="mut liten" style={{ margin: 0 }}>Kan ikke jobbe: {tilgj.filter(x => x.dato === dagValgt && x.status === 'kan_ikke').map(x => `${fornavn(x.ansattId)}${x.grunn ? ` (${x.grunn.toLowerCase()})` : ''}`).join(', ')}</p>
            )}
          </div>
        </>
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
        <span><i className="overtid" /> Gir overtid</span>
        <span><i className="ledig" /> Ledig</span>
        <span><i className="kan" /> Tilgjengelig</span>
        <span><i className="kan-ikke" /> Kan ikke jobbe</span>
        {endre && <span className="vp-forklaring-hoyre">Klikk i en rute for å legge til en vakt.</span>}
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
      {v.overtid > 0 && <small>Overtid</small>}
      {v.utlagt && <small>Vil bytte</small>}
      {!v.ansattId && <small>{v.interesse.length ? `${v.interesse.length} vil ta den` : 'Ingen ennå'}</small>}
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
