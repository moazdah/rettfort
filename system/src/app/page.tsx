import { redirect } from 'next/navigation';
import { sesjon } from '@/lib/server';

export default async function Start() {
  const s = await sesjon();
  if (!s) redirect('/logg-inn');
  if (s.rolle === 'ansatt') redirect('/vakt');
  if (!s.bruker.epostBekreftet && !s.org) redirect('/registrer');
  if (!s.org) redirect('/velkommen');
  redirect(s.org.type === 'byra' ? '/byra' : '/hjem');
}
