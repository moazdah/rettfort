import Link from 'next/link';
import { Totrinn } from './Totrinn';
import { kreverSelskap, db, idag } from '@/lib/server';
import { kanEndre } from '@/lib/auth';
import { laastTil } from '@/lib/tjenester/bokforing';
import { formaterOrgnr } from '@/lib/brreg';
import { Kopier } from '@/components/Kopier';
import { Handling } from '@/components/Handling';
import { trekkInvitasjon } from '@/app/handlinger';
import { FirmaSkjema, FakturaInnstillinger, Inviter, Laas, Apningsbalanse } from './Skjemaer';
import { stripePa, fullforBetaling, synkAbonnement, antallAnsatte, abonnementDetaljer } from '@/lib/stripe';
import { Abonnement } from './Abonnement';
import { slettPlan } from '@/lib/tjenester/konto';
import { SlettKonto } from './SlettKonto';
import { LogoInnstillinger } from './LogoInnstillinger';
import { hentLogo } from '@/lib/tjenester/logo';

export const metadata = { title: 'Innstillinger' };

const FANER = [['firma', 'Firma'], ['faktura', 'Faktura'], ['brukere', 'Brukere'], ['sikkerhet', 'Sikkerhet'], ['abonnement', 'Abonnement'], ['avansert', 'Avansert'], ['konto', 'Din konto']] as const;
const ORGFORM: Record<string, string> = { AS: 'Aksjeselskap', ENK: 'Enkeltpersonforetak', ANS: 'Ansvarlig selskap', DA: 'Selskap med delt ansvar', NUF: 'Norskregistrert utenlandsk foretak' };
const ROLLE: Record<string, string> = { eier: 'Eier', full: 'Full tilgang', les: 'Kan se', kvittering: 'Kvitteringer', regnskapsforer_full: 'Regnskapsfører', regnskapsforer_les: 'Regnskapsfører (se)' };

