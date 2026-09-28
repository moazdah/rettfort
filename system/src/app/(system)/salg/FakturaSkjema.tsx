'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BrregSok } from '@/components/BrregSok';
import { Maskot } from '@/components/Logo';
import { FakturaDokument, type DokAvsender } from '@/components/FakturaDokument';
import { lagreKontaktFraBrreg, lagreKontakt, lagreUtkastSalg, sendSalgHandling, lagreInnstillinger } from '@/app/handlinger';
import { mangler, forfallFra, type Kontakt, type Org, type SalgType } from '@/lib/tjenester/faktura';
import { fakturaSummer, type FakturaLinje } from '@/lib/hovedbok';
import { formaterOrgnr, type Enhet } from '@/lib/brreg';
import { kr, tilOre } from '@/lib/penger';
import { antallTekst, tilMilli } from '@/lib/vis';

type Linje = { beskrivelse: string; antall: string; pris: string; sats: number; konto?: number };
export interface SalgStart { id?: string; type: SalgType; kunde: Kontakt | null; dato: string; forfall: string | null; levert: string | null; referanse: string | null; linjer: FakturaLinje[]; gjentakelse: string | null }
export interface Videre { id: string; kontaktId: string; tekst: string; netto: number; sats: number }

const TYPER: [SalgType, string, string][] = [
  ['faktura', 'Faktura', 'Kunden betaler senere. Vi lager KID og følger med på betalingen.'],
  ['tilbud', 'Tilbud', 'Et pristilbud. Føres ikke i regnskapet før du gjør det om til faktura.'],
  ['kvittering', 'Kvittering', 'Kunden har betalt nå, for eksempel med Vipps eller kort. Føres som betalt.'],
];

const tilLinje = (l: FakturaLinje): Linje => ({ beskrivelse: l.beskrivelse, antall: antallTekst(l.antallMilli), pris: kr(l.pris), sats: l.sats, konto: l.konto });

