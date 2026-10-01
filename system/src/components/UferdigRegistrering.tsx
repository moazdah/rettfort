import Link from 'next/link';
import { avbrytRegistrering } from '@/app/handlinger';

/** Vises på Logg inn / Lag konto når noen har begynt å lage konto, men ikke bekreftet e-posten. */
export function UferdigRegistrering({ epost }: { epost: string }) {
  return (
    <div className="varsel info liten" style={{ marginTop: 18, display: 'block' }}>
      Du har begynt å lage konto med <b>{epost}</b>, men ikke bekreftet e-posten.
      <div className="rad" style={{ gap: 14, marginTop: 8 }}>
        <Link href="/velkommen" className="lenke">Skriv inn koden</Link>
        <form action={avbrytRegistrering}><button className="lenke" style={{ background: 'none', border: 0, padding: 0, font: 'inherit', cursor: 'pointer' }}>Start på nytt</button></form>
      </div>
    </div>
  );
}
