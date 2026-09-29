import { epostPa } from '@/lib/epost';
import { redirect } from 'next/navigation';
import { sesjon, db } from '@/lib/server';
import { Velkomst } from './velkomst';

export const metadata = { title: 'Velkommen' };

export default async function Velkommen({ searchParams }: { searchParams: Promise<{ kode?: string }> }) {
  const s = await sesjon();
  if (!s) redirect('/registrer?rolle=bedrift');
  if (s.org && s.org.type === 'selskap') redirect('/hjem');
  const { kode } = await searchParams;
  const d = await db();
  const b = await d.en<{ bekreftkode: string | null }>('select bekreftkode from bruker where id = $1', [s.bruker.id]);
  // Koden vises når e-post ikke er koblet til, eller når sendingen feilet (da kommer den med i adressen).
  return <Velkomst navn={s.bruker.navn.split(' ')[0]} epost={s.bruker.epost} bekreftet={s.bruker.epostBekreftet} testkode={d.modus === 'testmodus' || !epostPa() ? (b?.bekreftkode ?? null) : kode && kode === b?.bekreftkode ? kode : null} />;
}
