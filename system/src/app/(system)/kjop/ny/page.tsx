import Link from 'next/link';
import { kreverSelskap, db, idag } from '@/lib/server';
import { KjopSkjema, type KjopStart } from '../KjopSkjema';

export const metadata = { title: 'Nytt kjøp' };

export default async function NyttKjop({ searchParams }: { searchParams: Promise<{ utkast?: string; rett?: string }> }) {
  const s = await kreverSelskap();
  const d = await db();
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
  const modus = sp.rett && start ? 'rett' : sp.utkast && start ? 'utkast' : 'ny';
  const kunder = await d.q<{ id: string; navn: string }>(`select id, navn from kontakt where organisasjon_id = $1 and type in ('kunde','begge') order by navn`, [s.org.id]);
  const titt = await d.en<{ n: number }>(`select count(*)::int as n from kjop where organisasjon_id = $1 and status in ('utkast','trenger_titt')`, [s.org.id]);
  return (
    <div className="stakk" style={{ gap: 22 }}>
      <div className="hode">
        <div>
          <div className="stikk gronn">Penger ut</div>
          <h1 style={{ marginTop: 4 }}>{modus === 'rett' ? 'Rett kjøpet' : 'Jeg har kjøpt noe'}</h1>
          <p className="mut">{modus === 'rett' ? 'Det gamle bilaget blir stående, og vi fører en korrigering i dag. Slik er regnskapet sporbart.' : 'Last opp kvitteringen eller fyll ut selv. Vi sjekker MVA og summen før noe blir ført.'}</p>
        </div>
        <Link href="/kjop" className="knapp hvit">Alle kjøp{titt?.n ? <span className="merke gul">{titt.n}</span> : null}</Link>
      </div>
      <KjopSkjema key={id ?? 'ny'} start={start} idag={idag()} mvaRegistrert={s.org.mvaRegistrert} kunder={kunder} bilagEpost={`${s.org.bilagSlug ?? 'firma'}@bilag.rettfort.no`} modus={modus} pakke={s.org.pakke} />
    </div>
  );
}
