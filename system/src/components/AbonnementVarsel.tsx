import Link from 'next/link';
import { AngreOppsigelse, EndreKort } from '@/app/(system)/innstillinger/AbonnementKnapper';
import { PAKKE_NAVN, datoTekst } from '@/lib/tjenester/abonnement';

/** Ett varsel om gangen øverst i systemet og i abonnementet: sagt opp, eller trekk som feilet. */
export function AbonnementVarsel({ pakke, status, slutt, eier, eierNavn }: { pakke: string; status: string | null; slutt: string | null; eier: boolean; eierNavn: string | null }) {
  const navn = PAKKE_NAVN[pakke] ?? pakke;
  if (slutt && pakke !== 'gratis') {
    return (
      <div className="varsel gul abonnement-varsel" role="status">
        <span className="fyll">Du har {navn} til {datoTekst(slutt)}, deretter Gratis.</span>
        {eier && <AngreOppsigelse />}
      </div>
    );
  }
  if (status === 'past_due') {
    return (
      <div className="varsel rod abonnement-varsel" role="alert">
        <span className="fyll">{eier ? 'Siste trekk feilet. Oppdater kortet, så beholder du pakken.' : `Siste trekk feilet. ${eierNavn ?? 'Eieren'} må oppdatere kortet, så beholder dere pakken.`}</span>
        {eier ? <EndreKort tekst="Oppdater kortet" /> : <Link href="/innstillinger?vis=abonnement" className="lenke">Se abonnementet</Link>}
      </div>
    );
  }
  return null;
}
