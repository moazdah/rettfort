// Løpende kontroll av regnskapet. Funnene regnes ut fra dataene hver gang (ingen utdaterte funn).
// Brukeren kan markere et funn som vurdert; det lagres i kontrollfunn med status 'ignorert'.

import type { Sporring } from '../db';
import { kr } from '../penger';

export interface KontrollFunn {
  id: string; // kode:ref
  kode: string;
  alvor: 'hoy' | 'middels' | 'info';
  tekst: string;
  handling?: string;
  refType?: string;
  refId?: string;
  dato?: string;
}

const nd = (d: string) => d.split('-').reverse().join('.');

export async function kontrollFunn(t: Sporring, orgId: string, fra: string, til: string, idag?: string): Promise<KontrollFunn[]> {
  const ut: KontrollFunn[] = [];
  // 1) Fradrag for MVA fra leverandør som ikke er i MVA-registeret
  const ikkeMva = await t.q<{ id: string; navn: string; mva: number; dato: string }>(
    `select k.id, k.leverandor_navn as navn, k.mva, k.dato::text as dato from kjop k join kontakt c on c.id = k.kontakt_id
     where k.organisasjon_id = $1 and k.dato between $2 and $3 and k.status <> 'utkast' and k.mva > 0 and c.mva_registrert = false`, [orgId, fra, til]);
  for (const x of ikkeMva) ut.push({ id: `ikke_mva_reg:${x.id}`, kode: 'ikke_mva_reg', alvor: 'hoy', tekst: `${x.navn} ${nd(x.dato)} er ført med ${kr(x.mva)} kr i MVA-fradrag, men ${x.navn} finnes ikke i MVA-registeret.`, handling: 'Rett kjøpet', refType: 'kjop', refId: x.id, dato: x.dato });

  // 2) Mulige dobbeltføringer
  const dup = await t.q<{ a: string; b: string; navn: string; total: number; dato: string }>(
    `select a.id as a, b.id as b, a.leverandor_navn as navn, a.total, a.dato::text as dato from kjop a join kjop b on a.organisasjon_id = b.organisasjon_id and lower(a.leverandor_navn) = lower(b.leverandor_navn) and a.total = b.total and abs(a.dato - b.dato) <= 3 and a.id < b.id
     where a.organisasjon_id = $1 and a.dato between $2 and $3 and a.status <> 'utkast' and b.status <> 'utkast'
       and not exists (select 1 from bilag x where x.korrigerer_id = b.bilag_id) and not exists (select 1 from bilag x where x.korrigerer_id = a.bilag_id)`, [orgId, fra, til]);
  for (const x of dup) ut.push({ id: `duplikat:${x.b}`, kode: 'duplikat', alvor: 'hoy', tekst: `${x.navn} ${kr(x.total)} kr er ført to ganger rundt ${nd(x.dato)}.`, handling: 'Se kjøpene', refType: 'kjop', refId: x.b, dato: x.dato });

  // 3) Kjøp uten kvittering
  const utenKv = await t.q<{ id: string; navn: string; total: number; dato: string }>(
    `select id, leverandor_navn as navn, total, dato::text as dato from kjop where organisasjon_id = $1 and dato between $2 and $3 and status <> 'utkast' and vedlegg_id is null and coalesce(kilde,'') <> 'ehf'`, [orgId, fra, til]);
  for (const x of utenKv) ut.push({ id: `kvittering:${x.id}`, kode: 'kvittering', alvor: 'middels', tekst: `${x.navn} ${nd(x.dato)} · ${kr(x.total)} kr har ingen kvittering lagt ved.`, handling: 'Legg ved', refType: 'kjop', refId: x.id, dato: x.dato });

  // 4) Forfalte fakturaer
  if (idag) {
    const forfalt = await t.q<{ id: string; nr: number; kunde: string; rest: number; forfall: string }>(
      `select f.id, f.nr, coalesce(c.navn,'') as kunde, (f.total - f.betalt - coalesce((select sum(k.total) from faktura k where k.krediterer_id = f.id and k.status <> 'utkast'),0))::bigint as rest, f.forfall::text as forfall from faktura f left join kontakt c on c.id = f.kontakt_id
       where f.organisasjon_id = $1 and f.type = 'faktura' and f.status in ('sendt','delvis_betalt') and f.forfall < $2`, [orgId, idag]);
    for (const x of forfalt.filter(y => y.rest > 0)) ut.push({ id: `forfalt:${x.id}`, kode: 'forfalt', alvor: 'info', tekst: `Faktura ${x.nr} til ${x.kunde} forfalt ${nd(x.forfall)}. ${kr(x.rest)} kr er ikke betalt.`, handling: 'Send purring', refType: 'faktura', refId: x.id, dato: x.forfall });
  }

  // 5) Bankmåneder i perioden som ikke er avstemt
  const mnd = await t.q<{ maned: string; status: string }>(`select maned, status from kontoutskrift where organisasjon_id = $1 and maned between $2 and $3`, [orgId, fra.slice(0, 7), til.slice(0, 7)]);
  for (const m of mnd.filter(x => x.status !== 'ferdig')) ut.push({ id: `bank:${m.maned}`, kode: 'bank', alvor: 'middels', tekst: `Banken for ${m.maned.split('-').reverse().join('.')} er ikke avstemt ferdig.`, handling: 'Gå til Bank' });

  const ignorert = new Set((await t.q<{ kode: string }>(`select kode from kontrollfunn where organisasjon_id = $1 and status = 'ignorert'`, [orgId])).map(x => x.kode));
  return ut.filter(f => !ignorert.has(f.id));
}

export async function vurderFunn(t: Sporring, orgId: string, id: string, tekst: string): Promise<void> {
  await t.q(`insert into kontrollfunn (organisasjon_id, kode, tekst, status) values ($1,$2,$3,'ignorert')`, [orgId, id, tekst]);
}
