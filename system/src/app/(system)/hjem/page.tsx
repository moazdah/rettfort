import Link from 'next/link';
import { kreverSelskap, db, idag } from '@/lib/server';
import { aktuellTermin, mvaStatus } from '@/lib/tjenester/mva';
import { nesteFrister, sistRegistrert } from '@/lib/tjenester/oversikt';
import { Kopier } from '@/components/Kopier';
import { Maskot } from '@/components/Logo';
import { kr, langDato, nd, kortManed } from '@/lib/vis';
import { norskDato } from '@/lib/frister';
import { cookies } from 'next/headers';
import { PAKKER } from '@/lib/pakker';
import { ventende } from '@/lib/ai/utfor';
import { kanEndre } from '@/lib/auth';
import { VenterPaDeg, type Ventende } from '@/components/VenterPaDeg';

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
  // Valgte pakke på forsiden før registrering: minn om betalingen.
  const valgt = (await cookies()).get('rf_pakke')?.value;
  const valgtPakke = (valgt === 'start' || valgt === 'selskap') && s.org.pakke === 'gratis' && s.rolle === 'eier' ? PAKKER.find(p => p.k === valgt) : null;
  const venter: Ventende[] = (await ventende(d, s.org.id).catch(() => [])).map(v => {
    const x = (typeof v.data === 'string' ? JSON.parse(v.data) : v.data) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (v.art === 'purring') return { id: v.id, art: v.art, tittel: 'Purring', tekst: `Faktura ${x.nr} til ${x.kunde}, ${kr(x.rest)} kr, sendes til ${x.epost}`, knapp: 'Send' };
    if (v.art === 'betaling') return { id: v.id, art: v.art, tittel: 'Betaling', tekst: `Innbetaling på faktura ${x.nr} fra ${x.kunde}, ${kr(x.belop)} kr`, knapp: 'Registrer' };
    if (v.art === 'kreditnota') return { id: v.id, art: v.art, tittel: 'Kreditnota', tekst: `Faktura ${x.nr} til ${x.kunde}, ${kr(x.belop)} kr. ${x.grunn}`, knapp: 'Lag kreditnota' };
    if (v.art === 'skannelenke') return { id: v.id, art: v.art, tittel: 'Lenke', tekst: `Skannelenke til ${x.navn ? `${x.navn}, ` : ''}${x.epost}`, knapp: 'Send' };
    if (v.art === 'invitasjon') return { id: v.id, art: v.art, tittel: 'Invitasjon', tekst: `Inviter ${x.epost}`, knapp: 'Send' };
    if (v.art === 'lonn') return { id: v.id, art: v.art, tittel: 'Lønn', tekst: `Lønn ${x.periode}: ${kr(x.sum?.netto ?? 0)} kr til utbetaling ${String(x.utbetalingsdato ?? '').split('-').reverse().join('.')}`, knapp: 'Kjør lønn' };
    if (v.art === 'lonnslipp') return { id: v.id, art: v.art, tittel: 'Lønnslipp', tekst: `Lønnslipp ${x.periode} til ${x.navn} (${x.epost})`, knapp: 'Send' };
    if (v.art === 'kunde') return { id: v.id, art: v.art, tittel: 'Kunde', tekst: `Ny kunde: ${x.navn}`, knapp: 'Legg til' };
    return { id: v.id, art: v.art, tittel: 'MVA', tekst: `${x.termin?.tittel ?? 'MVA-melding'}: ${x.aBetale >= 0 ? 'betal' : 'til gode'} ${kr(Math.abs(x.aBetale))} kr`, knapp: 'Merk som sendt', sperret: mva && mva.antallMangler > 0 && x.termin?.tittel === mva.termin.tittel ? 'Noe mangler bilag. Se MVA-siden.' : undefined };
  });
  const ubetalt = await d.en<{ n: number }>(`select count(*)::int as n from kjop where organisasjon_id = $1 and status = 'registrert'`, [s.org.id]);

  return (
    <div className="stakk" style={{ gap: 26 }}>
      <div>
        <div className="mut liten">{langDato(dag)}</div>
        <h1 style={{ marginTop: 6 }}>Hei, {fornavn}. Hva har skjedd i dag?</h1>
      </div>

      {valgtPakke && (
        <div className="varsel gul"><div className="fyll">Du valgte <b>{valgtPakke.n}</b>. Fullfør betalingen, så får du alt som er med i pakken.</div><a href={`/pakke/${valgtPakke.k}`} className="knapp liten">Gå til betaling</a></div>
      )}

      {venter.length > 0 && kanEndre(s.rolle) && <VenterPaDeg rader={venter} />}

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
            <span className="mono liten" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{bilagEpost}</span>
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
                <span className={`merke ${r.belop >= 0 ? 'gronn' : ''}`} style={{ minWidth: 60, justifyContent: 'center' }}>{r.type}</span>
                <span className="fyll tittel">{r.tekst}</span>
                <span className="mut liten skjul-mobil">{nd(r.dato)}</span>
                <span className="belop" style={{ textAlign: 'right' }}>{r.belop >= 0 ? '' : '−'}{kr(Math.abs(r.belop))}</span>
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
