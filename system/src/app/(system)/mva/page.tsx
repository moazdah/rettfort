import Link from 'next/link';
import { Oppgrader } from '@/components/Oppgrader';
import { harFulltRegnskap } from '@/lib/pakker';
import { kreverSelskap, db, idag } from '@/lib/server';
import { aktuellTermin, mvaStatus, terminFor, type Termin } from '@/lib/tjenester/mva';
import { kanEndre } from '@/lib/auth';
import { dagerTil, norskDato } from '@/lib/frister';
import { kr, nd } from '@/lib/vis';
import { Handling } from '@/components/Handling';
import { Maskot } from '@/components/Logo';
import { Utfylling } from '@/components/Utfylling';
import { sendMvaHandling, vurderFunnHandling } from '@/app/handlinger';

export const metadata = { title: 'MVA' };

function Steg({ nr, tittel, tekst, ferdig, aktiv, children }: { nr: number; tittel: string; tekst: string; ferdig: boolean; aktiv: boolean; children?: React.ReactNode }) {
  return (
    <section className={`steg ${ferdig ? 'ferdig' : aktiv ? 'aktivt' : 'last'}`}>
      <span className="nr">{ferdig ? '✓' : nr}</span>
      <div className="stakk" style={{ flex: 1, gap: 10 }}>
        <div><b style={{ fontWeight: 600, fontSize: 17 }}>{tittel}</b><div className="mut liten">{tekst}</div></div>
        {children}
      </div>
    </section>
  );
}

