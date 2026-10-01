import Link from 'next/link';

export type Faner = { uke: string; ansatte: string; vis: 'uke' | 'ansatte' };

/** Fanene Uke | Ansatte i vaktplanen. */
export function VpFaner({ f }: { f: Faner }) {
  return (
    <nav className="faner">
      <Link href={f.uke} className={f.vis === 'uke' ? 'aktiv' : ''}>Uke</Link>
      <Link href={f.ansatte} className={f.vis === 'ansatte' ? 'aktiv' : ''}>Ansatte</Link>
    </nav>
  );
}
