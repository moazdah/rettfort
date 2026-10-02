// MVA-meldingen i fire steg: bilag på plass → kontroll uten funn → se over tallene → send.

import type { Sporring } from '../db';
import { mvaMelding, saldobalanse, type MvaMelding } from '../rapporter';
import { byggMvaOppgjor, RegnskapsFeil } from '../hovedbok';
import { bokfor, hentPosteringer, laasPeriode } from './bokforing';
import { mvaTerminer } from '../frister';
import { kontrollFunn, type KontrollFunn } from './kontroll';

export interface Termin { fra: string; til: string; frist: string; tittel: string }

export function terminFor(dato: string, type: 'tomnd' | 'aar'): Termin {
  const ar = Number(dato.slice(0, 4));
  if (type === 'aar') return { fra: `${ar}-01-01`, til: `${ar}-12-31`, frist: `${ar + 1}-03-10`, tittel: `MVA for ${ar}` };
  const t = mvaTerminer(ar).find(x => dato >= x.periodeFra! && dato <= x.periodeTil!)!;
  return { fra: t.periodeFra!, til: t.periodeTil!, frist: t.dato, tittel: t.tittel };
}

/** Terminen som skal leveres nå: den siste avsluttede terminen som ikke er sendt. */
export async function aktuellTermin(t: Sporring, orgId: string, idag: string): Promise<Termin | null> {
  const org = await t.en<{ mva_termin: 'tomnd' | 'aar' | 'ingen'; mva_registrert: boolean }>('select mva_termin, mva_registrert from organisasjon where id = $1', [orgId]);
  if (!org || !org.mva_registrert || org.mva_termin === 'ingen') return null;
  const naa = terminFor(idag, org.mva_termin);
  // Forrige termin: dagen før denne terminen startet
  const d = new Date(naa.fra + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 1);
  const forrige = terminFor(d.toISOString().slice(0, 10), org.mva_termin);
  const sendt = await t.en('select 1 from mva_melding where organisasjon_id = $1 and fra = $2', [orgId, forrige.fra]);
  return sendt ? naa : forrige;
}

export interface MvaStatus {
  termin: Termin;
  manglerBilag: { id: string; dato: string; tekst: string; belop: number }[];
  funn: KontrollFunn[];
  tall: MvaMelding;
  sendt: { tid: string; aBetale: number; kanal: string } | null;
  antallMangler: number;
}

export async function mvaStatus(t: Sporring, orgId: string, termin: Termin): Promise<MvaStatus> {
  const manglerBilag = await t.q<{ id: string; dato: string; tekst: string; belop: number }>(
    `select id, dato::text as dato, tekst, belop from bankbevegelse where organisasjon_id = $1 and dato between $2 and $3 and status in ('apen') and belop < 0 order by dato`, [orgId, termin.fra, termin.til]);
  const funn = (await kontrollFunn(t, orgId, termin.fra, termin.til)).filter(f => f.alvor === 'hoy');
  const rader = await hentPosteringer(t, orgId, termin.fra, termin.til);
  const tall = mvaMelding(rader, termin.fra, termin.til);
  const s = await t.en<{ tid: string; a_betale: number; kanal: string }>('select sendt_tid::text as tid, a_betale, kanal from mva_melding where organisasjon_id = $1 and fra = $2', [orgId, termin.fra]);
  return { termin, manglerBilag, funn, tall, sendt: s ? { tid: s.tid, aBetale: s.a_betale, kanal: s.kanal } : null, antallMangler: manglerBilag.length + funn.length };
}

/**
 * Sender (registrerer) MVA-meldingen: fører oppgjøret mot 2740 og låser terminen.
 * Innsending til Altinn krever systemleverandøravtale og Maskinporten, og kobles på senere. Til da
 * sender brukeren tallene i Altinn selv, og vi registrerer at det er gjort.
 */
export async function sendMva(t: Sporring, orgId: string, termin: Termin, brukerId?: string | null): Promise<{ aBetale: number }> {
  const s = await mvaStatus(t, orgId, termin);
  if (s.sendt) throw new RegnskapsFeil('MVA-meldingen for terminen er allerede sendt.');
  if (s.antallMangler) throw new RegnskapsFeil(`${s.antallMangler} ting mangler før du kan sende.`);
  const sb = saldobalanse(await hentPosteringer(t, orgId, termin.fra, termin.til));
  const s2700 = sb.get(2700)?.saldo ?? 0, s2710 = sb.get(2710)?.saldo ?? 0;
  let bilagId: string | null = null;
  if (s2700 !== 0 || s2710 !== 0) {
    const b = await bokfor(t, orgId, { dato: termin.til, type: 'mva_oppgjor', beskrivelse: termin.tittel, brukerId, kilde: 'mva' }, byggMvaOppgjor(s2700, s2710));
    bilagId = b.id;
  }
  const aBetale = -(s2700 + s2710);
  if (aBetale !== s.tall.aBetale) throw new RegnskapsFeil('MVA-kontoene stemmer ikke med meldingen. Ta kontakt med regnskapsføreren.');
  await t.q('insert into mva_melding (organisasjon_id, fra, til, a_betale, linjer, bilag_id, sendt_av) values ($1,$2,$3,$4,$5,$6,$7)', [orgId, termin.fra, termin.til, aBetale, JSON.stringify(s.tall.linjer), bilagId, brukerId ?? null]);
  await laasPeriode(t, orgId, termin.til, `${termin.tittel} sendt`, brukerId);
  return { aBetale };
}