export default async function Mva({ searchParams }: { searchParams: Promise<{ fra?: string }> }) {
  const s = await kreverSelskap();
  if (!harFulltRegnskap(s.org.pakke)) return <Oppgrader tittel={"MVA-meldingen"} tekst={"MVA-meldingen lages av det du har ført, og du ser hva som mangler før fristen."} punkter={["Utkast til hver termin", "Påminnelse før fristen", "Kontroll av satser og fradrag"]} />;
  const d = await db();
  const dag = idag();
  const org = await d.en<{ mva_termin: 'tomnd' | 'aar' | 'ingen'; mva_registrert: boolean; regnskap_fra: string | null }>('select mva_termin, mva_registrert, regnskap_fra::text as regnskap_fra from organisasjon where id = $1', [s.org.id]);
  if (!org?.mva_registrert || org.mva_termin === 'ingen') return (
    <div className="stakk" style={{ maxWidth: 640 }}>
      <h1>MVA</h1>
      <div className="kort stakk"><p>Foretaket er ikke MVA-registrert, så du skal ikke levere MVA-melding.</p><p className="mut">Du må registrere deg i Merverdiavgiftsregisteret når salget passerer 50 000 kr på tolv måneder. Når du har gjort det, endrer du MVA-termin under <Link className="lenke" href="/innstillinger">Innstillinger</Link>.</p></div>
    </div>
  );
  const sp = await searchParams;
  const aktuell = await aktuellTermin(d, s.org.id, dag);
  const termin: Termin | null = sp.fra && /^\d{4}-\d{2}-\d{2}$/.test(sp.fra) ? terminFor(sp.fra, org.mva_termin) : aktuell;
  if (!termin) return <p>Fant ingen termin.</p>;
  const st = await mvaStatus(d, s.org.id, termin);
  const steg1 = st.manglerBilag.length === 0;
  const steg2 = st.funn.length === 0;
  const klar = steg1 && steg2;
  const sendt = !!st.sendt;
  const dager = dagerTil(dag, termin.frist);
  const endre = kanEndre(s.rolle);
  const terminAvsluttet = termin.til < dag;

  // Terminer i år og i fjor, til og med den aktuelle.
  const sendte = await d.q<{ fra: string; a_betale: number }>('select fra::text as fra, a_betale from mva_melding where organisasjon_id = $1', [s.org.id]);
  const start = org.regnskap_fra ?? `${dag.slice(0, 4)}-01-01`;
  const terminer: Termin[] = [];
  let x = terminFor(start, org.mva_termin);
  while (x.fra <= dag && terminer.length < 40) { terminer.push(x); const n = new Date(x.til + 'T00:00:00Z'); n.setUTCDate(n.getUTCDate() + 1); x = terminFor(n.toISOString().slice(0, 10), org.mva_termin); }
  const tall = st.tall;

  return (
    <div className="stakk" style={{ gap: 18, maxWidth: 860 }}>
      <div className="hode">
        <div><h1>{termin.tittel}</h1><div className="mut" style={{ marginTop: 6 }}>Frist {norskDato(termin.frist)}{!sendt ? (dager >= 0 ? ` · ${dager} ${dager === 1 ? 'dag' : 'dager'} igjen` : ` · ${-dager} dager på overtid`) : ''}</div></div>
        <span className={`merke ${sendt || klar ? 'gronn' : 'gul'}`} style={{ fontSize: 13, padding: '5px 12px' }}>{sendt ? 'Sendt' : !terminAvsluttet ? 'Terminen pågår' : klar ? 'Klar til å sende' : `${st.antallMangler} ting mangler før du kan sende`}</span>
      </div>

      <Steg nr={1} tittel="Alle bilag er på plass" ferdig={steg1} aktiv={!steg1} tekst={steg1 ? 'Alle utbetalinger i banken i terminen har bilag.' : `${st.manglerBilag.length} ${st.manglerBilag.length === 1 ? 'utbetaling' : 'utbetalinger'} i banken mangler bilag.`}>
        {st.manglerBilag.map(b => (
          <div key={b.id} className="rad" style={{ borderTop: '1px solid var(--linje-3)', paddingTop: 8 }}>
            <span className="fyll" style={{ flex: 1 }}>{nd(b.dato)} · {b.tekst} · <span className="belop">{kr(b.belop)} kr</span></span>
            {endre && <Link className="knapp hvit liten" href={`/kjop/ny?lev=${encodeURIComponent(b.tekst.slice(0, 60))}&total=${Math.abs(b.belop)}&dato=${b.dato}`}>Last opp kvittering</Link>}
            <Link className="lenke liten" href={`/bank?maned=${b.dato.slice(0, 7)}`}>Se i Bank</Link>
          </div>
        ))}
      </Steg>

      <Steg nr={2} tittel="Kontrollen har ikke funnet noe" ferdig={steg2} aktiv={steg1 && !steg2} tekst={steg2 ? 'Alle MVA-koder og leverandører er sjekket.' : `${st.funn.length} ${st.funn.length === 1 ? 'funn må' : 'funn må'} rettes eller vurderes før du sender.`}>
        {st.funn.map(f => (
          <div key={f.id} className="rad" style={{ borderTop: '1px solid var(--linje-3)', paddingTop: 8 }}>
            <span style={{ flex: 1 }}>{f.tekst}</span>
            {f.refType === 'kjop' && f.refId && <Link className="knapp hvit liten" href={f.kode === 'ikke_mva_reg' ? `/kjop/ny?rett=${f.refId}` : `/kjop/${f.refId}`}>{f.handling ?? 'Se kjøpet'}</Link>}
            {endre && <Handling handling={vurderFunnHandling.bind(null, f.id, `Vurdert i ${termin.tittel}`)} tekst="Det er riktig" klasse="knapp hvit liten" bekreft="Markere funnet som vurdert? Det blir ikke rettet." />}
          </div>
        ))}
      </Steg>

      <Steg nr={3} tittel="Se over tallene" ferdig={sendt} aktiv={klar && !sendt} tekst={klar ? (tall.aBetale >= 0 ? `Tallene er klare. Beløpet skal betales innen ${norskDato(termin.frist, false)}.` : 'Tallene er klare. Du får penger tilbake.') : 'Åpner når punktene over er løst.'}>
        {(klar || sendt) && (
          <>
            <div className="rutenett tre">
              <div className="kort" style={{ padding: 14 }}><div className="mut liten">MVA på salg</div><div className="belop" style={{ fontSize: 22, fontWeight: 600 }}>{kr(tall.utgaende)}</div></div>
              <div className="kort" style={{ padding: 14 }}><div className="mut liten">MVA på kjøp</div><div className="belop" style={{ fontSize: 22, fontWeight: 600 }}>{kr(tall.inngaende)}</div></div>
              <div className="kort mork" style={{ padding: 14 }}><div className="mut liten">{tall.aBetale >= 0 ? 'Du skal betale' : 'Du får tilbake'}</div><div className="belop" style={{ fontSize: 22, fontWeight: 600 }}>{kr(Math.abs(tall.aBetale))}</div></div>
            </div>
          </>
        )}
      </Steg>

      <Steg nr={4} tittel={sendt ? 'Sendt' : 'Send meldingen'} ferdig={sendt} aktiv={klar && !sendt} tekst={sendt ? `Registrert som sendt ${nd(st.sendt!.tid)}. Terminen er låst.` : 'Du sender selv hos Skatteetaten. Tallene står klare under, post for post. Trykk på et tall for å kopiere det.'}>
        {sendt ? (
          <div className="rad" style={{ flexWrap: 'nowrap' }}>
            <Maskot storrelse={56} />
            <p className="mut">{st.sendt!.aBetale >= 0 ? `Betal ${kr(st.sendt!.aBetale)} kr til Skatteetaten innen ${norskDato(termin.frist, false)}. Når betalingen kommer på kontoutskriften, velger du «MVA til Skatteetaten» i Bank.` : `Du får ${kr(-st.sendt!.aBetale)} kr tilbake. Når pengene kommer, velger du «MVA tilbake fra Skatteetaten» i Bank.`}</p>
          </div>
        ) : klar && terminAvsluttet && endre ? (
          <div className="stakk">
            <ol className="mut liten" style={{ margin: 0, paddingLeft: 18 }}>
              <li>Åpne MVA-meldingen hos Skatteetaten og logg inn med BankID. Velg {s.org.navn} og terminen {termin.tittel.replace('MVA for ', '')}.</li>
              <li>Fyll inn postene under. Trykk på et tall for å kopiere det, og kryss av når posten er fylt inn.</li>
              <li>Kontroller at summen hos Skatteetaten blir {tall.aBetale >= 0 ? `${kr(tall.aBetale)} kr å betale` : `${kr(-tall.aBetale)} kr til gode`}, og send.</li>
              <li>Trykk på knappen nederst. Vi fører oppgjøret og låser terminen.</li>
            </ol>
            <Utfylling id={`mva-${s.org.id}-${termin.fra}`} lenke="https://www.skatteetaten.no/bedrift-og-organisasjon/avgifter/mva/" lenketekst="Gå til MVA hos Skatteetaten"
              rader={[...tall.linjer.filter(l => l.grunnlag !== 0 || l.mva !== 0).map(l => ({ kode: l.kode, tekst: l.navn, verdier: [{ etikett: 'Grunnlag', verdi: kr(l.grunnlag) }, { etikett: 'MVA', verdi: kr(l.mva) }] })),
                { tekst: tall.aBetale >= 0 ? 'Å betale (sjekk at summen stemmer)' : 'Til gode (sjekk at summen stemmer)', verdier: [{ etikett: 'Sum', verdi: kr(Math.abs(tall.aBetale)) }] }]} />
            <div><Handling handling={sendMvaHandling.bind(null, termin)} tekst="Jeg har sendt meldingen i Altinn" bekreft="Registrere meldingen som sendt? Terminen låses, og rettelser må føres i neste termin." /></div>
          </div>
        ) : !terminAvsluttet ? <p className="mut liten">Terminen er ikke over ennå. Du kan sende fra {nd(new Date(Date.parse(termin.til) + 86400000).toISOString().slice(0, 10))}.</p> : null}
      </Steg>

      <section className="kort">
        <h2>Alle terminer</h2>
        <div className="liste" style={{ marginTop: 10, border: 0 }}>
          {terminer.slice().reverse().map(t => {
            const m = sendte.find(x => x.fra === t.fra);
            return (
              <Link key={t.fra} href={`/mva?fra=${t.fra}`} className="linje" style={{ background: t.fra === termin.fra ? 'var(--kort-2)' : undefined }}>
                <span className="fyll"><span className="tittel">{t.tittel}</span><span className="mut liten" style={{ display: 'block' }}>Frist {norskDato(t.frist)}</span></span>
                {m ? <span className="merke gronn">Sendt · {kr(m.a_betale)} kr</span> : t.til >= dag ? <span className="merke">Pågår</span> : <span className="merke gul">Ikke sendt</span>}
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
