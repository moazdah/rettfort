import Link from 'next/link';
import { kreverSelskap, db, idag } from '@/lib/server';
import { nesteFrister } from '@/lib/tjenester/oversikt';
import { aktuellTermin, mvaStatus } from '@/lib/tjenester/mva';
import { trekkOgAga } from '@/lib/tjenester/lonn';
import { dagerTil } from '@/lib/frister';
import { kr, kortManed, nd } from '@/lib/vis';
import { Kalender } from './Kalender';

export const metadata = { title: 'Frister' };

export default async function Frister() {
  const s = await kreverSelskap();
  const d = await db();
  const dag = idag();
  const frister = await nesteFrister(d, s.org.id, dag, 12);
  const termin = await aktuellTermin(d, s.org.id, dag);
  const mva = termin ? await mvaStatus(d, s.org.id, termin) : null;
  const sendte = new Set((await d.q<{ fra: string }>('select fra::text as fra from mva_melding where organisasjon_id = $1', [s.org.id])).map(x => x.fra));
  const trekk = frister.find(f => f.type === 'skattetrekk');
  const tAga = trekk?.periodeFra ? await trekkOgAga(d, s.org.id, trekk.periodeFra, trekk.periodeTil!) : null;
  const epost = await d.en<{ epost: string | null }>('select epost from organisasjon where id = $1', [s.org.id]);

  const status = (f: (typeof frister)[number]): [string, string] => {
    if (f.type === 'mva' && f.periodeFra) {
      if (sendte.has(f.periodeFra)) return ['Sendt', 'gronn'];
      if (f.periodeTil! >= dag) return [`Åpner ${nd(new Date(Date.parse(f.periodeTil!) + 86400000).toISOString().slice(0, 10)).slice(0, 5)}`, ''];
      if (mva && mva.termin.fra === f.periodeFra) return mva.antallMangler ? [`${mva.antallMangler} ting mangler`, 'gul'] : ['Klar', 'gronn'];
      return ['Ikke sendt', 'gul'];
    }
    const dg = dagerTil(dag, f.dato);
    return dg <= 14 ? [`Om ${dg} ${dg === 1 ? 'dag' : 'dager'}`, 'gul'] : ['', ''];
  };
  const lenke = (f: (typeof frister)[number]) => f.type === 'mva' ? `/mva?fra=${f.periodeFra}` : f.type === 'skattetrekk' || f.type === 'amelding' ? '/lonn' : f.type === 'arsregnskap' || f.type === 'skattemelding' ? '/aarsavslutning' : null;

  return (
    <div className="stakk" style={{ gap: 20, maxWidth: 860 }}>
      <div><h1>Frister</h1><p className="mut" style={{ marginTop: 6 }}>Ut fra organisasjonsform, MVA-termin og om dere har ansatte. Frister som faller på helg eller helligdag er flyttet til neste virkedag.</p></div>
      {trekk && tAga && tAga.skatt + tAga.aga > 0 && (
        <section className="kort mork stakk">
          <span className="stikk" style={{ color: 'var(--gul)' }}>Skattetrekk og arbeidsgiveravgift</span>
          <h2>Du skal betale {kr(tAga.skatt + tAga.aga)} kr innen {nd(trekk.dato)}.</h2>
          <p className="mut">Skattetrekk {kr(tAga.skatt)} kr og arbeidsgiveravgift {kr(tAga.aga)} kr {trekk.beskrivelse.toLowerCase()}. Regnet ut fra lønnen, og oppdateres hvis du endrer den.</p>
          <div><Link href="/lonn" className="knapp gul liten">Se lønnen</Link></div>
        </section>
      )}
      <div className="liste">
        {frister.map(f => {
          const [t, farge] = status(f);
          const l = lenke(f);
          const innhold = (
            <>
              <div style={{ textAlign: 'center', minWidth: 46 }}><div className="stikk mut" style={{ fontSize: 11 }}>{kortManed(f.dato)}</div><div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1 }}>{Number(f.dato.slice(8))}</div></div>
              <div className="fyll"><div className="tittel">{f.tittel}</div><div className="mut liten">{f.beskrivelse}{f.dato !== f.opprinnelig ? ` · flyttet fra ${nd(f.opprinnelig).slice(0, 5)}` : ''}</div></div>
              {t && <span className={`merke ${farge}`}>{t}</span>}
            </>
          );
          return l ? <Link key={f.id} href={l} className="linje">{innhold}</Link> : <div key={f.id} className="linje">{innhold}</div>;
        })}
      </div>
      <div className="rutenett to">
        <section className="kort stakk">
          <h2>Påminnelser</h2>
          <p className="mut liten">Vi sender e-post en uke før og dagen før hver frist{epost?.epost ? ` til ${epost.epost}` : ''}. Påminnelser på e-post slås på når e-posttjenesten er koblet til.</p>
        </section>
        <section className="kort stakk">
          <h2>Legg fristene i kalenderen din</h2>
          <p className="mut liten">Fristene oppdateres av seg selv når noe endres.</p>
          <Kalender />
          <p className="faint liten">Påminnelser og kalender er med i alle pakker, også Gratis.</p>
        </section>
      </div>
    </div>
  );
}
