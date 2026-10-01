import Link from 'next/link';
import { kreverSelskap, db, idag } from '@/lib/server';
import { kanEndre } from '@/lib/auth';
import { harVaktplan, harAssistent } from '@/lib/pakker';
import { hentUke, trengerSvar, vaktAnsatte } from '@/lib/tjenester/vaktplan';
import { isoUke, flyttUke } from '@/lib/vaktplan';
import { VaktUke } from './Uke';
import { VaktAnsatte } from './Ansatte';

export const metadata = { title: 'Vaktplan' };

export default async function Vaktplan({ searchParams }: { searchParams: Promise<{ uke?: string; vis?: string }> }) {
  const s = await kreverSelskap();
  const sp = await searchParams;
  if (!harVaktplan(s.org.pakke)) {
    return (
      <div className="stakk" style={{ gap: 20, maxWidth: 720 }}>
        <div><div className="mut liten">Ansatte</div><h1 style={{ marginTop: 4 }}>Vaktplan</h1></div>
        <section className="kort stakk">
          <h2>Vaktplan er med i Start og Selskap</h2>
          <p className="mut">Lag ukeplanen på et par minutter, la de ansatte ta ledige vakter og be om fri fra mobilen, og send timene rett til lønn. Overtid og merarbeid regnes ut for deg.</p>
          <ul className="mut liten" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
            <li>Publiser uka, og alle får vaktene sine på e-post</li>
            <li>Ansatte ser bare sine egne vakter, aldri regnskapet</li>
            <li>Advarsel før noen får overtid</li>
          </ul>
          <div><Link href="/innstillinger?vis=abonnement" className="knapp">Se pakkene</Link></div>
        </section>
      </div>
    );
  }
  const d = await db();
  const dag = idag();
  const naa = isoUke(dag);
  const m = sp.uke?.match(/^(\d{4})-(\d{1,2})$/);
  const valgt = m && Number(m[2]) >= 1 && Number(m[2]) <= 53 ? { aar: Number(m[1]), uke: Number(m[2]) } : naa;
  const vis = sp.vis === 'ansatte' ? 'ansatte' : 'uke';
  const endre = kanEndre(s.rolle);

  return (
    <div className="stakk" style={{ gap: 20 }}>
      <div className="rad" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div><div className="mut liten">Ansatte</div><h1 style={{ marginTop: 4 }}>Vaktplan</h1></div>
        <nav className="faner">
          <Link href={`/vaktplan?uke=${valgt.aar}-${valgt.uke}`} className={vis === 'uke' ? 'aktiv' : ''}>Uke</Link>
          <Link href="/vaktplan?vis=ansatte" className={vis === 'ansatte' ? 'aktiv' : ''}>Ansatte</Link>
        </nav>
      </div>
      {!endre && <div className="varsel info liten">Du har lesetilgang. Bare eier og brukere med full tilgang kan endre vaktplanen.</div>}
      {vis === 'uke'
        ? <VaktUke data={await hentUke(d, s.org.id, valgt.aar, valgt.uke)} trenger={await trengerSvar(d, s.org.id, dag)} idag={dag}
            forrige={flyttUke(valgt.aar, valgt.uke, -1)} neste={flyttUke(valgt.aar, valgt.uke, 1)} assistent={harAssistent(s.org.pakke)} endre={endre} />
        : <VaktAnsatte ansatte={await vaktAnsatte(d, s.org.id)} maler={(await hentUke(d, s.org.id, naa.aar, naa.uke)).maler} endre={endre} />}
    </div>
  );
}
