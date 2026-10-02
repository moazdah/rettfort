import Link from 'next/link';
import { Kreditter } from '@/components/Kreditter';
import { gratisBruk } from '@/lib/tjenester/bruk';
import { kreverSelskap, db, idag } from '@/lib/server';
import { aktuellTermin, mvaStatus } from '@/lib/tjenester/mva';
import { nesteFrister, sistRegistrert } from '@/lib/tjenester/oversikt';
import { Kopier } from '@/components/Kopier';
import { Maskot } from '@/components/Logo';
import { kr, langDato, nd, kortManed } from '@/lib/vis';
import { norskDato } from '@/lib/frister';
import { cookies } from 'next/headers';
import { PAKKER, harVaktplan, harFulltRegnskap } from '@/lib/pakker';
import { ventende } from '@/lib/ai/utfor';
import { kanEndre } from '@/lib/auth';
import { VenterPaDeg, type Ventende } from '@/components/VenterPaDeg';
import { trengerSvar, vakterMellom, vaktAnsatte } from '@/lib/tjenester/vaktplan';
import { kortTid, plussDager } from '@/lib/vaktplan';

export const metadata = { title: 'Hjem' };

const DAG = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const dm = (d: string) => d.split('-').reverse().slice(0, 2).map(Number).join('.') + '.';

const TITTEL: Record<string, string> = { purring: 'Purring', betaling: 'Betaling', kreditnota: 'Kreditnota', skannelenke: 'Lenke', invitasjon: 'Invitasjon', lonn: 'Lønn', lonnslipp: 'Lønnslipp', vaktplan: 'Vaktplan', tildel_vakt: 'Vakt', publiser_uke: 'Vaktplan', kunde: 'Kunde', mva: 'MVA' };

