// Varsler fra vaktplanen på e-post. Hver e-post har en ny innloggingslenke, så den ansatte kommer rett inn.
// SMS kommer når en SMS-tjeneste er koblet til; ansatte med bare mobilnummer varsles ikke ennå.

import type { Db } from '../db';
import { sendEpost, maler } from '../epost';
import { kortTid, ukeDager } from '../vaktplan';
import { nyLenke, publiser, vakterMellom } from './vaktplan';
import { tilVaktplan } from '../verter';

const DAGNAVN = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
export const dagTekst = (d: string) => { const x = new Date(`${d}T12:00:00Z`); return `${DAGNAVN[x.getUTCDay()]} ${x.getUTCDate()}.${x.getUTCMonth() + 1}.`; };

export async function varsleAnsatt(db: Db, base: string, orgId: string, foretak: string, ansattId: string, tittel: string, linjer: string[]): Promise<boolean> {
  const a = await db.en<{ navn: string; epost: string | null; kontakt: string | null; bruker_id: string | null }>('select navn, epost, kontakt, bruker_id from ansatt where id = $1 and organisasjon_id = $2', [ansattId, orgId]);
  const til = a?.epost ?? (a?.kontakt?.includes('@') ? a.kontakt : null);
  if (!a || !til || !a.bruker_id) return false;
  const lenke = `${tilVaktplan(base)}/vakt/inn/${await nyLenke(db, ansattId)}`;
  return sendEpost({ til, ...maler.vakt({ navn: a.navn, foretak, tittel, linjer, knappTekst: 'Åpne vaktplanen', lenke }) });
}

/** Leder får beskjed om nye forespørsler, høyst én gang i timen. */
export async function varsleLeder(db: Db, base: string, orgId: string, foretak: string, hva: string) {
  const o = await db.en<{ ok: boolean }>(`update organisasjon set vakt_varslet = now() where id = $1 and (vakt_varslet is null or vakt_varslet < now() - interval '1 hour') returning true as ok`, [orgId]);
  if (!o) return;
  const ledere = await db.q<{ navn: string; epost: string }>(`select b.navn, b.epost from medlemskap m join bruker b on b.id = m.bruker_id where m.organisasjon_id = $1 and m.rolle in ('eier','full') and b.epost not like '%.invalid'`, [orgId]);
  for (const l of ledere) await sendEpost({ til: l.epost, ...maler.vakt({ navn: l.navn, foretak, tittel: 'Vaktplanen trenger svar', linjer: [hva, 'Svar under Vaktplan.'], knappTekst: 'Åpne vaktplanen', lenke: `${tilVaktplan(base)}/vaktplan` }) });
}

/** Publiserer uka og sender vaktene til dem det gjelder. */
export async function publiserOgVarsle(db: Db, base: string, orgId: string, foretak: string, aar: number, uke: number): Promise<{ varslet: number; uten: number }> {
  const p = await db.tx(t => publiser(t, orgId, aar, uke));
  const d = ukeDager(aar, uke);
  const alle = await vakterMellom(db, orgId, d[0], d[6]);
  let varslet = 0;
  for (const id of p.varsle) {
    const mine = alle.filter(v => v.ansattId === id);
    const linjer = mine.length ? [`Vaktene dine i uke ${uke}:`, ...mine.map(v => `${dagTekst(v.dato)}: ${kortTid(v.start, v.slutt)}`)] : [`Du har ingen vakter i uke ${uke} lenger.`];
    if (await varsleAnsatt(db, base, orgId, foretak, id, p.forste ? `Vaktplan for uke ${uke}` : `Endringer i uke ${uke}`, linjer)) varslet++;
  }
  return { varslet, uten: p.varsle.length - varslet };
}
