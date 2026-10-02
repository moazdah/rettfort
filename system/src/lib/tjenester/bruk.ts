// Bruken i Gratis: fakturaer og kvitteringer som leses av, per kalendermåned.
// Betalte pakker har ingen grenser. Grensene stopper bare nye, aldri det som allerede er ført.

import type { Sporring } from '../db';
import { RegnskapsFeil } from '../hovedbok';
import { GRATIS_GRENSE, harFulltRegnskap } from '../pakker';

export interface GratisBruk { faktura: number; kvittering: number }

const manedStart = (idag: string) => `${idag.slice(0, 7)}-01`;

/** Fakturaer og salgskvitteringer som er sendt denne måneden. */
export async function sendteFakturaer(t: Sporring, orgId: string, idag: string): Promise<number> {
  const r = await t.en<{ n: number }>(`select count(*)::int as n from faktura where organisasjon_id = $1 and type in ('faktura','kvittering') and nr is not null and coalesce(sendt_tid::date, dato) >= $2::date`, [orgId, manedStart(idag)]);
  return r?.n ?? 0;
}

export async function gratisBruk(t: Sporring, orgId: string, idag: string): Promise<GratisBruk> {
  const k = await t.en<{ antall: number }>(`select antall from pakke_bruk where organisasjon_id = $1 and maned = $2 and hva = 'kvittering'`, [orgId, idag.slice(0, 7)]);
  return { faktura: await sendteFakturaer(t, orgId, idag), kvittering: k?.antall ?? 0 };
}

/** Stopper en ny faktura i Gratis når månedens grense er nådd. */
export async function sjekkFakturaGrense(t: Sporring, orgId: string, pakke: string, idag: string): Promise<void> {
  if (harFulltRegnskap(pakke)) return;
  if (await sendteFakturaer(t, orgId, idag) >= GRATIS_GRENSE.faktura) {
    throw new RegnskapsFeil(`Du har sendt ${GRATIS_GRENSE.faktura} fakturaer denne måneden, som er det som er med i Gratis. Med Start sender du så mange du vil. Oppgrader under Innstillinger → Abonnement.`);
  }
}

/** Teller én kvittering som leses av. Gir hvor mange som er igjen denne måneden, eller null når det ikke er noen grense. */
export async function taKvitteringslesing(t: Sporring, orgId: string, pakke: string, idag: string): Promise<number | null> {
  if (harFulltRegnskap(pakke)) return null;
  const maned = idag.slice(0, 7);
  const r = await t.en<{ antall: number }>(`insert into pakke_bruk (organisasjon_id, maned, hva, antall) values ($1, $2, 'kvittering', 1)
    on conflict (organisasjon_id, maned, hva) do update set antall = pakke_bruk.antall + 1 where pakke_bruk.antall < $3 returning antall`, [orgId, maned, GRATIS_GRENSE.kvittering]);
  if (!r) throw new RegnskapsFeil(`Du har lest av ${GRATIS_GRENSE.kvittering} kvitteringer denne måneden, som er det som er med i Gratis. Fyll inn feltene selv, eller oppgrader til Start for å lese av så mange du vil.`);
  return GRATIS_GRENSE.kvittering - r.antall;
}
