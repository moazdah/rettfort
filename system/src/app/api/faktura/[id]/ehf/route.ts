import { sesjon, db } from '@/lib/server';
import { hentSalg, hentOrg } from '@/lib/tjenester/faktura';
import { lagEhf, ehfMangler } from '@/lib/ehf';

/** EHF-fil (Peppol BIS Billing 3.0) for en sendt faktura eller kreditnota. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await sesjon();
  if (!s?.org) return new Response('Ikke logget inn', { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('Ugyldig', { status: 400 });
  const d = await db();
  const f = await hentSalg(d, s.org.id, id);
  if (!f || !f.nr) return new Response('Fant ikke dokumentet', { status: 404 });
  if (f.type !== 'faktura' && f.type !== 'kreditnota') return new Response('EHF lages bare for faktura og kreditnota.', { status: 400 });
  const o = await hentOrg(d, s.org.id);
  const krediterer = f.krediterer_id ? await d.en<{ nr: number; dato: string }>('select nr, dato::text as dato from faktura where id = $1 and organisasjon_id = $2', [f.krediterer_id, s.org.id]) : null;
  const data = {
    type: f.type, nr: f.nr, dato: f.dato, forfall: f.forfall, kid: f.kid, referanse: f.referanse, krediterer, kreditgrunn: f.kreditgrunn,
    selger: { navn: o.navn, orgnr: o.orgnr, adresse: o.adresse, postnr: o.postnr, poststed: o.poststed, epost: o.epost, kontonr: o.kontonr, mvaRegistrert: o.mva_registrert, orgform: o.orgform },
    kunde: { navn: f.kunde?.navn ?? '', orgnr: f.kunde?.orgnr ?? null, adresse: f.kunde?.adresse ?? null, postnr: f.kunde?.postnr ?? null, poststed: f.kunde?.poststed ?? null, epost: f.kunde?.epost ?? null },
    linjer: f.linjer,
  } as const;
  const mangler = ehfMangler(data);
  if (mangler.length) return new Response(mangler.join(' '), { status: 422, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  return new Response(lagEhf(data), { headers: { 'content-type': 'application/xml; charset=utf-8', 'content-disposition': `attachment; filename="EHF-${f.type}-${f.nr}.xml"` } });
}
