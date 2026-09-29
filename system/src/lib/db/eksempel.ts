// Lager et testfirma med fiktivt organisasjonsnummer og realistisk aktivitet fra 1. januar til i dag:
// fakturaer (noen betalt, noen ubetalt, én forfalt), kjøp, lønn, MVA og skattetrekk betalt ved fristene, og en kontoutskrift.
// Organisasjonsnumrene begynner på 3. Brønnøysund deler bare ut numre som begynner på 8 eller 9, så de
// kan aldri tilhøre et ekte foretak.

import type { Sporring, Db } from './index';
import { bokfor } from '../tjenester/bokforing';
import { lagreSalg, sendSalg, registrerBetaling } from '../tjenester/faktura';
import { registrerKjop, finnEllerLagKontakt } from '../tjenester/kjop';
import { kjorLonn, trekkOgAga } from '../tjenester/lonn';
import { byggMvaBetaling, byggSkattAgaBetaling } from '../hovedbok';
import { sendMva, terminFor } from '../tjenester/mva';
import { importerKontoutskrift } from '../tjenester/bank';

export const TESTFIRMA_ORGNR = '315000009';

const p2 = (n: number) => String(n).padStart(2, '0');
const sisteDag = (ar: number, m: number) => new Date(Date.UTC(ar, m, 0)).getUTCDate();

/** Oppretter testfirmaet for brukeren og fyller det. Gir id-en til firmaet. */
export async function lagTestfirma(db: Db, brukerId: string, fornavn: string, idag: string): Promise<string> {
  const ar = Number(idag.slice(0, 4));
  const org = await db.tx(async (t: Sporring) => {
    const slug = `testfirma-${Math.random().toString(36).slice(2, 7)}`;
    const o = await t.en<{ id: string }>(`insert into organisasjon (type, navn, orgnr, orgform, stiftet, adresse, postnr, poststed, kommunenr, epost, telefon, kontonr, mva_registrert, mva_termin, regnskap_fra, nace, pakke, bilag_slug, aga_sone, lonningsdag)
      values ('selskap','Testfirma AS',$1,'AS','2024-02-01','Testveien 1','0150','Oslo','0301','post@testfirma.no','22 00 00 00','12345600009',true,'tomnd',$2,'62.100','selskap',$3,'1',25) returning id`, [TESTFIRMA_ORGNR, `${ar}-01-01`, slug]);
    await t.q(`insert into medlemskap (bruker_id, organisasjon_id, rolle) values ($1,$2,'eier')`, [brukerId, o!.id]);
    return o!.id;
  });
  await fyll(db, org, fornavn, idag);
  return org;
}

