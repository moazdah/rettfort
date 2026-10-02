import type { Sporring } from '@/lib/db';
import { hentSalg, hentOrg } from './faktura';
import { lagFakturaPdf } from '@/lib/pdf';
import { logoFor } from './logo';

/** Lager PDF-en for et salgsdokument, slik kunden ser den. */
export async function fakturaPdf(d: Sporring, orgId: string, id: string) {
  const f = await hentSalg(d, orgId, id);
  if (!f) return null;
  const o = await hentOrg(d, orgId) as Awaited<ReturnType<typeof hentOrg>> & { faktura_tekst: string | null };
  const av = { navn: o.navn, orgnr: o.orgnr, adresse: o.adresse, postnr: o.postnr, poststed: o.poststed, kontonr: o.kontonr, epost: o.epost, telefon: o.telefon, tekst: o.faktura_tekst, mvaRegistrert: o.mva_registrert, orgform: o.orgform, ...(f.avsender ?? {}) };
  const pdf = await lagFakturaPdf({ type: f.type, nr: f.nr, dato: f.dato, forfall: f.forfall, levert: f.levert, referanse: f.referanse, kid: f.kid, kreditgrunn: f.type === 'kreditnota' ? f.kreditgrunn : null, avsender: av, kunde: f.kunde, linjer: f.linjer, logo: await logoFor(d, orgId, 'faktura') });
  return { pdf, filnavn: `${f.type}-${f.nr ?? 'utkast'}.pdf`, f, avsender: av };
}
