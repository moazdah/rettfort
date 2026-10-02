// Leser en kvittering eller faktura i nettleseren: EHF direkte, PDF med pdf.js, bilder med norsk
// tekstgjenkjenning (Tesseract). Bildet leses to ganger, og tallene kryss-sjekkes av tolkeren.
// Ingenting sendes til andre tjenester, og det koster ingenting per kvittering.

import { tolkBeste } from './kvittering.js';

export type FeltStatus = 'bekreftet' | 'lest' | 'sjekk' | 'mangler';
export interface Tolkning {
  lev: string | null; orgnr: string | null; dato: string | null; total: number | null; mva: number | null; sats: number | null;
  beskrivelse: string | null; status: Record<string, FeltStatus>; grunn: Record<string, string>; sikker: boolean;
}

// Laster moduler fra /public uten at byggeverktøyet prøver å pakke dem.
const hent = new Function('u', 'return import(u)') as (u: string) => Promise<Record<string, unknown>>;

export async function lesKvittering(fil: File, idag: string, onSteg?: (t: string) => void): Promise<Tolkning> {
  const B = await hent('/les/rettfort-bilag.js') as { readBilag: (f: File, s?: (t: string) => void, o?: { alle: boolean }) => Promise<{ error?: string; kind?: string; xml?: string; text?: string; varianter?: { text: string }[] }> };
  const r = await B.readBilag(fil, onSteg, { alle: true });
  if (r.error) throw new Error(r.error);
  if (r.kind === 'ehf' && r.xml) {
    const E = await hent('/les/rettfort-engine.js') as { parseEhf: (x: string) => { fields: Record<string, unknown> } };
    const f = E.parseEhf(r.xml).fields as { supplier?: string; orgNo?: string; date?: string; total?: number; vat?: number; description?: string };
    const ore = (x?: number) => (x == null || isNaN(x) ? null : Math.round(x * 100));
    const total = ore(f.total), mva = ore(f.vat);
    const sats = total && mva != null ? [25, 15, 12, 0].find(s => Math.abs(mva - Math.round((total * s) / (100 + s))) <= 2) ?? null : null;
    return { lev: f.supplier ?? null, orgnr: f.orgNo ?? null, dato: f.date ?? null, total, mva, sats, beskrivelse: f.description ?? null,
      status: { lev: 'bekreftet', dato: 'bekreftet', total: 'bekreftet', mva: 'bekreftet' }, grunn: { total: 'Lest fra EHF-fakturaen.' }, sikker: true };
  }
  const tekster = r.varianter ? r.varianter.map(v => v.text) : [r.text ?? ''];
  return tolkBeste(tekster, { idag }) as unknown as Tolkning;
}
