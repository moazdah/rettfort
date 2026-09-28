import { kreverSelskap, db } from '@/lib/server';
import { kanEndre } from '@/lib/auth';
import { Handling } from '@/components/Handling';
import { fjernByraTilgang, trekkInvitasjon } from '@/app/handlinger';
import { InviterRegnskapsforer } from './Inviter';

export const metadata = { title: 'Regnskapsfører' };

export default async function Regnskapsforer() {
  const s = await kreverSelskap();
  const d = await db();
  const byraer = await d.q<{ id: string; navn: string; rolle: string; status: string; kontakt: string | null }>(
    `select o.id, o.navn, bk.rolle, bk.status, (select b.epost from medlemskap m join bruker b on b.id = m.bruker_id where m.organisasjon_id = o.id order by m.opprettet limit 1) as kontakt from byra_kunde bk join organisasjon o on o.id = bk.byra_id where bk.selskap_id = $1 and bk.status <> 'avsluttet'`, [s.org.id]);
  const inv = await d.q<{ id: string; epost: string; rolle: string }>(`select id, epost, rolle from invitasjon where organisasjon_id = $1 and status = 'venter' and rolle like 'regnskapsforer%'`, [s.org.id]);
  const endre = kanEndre(s.rolle) && !s.rolle?.startsWith('regnskapsforer');
  return (
    <div className="stakk" style={{ gap: 20, maxWidth: 760 }}>
      <div><h1>Regnskapsføreren din</h1><p className="mut" style={{ marginTop: 6 }}>Fører du selv, men vil ha hjelp til MVA eller årsoppgjøret? Inviter regnskapsføreren din. De ser det samme som deg, og funn fra kontrollen havner i arbeidslisten deres. Det koster deg ingenting ekstra.</p></div>
      {(byraer.length > 0 || inv.length > 0) && (
        <section className="kort stakk">
          {byraer.map(b => (
            <div key={b.id} className="rad">
              <span className="avatar">{b.navn.split(' ').map(n => n[0]).slice(0, 2).join('')}</span>
              <div style={{ flex: 1 }}><b style={{ fontWeight: 600 }}>{b.navn}</b><div className="mut liten">{b.kontakt} · {b.rolle === 'regnskapsforer_les' ? 'kan se' : 'kan føre og rette'} · {b.status === 'aktiv' ? 'har tilgang' : 'invitert'}</div></div>
              {endre && <Handling handling={fjernByraTilgang.bind(null, b.id)} tekst="Fjern tilgang" klasse="knapp hvit liten" bekreft={`Fjerne tilgangen til ${b.navn}?`} />}
            </div>
          ))}
          {inv.map(i => (
            <div key={i.id} className="rad">
              <span className="avatar" style={{ background: 'var(--noyt-bg)', color: 'var(--mut)' }}>?</span>
              <div style={{ flex: 1 }}><b style={{ fontWeight: 600 }}>{i.epost}</b><div className="mut liten">Invitert, har ikke svart ennå</div></div>
              {endre && <Handling handling={trekkInvitasjon.bind(null, i.id)} tekst="Trekk tilbake" klasse="knapp hvit liten" />}
            </div>
          ))}
        </section>
      )}
      {endre && <section className="kort stakk"><h2>{byraer.length ? 'Inviter en til' : 'Inviter regnskapsføreren'}</h2><InviterRegnskapsforer /></section>}
      <section className="kort mork stakk">
        <b>Slik ser det ut for regnskapsføreren</b>
        <p className="mut">{s.org.navn} dukker opp i arbeidslisten deres sammen med de andre kundene, med funn og frister. Regnskapsførere bruker Rettført Byrå.</p>
      </section>
    </div>
  );
}
