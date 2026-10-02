import Link from 'next/link';
import { Kreditter } from '@/components/Kreditter';
import { gratisBruk } from '@/lib/tjenester/bruk';
import { harFulltRegnskap } from '@/lib/pakker';
import { kreverSelskap, db, idag } from '@/lib/server';
import { KjopSkjema, type KjopStart, type InnsendingStart } from '../KjopSkjema';
import { hentInnsending, antallIInnboks } from '@/lib/tjenester/innsending';

export const metadata = { title: 'Nytt kjøp' };

export default async function NyttKjop({ searchParams }: { searchParams: Promise<{ utkast?: string; rett?: string; lev?: string; total?: string; dato?: string; innsending?: string }> }) {
  const s = await kreverSelskap();
  const d = await db();
  const bruk = harFulltRegnskap(s.org.pakke) ? null : await gratisBruk(d, s.org.id, idag());
  const sp = await searchParams;
  const id = sp.utkast ?? sp.rett;
  let start: KjopStart | undefined;
  if (id && /^[0-9a-f-]{36}$/.test(id)) {
    const k = await d.en<{ id: string; leverandor_navn: string | null; leverandor_orgnr: string | null; dato: string | null; forfall: string | null; tekst: string | null; total: number; mva: number; sats: number | null; konto: number | null; betalt_med: string | null; linjer: unknown; vedlegg_id: string | null; filnavn: string | null; videre_kontakt_id: string | null; kilde: string | null; status: string }>(
      `select k.*, k.dato::text as dato, k.forfall::text as forfall, v.filnavn from kjop k left join vedlegg v on v.id = k.vedlegg_id where k.id = $1 and k.organisasjon_id = $2`, [id, s.org.id]);
    if (k) {
      const linjer = (typeof k.linjer === 'string' ? JSON.parse(k.linjer) : k.linjer) as KjopStart['deler'];
      start = { id: k.id, leverandorNavn: k.leverandor_navn ?? '', leverandorOrgnr: k.leverandor_orgnr, dato: k.dato ?? undefined, forfall: k.forfall, tekst: k.tekst, total: k.total, mva: k.mva, sats: k.sats ?? 25, konto: k.konto ?? 6800, betaltMed: (k.betalt_med ?? 'bank') as KjopStart['betaltMed'], deler: linjer, vedleggId: k.vedlegg_id, vedleggNavn: k.filnavn, viderefakturerKontaktId: k.videre_kontakt_id, kilde: k.kilde };
    }
  }
  if (!start && sp.total && /^\d+$/.test(sp.total)) {
    // Fra Bank: en bevegelse som mangler kvittering.
    start = { leverandorNavn: sp.lev ?? '', total: Number(sp.total), dato: sp.dato && /^\d{4}-\d{2}-\d{2}$/.test(sp.dato) ? sp.dato : undefined, betaltMed: 'bank', kilde: 'bank' };
  }
  const modus = sp.rett && start ? 'rett' : sp.utkast && start ? 'utkast' : 'ny';
  // Fra innboksen: et dokument sendt fra mobil, klient eller ansatt.
  let innsending: InnsendingStart | null = null;
  if (sp.innsending && /^[0-9a-f-]{36}$/.test(sp.innsending)) {
    const i = await hentInnsending(d, s.org.id, sp.innsending);
    if (i && i.vedlegg_id && ['ny', 'hentet'].includes(i.status)) innsending = { id: i.id, vedleggId: i.vedlegg_id, filnavn: i.filnavn ?? 'kvittering.jpg', type: i.type, fraNavn: i.fra_navn, tekst: i.tekst, betaltMed: i.betalt_med };
  }
  const kunder = await d.q<{ id: string; navn: string }>(`select id, navn from kontakt where organisasjon_id = $1 and type in ('kunde','begge') order by navn`, [s.org.id]);
  const innboksN = await antallIInnboks(d, s.org.id);
  const titt = await d.en<{ n: number }>(`select count(*)::int as n from kjop where organisasjon_id = $1 and status in ('utkast','trenger_titt')`, [s.org.id]);
  return (
    <div className="stakk" style={{ gap: 22 }}>
      <div className="hode">
        <div>
          <div className="stikk gronn">Penger ut</div>
          <h1 style={{ marginTop: 4 }}>{modus === 'rett' ? 'Rett kjøpet' : innsending?.type === 'utlegg' ? `Utlegg fra ${innsending.fraNavn ?? 'ansatt'}` : innsending?.type === 'klient' ? `Bilag fra ${innsending.fraNavn ?? 'klient'}` : 'Jeg har kjøpt noe'}</h1>
          <p className="mut">{modus === 'rett' ? 'Det gamle bilaget blir stående, og vi fører en korrigering i dag. Slik er regnskapet sporbart.' : 'Last opp kvitteringen eller fyll ut selv. Vi sjekker MVA og summen før noe blir ført.'}</p>
        </div>
        <div className="rad" style={{ gap: 8 }}>
          <Link href="/kjop/innboks" className="knapp hvit">Innboks{innboksN ? <span className="merke gul">{innboksN}</span> : null}</Link>
          <Link href="/kjop" className="knapp hvit">Alle kjøp{titt?.n ? <span className="merke gul">{titt.n}</span> : null}</Link>
        </div>
      </div>
      {bruk && <Kreditter bruk={bruk} bare="kvittering" />}
      <KjopSkjema key={id ?? sp.innsending ?? 'ny'} innsending={innsending} start={start} idag={idag()} mvaRegistrert={s.org.mvaRegistrert} kunder={kunder} bilagEpost={`${s.org.bilagSlug ?? 'firma'}@bilag.rettfort.no`} modus={modus} pakke={s.org.pakke} />
    </div>
  );
}
