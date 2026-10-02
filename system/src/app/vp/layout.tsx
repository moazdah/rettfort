import type { Metadata } from 'next';
import { Assistent } from '@/components/Assistent';
import { sesjon, db } from '@/lib/server';
import { harAssistent } from '@/lib/pakker';
import { IKON_URL } from './ikoner';

export const metadata: Metadata = {
  title: { default: 'Vaktplan', template: '%s · Rettført Vaktplan' },
  manifest: '/vakt.webmanifest',
  appleWebApp: { capable: true, title: 'Rettført Vaktplan', statusBarStyle: 'default' },
  icons: { apple: '/vakt-ikon-180.png' },
};

/** Egen ramme for vaktplan.rettført.no: vaktplanen har sin egen toppmeny. */
export default async function VaktplanRamme({ children }: { children: React.ReactNode }) {
  const s = await sesjon();
  const d = await db();
  const medAssistent = !!s?.org && harAssistent(s.org.pakke);
  return (
    <>
      <link rel="stylesheet" href={IKON_URL} precedence="default" />
      {d.modus === 'testmodus' && <div className="testmodus ikke-utskrift">Testmodus: databasen er ikke koblet til ennå. Data kan bli nullstilt.</div>}
      {children}
      {s?.org && <Assistent tilgang={medAssistent} />}
    </>
  );
}
