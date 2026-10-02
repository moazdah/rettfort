import Link from 'next/link';
import { PAKKER } from '@/lib/pakker';
import type { AbonnementDetaljer } from '@/lib/stripe';
import { PAKKE_NAVN, RANG, belop, datoTekst, inkludert, prisregning } from '@/lib/tjenester/abonnement';
import { AbonnementVarsel } from '@/components/AbonnementVarsel';
import { SiOpp, ByttNed, EndreKort } from './AbonnementKnapper';

/** Innstillinger → Abonnement: din pakke, bytt pakke, kvitteringer og oppsigelse. */
export function Abonnement({ pakke, status, slutt, eier, eierNavn, ansatte, detaljer, betalingPa, avbrutt }: {
  pakke: string; status: string | null; slutt: string | null; eier: boolean; eierNavn: string | null; ansatte: number; detaljer: AbonnementDetaljer | null; betalingPa: boolean; avbrutt: boolean;
}) {
  const betalt = pakke === 'start' || pakke === 'selskap';
  const navn = PAKKE_NAVN[pakke] ?? pakke;
  const p = betalt ? prisregning(pakke, ansatte) : null;
  const sagtOpp = !!slutt && betalt;
  return (
    <div className="stakk" style={{ gap: 20 }}>
      {avbrutt && <div className="varsel info">Betalingen ble avbrutt. Ingenting er trukket.</div>}
      {!eier && <div className="varsel info">Bare eieren av foretaket kan bytte pakke og betale.{eierNavn ? ` Her er det ${eierNavn}.` : ''}</div>}
      <AbonnementVarsel pakke={pakke} status={status} slutt={slutt} eier={eier} eierNavn={eierNavn} />

      <section className="kort stakk" style={{ gap: 14 }}>
        <div className="rad" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div className="stikk">Din pakke</div>
            <h2 style={{ margin: '4px 0 0' }}>{navn}</h2>
          </div>
          <div className="rad" style={{ gap: 6, flexWrap: 'wrap' }}>
            {sagtOpp && <span className="merke gul">Avsluttes {datoTekst(slutt!, false)}</span>}
            {status === 'past_due' && <span className="merke rod">Betaling feilet</span>}
          </div>
        </div>
        {p ? (
          <div><span className="belop" style={{ fontSize: 24, fontWeight: 600 }}>{belop(p.netto)}</span><span className="mut"> /mnd uten MVA · {belop(p.sum)} med MVA</span></div>
        ) : <div><span className="belop" style={{ fontSize: 24, fontWeight: 600 }}>0 kr</span><span className="mut"> /mnd</span></div>}
        <div className="abonnement-rader">
          {betalt && (
            <div className="abonnement-rad">
              <span className="mut">Neste trekk</span>
              {sagtOpp ? <span><b>Ingen flere trekk</b><small>{navn} gjelder til {datoTekst(slutt!)}, deretter Gratis.</small></span>
                : status === 'past_due' ? <span><b>Trekket feilet</b><small>Vi prøver igjen automatisk de neste dagene.</small></span>
                : detaljer ? <span><b>{datoTekst(detaljer.periodeSlutt)} · <span className="belop">{belop(detaljer.nesteBelop)}</span></b></span>
                : <span className="mut">{betalingPa ? 'Henter fra Stripe …' : 'Betaling er ikke koblet til i testmodus.'}</span>}
            </div>
          )}
          {betalt && (
            <div className="abonnement-rad">
              <span className="mut">Kort</span>
              <span>{detaljer?.kort ? <><b>{detaljer.kort.merke} ···· {detaljer.kort.siste4}</b><small>{status === 'past_due' ? 'Kortet ble avvist ved siste trekk.' : `Utløper ${detaljer.kort.utlop}`}</small></> : <span className="mut">–</span>}</span>
              {eier && betalingPa && detaljer && <EndreKort />}
            </div>
          )}
          <div className="abonnement-rad">
            <span className="mut">Vaktplan</span>
            {betalt ? <span><b>{p!.ekstraAntall > 0 ? `${ansatte} ansatte · ${inkludert(pakke)} med i ${navn}, ${p!.ekstraAntall} × 29 kr` : `${ansatte} av ${inkludert(pakke)} ansatte`}</b></span>
              : <span><b>Ikke med i Gratis</b><small>Velg Start eller Selskap under for å bruke vaktplanen.</small></span>}
          </div>
        </div>
      </section>

      <section className="stakk" style={{ gap: 12 }}>
        <h3 style={{ margin: 0 }}>Bytt pakke</h3>
        <div className="rutenett tre">
          {PAKKER.map(x => {
            const din = x.k === pakke;
            const opp = RANG[x.k] > RANG[pakke];
            return (
              <div key={x.k} className={`kort stakk pakke-kort ${din ? 'din' : ''}`} style={{ gap: 8 }}>
                <div className="rad" style={{ justifyContent: 'space-between' }}><b>{x.n}</b>{din && <span className="merke gronn">Din pakke</span>}</div>
                <div><span className="belop" style={{ fontSize: 22, fontWeight: 600 }}>{belop(x.pris)}</span><span className="mut liten"> /mnd</span>{x.pris > 0 && <div className="faint liten">{belop(Math.round(x.pris * 1.25))} med MVA</div>}</div>
                <p className="mut liten" style={{ flex: 1, margin: 0 }}>{x.d}</p>
                {!din && eier && (opp
                  ? <Link href={`/abonnement/bekreft?pakke=${x.k}`} className="knapp liten" style={{ width: '100%', justifyContent: 'center' }}>Bytt til {x.n}</Link>
                  : x.k === 'start' ? <ByttNed ekstra={Math.max(0, ansatte - 5)} />
                  : null)}
                {!din && !eier && <span className="faint liten">Bare eieren kan bytte pakke</span>}
              </div>
            );
          })}
        </div>
      </section>

      {betalt && detaljer && detaljer.kvitteringer.length > 0 && (
        <section className="stakk" style={{ gap: 10 }}>
          <h3 style={{ margin: 0 }}>Kvitteringer</h3>
          <div className="kort liste">
            {detaljer.kvitteringer.map((k, i) => (
              <div key={i} className="abonnement-rad">
                <span>{datoTekst(k.dato)}</span>
                <span className="mut">{k.tekst}</span>
                <span className="belop">{belop(k.belop)}</span>
                {k.betalt && k.pdf ? <a className="lenke" href={k.pdf} target="_blank" rel="noreferrer">PDF</a> : <span className="merke rod">Ikke betalt</span>}
              </div>
            ))}
          </div>
          <p className="faint liten" style={{ margin: 0 }}>Kvitteringene sendes også på e-post fra Stripe.</p>
        </section>
      )}

      <p className="mut liten" style={{ margin: 0 }}>Ingen bindingstid. Bytter du ned, beholder du alt som er ført, og pakken gjelder ut perioden du har betalt for. <a className="lenke" href="https://xn--rettfrt-u1a.no/vilkar" target="_blank" rel="noreferrer">Se vilkår</a></p>
      {eier && betalt && !sagtOpp && <div><SiOpp pakke={navn} slutt={detaljer ? datoTekst(detaljer.periodeSlutt) : 'slutten av perioden'} /></div>}
    </div>
  );
}