async function fyll(db: Db, org: string, fornavn: string, idag: string) {
  const ar = Number(idag.slice(0, 4)), naMnd = Number(idag.slice(5, 7));
  const k = await db.tx(async t => ({
    fjord: await finnEllerLagKontakt(t, org, 'kunde', 'Fjordlys Media AS', '315000017', { adresse: 'Bryggen 3', postnr: '5003', poststed: 'Bergen', epost: 'faktura@fjordlys.test' }),
    nordvik: await finnEllerLagKontakt(t, org, 'kunde', 'Nordvik Bygg AS', '315000025', { adresse: 'Industriveien 8', postnr: '7080', poststed: 'Heimdal', epost: 'post@nordvik.test' }),
    solberg: await finnEllerLagKontakt(t, org, 'kunde', 'Solberg Tannklinikk AS', '315000033', { adresse: 'Torget 2', postnr: '3015', poststed: 'Drammen' }),
    kontor: await finnEllerLagKontakt(t, org, 'leverandor', 'Kontorpartner AS', '315000041', { mvaRegistrert: true }),
  }));

  // Åpningsbalanse: penger i banken og egenkapital
  await db.tx(t => bokfor(t, org, { dato: `${ar}-01-01`, type: 'apning', beskrivelse: 'Åpningsbalanse' }, [
    { konto: 1920, debet: 15000000, kredit: 0 }, { konto: 2000, debet: 0, kredit: 3000000 }, { konto: 2050, debet: 0, kredit: 12000000 },
  ]));

  // Lønn: én fast ansatt fra januar
  await db.q(`insert into ansatt (organisasjon_id, navn, epost, stilling, lonn_type, manedslonn, skatteprosent, kontonr, startdato) values ($1, $2, 'ansatt@testfirma.no', 'Daglig leder', 'fast', 4200000, 31, '12345600017', $3)`, [org, `${fornavn} Testesen`, `${ar}-01-01`]);

  const kunder = [k.fjord, k.nordvik, k.solberg];
  for (let m = 1; m <= naMnd; m++) {
    const mm = p2(m), naa = m === naMnd, forrige = m === naMnd - 1;
    const dag = (d: number) => `${ar}-${mm}-${p2(Math.min(d, naa ? Number(idag.slice(8, 10)) : sisteDag(ar, m)))}`;

    // Salg: to fakturaer i måneden. Denne måneden er ubetalt; forrige måned har én forfalt.
    for (let j = 0; j < 2; j++) {
      const kunde = kunder[(m + j) % 3];
      const timer = 26 + ((m * 7 + j * 5) % 20);
      const d = dag(4 + j * 10);
      const f = await db.tx(t => lagreSalg(t, org, { type: 'faktura', kontaktId: kunde, dato: d, forfall: forfallEtter(d, 14), linjer: [
        { beskrivelse: `Rådgivning ${mm}.${ar}`, antallMilli: timer * 1000, pris: 130000, sats: 25 },
        ...(j === 0 ? [{ beskrivelse: 'Programvarelisens', antallMilli: 1000, pris: 49000, sats: 25 }] : []),
      ] }));
      await db.tx(t => sendSalg(t, org, f));
      const tot = (await db.en<{ total: number }>('select total from faktura where id = $1', [f]))!.total;
      const betales = !naa && !(forrige && j === 1);
      if (betales && forfallEtter(d, 12) <= idag) await db.tx(t => registrerBetaling(t, org, f, tot, forfallEtter(d, 12)));
    }

    // Skattetrekk og arbeidsgiveravgift for forrige termin (to måneder) betales den 15. i jan, mar, mai, jul, sep, nov.
    if (m % 2 === 1 && m >= 3 && `${ar}-${mm}-15` <= idag) {
      const { skatt, aga } = await db.tx(t => trekkOgAga(t, org, `${ar}-${p2(m - 2)}-01`, `${ar}-${p2(m - 1)}-${p2(sisteDag(ar, m - 1))}`));
      if (skatt + aga > 0) await db.tx(t => bokfor(t, org, { dato: `${ar}-${mm}-15`, type: 'bank', beskrivelse: 'Skattetrekk og arbeidsgiveravgift' }, byggSkattAgaBetaling(skatt, aga)));
    }

    // MVA: meldingen sendes og betales på fristen.
    for (let tm = 1; tm < m; tm += 2) {
      const termin = terminFor(`${ar}-${p2(tm)}-15`, 'tomnd');
      if (termin.frist.slice(5, 7) !== mm || termin.frist > idag) continue;
      const { aBetale } = await db.tx(t => sendMva(t, org, termin));
      if (aBetale > 0) await db.tx(t => bokfor(t, org, { dato: termin.frist, type: 'bank', beskrivelse: 'MVA til Skatteetaten' }, byggMvaBetaling(-aBetale)));
    }

    // Faste kostnader
    const betalt = (d: string) => d <= idag;
    const kjop = async (lev: string, d: string, total: number, sats: number, konto: number, tekst: string, betaltMed: 'bank' | 'ubetalt' = 'bank', forfall?: string) => {
      if (!betalt(d)) return;
      const mva = sats ? Math.round((total * sats) / (100 + sats)) : 0;
      await db.tx(t => registrerKjop(t, org, { leverandorNavn: lev, dato: d, total, mva, sats, konto, betaltMed, forfall: forfall ?? null, tekst, kilde: 'uten_kvittering' }));
    };
    await kjop('Kontorhotellet AS', dag(1), 1250000, 0, 6300, 'husleie kontor');
    await kjop('Telia Norge AS', dag(2), 59900, 25, 6900, 'mobil og internett');
    await kjop('Microsoft Norge AS', dag(3), 31200, 25, 6540, 'Microsoft 365');
    if (m % 2 === 0) await kjop('Vy', dag(9), 164800, 12, 7130, 'togreise til kunde');
    if (m % 3 === 1) await kjop('Rema 1000', dag(16), 48750, 15, 7350, 'kaffe og frukt til møte');
    if (m === 3) await kjop('Elkjøp Norge AS', dag(11), 1499000, 25, 6551, 'bærbar PC');
    if (naa) await kjop('Kontorpartner AS', dag(1), 289000, 25, 6800, 'kontorrekvisita', 'ubetalt', forfallEtter(dag(1), 30));

    // Lønn den 25. (bare for måneder som er ferdige eller der lønningsdagen har vært)
    if (`${ar}-${mm}-25` <= idag) await db.tx(t => kjorLonn(t, org, `${ar}-${mm}`, `${ar}-${mm}-25`, []));
  }

  // Kontoutskrift for forrige måned: det som er ført, pluss ett kjøp uten kvittering.
  if (naMnd > 1) {
    const fm = p2(naMnd - 1), fra = `${ar}-${fm}-01`, til = `${ar}-${fm}-${p2(sisteDag(ar, naMnd - 1))}`;
    const saldo = await db.en<{ s: number }>(`select coalesce(sum(debet - kredit),0)::bigint as s from postering where organisasjon_id = $1 and konto = 1920 and dato < $2`, [org, fra]);
    const bank = await db.q<{ dato: string; belop: number; tekst: string }>(
      `select b.dato::text as dato, sum(p.debet - p.kredit)::bigint as belop, coalesce(b.beskrivelse,'') as tekst from bilag b join postering p on p.bilag_id = b.id and p.konto = 1920
       where b.organisasjon_id = $1 and b.dato between $2 and $3 group by b.id, b.dato, b.beskrivelse order by b.dato`, [org, fra, til]);
    const linjer: [string, string, number][] = bank.map(x => [x.dato, x.tekst.toUpperCase(), x.belop]);
    linjer.push([`${ar}-${fm}-18`, 'VISA CIRCLE K MAJORSTUEN', -71250]);
    linjer.sort((a, b) => a[0].localeCompare(b[0]));
    let s = saldo?.s ?? 0;
    const nok = (o: number) => (o / 100).toFixed(2).replace('.', ',');
    const csv = ['Dato;Forklaring;Beløp;Saldo', ...linjer.map(([d, tekst, b]) => { s += b; return `${d.split('-').reverse().join('.')};${tekst};${nok(b)};${nok(s)}`; })].join('\n');
    await db.tx(t => importerKontoutskrift(t, org, csv, `kontoutskrift-${ar}-${fm}.csv`));
  }
}

function forfallEtter(dato: string, dager: number): string {
  const d = new Date(dato + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + dager);
  return d.toISOString().slice(0, 10);
}
