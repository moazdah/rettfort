import { redirect } from 'next/navigation';
import { sesjon, kreverSelskap, db, idag } from '@/lib/server';
import { minAdresse } from '@/lib/verter';
import { harVaktplan } from '@/lib/pakker';
import { isoUke } from '@/lib/vaktplan';
import { Logo } from '@/components/Logo';
import { hentLederData } from './data';
import { Leder } from './Leder';

export const metadata = { title: 'Vaktplan' };

type Sok = { uke?: string; vis?: string; visning?: string; dag?: string; fane?: string };

/** Forsiden på vaktplan.rettført.no: lederens vaktplan. Ansatte går til sin egen flate. */
export default async function VaktplanForside({ searchParams }: { searchParams: Promise<Sok> }) {
  const s0 = await sesjon({ ansatt: true });
  if (!s0) redirect('/logg-inn');
  if (s0.rolle === 'ansatt') redirect('/vakt');
  const s = await kreverSelskap();
  const sp = await searchParams;
  if (!harVaktplan(s.org.pakke)) {
    return (
      <main className="midt">
        <div className="boks stakk">
          <Logo bredde={120} />
          <h1>Vaktplan er med i Start og Selskap</h1>
          <p className="mut">Lag ukeplanen på et par minutter, la de ansatte ta ledige vakter og be om fri fra mobilen, og send timene rett til lønn. Overtid og merarbeid regnes ut for deg.</p>
          <div><a href={`${minAdresse()}/innstillinger?vis=abonnement`} className="knapp">Se pakkene</a></div>
        </div>
      </main>
    );
  }
  const dag = idag();
  const m = sp.uke?.match(/^(\d{4})-(\d{1,2})$/);
  const valgt = m && Number(m[2]) >= 1 && Number(m[2]) <= 53 ? { aar: Number(m[1]), uke: Number(m[2]) } : isoUke(dag);
  const d = await hentLederData(await db(), s, dag, valgt, minAdresse());
  return <Leder key={`${valgt.aar}-${valgt.uke}`} d={d} start={{ vis: sp.vis, visning: sp.visning, dag: sp.dag, fane: sp.fane }} />;
}
