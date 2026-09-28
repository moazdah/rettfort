import { kreverByra, db, idag } from '@/lib/server';
import { aktuellTermin, mvaStatus } from '@/lib/tjenester/mva';
import { kontrollFunn } from '@/lib/tjenester/kontroll';
import { nesteFrister } from '@/lib/tjenester/oversikt';
import { formaterOrgnr } from '@/lib/brreg';
import { dagerTil, norskDato } from '@/lib/frister';
import { langDato, manedNavn } from '@/lib/vis';
import { AapneKnapp, NyKlient } from './Klienter';

export const metadata = { title: 'Klienter' };

interface Rad { id: string; navn: string; orgnr: string | null; pakke: string; funn: number; mva: { tittel: string; frist: string; mangler: number } | null; bank: string | null; neste: { tittel: string; dato: string } | null; forfalt: number }

export default async function Byra() {
  const s = await kreverByra();
  const d = await db();
  const dag = idag();
  const byraId = s.medlemskap.find(m => m.type === 'byra')!.orgId;
  const klienter = await d.q<{ id: string; navn: string; orgnr: string | null; pakke: string }>(
    `select o.id, o.navn, o.orgnr, o.pakke from byra_kunde bk join organisasjon o on o.id = bk.selskap_id where bk.byra_id = $1 and bk.status = 'aktiv' order by o.navn`, [byraId]);
  const rader: Rad[] = [];
  for (const k of klienter) {
    const termin = await aktuellTermin(d, k.id, dag);
    const st = termin ? await mvaStatus(d, k.id, termin) : null;
    const funn = await kontrollFunn(d, k.id, `${dag.slice(0, 4)}-01-01`, dag, dag);
    const bank = await d.en<{ maned: string }>(`select max(maned) as maned from kontoutskrift where organisasjon_id = $1 and status = 'ferdig'`, [k.id]);
    const frister = await nesteFrister(d, k.id, dag, 3);
    rader.push({
      ...k, funn: funn.filter(f => f.alvor !== 'info').length, forfalt: funn.filter(f => f.kode === 'forfalt').length,
      mva: st && !st.sendt ? { tittel: st.termin.tittel, frist: st.termin.frist, mangler: st.antallMangler } : null,
      bank: bank?.maned ?? null, neste: frister[0] ? { tittel: frister[0].tittel, dato: frister[0].dato } : null,
    });
  }
  // Dette haster: MVA som ikke er klar, sortert etter frist, deretter funn.
  const haster = [
    ...rader.filter(r => r.mva && r.mva.mangler > 0).map(r => ({ id: r.id, navn: r.navn, dato: r.mva!.frist, t: `${r.mva!.tittel}: ${r.mva!.mangler} ting mangler`, act: 'Åpne MVA' })),
    ...rader.filter(r => r.mva && r.mva.mangler === 0).map(r => ({ id: r.id, navn: r.navn, dato: r.mva!.frist, t: `${r.mva!.tittel} er klar til å sendes`, act: 'Send' })),
    ...rader.filter(r => r.funn > 0 && !(r.mva && r.mva.mangler)).map(r => ({ id: r.id, navn: r.navn, dato: '9999', t: `${r.funn} funn fra kontrollen`, act: 'Se funn' })),
  ].sort((a, b) => a.dato.localeCompare(b.dato)).slice(0, 8);
  const fornavn = s.bruker.navn.split(' ')[0];
  const time = Number(new Intl.DateTimeFormat('nb-NO', { hour: 'numeric', timeZone: 'Europe/Oslo' }).format(new Date()));
  const hilsen = time < 10 ? 'God morgen' : time < 18 ? 'Hei' : 'God kveld';
  const mvaSnart = rader.filter(r => r.mva && dagerTil(dag, r.mva.frist) <= 14).length;

  return (
    <div className="stakk" style={{ gap: 22 }}>
      <div>
        <div className="mut liten">{langDato(dag)}</div>
        <h1 style={{ marginTop: 6 }}>{hilsen}, {fornavn}.</h1>
        <p className="mut" style={{ marginTop: 6 }}>{klienter.length ? `${klienter.length} ${klienter.length === 1 ? 'klient' : 'klienter'}. ${haster.length ? `${haster.length} ${haster.length === 1 ? 'ting' : 'ting'} haster.` : 'Ingenting haster.'}` : 'Ingen klienter ennå. Legg til den første, eller be kundene invitere deg fra Rettført.'}</p>
      </div>
      <div className="rutenett tre">
        <div className="kort"><div className="mut liten">Klienter</div><div style={{ fontSize: 28, fontWeight: 600 }}>{klienter.length}</div></div>
        <div className="kort"><div className="mut liten">Funn som må ses på</div><div style={{ fontSize: 28, fontWeight: 600 }}>{rader.reduce((a, r) => a + r.funn, 0)}</div></div>
        <div className="kort"><div className="mut liten">MVA-frister neste 14 dager</div><div style={{ fontSize: 28, fontWeight: 600 }}>{mvaSnart}</div></div>
      </div>
      {haster.length > 0 && (
        <section>
          <div className="rad" style={{ justifyContent: 'space-between', marginBottom: 10 }}><h2>Dette haster</h2><span className="mut liten">Sortert etter frist</span></div>
          <div className="liste">
            {haster.map((h, i) => (
              <div key={i} className="linje">
                <span className="merke">{h.dato === '9999' ? 'Funn' : norskDato(h.dato, false)}</span>
                <div className="fyll"><div className="tittel">{h.navn}</div><div className="mut liten">{h.t}</div></div>
                <AapneKnapp id={h.id} tekst={h.act} klasse="knapp hvit liten" />
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="stakk">
        <div className="rad" style={{ justifyContent: 'space-between' }}><h2>Klienter</h2><NyKlient /></div>
        {rader.length > 0 && (
          <div className="kort" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="tabell">
              <thead><tr><th>Klient</th><th>MVA</th><th>Bank avstemt til</th><th className="h">Funn</th><th>Neste frist</th><th></th></tr></thead>
              <tbody>
                {rader.map(r => (
                  <tr key={r.id}>
                    <td><b style={{ fontWeight: 600 }}>{r.navn}</b><div className="mut liten">{r.orgnr ? formaterOrgnr(r.orgnr) : 'uten org.nr'} · {r.pakke[0].toUpperCase() + r.pakke.slice(1)}</div></td>
                    <td>{r.mva ? <span className={`merke ${r.mva.mangler ? 'gul' : 'gronn'}`}>{r.mva.mangler ? `${r.mva.mangler} mangler` : 'Klar'}</span> : <span className="merke">Sendt</span>}</td>
                    <td className="liten">{r.bank ? manedNavn(r.bank) : <span className="mut">Ikke startet</span>}</td>
                    <td className="h">{r.funn || ''}</td>
                    <td className="liten">{r.neste ? <>{r.neste.tittel}<div className="mut">{norskDato(r.neste.dato)}</div></> : ''}</td>
                    <td className="h"><AapneKnapp id={r.id} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
