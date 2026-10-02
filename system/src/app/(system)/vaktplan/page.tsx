import { redirect } from 'next/navigation';

export const metadata = { title: 'Vaktplan' };

/** Vaktplanen har sin egen flate (vaktplan.rettført.no). Her i regnskapet sendes man dit. */
export default async function Vaktplan({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = new URLSearchParams(await searchParams).toString();
  redirect(`/vp${sp ? `?${sp}` : ''}`);
}
