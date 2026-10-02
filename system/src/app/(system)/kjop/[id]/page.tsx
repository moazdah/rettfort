import Link from 'next/link';
import { notFound } from 'next/navigation';
import { kreverSelskap, db, idag } from '@/lib/server';
import { kr, nd, KJOP_STATUS } from '@/lib/vis';
import { kontoNavn } from '@/lib/kontoplan';
import { Handling } from '@/components/Handling';
import { Posteringer } from '@/components/Posteringer';
import { LeggVed } from '@/components/LeggVed';
import { betalKjopHandling, slettKjopHandling } from '@/app/handlinger';

export const metadata = { title: 'Kjøp' };

const BETALT: Record<string, string> = { bank: 'Firmakort eller bank', ubetalt: 'Ikke betalt ennå', privat: 'Med egne penger (utlegg)', kontant: 'Kontant' };

export default async function KjopDetalj({ params }: { params: Promise<{ id: string }> }) {
  const s = await kreverSelskap();
  const d = await db();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const k = await d.en<{ id: string; leverandor_navn: string; leverandor_orgnr: string | null; dato: string; forfall: string | null; tekst: string | null; total: number; mva: number; sats: number; konto: number; status: string; betalt_med: string; vedlegg_id: string | null; bilag_id: string | null; nr: number | null; filnavn: string | null; linjer: unknown; videre: string | null }>(
    `select k.*, k.dato::text as dato, k.forfall::text as forfall, b.nr, v.filnavn, c.navn as videre from kjop k left join bilag b on b.id = k.bilag_id left join vedlegg v on v.id = k.vedlegg_id left join kontakt c on c.id = k.videre_kontakt_id where k.id = $1 and k.organisasjon_id = $2`, [id, s.org.id]);
  if (!k) notFound();
  if (k.status === 'utkast') return <p>Dette er et utkast. <Link className="lenke" href={`/kjop/ny?utkast=${k.id}`}>Fortsett utkastet</Link>.</p>;
  const [st, farge] = KJOP_STATUS[k.status] ?? [k.status, ''];
  const deler = (typeof k.linjer === 'string' ? JSON.parse(k.linjer) : k.linjer) as { konto: number; brutto: number }[] | null;
  const dag = idag();
  return (
    <div className="stakk" style={{ gap: 20, maxWidth: 820 }}>
      <Link href="/kjop" className="lenke mut">← Alle kjøp</Link>
      <div className="hode">
        <div><div className="stikk gronn">Kjøp{k.nr ? ` · bilag ${k.nr}` : ''}</div><h1 style={{ marginTop: 4 }}>{k.leverandor_navn}</h1><p className="mut">{nd(k.dato)}{k.tekst ? ` · ${k.tekst}` : ''}</p></div>
        <div style={{ textAlign: 'right' }}><div className="belop" style={{ fontSize: 28, fontWeight: 600 }}>{kr(k.total)} kr</div><span className={`merke ${farge}`}>{st}</span></div>
      </div>
      <div className="kort">
        <table className="tabell">
          <tbody>
            <tr><td className="mut">Type kjøp</td><td>{deler?.length ? deler.map(x => `${kontoNavn(x.konto)} (${kr(x.brutto)} kr)`).join(', ') : kontoNavn(k.konto)}</td></tr>
            <tr><td className="mut">MVA</td><td>{k.mva ? `${kr(k.mva)} kr (${k.sats} %) trekkes fra i MVA-meldingen` : 'Ingen MVA-fradrag'}</td></tr>
            <tr><td className="mut">Betalt med</td><td>{BETALT[k.betalt_med] ?? k.betalt_med}{k.status === 'registrert' && k.forfall ? ` · forfaller ${nd(k.forfall)}` : ''}</td></tr>
            {k.leverandor_orgnr && <tr><td className="mut">Org.nr</td><td className="mono">{k.leverandor_orgnr}</td></tr>}
            {k.videre && <tr><td className="mut">Faktureres videre til</td><td>{k.videre}</td></tr>}
            <tr><td className="mut">Kvittering</td><td>{k.vedlegg_id ? <a className="lenke" href={`/api/vedlegg/${k.vedlegg_id}`} target="_blank" rel="noreferrer">{k.filnavn ?? 'Åpne'}</a> : <span>Ikke lagt ved. <LeggVed kjopId={k.id} /></span>}</td></tr>
          </tbody>
        </table>
      </div>
      <div className="rad">
        {k.status === 'registrert' && <Handling handling={betalKjopHandling.bind(null, k.id, dag)} tekst="Marker som betalt i dag" />}
        <Link href={`/kjop/ny?rett=${k.id}`} className="knapp hvit">Rett kjøpet</Link>
        <Handling handling={slettKjopHandling.bind(null, k.id)} tekst="Fjern kjøpet" klasse="knapp rod" bekreft="Kjøpet fjernes med en motpostering i dag. Det opprinnelige bilaget blir stående. Fortsette?" etter="/kjop" />
      </div>
      <Posteringer d={d} orgId={s.org.id} bilagId={k.bilag_id} />
    </div>
  );
}
