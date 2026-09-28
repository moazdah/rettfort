import Link from 'next/link';
import { MENY } from '@/components/menyvalg';
import { loggUt } from '@/app/handlinger';

export const metadata = { title: 'Meny' };

export default function MenySide() {
  return (
    <div className="stakk">
      <h1>Meny</h1>
      <div className="liste">
        {MENY.map(m => <Link key={m.href} href={m.href} className="linje"><span className="merke">{m.ikon}</span><span className="fyll tittel">{m.navn}</span><span className="faint">›</span></Link>)}
      </div>
      <form action={loggUt}><button className="knapp hvit">Logg ut</button></form>
    </div>
  );
}
