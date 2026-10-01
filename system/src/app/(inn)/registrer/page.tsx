import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { sesjon } from '@/lib/server';
import { RegistrerSkjema } from './skjema';
import { BYRA_I_SALG } from '@/lib/pakker';
import { UferdigRegistrering } from '@/components/UferdigRegistrering';

export const metadata = { title: 'Lag konto' };

export default async function Registrer({ searchParams }: { searchParams: Promise<{ rolle?: string; neste?: string; epost?: string }> }) {
  const { rolle, neste: n, epost } = await searchParams;
  const neste = n && /^\/invitasjon\/[\w-]+$/.test(n) ? n : undefined;
  const s = await sesjon();
  // Uferdig registrering (e-posten ikke bekreftet): vis skjemaet igjen, med valg om å fortsette.
  const uferdig = s && !s.bruker.epostBekreftet ? s.bruker.epost : null;
  if (s && !uferdig && neste) redirect(neste);
  if (s && !uferdig && s.org) redirect('/');
  if (s && !uferdig) redirect('/velkommen');
  return (
    <main className="midt">
      <div className="boks">
        <div style={{ marginBottom: 28 }}><Logo bredde={130} /></div>
        <h1>Lag kontoen</h1>
        <p className="mut" style={{ marginTop: 8 }}>Gratis å starte. Ingen binding.</p>
        {uferdig && <UferdigRegistrering epost={uferdig} />}
        <RegistrerSkjema startRolle={BYRA_I_SALG && rolle === 'regnskapsforer' ? 'regnskapsforer' : 'bedrift'} neste={neste} epost={epost} velgRolle={BYRA_I_SALG} />
        <p className="mut liten" style={{ marginTop: 22 }}>Har du konto? <Link href="/logg-inn">Logg inn</Link></p>
      </div>
    </main>
  );
}
