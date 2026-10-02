import Link from 'next/link';
import { db, sesjon } from '@/lib/server';
import { Logo } from '@/components/Logo';
import { GodtaKnapp } from './Godta';

export const metadata = { title: 'Invitasjon' };

export default async function Invitasjon({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const d = await db();
  const inv = await d.en<{ epost: string; rolle: string; status: string; navn: string }>('select i.epost, i.rolle, i.status, o.navn from invitasjon i join organisasjon o on o.id = i.organisasjon_id where i.token = $1', [token]);
  const s = await sesjon();
  const neste = encodeURIComponent(`/invitasjon/${token}`);
  return (
    <main className="midt">
      <div className="boks stakk">
        <Logo bredde={110} />
        {!inv || inv.status !== 'venter' ? (
          <><h1>Invitasjonen er ikke gyldig</h1><p className="mut">Den kan være brukt eller trukket tilbake. Be om en ny.</p></>
        ) : (
          <>
            <h1>Du er invitert til {inv.navn}</h1>
            <p className="mut">{inv.rolle.startsWith('regnskapsforer') ? `Som regnskapsfører. ${inv.navn} havner i arbeidslisten din.` : inv.rolle === 'les' ? 'Du kan se regnskapet.' : inv.rolle === 'kvittering' ? 'Du kan laste opp kvitteringer.' : 'Du får full tilgang til regnskapet.'}</p>
            {s ? (
              <><p className="liten">Logget inn som <b>{s.bruker.epost}</b>.</p><GodtaKnapp token={token} /></>
            ) : (
              <div className="rad"><Link className="knapp" href={`/registrer?neste=${neste}&epost=${encodeURIComponent(inv.epost)}${inv.rolle.startsWith('regnskapsforer') ? '&rolle=regnskapsforer' : ''}`}>Lag bruker</Link><Link className="knapp hvit" href={`/logg-inn?neste=${neste}`}>Logg inn</Link></div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
