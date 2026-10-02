import Link from 'next/link';

/** Vises i Gratis der en funksjon krever Start eller Selskap. Det som allerede er ført, kan fortsatt ses og lastes ned. */
export function Oppgrader({ tittel, tekst, punkter }: { tittel: string; tekst: string; punkter: string[] }) {
  return (
    <div className="stakk" style={{ maxWidth: 720 }}>
      <section className="kort stakk" style={{ gap: 16 }}>
        <span className="merke gul" style={{ alignSelf: 'flex-start' }}>Med i Start og Selskap</span>
        <h1 style={{ margin: 0 }}>{tittel}</h1>
        <p className="mut" style={{ margin: 0 }}>{tekst}</p>
        <ul className="stakk" style={{ margin: 0, paddingLeft: 20, gap: 6 }}>{punkter.map(p => <li key={p}>{p}</li>)}</ul>
        <div className="rad" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Link className="knapp" href="/abonnement/bekreft?pakke=start">Oppgrader til Start</Link><Link className="lenke liten" href="/innstillinger?vis=abonnement">Se alle pakkene</Link>
          <span className="mut liten">Start koster 179 kr i måneden uten MVA. Ingen bindingstid.</span>
        </div>
      </section>
    </div>
  );
}
