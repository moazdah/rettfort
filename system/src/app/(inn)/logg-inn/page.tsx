import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { sesjon, db } from '@/lib/server';
import { LoggInnSkjema } from './skjema';

export const metadata = { title: 'Logg inn' };

export default async function LoggInn() {
  const s = await sesjon();
  if (s) redirect('/');
  const d = await db();
  return (
    <main className="midt">
      <div className="boks">
        <div style={{ marginBottom: 28 }}><Logo bredde={130} /></div>
        <h1>Logg inn</h1>
        <p className="mut" style={{ marginTop: 8 }}>Regnskap som sjekker seg selv.</p>
        {d.modus === 'testmodus' && (
          <div className="testmodus" style={{ marginTop: 18 }}>
            Testmodus: databasen er ikke koblet til ennå, så alt nullstilles med jevne mellomrom. Prøv med <b>demo@rettfort.no</b> (bedrift) eller <b>regnskap@rettfort.no</b> (regnskapsfører), passord <b>rettfort-demo</b>.
          </div>
        )}
        <LoggInnSkjema />
        <p className="mut liten" style={{ marginTop: 22 }}>Ny her? <Link href="/registrer">Lag en konto</Link> · <Link href="/registrer?rolle=bedrift">Start gratis for bedriften</Link></p>
      </div>
    </main>
  );
}
