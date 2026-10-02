import Link from 'next/link';
import { kreverSelskap, db, idag } from '@/lib/server';
import { kr, nd, KJOP_STATUS } from '@/lib/vis';
import { Handling } from '@/components/Handling';
import { slettUtkast, betalKjopHandling } from '@/app/handlinger';
import { Maskot } from '@/components/Logo';

export const metadata = { title: 'Alle kjøp' };

const FANER = [['alle', 'Alle'], ['ubetalt', 'Ikke betalt'], ['utenkv', 'Uten kvittering']] as const;

export default async function AlleKjop({ searchParams }: { searchParams: Promise<{ vis?: string; q?: string }> }) {
  const s = await kreverSelskap();
  const d = await db();
  const sp = await searchParams;
  const vis = FANER.some(f => f[0] === sp.vis) ? sp.vis! : 'alle';
  const q = (sp.q ?? '').trim();
  const utkast = await d.q<{ id: string; navn: string | null; total: number; opprettet: string }>(`select id, leverandor_navn as navn, total, opprettet::text as opprettet from kjop where organisasjon_id = $1 and status = 'utkast' order by opprettet desc`, [s.org.id]);
  const hvor = vis === 'ubetalt' ? `and k.status = 'registrert'` : vis === 'utenkv' ? `and k.vedlegg_id is null` : '';
  const rader = await d.q<{ id: string; navn: string; dato: string; forfall: string | null; total: number; status: string; konto: number; vedlegg_id: string | null; nr: number | null }>(
    `select k.id, k.leverandor_navn as navn, k.dato::text as dato, k.forfall::text as forfall, k.total, k.status, k.konto, k.vedlegg_id, b.nr from kjop k left join bilag b on b.id = k.bilag_id
     where k.organisasjon_id = $1 and k.status <> 'utkast' ${hvor} ${q ? 'and (k.leverandor_navn ilike $2 or k.tekst ilike $2)' : ''} order by k.dato desc, k.opprettet desc limit 300`, q ? [s.org.id, `%${q}%`] : [s.org.id]);
  const antUbetalt = await d.en<{ n: number; sum: number }>(`select count(*)::int as n, coalesce(sum(total),0)::bigint as sum from kjop where organisasjon_id = $1 and status = 'registrert'`, [s.org.id]);
  const dag = idag();
  return (
    <div className="stakk" style={{ gap: 20 }}>
      <div className="hode">
        <div><div className="stikk gronn">Penger ut</div><h1 style={{ marginTop: 4 }}>Alle kjøp</h1>{antUbetalt?.n ? <p className="mut">{antUbetalt.n} {antUbetalt.n === 1 ? 'regning' : 'regninger'} er ikke betalt, til sammen {kr(antUbetalt.sum)} kr.</p> : null}</div>
        <Link href="/kjop/ny" className="knapp">Nytt kjøp</Link>
      </div>
      {utkast.map(u => (
        <div key={u.id} className="kort rad" style={{ padding: '12px 16px' }}>
          <span className="merke">Utkast</span>
          <div style={{ flex: 1 }}><b style={{ fontWeight: 500 }}>{u.navn || 'Uten navn'}</b><div className="mut liten">{u.total ? `${kr(u.total)} kr · ` : ''}lagret {nd(u.opprettet)}</div></div>
          <Link href={`/kjop/ny?utkast=${u.id}`} className="knapp liten">Fortsett</Link>
          <Handling handling={slettUtkast.bind(null, 'kjop', u.id)} tekst="Slett" klasse="knapp hvit liten" bekreft="Slette utkastet?" />
        </div>
      ))}
      <div className="rad" style={{ justifyContent: 'space-between' }}>
        <nav className="faner">{FANER.map(([k, t]) => <Link key={k} href={`/kjop?vis=${k}`} className={vis === k ? 'aktiv' : ''}>{t}{k === 'ubetalt' && antUbetalt?.n ? ` (${antUbetalt.n})` : ''}</Link>)}</nav>
        <form className="rad"><input type="hidden" name="vis" value={vis} /><input className="inndata" name="q" defaultValue={q} placeholder="Søk leverandør eller tekst" style={{ width: 240 }} /></form>
      </div>
      {rader.length ? (
        <div className="liste">
          {rader.map(r => {
            const [st, farge] = KJOP_STATUS[r.status] ?? [r.status, ''];
            const forfalt = r.status === 'registrert' && r.forfall && r.forfall < dag;
            return (
              <div key={r.id} className="linje">
                <Link href={`/kjop/${r.id}`} className="fyll" style={{ textDecoration: 'none' }}>
                  <div className="tittel">{r.navn}</div>
                  <div className="mut liten">{nd(r.dato)}{r.nr ? ` · bilag ${r.nr}` : ''}{!r.vedlegg_id ? ' · uten kvittering' : ''}</div>
                </Link>
                <span className={`merke ${forfalt ? 'rod' : farge}`}>{forfalt ? `Forfalt ${nd(r.forfall)}` : st}</span>
                {r.status === 'registrert' && <Handling handling={betalKjopHandling.bind(null, r.id, dag)} tekst="Betalt i dag" klasse="knapp hvit liten" />}
                <span className="belop" style={{ minWidth: 100, textAlign: 'right' }}>{kr(r.total)}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="kort tom"><Maskot storrelse={72} /><p className="mut" style={{ marginTop: 10 }}>{q ? `Ingen kjøp passer med «${q}».` : vis === 'ubetalt' ? 'Ingen ubetalte regninger.' : vis === 'utenkv' ? 'Alle kjøp har kvittering.' : 'Ingen kjøp ennå. Kvitteringer du sender på e-post havner her.'}</p></div>
      )}
    </div>
  );
}
