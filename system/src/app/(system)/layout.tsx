import { Meny } from '@/components/Meny';
import { kreverSelskap, db, idag } from '@/lib/server';
import { aktuellTermin, mvaStatus } from '@/lib/tjenester/mva';

export default async function SystemRamme({ children }: { children: React.ReactNode }) {
  const s = await kreverSelskap();
  const d = await db();
  let mvaTeller = 0;
  try {
    const termin = await aktuellTermin(d, s.org.id, idag());
    if (termin) { const st = await mvaStatus(d, s.org.id, termin); if (!st.sendt) mvaTeller = st.antallMangler; }
  } catch { /* telleren er ikke kritisk */ }
  return (
    <div className="ramme">
      <Meny firma={s.org.navn} pakke={s.org.pakke} bruker={s.bruker.navn} rolle={s.rolle} mvaTeller={mvaTeller} harByra={s.medlemskap.some(m => m.type === 'byra')} />
      <main className="innhold">
        {d.modus === 'testmodus' && <div className="testmodus ikke-utskrift">Testmodus: databasen er ikke koblet til ennå. Data kan bli nullstilt.</div>}
        {children}
      </main>
    </div>
  );
}
