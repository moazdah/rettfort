import { redirect } from 'next/navigation';
import { sesjon } from '@/lib/server';

export default async function Start() {
  const s = await sesjon();
  if (!s) redirect('/logg-inn');
  if (!s.org) redirect('/velkommen');
  redirect(s.org.type === 'byra' ? '/byra' : '/hjem');
}
