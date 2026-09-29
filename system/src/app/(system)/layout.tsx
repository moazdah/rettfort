import { Meny } from '@/components/Meny';
import { Assistent } from '@/components/Assistent';
import { harAssistent, erTestbruker } from '@/lib/pakker';
import { kreverSelskap, db, idag } from '@/lib/server';
import { aktuellTermin, mvaStatus } from '@/lib/tjenester/mva';
import { sendKlareIBakgrunnen } from '@/lib/tjenester/utsending';

export default async function SystemRamme({ children }: { children: React.ReactNode }) {
  const s = await kreverSelskap();
  const d = await db();
  let mvaTeller = 0;
  try {
    const termin = await aktuellTermin(d, s.org.id, idag());
    if (termin) { const st = await mvaStatus(d, s.org.id, termin); if (!st.sendt) mvaTeller = st.antallMangler; }
  } catch { /* telleren er ikke kritisk */ }
  await sendKlareIBakgrunnen().catch(() => {});
  return (
    <div className="ramme">
      <Meny firma={s.org.navn} pakke={s.org.pakke} bruker={s.bruker.navn} rolle={s.rolle} mvaTeller={mvaTeller} harByra={s.medlemskap.some(m => m.type === 'byra')} testbruker={erTestbruker(s.bruker.epost)} foretak={s.medlemskap.filter(m => m.type === 'selskap')} orgId={s.org.id} epost={s.bruker.epost} />
      <main className="innhold">
        {d.modus === 'testmodus' && <div className="testmodus ikke-utskrift">Testmodus: databasen er ikke koblet til ennå. Data kan bli nullstilt.</div>}
        {children}
      </main>
      {(harAssistent(s.org.pakke) || s.medlemskap.some(m => m.type === 'byra')) && <Assistent />}
    </div>
  );
}