export default async function Innstillinger({ searchParams }: { searchParams: Promise<{ vis?: string; betaling?: string; avbrutt?: string }> }) {
  const s = await kreverSelskap();
  const d = await db();
  const sp = await searchParams;
  const vis = FANER.find(f => f[0] === sp.vis)?.[0] ?? 'firma';
  // Abonnement: bekreft betalingen hos Stripe når kunden kommer tilbake, ellers hent siste status.
  let betalt: boolean | null = null;
  if (vis === 'abonnement' && stripePa()) {
    try {
      if (sp.betaling) betalt = await fullforBetaling(d, s.org.id, sp.betaling);
      else await synkAbonnement(d, s.org.id);
    } catch (e) { console.error('Abonnement:', e); }
  }
  const o = await d.en<Record<string, string | number | boolean | null> & { navn: string; orgnr: string | null; orgform: string; mva_registrert: boolean; bilag_slug: string | null; regnskap_fra: string | null; pakke: string }>('select *, regnskap_fra::text as regnskap_fra, abonnement_slutt::text as abonnement_slutt from organisasjon where id = $1', [s.org.id]);
  const endre = kanEndre(s.rolle);
  const logo = vis === 'firma' && endre ? await hentLogo(d, s.org.id) : null;
  const abo = vis === 'abonnement' ? {
    ansatte: await antallAnsatte(d, s.org.id),
    detaljer: stripePa() ? await abonnementDetaljer(d, s.org.id).catch(e => { console.error('Abonnement:', e); return null; }) : null,
    eierNavn: (await d.en<{ navn: string }>(`select b.navn from medlemskap m join bruker b on b.id = m.bruker_id where m.organisasjon_id = $1 and m.rolle = 'eier' order by m.opprettet limit 1`, [s.org.id]))?.navn ?? null,
  } : null;
  const brukere = await d.q<{ navn: string; epost: string; rolle: string }>('select b.navn, b.epost, m.rolle from medlemskap m join bruker b on b.id = m.bruker_id where m.organisasjon_id = $1 order by m.opprettet', [s.org.id]);
  const inv = await d.q<{ id: string; epost: string; rolle: string }>(`select id, epost, rolle from invitasjon where organisasjon_id = $1 and status = 'venter' and rolle not like 'regnskapsforer%' order by opprettet`, [s.org.id]);
  const laast = await laastTil(d, s.org.id);
  const totrinnPa = !!(await d.en<{ pa: boolean }>('select totp_hemmelig is not null as pa from bruker where id = $1', [s.bruker.id]))?.pa;
  const harApning = await d.en(`select 1 from bilag where organisasjon_id = $1 and type = 'apningsbalanse'`, [s.org.id]);
  const dagForStart = o?.regnskap_fra ? new Date(Date.parse(o.regnskap_fra) - 86400000).toISOString().slice(0, 10) : `${Number(idag().slice(0, 4)) - 1}-12-31`;

  return (
    <div className="stakk" style={{ gap: 20, maxWidth: 900 }}>
      <h1>Innstillinger</h1>
      <nav className="faner">{FANER.map(([k, t]) => <Link key={k} href={`/innstillinger?vis=${k}`} className={vis === k ? 'aktiv' : ''}>{t}</Link>)}</nav>

      {vis === 'firma' && (
        <>
          <section className="kort stakk">
            <div className="rad" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div><h2>{o?.navn}</h2><div className="mut liten">{o?.orgnr ? `Org.nr ${formaterOrgnr(o.orgnr)}` : 'Uten org.nr'} · {ORGFORM[o?.orgform ?? ''] ?? o?.orgform} · {o?.mva_registrert ? 'registrert i MVA-registeret' : 'ikke MVA-registrert'}</div></div>
              {o?.orgnr && <span className="merke">Hentet fra Brønnøysund</span>}
            </div>
            <div className="rad" style={{ background: 'var(--kort-2)', border: '1px solid var(--linje)', borderRadius: 10, padding: '8px 10px', flexWrap: 'nowrap' }}>
              <span className="mut liten">Bilag-e-post</span><span className="mono liten" style={{ flex: 1 }}>{o?.bilag_slug}@bilag.rettfort.no</span><Kopier tekst={`${o?.bilag_slug}@bilag.rettfort.no`} />
            </div>
            <p className="faint liten">Navn, org.nr og selskapsform kommer fra Brønnøysundregistrene.</p>
          </section>
          {endre && <section className="kort stakk"><div><h2>Logo</h2><p className="mut liten">Logoen er med i alle pakker. Du velger selv hvor den skal vises.</p></div><LogoInnstillinger logo={logo?.dataUrl ?? null} bruk={logo?.bruk ?? []} /></section>}
          {endre && <section className="kort"><FirmaSkjema start={{ adresse: o?.adresse ?? '', postnr: o?.postnr ?? '', poststed: o?.poststed ?? '', epost: o?.epost ?? '', telefon: o?.telefon ?? '', mva_termin: o?.mva_termin ?? 'tomnd' }} /></section>}
        </>
      )}

      {vis === 'faktura' && endre && <section className="kort stakk"><h2>Slik ser fakturaene dine ut</h2><FakturaInnstillinger start={{ kontonr: o?.kontonr ?? '', faktura_forfall_dager: o?.faktura_forfall_dager ?? 14, faktura_tekst: o?.faktura_tekst ?? '', kid_metode: o?.kid_metode ?? 'mod10' }} /></section>}

      {vis === 'brukere' && (
        <>
          <section className="kort stakk">
            <h2>Hvem har tilgang</h2>
            <div className="liste" style={{ border: 0 }}>
              {brukere.map(b => <div key={b.epost} className="linje"><span className="avatar">{b.navn.split(' ').map(n => n[0]).slice(0, 2).join('')}</span><div className="fyll"><div className="tittel">{b.navn}</div><div className="mut liten">{b.epost}</div></div><span className="merke">{ROLLE[b.rolle] ?? b.rolle}</span></div>)}
              {inv.map(i => <div key={i.id} className="linje"><span className="avatar" style={{ background: 'var(--noyt-bg)', color: 'var(--mut)' }}>?</span><div className="fyll"><div className="tittel">{i.epost}</div><div className="mut liten">Invitert · {ROLLE[i.rolle] ?? i.rolle}</div></div>{endre && <Handling handling={trekkInvitasjon.bind(null, i.id)} tekst="Trekk tilbake" klasse="knapp hvit liten" />}</div>)}
            </div>
            <p className="mut liten">Regnskapsføreren inviterer du under <Link className="lenke" href="/regnskapsforer">Regnskapsfører</Link>.</p>
          </section>
          {endre && <section className="kort stakk"><h2>Inviter noen</h2><Inviter /></section>}
        </>
      )}

      {vis === 'konto' && await (async () => {
        const plan = await slettPlan(d, s.bruker.id);
        const ar = Number(idag().slice(0, 4));
        return (
          <>
            <section className="kort stakk">
              <h2>Last ned dataene dine</h2>
              <p className="mut liten">Alt vi har lagret om deg som person: profil, tilganger, innlogginger, samtaler med assistenten og hva du har gjort i systemet. Filen er i JSON-format.</p>
              <div><a href="/api/mine-data" className="knapp hvit" download>Last ned mine data</a></div>
              <p className="mut liten">Regnskapet til {s.org.navn} lastes ned som SAF-T, som alle regnskapssystemer kan lese.</p>
              <div className="rad" style={{ gap: 8 }}>{[ar, ar - 1].map(a => <a key={a} href={`/api/saft?ar=${a}`} className="knapp hvit liten" download>SAF-T {a}</a>)}</div>
            </section>
            <section className="kort stakk">
              <h2>Slett kontoen</h2>
              <p className="mut liten">Kontoen din ({s.bruker.epost}) slettes. Det du har ført i regnskapet blir stående hos foretaket, merket «Slettet bruker».</p>
              <SlettKonto hindring={plan.hindring} foretakAlene={plan.foretakAlene.map(f => f.navn)} />
            </section>
          </>
        );
      })()}
      {vis === 'sikkerhet' && <section className="kort stakk"><h2>Totrinns innlogging</h2><Totrinn pa={totrinnPa} /></section>}
      {vis === 'abonnement' && <section className="stakk"><h2>Abonnement</h2><Abonnement pakke={o?.pakke ?? 'gratis'} status={(o?.abonnement_status as string | null) ?? null} slutt={o?.abonnement_slutt ? String(o.abonnement_slutt).slice(0, 10) : null} eier={s.rolle === 'eier'} eierNavn={abo?.eierNavn ?? null} ansatte={abo?.ansatte ?? 0} detaljer={abo?.detaljer ?? null} betalingPa={stripePa()} avbrutt={!!sp.avbrutt} />{betalt === false && <div className="varsel gul">Vi fant ikke betalingen ennå. Last siden på nytt om litt.</div>}</section>}

      {vis === 'avansert' && (
        <>
          {endre && <section className="kort stakk"><h2>Lås regnskapet</h2><Laas laastTil={laast} idag={idag()} /></section>}
          {endre && !harApning && <section className="kort stakk"><h2>Åpningsbalanse</h2><Apningsbalanse standardDato={dagForStart} /></section>}
          <section className="kort stakk">
            <h2>Ta med deg regnskapet</h2>
            <p className="mut liten">Last ned alt som er ført som SAF-T. Du eier dataene dine, også om du slutter.</p>
            <div className="rad"><a className="knapp hvit" href={`/api/saft?ar=${idag().slice(0, 4)}`}>Last ned SAF-T for {idag().slice(0, 4)}</a><a className="knapp hvit" href={`/api/rapport?type=hb&ar=${idag().slice(0, 4)}`}>Hovedbok (CSV)</a></div>
          </section>
        </>
      )}
    </div>
  );
}
