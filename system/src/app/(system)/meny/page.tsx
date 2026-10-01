import Link from 'next/link';
import { MER } from '@/components/menyvalg';
import { loggUt } from '@/app/handlinger';

export const metadata = { title: 'Meny' };

/** Reserve for lenker til /meny. På mobil åpnes «Mer» som et ark fra bunnmenyen. */
export default function MenySide() {
  return (
    <div className="stakk">
      <h1>Meny</h1>
      {MER.map(g => (
        <section key={g.navn} className="stakk" style={{ gap: 8 }}>
          <h2>{g.navn}</h2>
          <div className="liste">{g.under.map(m => <Link key={m.href} href={m.href} className="linje"><span className="fyll tittel">{m.navn}</span><span className="faint">›</span></Link>)}</div>
        </section>
      ))}
      <form action={loggUt}><button className="knapp hvit">Logg ut</button></form>
    </div>
  );
}
