import { redirect } from 'next/navigation';
import { sesjon, kreverSelskap } from '@/lib/server';
import { minAdresse } from '@/lib/verter';
import { VaktplanInnhold, type Sok } from '../(system)/vaktplan/Innhold';

export const metadata = { title: 'Vaktplan' };

/** Forsiden på vaktplan.rettført.no: lederens vaktplan. Ansatte går til sin egen flate. */
export default async function VaktplanForside({ searchParams }: { searchParams: Promise<Sok> }) {
  const s = await sesjon({ ansatt: true });
  if (!s) redirect('/logg-inn');
  if (s.rolle === 'ansatt') redirect('/vakt');
  return <VaktplanInnhold s={await kreverSelskap()} sp={await searchParams} regnskap={minAdresse()} />;
}
