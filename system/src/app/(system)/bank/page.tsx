import Link from 'next/link';
import { Oppgrader } from '@/components/Oppgrader';
import { harFulltRegnskap } from '@/lib/pakker';
import { kreverSelskap, db } from '@/lib/server';
import { avstemming, foreslaAlle } from '@/lib/tjenester/bank';
import { kanEndre } from '@/lib/auth';
import { kr, nd, manedNavn, formaterKontonr } from '@/lib/vis';
import type { Forslag } from '@/lib/bankmatch';
import { Handling } from '@/components/Handling';
import { merkManedFerdigHandling } from '@/app/handlinger';
import { Opplasting } from './Opplasting';
import { BevegelseValg } from './Bevegelse';

export const metadata = { title: 'Bank' };

const KNAPP: Record<string, string> = { faktura: 'Godkjenn innbetaling', kjop: 'Godkjenn betaling', bokfort: 'Koble til', bankpost: 'Før automatisk' };
const MATCH: Record<string, string> = { faktura: 'Innbetaling på faktura', kjop: 'Betaling av regning', bokfort: 'Finnes i regnskapet', gebyr: 'Bankgebyr', renteinntekt: 'Renteinntekt', rentekostnad: 'Rentekostnad', uttak: 'Uttak/lån til eier', innskudd_eier: 'Innskudd fra eier', overforing: 'Overføring til egen konto', mva: 'MVA til/fra Skatteetaten', skatt_aga: 'Skattetrekk og arbeidsgiveravgift' };

