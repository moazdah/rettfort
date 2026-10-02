import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { GlemtSkjema } from './skjema';

export const metadata = { title: 'Glemt passord' };

export default function GlemtPassord() {
  return (
    <main className="midt">
      <div className="boks">
        <div style={{ marginBottom: 28 }}><Logo bredde={130} /></div>
        <h1>Glemt passord</h1>
        <p className="mut" style={{ marginTop: 8 }}>Skriv e-posten din, så sender vi deg en lenke for å lage et nytt passord.</p>
        <GlemtSkjema />
        <p className="mut liten" style={{ marginTop: 22 }}><Link href="/logg-inn">Tilbake til Logg inn</Link></p>
      </div>
    </main>
  );
}
