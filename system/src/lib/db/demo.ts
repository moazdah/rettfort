// Eksempeldata for testmodus (når databasen ikke er koblet til). Kjøres bare i PGlite.
// Innlogging: demo@rettfort.no / rettfort-demo (bedrift) og regnskap@rettfort.no / rettfort-demo (byrå).

import type { Db } from './index';
import { hashPassord } from '../auth';
import { bokfor } from '../tjenester/bokforing';
import { lagreSalg, sendSalg, registrerBetaling } from '../tjenester/faktura';
import { registrerKjop, finnEllerLagKontakt } from '../tjenester/kjop';
import { kjorLonn } from '../tjenester/lonn';
import { sendMva, terminFor } from '../tjenester/mva';
import { importerKontoutskrift } from '../tjenester/bank';

export const DEMO_BRUKER = 'demo@rettfort.no';
export const DEMO_BYRA = 'regnskap@rettfort.no';
export const DEMO_PASSORD = 'rettfort-demo';

export async function seedDemo(db: Db): Promise<void> {
  const finnes = await db.en('select 1 from bruker where epost = $1', [DEMO_BRUKER]);
  if (finnes) return;
  const hash = await hashPassord(DEMO_PASSORD);
  await db.tx(async t => {
    const b = await t.en<{ id: string }>(`insert into bruker (epost, navn, passord_hash, epost_bekreftet) values ($1, 'Kari Havøy', $2, true) returning id`, [DEMO_BRUKER, hash]);
    const o = await t.en<{ id: string }>(`insert into organisasjon (type, navn, orgnr, orgform, stiftet, adresse, postnr, poststed, kommunenr, epost, telefon, kontonr, mva_registrert, mva_termin, regnskap_fra, nace, pakke, bilag_slug, aga_sone, lonningsdag)
      values ('selskap','Havøy Fisk AS','912345688','AS','2019-03-14','Strandveien 12','9008','Tromsø','5501','post@havoyfisk.no','77 60 12 34','15062233445',true,'tomnd','2026-01-01','03.1','start','havoy-fisk','4a',25) returning id`);
    await t.q(`insert into medlemskap (bruker_id, organisasjon_id, rolle) values ($1,$2,'eier')`, [b!.id, o!.id]);
    const by = await t.en<{ id: string }>(`insert into bruker (epost, navn, passord_hash, epost_bekreftet) values ($1, 'Dina Berg', $2, true) returning id`, [DEMO_BYRA, hash]);
    const byra = await t.en<{ id: string }>(`insert into organisasjon (type, navn, orgnr, orgform, adresse, postnr, poststed, pakke) values ('byra','Berg & Holm Regnskap AS','923456791','AS','Storgata 1','9008','Tromsø','byra') returning id`);
    await t.q(`insert into medlemskap (bruker_id, organisasjon_id, rolle) values ($1,$2,'eier')`, [by!.id, byra!.id]);
    await t.q(`insert into byra_kunde (byra_id, selskap_id, status) values ($1,$2,'aktiv')`, [byra!.id, o!.id]);
  });
  const org = (await db.en<{ id: string }>(`select id from organisasjon where bilag_slug = 'havoy-fisk'`))!.id;

  const kunder = await db.tx(async t => ({
    kvam: await finnEllerLagKontakt(t, org, 'kunde', 'Kvam Transport AS', '923456783', { adresse: 'Kvamsveien 1', postnr: '5600', poststed: 'Norheimsund', epost: 'faktura@kvamtransport.no' }),
    lyngen: await finnEllerLagKontakt(t, org, 'kunde', 'Lyngen Bygg AS', null, { adresse: 'Fjordveien 4', postnr: '9060', poststed: 'Lyngseidet' }),
    nordlys: await finnEllerLagKontakt(t, org, 'leverandor', 'Nordlys Kontor AS', null, { mvaRegistrert: true }),
  }));

  // Åpningsbalanse 1. januar
  await db.tx(t => bokfor(t, org, { dato: '2026-01-01', type: 'apning', beskrivelse: 'Åpningsbalanse fra forrige system' }, [
    { konto: 1920, debet: 6000000, kredit: 0 }, { konto: 1500, debet: 1250000, kredit: 0, kontaktId: kunder.kvam },
    { konto: 2000, debet: 0, kredit: 3000000 }, { konto: 2050, debet: 0, kredit: 4250000 },
  ]));

  // Salg og kjøp gjennom året
  const mnd = ['01', '02', '03', '04', '05', '06', '07', '08', '09'];
  let i = 0;
  for (const m of mnd) {
    i++;
    const f = await db.tx(t => lagreSalg(t, org, { type: 'faktura', kontaktId: i % 2 ? kunder.kvam : kunder.lyngen, dato: `2026-${m}-05`, forfall: `2026-${m}-19`, linjer: [{ beskrivelse: `Konsulenttimer ${m}.2026`, antallMilli: (20 + i) * 1000, pris: 115000, sats: 25 }] }));
    await db.tx(t => sendSalg(t, org, f));
    const tot = (await db.en<{ total: number }>('select total from faktura where id = $1', [f]))!.total;
    if (m !== '09') await db.tx(t => registrerBetaling(t, org, f, tot, `2026-${m}-18`));
    await db.tx(t => registrerKjop(t, org, { leverandorNavn: 'Telenor Norge AS', leverandorOrgnr: '976967631', dato: `2026-${m}-01`, total: 44900, mva: 8980, sats: 25, konto: 6900, betaltMed: 'bank', tekst: 'mobilabonnement', kilde: 'ehf' }));
    await db.tx(t => registrerKjop(t, org, { leverandorNavn: 'Tromsø Eiendom AS', dato: `2026-${m}-01`, total: 800000, mva: 0, sats: 0, konto: 6300, betaltMed: 'bank', tekst: 'husleie', kilde: 'ehf' }));
    if (i % 3 === 0) await db.tx(t => registrerKjop(t, org, { leverandorNavn: 'Circle K', dato: `2026-${m}-14`, total: 81240, mva: 16248, sats: 25, konto: 7000, betaltMed: 'bank', tekst: 'drivstoff', kilde: 'uten_kvittering' }));
  }
  await db.tx(t => registrerKjop(t, org, { leverandorNavn: 'Nordlys Kontor AS', kontaktId: kunder.nordlys, dato: '2026-09-20', forfall: '2026-10-18', total: 299000, mva: 59800, sats: 25, konto: 6800, betaltMed: 'ubetalt', tekst: 'kontorrekvisita', kilde: 'ehf' }));

  // Lønn
  await db.q(`insert into ansatt (organisasjon_id, navn, epost, stilling, lonn_type, manedslonn, skatteprosent, kontonr, startdato) values ($1, 'Sara Havøy', 'sara@havoyfisk.no', 'Daglig leder', 'fast', 4500000, 32, '15063344556', '2024-01-01'), ($1, 'Ola Nilsen', 'ola@havoyfisk.no', 'Fisker', 'time', 0, 28, '15064455667', '2025-05-01')`, [org]);
  const ola = (await db.en<{ id: string }>(`select id from ansatt where navn = 'Ola Nilsen' and organisasjon_id = $1`, [org]))!.id;
  for (const m of mnd) await db.tx(t => kjorLonn(t, org, `2026-${m}`, `2026-${m}-25`, [{ ansattId: ola, timer: 120 + Number(m) * 3 }]));

  // Terminene januar–august er sendt
  for (const d of ['2026-01-15', '2026-03-15', '2026-05-15']) {
    const termin = terminFor(d, 'tomnd');
    await db.tx(t => sendMva(t, org, termin)).catch(() => { /* hopper over hvis noe mangler */ });
  }

  // Et funn for kontrollen: fradrag for MVA fra en snekker som ikke er i MVA-registeret
  const snekker = await db.tx(t => finnEllerLagKontakt(t, org, 'leverandor', 'Fjellheim Snekkerservice', null, { mvaRegistrert: false }));
  await db.tx(t => registrerKjop(t, org, { leverandorNavn: 'Fjellheim Snekkerservice', kontaktId: snekker, dato: '2026-08-12', total: 437500, mva: 87500, sats: 25, konto: 6600, betaltMed: 'bank', tekst: 'reparasjon av kai', kilde: 'uten_kvittering' }));

  // Kontoutskrift for august: alt i regnskapet finnes igjen, pluss to kjøp uten kvittering
  const saldo = await db.en<{ s: number }>(`select coalesce(sum(debet - kredit),0)::bigint as s from postering where organisasjon_id = $1 and konto = 1920 and dato < '2026-08-01'`, [org]);
  const bank = await db.q<{ dato: string; belop: number; tekst: string }>(
    `select b.dato::text as dato, sum(p.debet - p.kredit)::bigint as belop, coalesce(b.beskrivelse,'') as tekst from bilag b join postering p on p.bilag_id = b.id and p.konto = 1920
     where b.organisasjon_id = $1 and b.dato between '2026-08-01' and '2026-08-31' group by b.id, b.dato, b.beskrivelse order by b.dato`, [org]);
  const linjer: [string, string, number][] = bank.map(x => [x.dato, x.tekst.toUpperCase(), x.belop]);
  linjer.push(['2026-08-04', 'VISA CIRCLE K SANDNESSJØEN', -61200], ['2026-08-15', 'ADOBE *CREATIVE CLOUD', -23900]);
  linjer.sort((a, b) => a[0].localeCompare(b[0]));
  let s = saldo?.s ?? 0;
  const nok = (o: number) => (o / 100).toFixed(2).replace('.', ',');
  const csv = ['Dato;Forklaring;Beløp;Saldo', ...linjer.map(([d, tekst, b]) => { s += b; return `${d.split('-').reverse().join('.')};${tekst};${nok(b)};${nok(s)}`; })].join('\n');
  await db.tx(t => importerKontoutskrift(t, org, csv, 'kontoutskrift-august.csv'));
}
