import { kreverSelskap } from '@/lib/server';
import { VaktplanInnhold, type Sok } from './Innhold';

export const metadata = { title: 'Vaktplan' };

export default async function Vaktplan({ searchParams }: { searchParams: Promise<Sok> }) {
  return <VaktplanInnhold s={await kreverSelskap()} sp={await searchParams} />;
}
