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
      <nav className="meny" aria-label="Byrå">
        <Link href="/byra" className="logo"><Logo bredde={96} /></Link>
        <div className="firma"><b>{byra.navn}</b>Rettført Byrå</div>
        <Link href="/byra" className="valg aktiv"><span className="ikon">Kl</span>Klienter</Link>
        <div className="bunn">
          <span className="avatar">{s.bruker.navn.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase()}</span>
          <div style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }}><b style={{ display: 'block', fontWeight: 600 }}>{s.bruker.navn}</b><span className="faint">Regnskapsfører</span></div>
          <form action={loggUt}><button className="knapp hvit liten">Logg ut</button></form>
        </div>
      </nav>
      <main className="innhold">
        {d.modus === 'testmodus' && <div className="testmodus">Testmodus: databasen er ikke koblet til ennå. Data kan bli nullstilt.</div>}
        <div className="rad ikke-utskrift mobil-bare" style={{ justifyContent: 'space-between', marginBottom: 16 }}><Logo bredde={90} /><form action={loggUt}><button className="knapp hvit liten">Logg ut</button></form></div>
        {children}
      </main>
    </div>
  );
}
