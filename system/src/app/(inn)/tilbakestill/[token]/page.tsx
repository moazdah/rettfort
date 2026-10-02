import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { db } from '@/lib/server';
import { lesPassordLenke } from '@/lib/tjenester/konto';
import { NyttPassordSkjema } from './skjema';

export const metadata = { title: 'Nytt passord', robots: { index: false } };

export default async function Tilbakestill({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const lenke = await lesPassordLenke(await db(), token);
  return (
    <main className="midt">
      <div className="boks">
        <div style={{ marginBottom: 28 }}><Logo bredde={130} /></div>
        {lenke ? (
          <>
            <h1>Lag nytt passord</h1>
            <p className="mut" style={{ marginTop: 8 }}>For {lenke.epost}. Du blir logget ut på alle enheter.</p>
            <NyttPassordSkjema token={token} epost={lenke.epost} />
          </>
        ) : (
          <>
            <h1>Lenken virker ikke lenger</h1>
            <p className="mut" style={{ marginTop: 8 }}>Lenken er brukt eller utløpt. Den gjelder i én time og kan bare brukes én gang.</p>
            <Link className="knapp" href="/glemt-passord" style={{ marginTop: 24 }}>Be om en ny lenke</Link>
          </>
        )}
        <p className="mut liten" style={{ marginTop: 22 }}><Link href="/logg-inn">Tilbake til Logg inn</Link></p>
      </div>
    </main>
  );
}
