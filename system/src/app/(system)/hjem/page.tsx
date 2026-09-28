import Link from 'next/link';
import { kreverSelskap, db, idag } from '@/lib/server';
import { aktuellTermin, mvaStatus } from '@/lib/tjenester/mva';
import { nesteFrister, sistRegistrert } from '@/lib/tjenester/oversikt';
import { Kopier } from '@/components/Kopier';
import { Maskot } from '@/components/Logo';
import { kr, langDato, nd, kortManed } from '@/lib/vis';
import { norskDato } from '@/lib/frister';

export const metadata = { title: 'Hjem' };

export default async function Hjem() {
  const s = await kreverSelskap();
  const d = await db();
  const dag = idag();
  const termin = await aktuellTermin(d, s.org.id, dag);
  const mva = termin ? await mvaStatus(d, s.org.id, termin) : null;
  const frister = await nesteFrister(d, s.org.id, dag, 12);
  const neste = frister[0];
  const sist = await sistRegistrert(d, s.org.id, 6);
  const fornavn = s.bruker.navn.split(' ')[0];
  const bilagEpost = `${s.org.bilagSlug ?? 'firma'}@bilag.rettfort.no`;
  const ubetalt = await d.en<{ n: number }>(`select count(*)::int as n from kjop where organisasjon_id = $1 and status = 'registrert'`, [s.org.id]);

  return (
    <div className="stakk" style={{ gap: 26 }}>
      <div>
        <div className="mut liten">{langDato(dag)}</div>
        <h1 style={{ marginTop: 6 }}>Hei, {fornavn}. Hva har skjedd i dag?</h1>
      </div>

      <div className="rutenett to">
        <Link href="/salg/ny" className="kort mork" style={{ textDecoration: 'none', display: 'block' }}>
          <span className="stikk" style={{ color: 'var(--gul)' }}>Penger inn</span>
          <span style={{ display: 'block', fontSize: 22, fontWeight: 600, margin: '8px 0 6px' }}>Jeg skal sende en faktura</span>
          <span className="mut">Søk opp kunden, skriv hva du har gjort. Du ser fakturaen mens du skriver.</span>
        </Link>
        <Link href="/kjop/ny" className="kort" style={{ textDecoration: 'none', display: 'block' }}>
          <span className="stikk gronn">Penger ut</span>
          <span style={{ display: 'block', fontSize: 22, fontWeight: 600, margin: '8px 0 6px' }}>Jeg har kjøpt noe</span>
          <span className="mut">{ubetalt?.n ? `Last opp kvitteringen. ${ubetalt.n} ${ubetalt.n === 1 ? 'regning venter' : 'regninger venter'} på betaling.` : 'Last opp kvitteringen. Vi leser den og sjekker MVA før noe blir ført.'}</span>
        </Link>
      </div>

      <div className="rutenett to">
        <section className="kort stakk">
          <div className="rad" style={{ justifyContent: 'space-between' }}><h2>Neste frist</h2><Link href="/frister" className="lenke mut">Alle frister</Link></div>
          {mva && !mva.sendt && mva.antallMangler === 0 ? (
            <div className="rad" style={{ flexWrap: 'nowrap' }}>
              <Maskot storrelse={56} />
              <div><b>{mva.termin.tittel}, frist {norskDato(mva.termin.frist, false)}, er klar.</b><div className="mut liten">Ingenting mangler. <Link href="/mva" className="lenke">Se tallene og send</Link>.</div></div>
            </div>
          ) : mva && !mva.sendt ? (
            <div className="rad" style={{ flexWrap: 'nowrap' }}>
              <div style={{ textAlign: 'center', minWidth: 52 }}><div className="stikk mut">{kortManed(mva.termin.frist)}</div><div style={{ fontSize: 26, fontWeight: 700 }}>{Number(mva.termin.frist.slice(8))}</div></div>
              <div className="fyll" style={{ flex: 1 }}><b>{mva.termin.tittel}</b><div className="mut liten">{mva.antallMangler} {mva.antallMangler === 1 ? 'ting mangler' : 'ting mangler'} før du kan sende.</div></div>
              <Link href="/mva" className="knapp liten">Se hva</Link>
            </div>
          ) : neste ? (
            <div className="rad" style={{ flexWrap: 'nowrap' }}>
              <div style={{ textAlign: 'center', minWidth: 52 }}><div className="stikk mut">{kortManed(neste.dato)}</div><div style={{ fontSize: 26, fontWeight: 700 }}>{Number(neste.dato.slice(8))}</div></div>
              <div style={{ flex: 1 }}><b>{neste.tittel}</b><div className="mut liten">{neste.beskrivelse}</div></div>
            </div>
          ) : <p className="mut">Ingen frister de neste tolv månedene.</p>}
        </section>

        <section className="kort stakk">
          <h2>Send kvitteringer på e-post</h2>
          <p className="mut liten">Videresend kvitteringer og fakturaer hit. De havner under Penger ut og blir kontrollert med en gang.</p>
          <div className="rad" style={{ background: 'var(--kort-2)', border: '1px solid var(--linje)', borderRadius: 10, padding: '8px 10px', flexWrap: 'nowrap' }}>
            <span className="mono liten" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{bilagEpost}</span>
            <Kopier tekst={bilagEpost} />
          </div>
          <p className="faint liten">Med i alle pakker, også Gratis. Mottak på e-post slås på når e-posttjenesten er koblet til.</p>
        </section>
      </div>

      <section>
        <div className="rad" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <h2>Sist registrert</h2>
          <div className="rad" style={{ gap: 14 }}><Link href="/kjop" className="lenke">Alle kjøp</Link><Link href="/salg" className="lenke">Alle fakturaer</Link></div>
        </div>
        {sist.length ? (
          <div className="liste">
            {sist.map((r, i) => (
              <Link key={i} href={r.href} className="linje">
                <span className={`merke ${r.belop >= 0 ? 'gronn' : ''}`} style={{ minWidth: 76, justifyContent: 'center' }}>{r.type}</span>
                <span className="fyll tittel">{r.tekst}</span>
                <span className="mut liten">{nd(r.dato)}</span>
                <span className="belop" style={{ minWidth: 110, textAlign: 'right' }}>{r.belop >= 0 ? '' : '−'}{kr(Math.abs(r.belop))}</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="kort tom"><Maskot storrelse={80} /><p className="mut" style={{ marginTop: 10 }}>Ingenting registrert ennå. Start med en faktura eller et kjøp.</p></div>
        )}
      </section>
    </div>
  );
}
