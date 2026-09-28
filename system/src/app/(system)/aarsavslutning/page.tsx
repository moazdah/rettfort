import Link from 'next/link';
import { kreverSelskap, db, idag } from '@/lib/server';
import { kontrollFunn } from '@/lib/tjenester/kontroll';
import { MANEDER } from '@/lib/vis';

export const metadata = { title: 'Årsavslutning' };

export default async function Aarsavslutning() {
  const s = await kreverSelskap();
  const d = await db();
  const dag = idag();
  const ar = Number(dag.slice(0, 4));
  const o = await d.en<{ orgform: string }>('select orgform from organisasjon where id = $1', [s.org.id]);
  const bank = new Map((await d.q<{ maned: string; status: string }>(`select maned, status from kontoutskrift where organisasjon_id = $1 and maned like $2`, [s.org.id, `${ar}-%`])).map(x => [x.maned, x.status]));
  const funn = await kontrollFunn(d, s.org.id, `${ar}-01-01`, `${ar}-12-31`, dag);
  const iMnd = (m: string) => funn.filter(f => f.dato?.startsWith(m) && f.alvor !== 'info').length;
  const mnd = MANEDER.map((n, i) => {
    const m = `${ar}-${String(i + 1).padStart(2, '0')}`;
    const over = m < dag.slice(0, 7);
    const status = !over ? 'fremtid' : bank.get(m) === 'ferdig' && !iMnd(m) ? 'ok' : 'apen';
    return { n, m, status, funn: iMnd(m) };
  });
  const ferdige = mnd.filter(x => x.status === 'ok').length, passert = mnd.filter(x => x.status !== 'fremtid').length;
  const as = o?.orgform === 'AS' || o?.orgform === 'ASA';
  const steg = [
    { t: 'Løpende kontroll', pill: 'Pågår hele året', d: `${ferdige} av ${passert} måneder er avstemt i banken uten åpne funn. Det du retter nå, slipper du i januar.`, aktiv: true },
    { t: 'Se over og avslutt regnskapet', pill: 'Åpner i januar', d: 'Bank avstemt for alle måneder og avskrivninger sjekket. Du bekrefter varelager og eventuelle periodiseringer. Regnskapsføreren kan gjøre dette for deg.' },
    { t: 'Send inn skattemeldingen', pill: `Frist 31. mai ${ar + 1}`, d: as ? 'Skattemeldingen for selskapet fylles ut fra regnskapet. Du ser over og sender i Altinn.' : 'Næringsspesifikasjonen fylles ut fra regnskapet. Du ser over og sender i Altinn.' },
    ...(as ? [{ t: 'Send inn årsregnskapet', pill: `Frist 31. juli ${ar + 1}`, d: 'Sendes til Regnskapsregisteret i Brønnøysund. Styret signerer digitalt.' }] : []),
  ];
  return (
    <div className="stakk" style={{ gap: 16, maxWidth: 860 }}>
      <div><h1>Årsavslutning {ar}</h1><p className="mut" style={{ marginTop: 6 }}>Vi kontrollerer regnskapet hele året, så det er lite igjen å rydde når året er over.</p></div>
      {steg.map((x, i) => (
        <section key={x.t} className={`steg ${x.aktiv ? 'aktivt' : ''}`}>
          <span className="nr">{i}</span>
          <div className="stakk" style={{ flex: 1, gap: 8 }}>
            <div className="rad" style={{ justifyContent: 'space-between' }}><b style={{ fontWeight: 600, fontSize: 17 }}>{x.t}</b><span className={`merke ${x.aktiv ? 'gronn' : ''}`}>{x.pill}</span></div>
            <p className="mut liten">{x.d}</p>
            {x.aktiv && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gap: 4 }}>
                {mnd.map(m => (
                  <Link key={m.m} href={`/bank?maned=${m.m}`} title={`${m.n}: ${m.status === 'ok' ? 'avstemt' : m.status === 'apen' ? `ikke ferdig${m.funn ? `, ${m.funn} funn` : ''}` : 'ikke kommet ennå'}`} style={{ textDecoration: 'none', textAlign: 'center' }}>
                    <div style={{ height: 22, borderRadius: 5, background: m.status === 'ok' ? 'var(--gronn-lys)' : m.status === 'apen' ? 'var(--gul)' : 'var(--noyt-bg)' }} />
                    <div className="faint" style={{ fontSize: 11, marginTop: 3 }}>{m.n[0].toUpperCase()}</div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
