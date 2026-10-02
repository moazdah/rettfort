import Link from 'next/link';
import { redirect } from 'next/navigation';
import { kreverSelskap, db, idag } from '@/lib/server';
import { PAKKER, type BetaltPakke } from '@/lib/pakker';
import { stripePa, antallAnsatte, abonnementDetaljer } from '@/lib/stripe';
import { MED, PAKKE_NAVN, RANG, prisregning, inkludert, omEnManed, belop, datoTekst } from '@/lib/tjenester/abonnement';
import { GaTilBetaling } from './GaTilBetaling';

export const metadata = { title: 'Bekreft pakken' };

/** Bekreft pakken før Stripe: hva som er med, hva det koster per måned, og når det trekkes. */
export default async function BekreftPakken({ searchParams }: { searchParams: Promise<{ pakke?: string; avbrutt?: string }> }) {
  const s = await kreverSelskap();
  const sp = await searchParams;
  if (sp.pakke !== 'start' && sp.pakke !== 'selskap') redirect('/innstillinger?vis=abonnement');
  const pakke = sp.pakke as BetaltPakke;
  if (s.org.pakke === pakke) redirect('/innstillinger?vis=abonnement');
  const d = await db();
  const dag = idag();
  const ansatte = await antallAnsatte(d, s.org.id);
  const p = prisregning(pakke, ansatte);
  const fra = s.org.pakke;
  const bytte = RANG[fra] > 0;
  const detaljer = bytte && stripePa() ? await abonnementDetaljer(d, s.org.id).catch(() => null) : null;
  const neste = detaljer?.periodeSlutt ?? omEnManed(dag);
  const eier = s.rolle === 'eier';
  const navn = PAKKE_NAVN[pakke];
  return (
    <div className="stakk abonnement-side" style={{ gap: 22, maxWidth: 980 }}>
      <div>
        <Link href={bytte ? '/innstillinger?vis=abonnement' : '/hjem'} className="lenke liten">← Tilbake</Link>
        <h1 style={{ marginTop: 8 }}>Bekreft pakken</h1>
        {bytte && <p className="mut" style={{ margin: '6px 0 0' }}>Du bytter fra {PAKKE_NAVN[fra]} til {navn}.</p>}
      </div>
      {sp.avbrutt && <div className="varsel info">Betalingen ble avbrutt. Ingenting er trukket.</div>}
      <div className="bekreft-rutenett">
        <section className="kort stakk" style={{ gap: 18 }}>
          <div>
            <h2 style={{ margin: 0 }}>{navn}</h2>
            <p className="mut" style={{ margin: '4px 0 0' }}>{PAKKER.find(x => x.k === pakke)!.d}</p>
          </div>
          <div>
            <span className="belop" style={{ fontSize: 34, fontWeight: 600 }}>{belop(p.pakke)}</span><span className="mut"> /mnd uten MVA</span>
            <div className="faint liten">{belop(Math.round(p.pakke * 1.25))} med MVA</div>
          </div>
          <div className="stakk" style={{ gap: 8 }}>
            <div className="stikk">Med i {navn}</div>
            {MED[pakke].map(x => <div key={x} className="rad" style={{ gap: 10, alignItems: 'flex-start' }}><span className="hake" aria-hidden>✓</span><span>{x}</span></div>)}
          </div>
        </section>
        <section className="kort stakk" style={{ gap: 12 }}>
          <div className="stikk">Per måned</div>
          <div className="pris-rad"><span>{navn}</span><span className="belop">{belop(p.pakke)}</span></div>
          {p.ekstraAntall > 0
            ? <div className="pris-rad"><span>Ekstra ansatte · {p.ekstraAntall} × 29 kr<small className="mut">{ansatte} ansatte i vaktplanen · {inkludert(pakke)} med i {navn}</small></span><span className="belop">{belop(p.ekstra)}</span></div>
            : <div className="pris-rad"><span>Ansatte i vaktplanen<small className="mut">{ansatte} ansatte · alle med i {navn}</small></span><span className="belop">0 kr</span></div>}
          <div className="pris-rad skille"><span>Sum uten MVA</span><span className="belop">{belop(p.netto)}</span></div>
          <div className="pris-rad"><span>MVA 25 %</span><span className="belop">{belop(p.mva)}</span></div>
          <div className="pris-rad sum"><span>Sum per måned</span><span className="belop">{belop(p.sum)}</span></div>
          <div className="mut liten">{bytte ? <>Neste trekk: {datoTekst(neste)}</> : <>Første trekk: I dag · {belop(p.sum)}<br />Neste trekk: {datoTekst(neste)}</>}</div>
          <div className="mut liten">Ingen bindingstid. Si opp når du vil.</div>
          {eier
            ? <GaTilBetaling pakke={pakke} tekst={bytte ? `Bytt til ${navn}` : 'Gå til betaling'} />
            : <div className="varsel info">Bare eieren av foretaket kan bytte pakke og betale.</div>}
          {eier && <div className="faint liten">{bytte
            ? (detaljer?.kort ? `Vi bruker kortet som er registrert, ${detaljer.kort.merke} ···· ${detaljer.kort.siste4}. Mellomlegget for resten av perioden kommer på neste trekk.` : 'Vi bruker kortet som er registrert. Mellomlegget for resten av perioden kommer på neste trekk.')
            : 'Kortet tas imot av Stripe og lagres ikke hos oss.'}</div>}
          {!stripePa() && <div className="faint liten">Testmodus: betaling er ikke koblet til, så pakken byttes med en gang.</div>}
        </section>
      </div>
    </div>
  );
}
