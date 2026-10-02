import Link from 'next/link';
import Image from 'next/image';
import { kreverSelskap, db } from '@/lib/server';
import { stripePa, fullforBetaling, abonnementDetaljer } from '@/lib/stripe';
import { LAST_OPP, PAKKE_NAVN, belop, datoTekst } from '@/lib/tjenester/abonnement';
import { LastInnPaNytt, ApneAssistent } from './Knapper';

export const metadata = { title: 'Takk' };

/** Etter Stripe: betalingen slås opp på serveren før pakken vises som aktivert. */
export default async function Takk({ searchParams }: { searchParams: Promise<{ session_id?: string; pakke?: string; forsok?: string }> }) {
  const s = await kreverSelskap();
  const sp = await searchParams;
  const d = await db();
  let betalt = !sp.session_id;
  if (sp.session_id && stripePa()) betalt = await d.tx(t => fullforBetaling(t, s.org.id, sp.session_id!)).catch(() => false);
  const o = await d.en<{ pakke: string }>('select pakke from organisasjon where id = $1', [s.org.id]);
  const pakke = o?.pakke === 'start' || o?.pakke === 'selskap' ? o.pakke : null;

  if (!betalt || !pakke) {
    const forsok = Number(sp.forsok ?? 0);
    return (
      <div className="stakk" style={{ gap: 18, maxWidth: 620 }}>
        <h1>Vi fant ikke betalingen ennå</h1>
        <p className="mut" style={{ margin: 0 }}>Stripe har ikke bekreftet betalingen hos oss ennå. Det tar som regel noen sekunder.</p>
        <p className="mut" style={{ margin: 0 }}>Har du fått kvittering på e-post, er betalingen i orden, og pakken slås på av seg selv. Du blir ikke trukket to ganger om du laster inn på nytt.</p>
        <div className="rad" style={{ gap: 12, flexWrap: 'wrap' }}>
          <LastInnPaNytt auto={forsok < 5} forsok={forsok} />
          <Link href="/innstillinger?vis=abonnement" className="lenke">Gå til abonnementet</Link>
        </div>
      </div>
    );
  }

  const detaljer = stripePa() ? await abonnementDetaljer(d, s.org.id).catch(() => null) : null;
  return (
    <div className="stakk" style={{ gap: 22, maxWidth: 760 }}>
      <div className="rad" style={{ gap: 18, alignItems: 'center' }}>
        <Image src="/mascot-hip.png" alt="" width={84} height={84} style={{ height: 'auto' }} />
        <div>
          <h1 style={{ margin: 0 }}>{PAKKE_NAVN[pakke]} er aktivert ✓</h1>
          <p className="mut" style={{ margin: '6px 0 0' }}>Betalingen er mottatt. Dette er klart til bruk nå:</p>
        </div>
      </div>
      <div className="rutenett tre">
        {LAST_OPP[pakke].map(x => (
          <section key={x.t} className="kort stakk" style={{ gap: 8 }}>
            <b>{x.t}</b>
            <p className="mut liten" style={{ margin: 0, flex: 1 }}>{x.d}</p>
            {x.href.includes('assistent') ? <ApneAssistent tekst={x.knapp} /> : <Link href={x.href} className="knapp hvit liten">{x.knapp}</Link>}
          </section>
        ))}
      </div>
      {detaljer && (
        <section className="kort rad" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <span>Neste trekk</span><span><b>{datoTekst(detaljer.periodeSlutt)}</b> · <span className="belop">{belop(detaljer.nesteBelop)}</span></span>
        </section>
      )}
      <p className="mut liten" style={{ margin: 0 }}>Kvitteringen kommer på e-post fra Stripe til {s.bruker.epost}.</p>
      <div className="rad" style={{ gap: 14 }}>
        <Link href="/hjem" className="knapp">Til Hjem</Link>
        <Link href="/innstillinger?vis=abonnement" className="lenke">Se abonnementet</Link>
      </div>
    </div>
  );
}
