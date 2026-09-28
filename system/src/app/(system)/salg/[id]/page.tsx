import Link from 'next/link';
import { notFound } from 'next/navigation';
import { kreverSelskap, db, idag } from '@/lib/server';
import { hentSalg, hentOrg } from '@/lib/tjenester/faktura';
import { kanEndre } from '@/lib/auth';
import { FakturaDokument } from '@/components/FakturaDokument';
import { Posteringer } from '@/components/Posteringer';
import { kr, nd, SALG_STATUS, SALG_TYPE } from '@/lib/vis';
import { SalgHandlinger } from './SalgHandlinger';

export const metadata = { title: 'Faktura' };

export default async function SalgDetalj({ params }: { params: Promise<{ id: string }> }) {
  const s = await kreverSelskap();
  const d = await db();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const f = await hentSalg(d, s.org.id, id);
  if (!f) notFound();
  if (f.status === 'utkast') return <p>Dette er et utkast. <Link className="lenke" href={`/salg/ny?utkast=${f.id}`}>Fortsett utkastet</Link>.</p>;
  const org = await hentOrg(d, s.org.id) as Awaited<ReturnType<typeof hentOrg>> & { faktura_tekst: string | null };
  const av = { ...org, tekst: org.faktura_tekst, mvaRegistrert: org.mva_registrert, ...(f.avsender ?? {}) };
  const kreditnotaer = await d.q<{ id: string; nr: number; total: number; dato: string; kreditgrunn: string | null }>(`select id, nr, total, dato::text as dato, kreditgrunn from faktura where krediterer_id = $1 and status <> 'utkast' order by nr`, [id]);
  const orig2 = f.type === 'kreditnota' && f.krediterer_id ? await d.en<{ id: string; nr: number }>('select id, nr from faktura where id = $1 and organisasjon_id = $2', [f.krediterer_id, s.org.id]) : null;
  const betalinger = f.type === 'faktura' && f.nr ? await d.q<{ nr: number; dato: string; belop: number; kilde: string | null }>(
    `select b.nr, b.dato::text as dato, sum(p.debet)::bigint as belop, b.kilde from bilag b join postering p on p.bilag_id = b.id and p.konto = 1920 where b.organisasjon_id = $1 and b.type = 'innbetaling' and b.beskrivelse = $2 group by b.id, b.nr, b.dato, b.kilde order by b.nr`, [s.org.id, `Innbetaling faktura ${f.nr}`]) : [];
  const kreditert = kreditnotaer.reduce((a, k) => a + k.total, 0);
  const rest = f.total - f.betalt - kreditert;
  const [st, farge] = SALG_STATUS[f.status] ?? [f.status, ''];
  const dag = idag();
  const forfalt = f.type === 'faktura' && rest > 0 && f.forfall && f.forfall < dag;
  const tidslinje: { dato: string; tekst: string }[] = [
    { dato: f.opprettet.slice(0, 10), tekst: 'Laget' },
    ...(f.sendt_tid ? [{ dato: f.sendt_tid.slice(0, 10), tekst: f.type === 'tilbud' ? 'Tilbudet er klart' : 'Ført i regnskapet og klar til sending' }] : []),
    ...betalinger.map(b => ({ dato: b.dato, tekst: `${kr(b.belop)} kr betalt${b.kilde === 'bank' ? ' (fra bankavstemmingen)' : ''} · bilag ${b.nr}` })),
    ...kreditnotaer.map(k => ({ dato: k.dato, tekst: `Kreditnota ${k.nr} på ${kr(k.total)} kr${k.kreditgrunn ? `: ${k.kreditgrunn}` : ''}` })),
  ].sort((a, b) => a.dato.localeCompare(b.dato));
  return (
    <div className="stakk" style={{ gap: 20 }}>
      <Link href="/salg" className="lenke mut ikke-utskrift">← Alle fakturaer</Link>
      <div className="hode ikke-utskrift">
        <div><div className="stikk" style={{ color: 'var(--gul-tekst)' }}>{SALG_TYPE[f.type]} {f.nr}</div><h1 style={{ marginTop: 4 }}>{f.kunde?.navn ?? 'Uten kunde'}</h1><p className="mut">{nd(f.dato)}{f.type === 'faktura' && f.forfall ? ` · forfall ${nd(f.forfall)}` : ''}{f.kid ? ` · KID ${f.kid}` : ''}</p></div>
        <div style={{ textAlign: 'right' }}>
          <div className="belop" style={{ fontSize: 28, fontWeight: 600 }}>{kr(f.total)} kr</div>
          <span className={`merke ${forfalt ? 'rod' : farge}`}>{forfalt ? `Forfalt, ${kr(rest)} kr gjenstår` : f.status === 'delvis_betalt' ? `${kr(rest)} kr gjenstår` : st}</span>
        </div>
      </div>
      {orig2 && <div className="varsel info ikke-utskrift">Kreditnota for <Link className="lenke" href={`/salg/${orig2.id}`}>faktura {orig2.nr}</Link>.</div>}
      <SalgHandlinger id={f.id} type={f.type} status={f.status} rest={rest} idag={dag} kanEndre={kanEndre(s.rolle)} />
      <div className="rutenett delt">
        <FakturaDokument type={f.type} nr={f.nr} dato={f.dato} forfall={f.forfall} levert={f.levert} referanse={f.referanse} kid={f.kid} avsender={av} kunde={f.kunde} linjer={f.linjer} kreditgrunn={f.type === 'kreditnota' ? f.kreditgrunn : null} />
        <div className="stakk ikke-utskrift">
          <section className="kort stakk">
            <h2>Hva har skjedd</h2>
            <ol style={{ margin: 0, paddingLeft: 18 }} className="stakk">{tidslinje.map((t, i) => <li key={i}><span className="mut liten">{nd(t.dato)}</span><div>{t.tekst}</div></li>)}</ol>
            {f.type === 'faktura' && rest > 0 && <p className="mut liten">Når pengene kommer inn, finner bankavstemmingen betalingen på KID-en og markerer fakturaen som betalt.</p>}
          </section>
          <Posteringer d={d} orgId={s.org.id} bilagId={f.bilag_id} />
        </div>
      </div>
    </div>
  );
}