export default async function Hjem() {
  const s = await kreverSelskap();
  const d = await db();
  const bruk = harFulltRegnskap(s.org.pakke) ? null : await gratisBruk(d, s.org.id, idag());
  const dag = idag();
  const termin = await aktuellTermin(d, s.org.id, dag);
  const mva = termin ? await mvaStatus(d, s.org.id, termin) : null;
  const frister = await nesteFrister(d, s.org.id, dag, 12);
  const neste = frister[0];
  const sist = await sistRegistrert(d, s.org.id, 6);
  const fornavn = s.bruker.navn.split(' ')[0];
  const bilagEpost = `${s.org.bilagSlug ?? 'firma'}@bilag.rettfort.no`;
  const vakt = harVaktplan(s.org.pakke);
  const endre = kanEndre(s.rolle);
  // Valgte pakke på forsiden før registrering: minn om betalingen.
  const valgt = (await cookies()).get('rf_pakke')?.value;
  const valgtPakke = (valgt === 'start' || valgt === 'selskap') && s.org.pakke === 'gratis' && s.rolle === 'eier' ? PAKKER.find(p => p.k === valgt) : null;

  // ---------- Venter på deg: én samlet liste ----------
  const rader: Ventende[] = [];
  if (vakt) {
    const t = await trengerSvar(d, s.org.id, dag).catch(() => null);
    for (const f of t?.fri ?? []) rader.push({ id: `fri-${f.id}`, merke: 'Fri', farge: 'gul', tekst: `${f.navn} ber om fri ${DAG[new Date(`${f.dato}T12:00:00Z`).getUTCDay()]} ${dm(f.dato)}${f.grunn ? `: ${f.grunn}` : ''}`, under: f.harVakt ? 'Vakten blir ledig hvis du godkjenner.' : undefined, knapp: 'Godkjenn', fjern: 'Avslå', handling: { type: 'fri', id: f.id } });
    for (const v of t?.bytte ?? []) rader.push({ id: `bytte-${v.id}`, merke: 'Bytte', tekst: `${v.navn} vil bytte bort ${dm(v.dato)} ${kortTid(v.start, v.slutt)}`, knapp: 'Gjør ledig', handling: { type: 'bytte', id: v.id } });
    for (const v of t?.ledigeMedInteresse ?? []) {
      const i = v.interessenter[0];
      rader.push({ id: `ledig-${v.id}`, merke: 'Ledig vakt', farge: 'gronn', tekst: `${i.navn} vil ta ${dm(v.dato)} ${kortTid(v.start, v.slutt)}${v.interessenter.length > 1 ? ` (+${v.interessenter.length - 1} til)` : ''}`, under: i.merknad ?? undefined, knapp: `Gi til ${i.navn.split(' ')[0]}`, handling: { type: 'tildel', id: v.id, ansattId: i.id } });
    }
  }
  if (mva && !mva.sendt) {
    const dagerIgjen = (Date.parse(mva.termin.frist) - Date.parse(dag)) / 86400000;
    if (mva.antallMangler === 0 && dagerIgjen <= 30) rader.push({ id: 'mva', merke: 'MVA', farge: 'gronn', tekst: `${mva.termin.tittel} er klar`, under: `Frist ${norskDato(mva.termin.frist, false)}.`, knapp: 'Se og send', handling: { type: 'lenke', href: '/mva' } });
    else if (mva.antallMangler > 0) rader.push({ id: 'mva', merke: 'MVA', farge: 'gul', tekst: `${mva.termin.tittel}: ${mva.antallMangler} ${mva.antallMangler === 1 ? 'ting mangler' : 'ting mangler'}`, under: `Frist ${norskDato(mva.termin.frist, false)}.`, knapp: 'Se hva', handling: { type: 'lenke', href: '/mva' } });
  }
  const forfalte = await d.q<{ nr: number; kunde: string; rest: number; forfall: string; epost: string | null }>(
    `select f.nr, coalesce(c.navn, '') as kunde, c.epost, f.forfall::text as forfall,
       (f.total - f.betalt - coalesce((select sum(k.total) from faktura k where k.krediterer_id = f.id and k.status <> 'utkast'),0))::bigint as rest
     from faktura f left join kontakt c on c.id = f.kontakt_id where f.organisasjon_id = $1 and f.type = 'faktura' and f.status in ('sendt','delbetalt') and f.forfall < $2 order by f.forfall limit 3`, [s.org.id, dag]);
  for (const f of forfalte.filter(x => Number(x.rest) > 0)) rader.push({ id: `purring-${f.nr}`, merke: 'Forfalt', farge: 'rod', tekst: `Faktura ${f.nr} til ${f.kunde}, ${kr(Number(f.rest))} kr`, under: `Forfalt ${nd(f.forfall)}.${f.epost ? '' : ' Kunden har ingen e-post.'}`, knapp: 'Send purring', handling: f.epost ? { type: 'purring', nr: f.nr } : { type: 'lenke', href: '/salg' } });
  const regninger = await d.q<{ id: string; navn: string; total: number; forfall: string }>(
    `select k.id, k.leverandor_navn as navn, k.total, k.forfall::text as forfall from kjop k where k.organisasjon_id = $1 and k.status = 'registrert' and k.forfall is not null and k.forfall <= $2 order by k.forfall limit 3`, [s.org.id, plussDager(dag, 7)]).catch(() => []);
  for (const r of regninger) rader.push({ id: `regning-${r.id}`, merke: 'Regning', farge: r.forfall < dag ? 'rod' : '', tekst: `${r.navn}, ${kr(Number(r.total))} kr`, under: `${r.forfall < dag ? 'Forfalt' : 'Forfaller'} ${nd(r.forfall)}.`, knapp: 'Betal', handling: { type: 'lenke', href: `/kjop/${r.id}` } });
  for (const v of await ventende(d, s.org.id).catch(() => [])) {
    const x = (typeof v.data === 'string' ? JSON.parse(v.data) : v.data) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const tekst = v.art === 'purring' ? `Faktura ${x.nr} til ${x.kunde}, ${kr(x.rest)} kr`
      : v.art === 'betaling' ? `Innbetaling på faktura ${x.nr} fra ${x.kunde}, ${kr(x.belop)} kr`
      : v.art === 'kreditnota' ? `Kreditnota på faktura ${x.nr}, ${kr(x.belop)} kr`
      : v.art === 'skannelenke' ? `Skannelenke til ${x.navn ? `${x.navn}, ` : ''}${x.epost}`
      : v.art === 'invitasjon' ? `Inviter ${x.epost}`
      : v.art === 'lonn' ? `Lønn ${x.periode}: ${kr(x.sum?.netto ?? 0)} kr`
      : v.art === 'lonnslipp' ? `Lønnslipp ${x.periode} til ${x.navn}`
      : v.art === 'vaktplan' ? `Utkast til vaktplan for uke ${x.uke}`
      : v.art === 'tildel_vakt' ? `Gi vakten ${dm(String(x.dato))} til ${x.navn}`
      : v.art === 'publiser_uke' ? `Publiser vaktplanen for uke ${x.uke}`
      : v.art === 'kunde' ? `Ny kunde: ${x.navn}`
      : `${x.termin?.tittel ?? 'MVA-melding'}: merk som sendt`;
    const sperret = v.art === 'mva' && mva && mva.antallMangler > 0 && x.termin?.tittel === mva.termin.tittel ? 'Noe mangler bilag. Se MVA-siden.' : undefined;
    rader.push({ id: v.id, merke: TITTEL[v.art] ?? 'Forslag', tekst, under: 'Satt på vent fra assistenten.', knapp: 'Gjør det', fjern: 'Fjern', sperret, handling: { type: 'forslag', id: v.id } });
  }

  // ---------- På jobb i dag / neste arbeidsdag ----------
  let paJobb: { dato: string; vakter: { navn: string; tid: string }[] } | null = null;
  if (vakt) {
    const kommende = await vakterMellom(d, s.org.id, dag, plussDager(dag, 14)).catch(() => []);
    const forste = kommende.find(v => v.ansattId)?.dato;
    if (forste) {
      const ansatte = await vaktAnsatte(d, s.org.id);
      paJobb = { dato: forste, vakter: kommende.filter(v => v.dato === forste && v.ansattId).map(v => ({ navn: ansatte.find(a => a.id === v.ansattId)?.navn ?? '', tid: kortTid(v.start, v.slutt) })) };
    }
  }

  return (
    <div className="stakk" style={{ gap: 26 }}>
      <div>
        <div className="mut liten">{langDato(dag)}</div>
        <h1 style={{ marginTop: 6 }}>Hei, {fornavn}.</h1>
      </div>
      {bruk && <Kreditter bruk={bruk} />}

      {valgtPakke && (
        <div className="varsel gul"><div className="fyll">Du valgte <b>{valgtPakke.n}</b>. Fullfør betalingen, så får du alt som er med i pakken.</div><a href={`/pakke/${valgtPakke.k}`} className="knapp liten">Gå til betaling</a></div>
      )}

      {rader.length > 0 && endre && <VenterPaDeg rader={rader.slice(0, 12)} />}

      <div className={`rutenett ${vakt ? 'tre' : 'to'} hjem-snarveier`}>
        <Link href="/salg/ny" className="kort mork snarvei">
          <span className="stikk" style={{ color: 'var(--gul)' }}>Penger inn</span>
          <b>Send en faktura</b>
          <span className="mut">Søk opp kunden og skriv hva du har gjort.</span>
        </Link>
        <Link href="/kjop/ny" className="kort snarvei">
          <span className="stikk gronn">Penger ut</span>
          <b>Registrer et kjøp</b>
          <span className="mut">Last opp kvitteringen, så leser vi den.</span>
        </Link>
        {vakt && (
          <Link href="/vaktplan" className="kort snarvei">
            <span className="stikk">Ansatte</span>
            <b>Vaktplan</b>
            <span className="mut">Lag uka, svar på bytter og fri.</span>
          </Link>
        )}
      </div>

      <div className="rutenett to">
        <section className="kort stakk">
          <div className="rad" style={{ justifyContent: 'space-between' }}><h2>Neste frist</h2><Link href="/frister" className="lenke mut">Alle frister</Link></div>
          {neste ? (
            <div className="rad" style={{ flexWrap: 'nowrap' }}>
              <div style={{ textAlign: 'center', minWidth: 52 }}><div className="stikk mut">{kortManed(neste.dato)}</div><div style={{ fontSize: 26, fontWeight: 700 }}>{Number(neste.dato.slice(8))}</div></div>
              <div style={{ flex: 1 }}><b>{neste.tittel}</b><div className="mut liten">{neste.beskrivelse}</div></div>
            </div>
          ) : <p className="mut">Ingen frister de neste tolv månedene.</p>}
        </section>

        {vakt ? (
          <section className="kort stakk">
            <div className="rad" style={{ justifyContent: 'space-between' }}>
              <h2>{paJobb && paJobb.dato === dag ? 'På jobb i dag' : 'På jobb neste arbeidsdag'}</h2>
              <Link href="/vaktplan" className="lenke mut">Vaktplan</Link>
            </div>
            {paJobb ? (
              <>
                {paJobb.dato !== dag && <div className="mut liten">{DAG[new Date(`${paJobb.dato}T12:00:00Z`).getUTCDay()]} {dm(paJobb.dato)}</div>}
                <div className="liste">{paJobb.vakter.map((v, i) => <div key={i} className="linje"><span className="fyll">{v.navn}</span><span className="mono">{v.tid}</span></div>)}</div>
              </>
            ) : <p className="mut">Ingen vakter de neste to ukene. <Link href="/vaktplan" className="lenke">Lag vaktplanen</Link></p>}
          </section>
        ) : (
          <section className="kort stakk">
            <h2>Send kvitteringer på e-post</h2>
            <p className="mut liten">Videresend kvitteringer og fakturaer hit. De havner under Penger ut og blir kontrollert med en gang.</p>
            <div className="rad" style={{ background: 'var(--kort-2)', border: '1px solid var(--linje)', borderRadius: 10, padding: '8px 10px', flexWrap: 'nowrap' }}>
              <span className="mono liten" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{bilagEpost}</span>
              <Kopier tekst={bilagEpost} />
            </div>
            <p className="faint liten">Mottak på e-post slås på når e-posttjenesten er koblet til.</p>
          </section>
        )}
      </div>

      <section>
        <div className="rad" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <h2>Sist registrert</h2>
          <Link href="/rapporter?tab=hb" className="lenke">Se alt</Link>
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
