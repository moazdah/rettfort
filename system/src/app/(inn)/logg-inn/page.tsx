import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { sesjon, db } from '@/lib/server';
import { LoggInnSkjema } from './skjema';
import { UferdigRegistrering } from '@/components/UferdigRegistrering';
import { demoInn } from '@/app/handlinger';

export const metadata = { title: 'Logg inn' };

export default async function LoggInn({ searchParams }: { searchParams: Promise<{ neste?: string; slettet?: string; passord?: string }> }) {
  const { neste: n, slettet, passord } = await searchParams;
  const neste = n && /^\/invitasjon\/[\w-]+$/.test(n) ? n : undefined;
  const s = await sesjon();
  const uferdig = s && !s.bruker.epostBekreftet ? s.bruker.epost : null;
  if (s && !uferdig) redirect(neste ?? '/');
  const d = await db();
  return (
    <main className="midt">
      <div className="boks">
        <div style={{ marginBottom: 28 }}><Logo bredde={130} /></div>
        <h1>Logg inn</h1>
        <p className="mut" style={{ marginTop: 8 }}>Regnskap som sjekker seg selv.</p>
        {slettet && <div className="varsel gronn liten" style={{ marginTop: 18 }}>Kontoen er slettet. Takk for at du brukte Rettført.</div>}
        {passord === 'nytt' && <div className="varsel gronn liten" role="status" style={{ marginTop: 18 }}>Passordet er endret. Logg inn med det nye passordet.</div>}
        {uferdig && <UferdigRegistrering epost={uferdig} />}
        {d.modus === 'testmodus' ? (
          <>
            <div className="testmodus" style={{ marginTop: 18 }}>Testmodus: alt er eksempeldata og nullstilles med jevne mellomrom. Du trenger ikke passord.</div>
            <form action={demoInn} className="stakk" style={{ marginTop: 8 }}>
              <button className="knapp" name="rolle" value="bedrift">Gå inn som bedrift</button>
              <button className="knapp hvit" name="rolle" value="regnskapsforer">Gå inn som regnskapsfører</button>
            </form>
            <details style={{ marginTop: 18 }}><summary className="mut liten" style={{ cursor: 'pointer' }}>Logg inn med e-post og passord</summary><LoggInnSkjema neste={neste} /></details>
          </>
        ) : <LoggInnSkjema neste={neste} />}
        <p className="mut liten" style={{ marginTop: 22 }}>Ny her? <Link href="/registrer">Lag en konto</Link> · <Link href="/registrer?rolle=bedrift">Start gratis for bedriften</Link></p>
      </div>
    </main>
  );
}
