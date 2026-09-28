// Data til Hjem, Frister og Byrå-oversikten.

import type { Sporring } from '../db';
import { kommendeFrister, type MvaTermin, type Orgform } from '../frister';

export async function fristValg(t: Sporring, orgId: string): Promise<{ orgform: Orgform; mvaTermin: MvaTermin; harAnsatte: boolean }> {
  const o = await t.en<{ orgform: string; mva_termin: MvaTermin; mva_registrert: boolean; ansatte: number }>(
    `select orgform, mva_termin, mva_registrert, (select count(*)::int from ansatt a where a.organisasjon_id = o.id and a.aktiv) as ansatte from organisasjon o where id = $1`, [orgId]);
  const orgform = (['AS', 'ENK', 'ANS', 'DA', 'ASA', 'SA', 'NUF'].includes(o!.orgform) ? o!.orgform : 'ANNET') as Orgform;
  return { orgform, mvaTermin: o!.mva_registrert ? o!.mva_termin : 'ingen', harAnsatte: o!.ansatte > 0 };
}

export async function nesteFrister(t: Sporring, orgId: string, idag: string, maneder = 12) {
  return kommendeFrister(idag, maneder, await fristValg(t, orgId));
}

export interface SistRad { type: string; tekst: string; dato: string; belop: number; href: string }

export async function sistRegistrert(t: Sporring, orgId: string, antall = 6): Promise<SistRad[]> {
  const k = await t.q<{ id: string; navn: string; dato: string; total: number; opprettet: string }>(
    `select id, leverandor_navn as navn, dato::text as dato, total, opprettet::text as opprettet from kjop where organisasjon_id = $1 and status <> 'utkast' order by opprettet desc limit $2`, [orgId, antall]);
  const f = await t.q<{ id: string; type: string; nr: number; kunde: string; dato: string; total: number; opprettet: string }>(
    `select f.id, f.type, f.nr, coalesce(c.navn,'') as kunde, f.dato::text as dato, f.total, coalesce(f.sendt_tid, f.opprettet)::text as opprettet from faktura f left join kontakt c on c.id = f.kontakt_id where f.organisasjon_id = $1 and f.status <> 'utkast' order by coalesce(f.sendt_tid, f.opprettet) desc limit $2`, [orgId, antall]);
  const rader = [
    ...k.map(x => ({ o: x.opprettet, r: { type: 'Kjøp', tekst: x.navn, dato: x.dato, belop: -x.total, href: `/kjop/${x.id}` } })),
    ...f.map(x => ({ o: x.opprettet, r: { type: x.type === 'kreditnota' ? 'Kreditnota' : x.type === 'tilbud' ? 'Tilbud' : 'Salg', tekst: `${x.kunde}${x.nr ? ' · nr ' + x.nr : ''}`, dato: x.dato, belop: x.type === 'kreditnota' ? -x.total : x.total, href: `/salg/${x.id}` } })),
  ];
  return rader.sort((a, b) => b.o.localeCompare(a.o)).slice(0, antall).map(x => x.r);
}
