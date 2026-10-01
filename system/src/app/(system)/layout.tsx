import { Meny } from '@/components/Meny';
import { Assistent } from '@/components/Assistent';
import { harAssistent, erTestbruker, harVaktplan } from '@/lib/pakker';
import { antallForesporsler } from '@/lib/tjenester/vaktplan';
import { kreverSelskap, db, idag } from '@/lib/server';
import { aktuellTermin, mvaStatus } from '@/lib/tjenester/mva';
import { sendKlareIBakgrunnen } from '@/lib/tjenester/utsending';
import { antallIInnboks } from '@/lib/tjenester/innsending';
import { valgtLeverandor, leverandorKlar } from '@/lib/ai/modell';

export default async function SystemRamme({ children }: { children: React.ReactNode }) {
  const s = await kreverSelskap();
  const d = await db();
  let mvaTeller = 0;
  try {
    const termin = await aktuellTermin(d, s.org.id, idag());
    if (termin) { const st = await mvaStatus(d, s.org.id, termin); if (!st.sendt) mvaTeller = st.antallMangler; }
  } catch { /* telleren er ikke kritisk */ }
  await sendKlareIBakgrunnen().catch(() => {});
  const innboksTeller = await antallIInnboks(d, s.org.id).catch(() => 0);
  const vaktTeller = harVaktplan(s.org.pakke) ? await antallForesporsler(d, s.org.id, idag()).catch(() => 0) : 0;
  const test = erTestbruker(s.bruker.epost);
  // Bare for administrator: hvilken språkmodell assistenten bruker. Kunder ser aldri dette.
  const ai = test ? { valgt: await valgtLeverandor(d).catch(() => 'kina' as const), eu: leverandorKlar('eu'), kina: leverandorKlar('kina') } : undefined;
  const medAssistent = harAssistent(s.org.pakke) || s.medlemskap.some(m => m.type === 'byra');
  return (
    <div className="ramme">
      <Meny firma={s.org.navn} pakke={s.org.pakke} bruker={s.bruker.navn} rolle={s.rolle} mvaTeller={mvaTeller} harByra={s.medlemskap.some(m => m.type === 'byra')} testbruker={test} ai={ai} assistent vaktTeller={vaktTeller} idag={idag()} foretak={s.medlemskap.filter(m => m.type === 'selskap')} orgId={s.org.id} epost={s.bruker.epost} innboksTeller={innboksTeller} />
      <main className="innhold">
        {d.modus === 'testmodus' && <div className="testmodus ikke-utskrift">Testmodus: databasen er ikke koblet til ennå. Data kan bli nullstilt.</div>}
        {children}
      </main>
      <Assistent tilgang={medAssistent} />
    </div>
  );
}