export default async function Bank({ searchParams }: { searchParams: Promise<{ maned?: string }> }) {
  const s = await kreverSelskap();
  if (!harFulltRegnskap(s.org.pakke)) return <Oppgrader tittel={"Bankavstemming"} tekst={"Last opp kontoutskriften fra nettbanken, så sjekkes hver bevegelse mot regnskapet, og du får forslag til hva som mangler."} punkter={["Kontoutskrift fra alle norske banker", "Forslag til hver bevegelse", "Lukk måneden når banken og regnskapet stemmer"]} />;
  const d = await db();
  const sp = await searchParams;
  // Regnskapet kan ha fått nye kjøp eller betalinger siden sist. Regn ut forslagene på nytt.
  if (kanEndre(s.rolle) && await d.en(`select 1 from bankbevegelse where organisasjon_id = $1 and status in ('apen','foreslatt') limit 1`, [s.org.id])) await d.tx(t => foreslaAlle(t, s.org.id));
  const org = await d.en<{ kontonr: string | null; orgform: string }>('select kontonr, orgform from organisasjon where id = $1', [s.org.id]);
  const maneder = await d.q<{ maned: string; status: string }>(`select maned, status from kontoutskrift where organisasjon_id = $1 and konto = 1920 order by maned`, [s.org.id]);
  const valgt = sp.maned && /^\d{4}-\d{2}$/.test(sp.maned) ? sp.maned : (maneder.find(m => m.status !== 'ferdig') ?? maneder[maneder.length - 1])?.maned;
  const a = valgt ? await avstemming(d, s.org.id, valgt) : null;
  const bev = valgt ? await d.q<{ id: string; dato: string; tekst: string; belop: number; status: string; forslag: string | null; match_type: string | null }>(
    `select b.id, b.dato::text as dato, b.tekst, b.belop, b.status, b.forslag, b.match_type from bankbevegelse b join kontoutskrift k on k.id = b.kontoutskrift_id where b.organisasjon_id = $1 and k.maned = $2 order by b.dato, b.id`, [s.org.id, valgt]) : [];
  const endre = kanEndre(s.rolle);
  const apne = bev.filter(b => b.status === 'apen' || b.status === 'foreslatt');
  const ferdigAntall = bev.length - apne.length;
  const nesteManed = (() => { const m = maneder[maneder.length - 1]?.maned; if (!m) return null; const [y, mm] = m.split('-').map(Number); return mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, '0')}`; })();
  const status = maneder.every(m => m.status === 'ferdig') && maneder.length ? `Avstemt til og med ${manedNavn(maneder[maneder.length - 1].maned)}` : maneder.length ? `${maneder.filter(m => m.status !== 'ferdig').length} ${maneder.filter(m => m.status !== 'ferdig').length === 1 ? 'måned' : 'måneder'} er ikke ferdig avstemt` : 'Ingen kontoutskrift lastet opp ennå';

  return (
    <div className="stakk" style={{ gap: 20 }}>
      <div><h1>Bank</h1><p className="mut" style={{ marginTop: 6, maxWidth: 640 }}>Last opp kontoutskriften hver måned. Vi sjekker at hver bevegelse i banken finnes i regnskapet, så saldoen stemmer.</p></div>
      <section className="kort rad" style={{ padding: '14px 18px' }}>
        <span className="merke mork mono">1920</span>
        <div style={{ flex: 1 }}><b style={{ fontWeight: 600 }}>Driftskonto{org?.kontonr ? ` · ${formaterKontonr(org.kontonr)}` : ''}</b><div className="mut liten">{status}</div></div>
        <span className="mut liten">Kobling direkte mot banken kommer. Til da laster du opp utskriften.</span>
      </section>

      {maneder.length > 0 && (
        <nav className="faner" aria-label="Måned">
          {maneder.map(m => <Link key={m.maned} href={`/bank?maned=${m.maned}`} className={m.maned === valgt ? 'aktiv' : ''}>{manedNavn(m.maned, false).slice(0, 3)} {m.maned.slice(2, 4)}{m.status === 'ferdig' ? ' ✓' : ''}</Link>)}
        </nav>
      )}

      {valgt && a && (
        <>
          <div className="rad" style={{ justifyContent: 'space-between' }}>
            <div><h2>{apne.length ? `${apne.length} av ${bev.length} bevegelser trenger deg` : a.status === 'ferdig' ? `${manedNavn(valgt)} er ferdig` : 'Alle bevegelser er avstemt'}</h2><div className="mut liten">{manedNavn(valgt)} · {bev.length} bevegelser · {ferdigAntall} avstemt</div></div>
          </div>
          <div className="liste">
            {bev.map(b => {
              const f = b.forslag ? (JSON.parse(b.forslag) as Forslag) : null;
              const info = b.status === 'matchet' ? MATCH[b.match_type ?? ''] ?? 'Avstemt' : b.status === 'ignorert' ? 'Ignorert' : f?.grunn ?? 'Fant ikke noe som passer.';
              const pill = b.status === 'matchet' ? ['Avstemt', 'gronn'] : b.status === 'ignorert' ? ['Ignorert', ''] : b.status === 'foreslatt' ? ['Forslag', 'gul'] : ['Trenger deg', 'rod'];
              return (
                <div key={b.id} className="linje" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <span className="mono mut liten" style={{ minWidth: 44, paddingTop: 2 }}>{nd(b.dato).slice(0, 5)}</span>
                  <div className="fyll" style={{ minWidth: 180 }}>
                    <div className="tittel">{b.tekst || '(uten tekst)'}</div>
                    <div className="rad liten" style={{ gap: 6, marginTop: 2 }}><span className={`merke ${pill[1]}`}>{pill[0]}</span><span className="mut">{info}</span></div>
                  </div>
                  <BevegelseValg b={{ id: b.id, dato: b.dato, tekst: b.tekst, belop: b.belop, status: b.status, info, forslagTekst: f && f.type !== 'ingen' ? KNAPP[f.type] : null, orgform: org?.orgform ?? 'AS', kanEndre: endre && a.status !== 'ferdig' }} />
                  <span className="belop" style={{ minWidth: 100, textAlign: 'right', color: b.belop > 0 ? 'var(--gronn)' : undefined }}>{b.belop > 0 ? '+' : ''}{kr(b.belop)}</span>
                </div>
              );
            })}
          </div>
          <section className="kort stakk">
            <div className="rutenett to">
              <div><div className="mut liten">Saldo i banken {nd(a.sisteDag)}</div><div className="belop" style={{ fontSize: 24, fontWeight: 600 }}>{a.bank == null ? 'Ikke oppgitt' : `${kr(a.bank)} kr`}</div></div>
              <div><div className="mut liten">Saldo i regnskapet {nd(a.sisteDag)}</div><div className="belop" style={{ fontSize: 24, fontWeight: 600 }}>{kr(a.regnskap)} kr</div></div>
            </div>
            {a.status === 'ferdig' ? <div className="varsel gronn">{manedNavn(valgt)} er avstemt og låst. Rettelser føres i en åpen måned.</div>
              : a.stemmer ? <div className="varsel gronn"><div className="fyll">Saldoen stemmer. Når du merker måneden som ferdig, låses den slik at ingenting kan endres i ettertid.</div></div>
              : <div className="varsel gul">{a.apne ? `${a.apne} bevegelser gjenstår før saldoen kan stemme.` : a.bank == null ? 'Kontoutskriften har ikke utgående saldo. Last opp en utskrift med saldo.' : `Differanse på ${kr(a.bank - a.regnskap)} kr. Sjekk om noe er ført to ganger eller mangler.`}</div>}
            {endre && a.status !== 'ferdig' && <div><Handling handling={merkManedFerdigHandling.bind(null, valgt)} tekst={`Merk ${manedNavn(valgt, false)} som ferdig`} klasse={a.stemmer ? 'knapp' : 'knapp hvit'} bekreft={`Låse ${manedNavn(valgt)}? Etterpå kan ingenting i måneden endres.`} /></div>}
          </section>
        </>
      )}

      {endre && <Opplasting tekst={nesteManed ? `Slipp kontoutskriften for ${manedNavn(nesteManed, false)} her` : 'Slipp kontoutskriften her'} />}
    </div>
  );
}
