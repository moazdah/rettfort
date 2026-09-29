import Link from 'next/link';
import { kreverSelskap, db } from '@/lib/server';
import { innboks, lenker } from '@/lib/tjenester/innsending';
import { grunnadresse } from '@/lib/epost';
import { kr } from '@/lib/penger';
import { Avvis, VelgTilbake, BetaltKnapp, LenkeHandlinger, NyLenke } from './handlinger';

export const metadata = { title: 'Innboks' };

const dato = (d: string) => d.slice(0, 10).split('-').reverse().join('.');
const TYPE: Record<string, string> = { egen: 'Fra mobilen', klient: 'Fra klient', utlegg: 'Utlegg' };

export default async function Innboks() {
  const s = await kreverSelskap();
  const d = await db();
  const rader = await innboks(d, s.org.id);
  const ls = await lenker(d, s.org.id);
  const ansatte = await d.q<{ id: string; navn: string; epost: string | null }>('select id, navn, epost from ansatt where organisasjon_id = $1 and aktiv order by navn', [s.org.id]);
  const base = await grunnadresse();
  const venter = rader.filter(r => r.status === 'ny' || r.status === 'hentet');
  const utlegg = rader.filter(r => r.status === 'godkjent');
  const ferdige = rader.filter(r => !venter.includes(r) && !utlegg.includes(r));
  const bilde = (r: (typeof rader)[number]) => r.vedlegg_id && r.mime?.startsWith('image/')
    ? <a href={`/api/vedlegg/${r.vedlegg_id}`} target="_blank" rel="noreferrer" className="innboks-bilde" style={{ backgroundImage: `url(/api/vedlegg/${r.vedlegg_id})` }} aria-label="Åpne bildet" />
    : <a href={r.vedlegg_id ? `/api/vedlegg/${r.vedlegg_id}` : '#'} target="_blank" rel="noreferrer" className="innboks-bilde">PDF</a>;

  return (
    <div className="stakk" style={{ gap: 20 }}>
      <div className="hode">
        <div><div className="stikk gronn">Penger ut</div><h1 style={{ marginTop: 4 }}>Innboks</h1><p className="mut">Kvitteringer og fakturaer fra mobilen, fra klienter og utlegg fra ansatte.</p></div>
        <Link href="/kjop/ny" className="knapp hvit">Ta bilde med mobilen</Link>
      </div>

      <section className="kort stakk">
        <h2>Venter på deg {venter.length ? <span className="merke gul">{venter.length}</span> : null}</h2>
        {venter.length ? (
          <div className="liste">
            {venter.map(r => (
              <div key={r.id} className="innboks-rad">
                {bilde(r)}
                <div className="fyll" style={{ minWidth: 0 }}>
                  <div><span className="merke-type">{TYPE[r.type] ?? r.type}</span><b>{r.fra_navn ?? ''}</b></div>
                  <div className="mut liten" style={{ marginTop: 4 }}>{dato(r.opprettet)}{r.type === 'utlegg' ? ` · ${r.betalt_med === 'eget' ? 'Betalt med eget kort, skal ha pengene tilbake' : 'Betalt med firmakort'}` : ''}</div>
                  {r.tekst && <div style={{ marginTop: 4 }}>«{r.tekst}»</div>}
                </div>
                <div className="innboks-handling">
                  <Link href={`/kjop/ny?innsending=${r.id}`} className="knapp liten">{r.type === 'utlegg' ? 'Godkjenn og registrer' : 'Registrer'}</Link>
                  <Avvis id={r.id} />
                </div>
              </div>
            ))}
          </div>
        ) : <p className="mut">Ingenting venter. Nye dokumenter dukker opp her.</p>}
      </section>

      {utlegg.length > 0 && (
        <section className="kort stakk">
          <h2>Utlegg som skal betales tilbake</h2>
          <div className="liste">
            {utlegg.map(r => (
              <div key={r.id} className="innboks-rad">
                {bilde(r)}
                <div className="fyll" style={{ minWidth: 0 }}>
                  <div><b>{r.fra_navn}</b> · <span className="belop">{kr(r.belop ?? 0)} kr</span></div>
                  <div className="mut liten" style={{ marginTop: 4 }}>{r.tekst ?? 'Utlegg'} · {dato(r.opprettet)}</div>
                  {r.tilbake === 'neste_lonn' && <div className="liten tekst-gronn" style={{ marginTop: 4 }}>Betales med neste lønn. Står på lønnslippen.</div>}
                  {r.tilbake === 'na' && <div className="liten" style={{ marginTop: 4 }}>Betal {kr(r.belop ?? 0)} kr til {r.ansatt_kontonr ? <span className="mono">{r.ansatt_kontonr.replace(/(\d{4})(\d{2})(\d{5})/, '$1 $2 $3')}</span> : 'kontoen til den ansatte'} i nettbanken, og kryss av her.</div>}
                </div>
                <div className="innboks-handling">
                  {r.tilbake === 'na' ? <BetaltKnapp id={r.id} /> : r.tilbake === null ? <VelgTilbake id={r.id} /> : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="kort stakk">
        <h2>Lenker for å sende inn</h2>
        <p className="mut" style={{ marginTop: -6 }}>Den som har lenken, kan bare sende inn kvitteringer. De ser ingenting av regnskapet. Lenkene virker til du sletter dem.</p>
        {ls.length > 0 && (
          <div className="liste">
            {ls.map(l => (
              <div key={l.id} className="innboks-rad" style={{ alignItems: 'center' }}>
                <div className="fyll" style={{ minWidth: 0 }}>
                  <div><span className="merke-type">{l.type === 'ansatt' ? 'Ansatt' : 'Klient'}</span><b>{l.ansatt_navn ?? l.navn}</b></div>
                  <div className="mut liten" style={{ marginTop: 4 }}>{l.epost ?? 'Ingen e-post'} · laget {dato(l.opprettet)} · {l.antall} {l.antall === 1 ? 'dokument' : 'dokumenter'}</div>
                </div>
                <LenkeHandlinger id={l.id} url={`${base}/skann/${l.token}`} harEpost={!!l.epost || (l.type === 'ansatt' && !!ansatte.find(a => a.id === l.ansatt_id)?.epost)} />
              </div>
            ))}
          </div>
        )}
        <NyLenke ansatte={ansatte} />
      </section>

      {ferdige.length > 0 && (
        <details className="kort">
          <summary style={{ cursor: 'pointer' }}><b>Behandlet siste 30 dager</b> <span className="mut">({ferdige.length})</span></summary>
          <div className="liste" style={{ marginTop: 12 }}>
            {ferdige.map(r => (
              <div key={r.id} className="innboks-rad">
                {bilde(r)}
                <div className="fyll">
                  <div><span className="merke-type">{TYPE[r.type] ?? r.type}</span><b>{r.fra_navn}</b></div>
                  <div className="mut liten" style={{ marginTop: 4 }}>{dato(r.opprettet)} · {r.status === 'avvist' ? `Avvist: ${r.avvist_grunn}` : r.status === 'betalt' ? 'Betalt tilbake' : 'Registrert'}{r.belop ? ` · ${kr(r.belop)} kr` : ''}</div>
                </div>
                {r.kjop_id && <Link href={`/kjop/${r.kjop_id}`} className="knapp hvit liten">Se kjøpet</Link>}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
