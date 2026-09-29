// Sender lønnslipper som er klare når noen bruker systemet, i tillegg til den daglige jobben.
// Høyst én gang per kvarter per serverinstans, og etter at svaret er sendt, så ingen venter.

import { after } from 'next/server';
import { getDb } from '../db';
import { sendForfalte } from './lonnslipp';
import { grunnadresse } from '../epost';

let sist = 0;

export async function sendKlareIBakgrunnen() {
  if (Date.now() - sist < 15 * 60 * 1000) return;
  sist = Date.now();
  // Adressen må leses mens forespørselen pågår; inne i after() er den ikke tilgjengelig.
  const adresse = await grunnadresse();
  after(async () => {
    try { await sendForfalte(await getDb(), adresse); } catch (e) { console.error('Utsending av lønnslipper feilet:', e); }
  });
}
