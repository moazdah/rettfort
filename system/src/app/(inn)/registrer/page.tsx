import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { sesjon } from '@/lib/server';
import { RegistrerSkjema } from './skjema';

export const metadata = { title: 'Lag konto' };

export default async function Registrer({ searchParams }: { searchParams: Promise<{ rolle?: string; neste?: string; epost?: string }> }) {
  const { rolle, neste: n, epost } = await searchParams;
  const neste = n && /^\/invitasjon\/[\w-]+$/.test(n) ? n : undefined;
  const s = await sesjon();
  if (s && neste) redirect(neste);
  if (s?.org) redirect('/');
  if (s) redirect('/velkommen');
  return (
    <main className="midt">
      <div className="boks">
        <div style={{ marginBottom: 28 }}><Logo bredde={130} /></div>
        <h1>Lag kontoen</h1>
        <p className="mut" style={{ marginTop: 8 }}>Gratis å starte. Ingen binding.</p>
        <RegistrerSkjema startRolle={rolle === 'regnskapsforer' ? 'regnskapsforer' : 'bedrift'} neste={neste} epost={epost} />
        <p className="mut liten" style={{ marginTop: 22 }}>Har du konto? <Link href="/logg-inn">Logg inn</Link></p>
      </div>
    </main>
  );
}
