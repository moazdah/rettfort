import type { Metadata } from 'next';
import { Assistent } from '@/components/Assistent';
import { VpMeny } from '@/components/VpMeny';
import { sesjon, db } from '@/lib/server';
import { harAssistent } from '@/lib/pakker';
import { minAdresse } from '@/lib/verter';

export const metadata: Metadata = {
  title: { default: 'Vaktplan', template: '%s · Rettført Vaktplan' },
  manifest: '/vakt.webmanifest',
  appleWebApp: { capable: true, title: 'Rettført Vaktplan', statusBarStyle: 'default' },
  icons: { apple: '/vakt-ikon-180.png' },
};

/** Egen ramme for vaktplan.rettført.no: bare vaktplanen, med vei tilbake til regnskapet. */
export default async function VaktplanRamme({ children }: { children: React.ReactNode }) {
  const s = await sesjon();
  const d = await db();
  const medAssistent = !!s?.org && (harAssistent(s.org.pakke) || s.medlemskap.some(m => m.type === 'byra'));
  return (
    <div className="ramme vp-ramme">
      {s?.org && <VpMeny firma={s.org.navn} bruker={s.bruker.navn} epost={s.bruker.epost} regnskap={minAdresse()} assistent={medAssistent} />}
      <main className="innhold">
        {d.modus === 'testmodus' && <div className="testmodus ikke-utskrift">Testmodus: databasen er ikke koblet til ennå. Data kan bli nullstilt.</div>}
        {children}
      </main>
      {s?.org && <Assistent tilgang={medAssistent} />}
    </div>
  );
}
