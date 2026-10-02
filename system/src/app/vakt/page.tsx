import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { sesjon, db, idag } from '@/lib/server';
import { ansattForBruker } from '@/lib/tjenester/vaktplan';
import { loggUt } from '@/app/handlinger';
import { IKON_URL } from '../vp/ikoner';
import { hentAnsattData } from './data';
import { Ansatt } from './Ansatt';

export const metadata = {
  title: 'Vaktplan',
  manifest: '/vakt.webmanifest',
  appleWebApp: { capable: true, title: 'Rettført Vaktplan', statusBarStyle: 'default' as const },
  icons: { apple: '/vakt-ikon-180.png' },
};

/** Den ansattes egen, enkle flate. Ser bare egne vakter, ledige vakter og når hen kan jobbe. */
export default async function Vakt({ searchParams }: { searchParams: Promise<{ ugyldig?: string }> }) {
  const s = await sesjon({ ansatt: true });
  const sp = await searchParams;
  if (s && s.rolle !== 'ansatt') redirect('/vaktplan');
  if (!s?.org) {
    return (
      <main className="midt">
        <div className="boks stakk">
          <Logo bredde={120} />
          <h1>Vaktplan</h1>
          <p className="mut">{sp.ugyldig ? 'Lenken virker ikke lenger. Be lederen sende en ny under Vaktplan → Ansatte.' : 'Åpne lenken du fikk på SMS eller e-post, så kommer du rett inn.'}</p>
        </div>
      </main>
    );
  }
  const d = await db();
  const a = await ansattForBruker(d, s.org.id, s.bruker.id);
  if (!a) {
    return <main className="midt"><div className="boks stakk"><Logo bredde={120} /><h1>Vaktplan</h1><p className="mut">Du er ikke lenger registrert som ansatt i {s.org.navn}.</p><form action={loggUt}><button className="knapp hvit">Logg ut</button></form></div></main>;
  }
  const data = await hentAnsattData(d, s.org.id, s.org.navn, a.id, idag());
  return (
    <>
      <link rel="stylesheet" href={IKON_URL} precedence="default" />
      <Ansatt d={data} />
    </>
  );
}
