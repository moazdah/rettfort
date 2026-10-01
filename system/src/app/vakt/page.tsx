import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { sesjon, db, idag } from '@/lib/server';
import { ansattForBruker, vakterMellom, tilgjengelighet, vaktAnsatte } from '@/lib/tjenester/vaktplan';
import { analyserUke, isoUke, ukeDager, plussDager, avtaltMin } from '@/lib/vaktplan';
import { loggUt } from '@/app/handlinger';
import { VaktAnsattFlate } from './flate';

export const metadata = { title: 'Vaktplan' };

/** Den ansattes egen, enkle flate. Ser bare egne vakter, ledige vakter og når hen kan jobbe. */
export default async function Vakt({ searchParams }: { searchParams: Promise<{ ugyldig?: string }> }) {
  const s = await sesjon({ ansatt: true });
  const sp = await searchParams;
  if (s && s.rolle !== 'ansatt') redirect('/vaktplan');
  if (!s?.org) {
    return (
      <main className="midt">
        <div className="boks stakk">
          <Logo bredde={120} />
          <h1>Vaktplan</h1>
          <p className="mut">{sp.ugyldig ? 'Lenken virker ikke lenger. Be lederen sende en ny under Vaktplan → Ansatte.' : 'Åpne lenken du fikk på SMS eller e-post, så kommer du rett inn.'}</p>
        </div>
      </main>
    );
  }
  const d = await db();
  const a = await ansattForBruker(d, s.org.id, s.bruker.id);
  if (!a) {
    return <main className="midt"><div className="boks stakk"><Logo bredde={120} /><h1>Vaktplan</h1><p className="mut">Du er ikke lenger registrert som ansatt i {s.org.navn}.</p><form action={loggUt}><button className="knapp hvit">Logg ut</button></form></div></main>;
  }
  const dag = idag();
  const u = isoUke(dag);
  const uka = ukeDager(u.aar, u.uke);
  const til = plussDager(dag, 41);
  const [rae, tilgj, ansatte] = await Promise.all([vakterMellom(d, s.org.id, uka[0], til), tilgjengelighet(d, s.org.id, dag, til), vaktAnsatte(d, s.org.id)]);
  // Den ansatte ser bare uker lederen har publisert. Utkast er lederens arbeidsflate.
  const publiserte = new Set((await d.q<{ aar: number; uke: number }>(`select aar, uke from vaktuke where organisasjon_id = $1 and status <> 'utkast'`, [s.org.id])).map(x => `${x.aar}-${x.uke}`));
  const alle = rae.filter(v => { const w = isoUke(v.dato); return publiserte.has(`${w.aar}-${w.uke}`); });
  const meg = ansatte.find(x => x.id === a.id)!;
  const ukeAnalyse = analyserUke(alle.filter(v => v.dato <= uka[6]), [meg]).perAnsatt.get(a.id)!;
  // Ledige: ingen på vakten, eller en kollega vil bytte den bort. Med beskjed om den gir overtid eller er mer enn stillingen.
  const ledige = alle.filter(v => v.dato >= dag && (!v.ansattId || (v.utlagt && v.ansattId !== a.id))).map(v => {
    const w = ukeDager(isoUke(v.dato).aar, isoUke(v.dato).uke);
    const mine = alle.filter(x => x.ansattId === a.id && x.dato >= w[0] && x.dato <= w[6]);
    const for_ = analyserUke(mine, [meg]).perAnsatt.get(a.id)!;
    const etter = analyserUke([...mine, { ...v, ansattId: a.id }], [meg]).perAnsatt.get(a.id)!;
    return { ...v, interessert: v.interesse.includes(a.id), overtid: etter.overtid > for_.overtid, merarbeid: etter.merarbeid > for_.merarbeid };
  });
  const fri = await d.q<{ dato: string; status: string }>(`select dato::text as dato, status from fri_foresporsel where ansatt_id = $1 and dato >= $2 order by opprettet desc`, [a.id, dag]);
  return (
    <div className="vakt-flate">
      <header className="vakt-topp">
        <Logo bredde={92} />
        <div className="fyll"><b>Vaktplan</b><small>{s.org.navn}</small></div>
        <form action={loggUt}><button className="vakt-avatar" title="Logg ut" aria-label={`${a.navn}, logg ut`}>{a.navn.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase()}</button></form>
      </header>
      <VaktAnsattFlate navn={a.navn} idag={dag} mine={alle.filter(v => v.ansattId === a.id && v.dato >= dag)} ledige={ledige}
        tilgj={tilgj.filter(x => x.ansattId === a.id)} fri={fri} ukeArbeid={ukeAnalyse.arbeid} avtalt={avtaltMin(meg)} />
    </div>
  );
}
