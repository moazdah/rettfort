import { sesjon, db } from '@/lib/server';
import { hentSalg, hentOrg } from '@/lib/tjenester/faktura';
import { lagFakturaPdf } from '@/lib/pdf';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await sesjon();
  if (!s?.org) return new Response('Ikke logget inn', { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('Ugyldig', { status: 400 });
  const d = await db();
  const f = await hentSalg(d, s.org.id, id);
  if (!f) return new Response('Fant ikke dokumentet', { status: 404 });
  const o = await hentOrg(d, s.org.id) as Awaited<ReturnType<typeof hentOrg>> & { faktura_tekst: string | null };
  const av = { navn: o.navn, orgnr: o.orgnr, adresse: o.adresse, postnr: o.postnr, poststed: o.poststed, kontonr: o.kontonr, epost: o.epost, telefon: o.telefon, tekst: o.faktura_tekst, mvaRegistrert: o.mva_registrert, orgform: o.orgform, ...(f.avsender ?? {}) };
  const pdf = await lagFakturaPdf({ type: f.type, nr: f.nr, dato: f.dato, forfall: f.forfall, levert: f.levert, referanse: f.referanse, kid: f.kid, kreditgrunn: f.type === 'kreditnota' ? f.kreditgrunn : null, avsender: av, kunde: f.kunde, linjer: f.linjer });
  const navn = `${f.type}-${f.nr ?? 'utkast'}.pdf`;
  return new Response(pdf as unknown as BodyInit, { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="${navn}"` } });
}
