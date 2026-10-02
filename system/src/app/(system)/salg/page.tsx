import Link from 'next/link';
import { kreverSelskap, db, idag } from '@/lib/server';
import { kr, nd, SALG_STATUS, SALG_TYPE } from '@/lib/vis';
import { lagGjentakendeUtkast } from '@/lib/tjenester/faktura';
import { Handling } from '@/components/Handling';
import { slettUtkast } from '@/app/handlinger';
import { Maskot } from '@/components/Logo';

export const metadata = { title: 'Alle fakturaer' };

const FILTRE = [['alle', 'Alle'], ['ubetalt', 'Ikke betalt'], ['forfalt', 'Forfalt'], ['tilbud', 'Tilbud']] as const;

export default async function AlleFakturaer({ searchParams }: { searchParams: Promise<{ vis?: string; q?: string }> }) {
  const s = await kreverSelskap();
  const d = await db();
  const dag = idag();
  const nye = s.rolle && !['les', 'regnskapsforer_les'].includes(s.rolle) ? await d.tx(t => lagGjentakendeUtkast(t, s.org.id, dag)) : 0;
  const sp = await searchParams;
  const vis = FILTRE.some(f => f[0] === sp.vis) ? sp.vis! : 'alle';
  const q = (sp.q ?? '').trim();
  const utkast = await d.q<{ id: string; type: string; kunde: string | null; total: number; opprettet: string; gjentakelse: string | null }>(`select f.id, f.type, c.navn as kunde, f.total, f.opprettet::text as opprettet, f.gjentakelse from faktura f left join kontakt c on c.id = f.kontakt_id where f.organisasjon_id = $1 and f.status = 'utkast' and f.type <> 'kreditnota' order by f.opprettet desc`, [s.org.id]);
  const hvor = vis === 'ubetalt' ? `and f.type = 'faktura' and f.status in ('sendt','delvis_betalt')` : vis === 'forfalt' ? `and f.type = 'faktura' and f.status in ('sendt','delvis_betalt') and f.forfall < '${dag}'` : vis === 'tilbud' ? `and f.type = 'tilbud'` : `and f.type <> 'tilbud'`;
  const rader = await d.q<{ id: string; type: string; nr: number; kunde: string; dato: string; forfall: string | null; total: number; betalt: number; status: string }>(
    `select f.id, f.type, f.nr, coalesce(c.navn,'') as kunde, f.dato::text as dato, f.forfall::text as forfall, f.total, f.betalt, f.status from faktura f left join kontakt c on c.id = f.kontakt_id
     where f.organisasjon_id = $1 and f.status <> 'utkast' ${hvor} ${q ? `and (c.navn ilike $2 or f.nr::text = $3)` : ''} order by f.dato desc, f.nr desc limit 300`, q ? [s.org.id, `%${q}%`, q] : [s.org.id]);
  const ute = await d.en<{ n: number; sum: number; forfalt: number }>(`select count(*)::int as n, coalesce(sum(total - betalt - coalesce((select sum(k.total) from faktura k where k.krediterer_id = faktura.id and k.status <> 'utkast'),0)),0)::bigint as sum, count(*) filter (where forfall < $2)::int as forfalt from faktura where organisasjon_id = $1 and type = 'faktura' and status in ('sendt','delvis_betalt')`, [s.org.id, dag]);
  return (
    <div className="stakk" style={{ gap: 20 }}>
      <div className="hode">
        <div><div className="stikk" style={{ color: 'var(--gul-tekst)' }}>Penger inn</div><h1 style={{ marginTop: 4 }}>Alle fakturaer</h1>{ute?.n ? <p className="mut">{kr(ute.sum)} kr er utestående på {ute.n} {ute.n === 1 ? 'faktura' : 'fakturaer'}{ute.forfalt ? `, ${ute.forfalt} forfalt` : ''}.</p> : null}</div>
        <Link href="/salg/ny" className="knapp">Ny faktura</Link>
      </div>
      {nye > 0 && <div className="varsel info">{nye === 1 ? 'Et nytt utkast er laget fra en fast faktura.' : `${nye} nye utkast er laget fra faste fakturaer.`} Se over og send.</div>}
      {utkast.map(u => (
        <div key={u.id} className="kort rad" style={{ padding: '12px 16px' }}>
          <span className="merke">{u.gjentakelse?.startsWith('fra:') ? 'Fast faktura' : 'Utkast'}</span>
          <div style={{ flex: 1 }}><b style={{ fontWeight: 500 }}>{SALG_TYPE[u.type]} {u.kunde ? `til ${u.kunde}` : ''}</b><div className="mut liten">{u.total ? `${kr(u.total)} kr · ` : ''}lagret {nd(u.opprettet)}</div></div>
          <Link href={`/salg/ny?utkast=${u.id}`} className="knapp liten">Fortsett</Link>
          <Handling handling={slettUtkast.bind(null, 'salg', u.id)} tekst="Slett" klasse="knapp hvit liten" bekreft="Slette utkastet?" />
        </div>
      ))}
      <div className="rad" style={{ justifyContent: 'space-between' }}>
        <nav className="faner">{FILTRE.map(([k, t]) => <Link key={k} href={`/salg?vis=${k}`} className={vis === k ? 'aktiv' : ''}>{t}</Link>)}</nav>
        <form className="rad"><input type="hidden" name="vis" value={vis} /><input className="inndata" name="q" defaultValue={q} placeholder="Søk kunde eller nummer" style={{ width: 240 }} /></form>
      </div>
      {rader.length ? (
        <div className="liste">
          {rader.map(r => {
            const forfalt = r.type === 'faktura' && ['sendt', 'delvis_betalt'].includes(r.status) && r.forfall && r.forfall < dag;
            const [st, farge] = SALG_STATUS[r.status] ?? [r.status, ''];
            return (
              <Link key={r.id} href={`/salg/${r.id}`} className="linje">
                <div className="fyll"><div className="tittel">{r.kunde || 'Uten kunde'}</div><div className="mut liten">{SALG_TYPE[r.type]} {r.nr} · {nd(r.dato)}{r.type === 'faktura' && r.forfall ? ` · forfall ${nd(r.forfall)}` : ''}</div></div>
                <span className={`merke ${forfalt ? 'rod' : farge}`}>{forfalt ? 'Forfalt' : r.type === 'kreditnota' ? 'Kreditnota' : st}</span>
                <span className="belop" style={{ minWidth: 100, textAlign: 'right' }}>{r.type === 'kreditnota' ? '−' : ''}{kr(r.total)}</span>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="kort tom"><Maskot storrelse={72} /><p className="mut" style={{ marginTop: 10 }}>{q ? `Ingenting passer med «${q}».` : vis === 'forfalt' ? 'Ingen forfalte fakturaer.' : vis === 'ubetalt' ? 'Alle fakturaer er betalt.' : vis === 'tilbud' ? 'Ingen tilbud ennå.' : 'Ingen fakturaer ennå.'}</p></div>
      )}
    </div>
  );
}