export function FakturaSkjema({ org, kunder, start, idag, videre }: { org: Org & { faktura_tekst: string | null }; kunder: Kontakt[]; start?: SalgStart; idag: string; videre: Videre[] }) {
  const router = useRouter();
  const [type, setType] = useState<SalgType>(start?.type ?? 'faktura');
  const [kunde, setKunde] = useState<Kontakt | null>(start?.kunde ?? null);
  const [manuell, setManuell] = useState(false);
  const [mk, setMk] = useState({ navn: '', adresse: '', postnr: '', poststed: '', epost: '' });
  const [dato, setDato] = useState(start?.dato ?? idag);
  const [forfall, setForfall] = useState(start?.forfall || forfallFra(idag, org.faktura_forfall_dager));
  const [levert, setLevert] = useState(start?.levert ?? '');
  const [referanse, setReferanse] = useState(start?.referanse ?? '');
  const [mer, setMer] = useState(!!(start?.levert || start?.referanse));
  const std = org.mva_registrert ? 25 : 0;
  const [linjer, setLinjer] = useState<Linje[]>(start?.linjer.length ? start.linjer.map(tilLinje) : [{ beskrivelse: '', antall: '1', pris: '', sats: std }]);
  const [av, setAv] = useState({ navn: org.navn, adresse: org.adresse ?? '', postnr: org.postnr ?? '', poststed: org.poststed ?? '', kontonr: org.kontonr ?? '', epost: org.epost ?? '', telefon: org.telefon ?? '', tekst: org.faktura_tekst ?? '' });
  const [avApen, setAvApen] = useState(false);
  const [avAlle, setAvAlle] = useState(true);
  const [rep, setRep] = useState(start?.gjentakelse === 'maned');
  const [lagtTil, setLagtTil] = useState<string[]>([]);
  const [feil, setFeil] = useState('');
  const [venter, setVenter] = useState(false);
  const [sendt, setSendt] = useState<{ id: string; nr: number; kid: string | null } | null>(null);
  const [soker, setSoker] = useState(false);

  const fl: FakturaLinje[] = useMemo(() => linjer.map(l => ({ beskrivelse: l.beskrivelse, antallMilli: tilMilli(l.antall), pris: tilOre(l.pris) ?? 0, sats: org.mva_registrert ? l.sats : 0, konto: l.konto })), [linjer, org.mva_registrert]);
  const sum = fakturaSummer(fl.filter(l => l.beskrivelse.trim() || l.pris), org.mva_registrert);
  const avEndret = (['adresse', 'postnr', 'poststed', 'kontonr', 'epost', 'telefon', 'tekst'] as const).some(k => (av[k] || '') !== ((k === 'tekst' ? org.faktura_tekst : org[k]) ?? ''));
  const avsenderOverstyr = !avAlle && avEndret ? { navn: av.navn, adresse: av.adresse, postnr: av.postnr, poststed: av.poststed, kontonr: av.kontonr, epost: av.epost, telefon: av.telefon, tekst: av.tekst } : null;
  const input = () => ({ id: start?.id, type, kontaktId: kunde?.id ?? null, dato, forfall: type === 'kvittering' ? null : forfall || null, levert: levert || null, referanse: referanse || null, linjer: fl.filter(l => l.beskrivelse.trim() || l.pris), gjentakelse: type === 'faktura' && rep ? 'maned' : null, avsender: avsenderOverstyr });
  const orgMedAv = { ...org, ...av } as Org;
  const mangel = mangler(orgMedAv, kunde, input(), null);
  const forslag = videre.filter(v => kunde && v.kontaktId === kunde.id && !lagtTil.includes(v.id));

  const velgEnhet = async (e: Enhet) => {
    setSoker(true);
    const r = await lagreKontaktFraBrreg(e, 'kunde');
    setSoker(false);
    if (!r.ok) { setFeil(r.feil); return; }
    setKunde({ id: r.data!.id, navn: e.navn, orgnr: e.orgnr, adresse: e.adresse, postnr: e.postnr, poststed: e.poststed, epost: null, kundenr: null });
  };
  const lagreManuell = async () => {
    const r = await lagreKontakt({ ...mk, type: 'kunde' });
    if (!r.ok) { setFeil(r.feil); return; }
    setKunde({ id: r.data!.id, navn: mk.navn, orgnr: null, adresse: mk.adresse, postnr: mk.postnr, poststed: mk.poststed, epost: mk.epost, kundenr: null });
    setManuell(false);
  };
  const oppdater = (i: number, e: Partial<Linje>) => setLinjer(linjer.map((l, j) => (j === i ? { ...l, ...e } : l)));

  const lagreAvsender = async () => {
    if (avAlle && avEndret) {
      const r = await lagreInnstillinger({ adresse: av.adresse, postnr: av.postnr, poststed: av.poststed, kontonr: av.kontonr, epost: av.epost, telefon: av.telefon, faktura_tekst: av.tekst });
      if (!r.ok) { setFeil(r.feil); return false; }
    }
    return true;
  };
  const send = async () => {
    setVenter(true); setFeil('');
    if (!(await lagreAvsender())) { setVenter(false); return; }
    const r = await sendSalgHandling(input(), lagtTil);
    setVenter(false);
    if (!r.ok) { setFeil(r.feil); return; }
    setSendt(r.data!);
    router.refresh();
  };
  const utkast = async () => {
    setVenter(true); setFeil('');
    const r = await lagreUtkastSalg(input());
    setVenter(false);
    if (!r.ok) { setFeil(r.feil); return; }
    router.push('/salg');
  };

  if (sendt) return (
    <div className="kort rad" style={{ flexWrap: 'nowrap', alignItems: 'flex-start', gap: 18 }}>
      <Maskot storrelse={72} />
      <div style={{ flex: 1 }}>
        <h2>{type === 'tilbud' ? `Tilbud ${sendt.nr} er klart.` : type === 'kvittering' ? `Kvittering ${sendt.nr} er ført som betalt.` : `Faktura ${sendt.nr} er klar.`}</h2>
        <p className="mut" style={{ marginTop: 6 }}>
          {type === 'faktura' ? `${kunde?.navn} skal betale ${kr(sum.total)} kr innen ${forfall.split('-').reverse().join('.')} med KID ${sendt.kid}. ` : ''}
          {type !== 'tilbud' ? 'Den er ført i regnskapet. ' : ''}Last ned PDF og send den til kunden. Sending på e-post og EHF slås på når tjenestene er koblet til.
        </p>
        <div className="rad" style={{ marginTop: 14 }}>
          <Link href={`/salg/${sendt.id}`} className="knapp">Se {type === 'tilbud' ? 'tilbudet' : type === 'kvittering' ? 'kvitteringen' : 'fakturaen'}</Link>
          <a href={`/api/faktura/${sendt.id}/pdf`} className="knapp hvit">Last ned PDF</a>
          <button type="button" className="knapp hvit" onClick={() => { router.push('/salg/ny'); router.refresh(); location.reload(); }}>Ny faktura</button>
        </div>
      </div>
    </div>
  );

  const typeHint = TYPER.find(t => t[0] === type)![2];

  return (
    <div className="rutenett delt">
      <div className="stakk" style={{ gap: 18 }}>
        <div>
          <nav className="faner">{TYPER.map(([v, t]) => <button type="button" key={v} className={type === v ? 'aktiv' : ''} onClick={() => setType(v)}>{t}</button>)}</nav>
          <p className="mut liten" style={{ marginTop: 8 }}>{typeHint}</p>
        </div>

        {!org.orgnr && <div className="varsel gul"><div className="fyll">Legg inn organisasjonsnummeret ditt, så står det på fakturaen.</div><Link href="/innstillinger" className="knapp hvit liten">Gå til Innstillinger</Link></div>}

        <section className="kort stakk">
          <h2>{type === 'tilbud' ? 'Hvem er tilbudet til?' : 'Hvem skal betale?'}</h2>
          {!kunde && !manuell && (
            <>
              <BrregSok onVelg={velgEnhet} autoFocus={!start} />
              {soker && <span className="mut liten">Henter …</span>}
              {kunder.length > 0 && (
                <div className="stakk" style={{ gap: 6 }}>
                  <span className="stikk mut">Tidligere kunder</span>
                  <div className="rad" style={{ gap: 6 }}>{kunder.slice(0, 8).map(k => <button type="button" key={k.id} className="knapp hvit liten" onClick={() => setKunde(k)}>{k.navn}</button>)}</div>
                </div>
              )}
              <button type="button" className="lenke" style={{ alignSelf: 'flex-start' }} onClick={() => setManuell(true)}>Privatperson eller utenlandsk kunde</button>
            </>
          )}
          {manuell && !kunde && (
            <div className="stakk">
              <label className="felt"><span>Navn</span><input className="inndata" value={mk.navn} onChange={e => setMk({ ...mk, navn: e.target.value })} autoFocus /></label>
              <label className="felt"><span>Adresse</span><input className="inndata" value={mk.adresse} onChange={e => setMk({ ...mk, adresse: e.target.value })} /></label>
              <div className="rutenett to"><label className="felt"><span>Postnr</span><input className="inndata" value={mk.postnr} onChange={e => setMk({ ...mk, postnr: e.target.value })} /></label><label className="felt"><span>Sted</span><input className="inndata" value={mk.poststed} onChange={e => setMk({ ...mk, poststed: e.target.value })} /></label></div>
              <label className="felt"><span>E-post (valgfritt)</span><input className="inndata" type="email" value={mk.epost} onChange={e => setMk({ ...mk, epost: e.target.value })} /></label>
              <div className="rad"><button type="button" className="knapp liten" onClick={lagreManuell}>Bruk kunden</button><button type="button" className="lenke" onClick={() => setManuell(false)}>Søk i Brønnøysund i stedet</button></div>
            </div>
          )}
          {kunde && (
            <div className="rad" style={{ border: '1px solid var(--linje)', borderRadius: 12, padding: '12px 14px', flexWrap: 'nowrap', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <b>{kunde.navn}</b>
                <div className="mut liten">{[kunde.adresse, [kunde.postnr, kunde.poststed].filter(Boolean).join(' ')].filter(Boolean).join(', ')}{kunde.orgnr ? ` · org.nr ${formaterOrgnr(kunde.orgnr)}` : ''}</div>
                {kunde.epost && <div className="mut liten">Sendes til {kunde.epost}</div>}
                {kunde.orgnr && <div className="faint liten">Hentet fra Brønnøysund</div>}
              </div>
              <button type="button" className="knapp hvit liten" onClick={() => setKunde(null)}>Bytt</button>
            </div>
          )}
          {forslag.map(v => (
            <div key={v.id} className="varsel info">
              <div className="fyll">Du har et kjøp som skal faktureres videre: {v.tekst} ({kr(v.netto)} kr eks. MVA).</div>
              <button type="button" className="knapp hvit liten" onClick={() => { setLinjer([...linjer.filter(l => l.beskrivelse || l.pris), { beskrivelse: `Viderefakturert: ${v.tekst}`, antall: '1', pris: kr(v.netto), sats: org.mva_registrert ? v.sats || 25 : 0, konto: 3900 }]); setLagtTil([...lagtTil, v.id]); }}>Legg til på fakturaen</button>
            </div>
          ))}
          <button type="button" className="lenke" style={{ alignSelf: 'flex-start' }} onClick={() => setMer(!mer)}>{mer ? 'Skjul datoer og referanse' : 'Endre datoer eller legg til referanse'}</button>
          {mer && (
            <div className="rutenett to">
              <label className="felt"><span>Dato</span><input className="inndata" type="date" value={dato} onChange={e => { setDato(e.target.value); if (e.target.value) setForfall(forfallFra(e.target.value, org.faktura_forfall_dager)); }} /></label>
              {type !== 'kvittering' && <label className="felt"><span>{type === 'tilbud' ? 'Gyldig til' : 'Forfall'}</span><input className="inndata" type="date" value={forfall} onChange={e => setForfall(e.target.value)} /></label>}
              <label className="felt"><span>Når ble det levert?</span><input className="inndata" value={levert} onChange={e => setLevert(e.target.value)} placeholder="F.eks. september 2026" /></label>
              <label className="felt"><span>Referanse, hvis kunden har bedt om det</span><input className="inndata" value={referanse} onChange={e => setReferanse(e.target.value)} placeholder="F.eks. innkjøpsnr." /></label>
            </div>
          )}
        </section>

        <section className="kort stakk">
          <h2>Hva skal de betale for?</h2>
          {linjer.map((l, i) => (
            <div key={i} className={`fakturalinje ${org.mva_registrert ? '' : 'uten-mva'}`}>
              <label className="felt"><span>{i ? '' : 'Hva har du levert?'}</span><input className="inndata" value={l.beskrivelse} onChange={e => oppdater(i, { beskrivelse: e.target.value })} placeholder="F.eks. Konsulenttimer" /></label>
              <label className="felt"><span>Antall</span><input className="inndata mono" inputMode="decimal" value={l.antall} onChange={e => oppdater(i, { antall: e.target.value })} /></label>
              <label className="felt"><span>Pris eks. MVA</span><input className="inndata mono" inputMode="decimal" value={l.pris} onChange={e => oppdater(i, { pris: e.target.value })} onBlur={() => { const o = tilOre(l.pris); if (o != null && l.pris) oppdater(i, { pris: kr(o) }); }} placeholder="0,00" /></label>
              {org.mva_registrert && <label className="felt"><span>MVA</span><select className="inndata" value={l.sats} onChange={e => oppdater(i, { sats: Number(e.target.value) })}><option value={25}>25 %</option><option value={15}>15 %</option><option value={12}>12 %</option><option value={0}>0 %</option></select></label>}
              <button type="button" className="knapp hvit liten" style={{ padding: '10px 0' }} title="Fjern linje" aria-label="Fjern linje" onClick={() => setLinjer(linjer.length > 1 ? linjer.filter((_, j) => j !== i) : [{ beskrivelse: '', antall: '1', pris: '', sats: std }])}>×</button>
            </div>
          ))}
          <button type="button" className="lenke" style={{ alignSelf: 'flex-start' }} onClick={() => setLinjer([...linjer, { beskrivelse: '', antall: '1', pris: '', sats: std }])}>+ Ny linje</button>
          <p className="hint">15 % gjelder næringsmidler som ikke serveres. Servering, som mat på restaurant eller catering med servering, har 25 %.</p>
        </section>

        <section className="kort stakk">
          <div className="rad" style={{ justifyContent: 'space-between' }}>
            <div><h2>Din info på {type === 'tilbud' ? 'tilbudet' : type === 'kvittering' ? 'kvitteringen' : 'fakturaen'}</h2><div className="mut liten">{[av.navn, av.kontonr && `konto ${av.kontonr}`, av.epost].filter(Boolean).join(' · ')}</div></div>
            <button type="button" className="knapp hvit liten" onClick={() => setAvApen(!avApen)}>{avApen ? 'Lukk' : 'Endre'}</button>
          </div>
          {avApen && (
            <div className="stakk">
              <label className="felt"><span>Adresse</span><input className="inndata" value={av.adresse} onChange={e => setAv({ ...av, adresse: e.target.value })} /></label>
              <div className="rutenett to"><label className="felt"><span>Postnr</span><input className="inndata" value={av.postnr} onChange={e => setAv({ ...av, postnr: e.target.value })} /></label><label className="felt"><span>Sted</span><input className="inndata" value={av.poststed} onChange={e => setAv({ ...av, poststed: e.target.value })} /></label></div>
              <div className="rutenett to">
                <label className="felt"><span>Kontonummer</span><input className="inndata" value={av.kontonr} onChange={e => setAv({ ...av, kontonr: e.target.value })} placeholder="1506 22 33445" /></label>
                <label className="felt"><span>E-post</span><input className="inndata" value={av.epost} onChange={e => setAv({ ...av, epost: e.target.value })} /></label>
              </div>
              <label className="felt"><span>Telefon</span><input className="inndata" value={av.telefon} onChange={e => setAv({ ...av, telefon: e.target.value })} /></label>
              <label className="felt"><span>Tekst nederst</span><input className="inndata" value={av.tekst} onChange={e => setAv({ ...av, tekst: e.target.value })} placeholder="F.eks. «Takk for handelen!»" /></label>
              <label className="rad liten"><input type="checkbox" checked={avAlle} onChange={e => setAvAlle(e.target.checked)} /> Bruk dette på alle nye fakturaer, tilbud og kvitteringer</label>
            </div>
          )}
        </section>

        {type === 'faktura' && (
          <label className="kort rad" style={{ padding: '14px 18px', flexWrap: 'nowrap', cursor: 'pointer' }}>
            <input type="checkbox" checked={rep} onChange={e => setRep(e.target.checked)} />
            <span><b style={{ fontWeight: 600, display: 'block' }}>Send samme faktura hver måned</b><span className="mut liten">{rep ? `Vi lager et nytt utkast rundt den ${Number(dato.slice(8))}. hver måned. Du ser over og sender.` : 'For faste avtaler, som husleie eller abonnement.'}</span></span>
          </label>
        )}

        {mangel.length > 0 && <div className="varsel gul"><div className="fyll"><b>Før du kan sende:</b><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{mangel.map(m => <li key={m}>{m}</li>)}</ul></div></div>}
        {feil && <div className="varsel rod" role="alert">{feil}</div>}
        <div className="rad" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="knapp hvit" disabled={venter} onClick={utkast}>Lagre som utkast</button>
          <button type="button" className="knapp" disabled={venter || mangel.length > 0} onClick={send}>{venter ? 'Et øyeblikk …' : type === 'tilbud' ? 'Lag tilbudet' : type === 'kvittering' ? `Lag kvittering · ${kr(sum.total)} kr` : `Lag faktura · ${kr(sum.total)} kr`}</button>
        </div>
      </div>

      <div className="forhandsvisning">
        <div className="stikk mut" style={{ marginBottom: 10 }}>Slik ser kunden den</div>
        <FakturaDokument type={type} dato={dato} forfall={type === 'kvittering' ? null : forfall} levert={levert} referanse={referanse} avsender={{ ...av, orgnr: org.orgnr, orgform: org.orgform, mvaRegistrert: org.mva_registrert } as DokAvsender} kunde={kunde} linjer={fl} />
      </div>
    </div>
  );
}
