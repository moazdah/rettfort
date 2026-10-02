import Link from 'next/link';
import { kreverByra, db } from '@/lib/server';
import { Logo } from '@/components/Logo';
import { loggUt } from '@/app/handlinger';

export default async function ByraRamme({ children }: { children: React.ReactNode }) {
  const s = await kreverByra();
  const d = await db();
  const byra = s.medlemskap.find(m => m.type === 'byra')!;
  return (
    <div className="ramme">
      <header className="toppmeny">
        <div className="toppmeny-indre">
          <Link href="/byra" className="logo" aria-label="Rettført Byrå"><Logo bredde={92} /></Link>
          <nav className="valg-rad" aria-label="Byrå"><Link href="/byra" className="valg aktiv" aria-current="page">Klienter</Link></nav>
          <div className="profil" style={{ display: 'flex', gap: 12 }}>
            <span className="firma-navn">{byra.navn}</span>
            <span className="avatar">{s.bruker.navn.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase()}</span>
            <form action={loggUt}><button className="knapp hvit liten">Logg ut</button></form>
          </div>
        </div>
      </header>
      <main className="innhold">
        {d.modus === 'testmodus' && <div className="testmodus">Testmodus: databasen er ikke koblet til ennå. Data kan bli nullstilt.</div>}
        {children}
      </main>
    </div>
  );
}
