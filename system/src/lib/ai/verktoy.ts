// Verktøyene assistenten kan bruke. Lesing svarer med tall fra regnskapet. Alt som endrer noe, blir et
// forslag som lagres og vises som et kort i chatten; det utføres først når brukeren velger det.
// Modellen regner aldri selv: summer, MVA og KID kommer fra regnskapsmotoren.

import type { Db, Sporring } from '../db';
import type { Verktoy } from './modell';
import { RegnskapsFeil, fakturaSummer, type FakturaLinje } from '../hovedbok';
import { rapportData } from '../tjenester/rapport';
import { hentFakta } from '../tjenester/assistent';
import { aktuellTermin, mvaStatus } from '../tjenester/mva';
import { hentOrg, forfallFra } from '../tjenester/faktura';
import { finnDuplikat } from '../tjenester/kjop';
import { foreslaKonto, konto as finnKonto, kontoType } from '../kontoplan';
import { splittBrutto } from '../penger';

export interface Ktx { db: Db; orgId: string; brukerId: string; idag: string; kanEndre: boolean }

export type Kort =
  | { type: 'forslag'; id: string; art: Art; status: string; data: Record<string, unknown>; melding?: string; lenke?: string }
  | { type: 'graf_maned'; ar: number; maneder: { maned: number; inn: number; ut: number; resultat: number; topp: { navn: string; belop: number }[]; bilag: number }[] }
  | { type: 'tabell_fakturaer'; tittel: string; rader: { id: string; nr: number; kunde: string; forfall: string | null; rest: number; forfalt: boolean }[] }
  | { type: 'liste'; tittel: string; rader: { navn: string; belop: number; lenke?: string }[] };

export type Art = 'faktura' | 'kostnad' | 'betaling' | 'purring' | 'kreditnota' | 'mva';

const tall = (v: unknown, navn: string) => { const n = Number(v); if (!Number.isFinite(n)) throw new RegnskapsFeil(`Mangler ${navn}.`); return n; };
const ore = (kr: unknown, navn: string) => Math.round(tall(kr, navn) * 100);
const dato = (v: unknown, std: string) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : std);

export const VERKTOY: Verktoy[] = [
  { type: 'function', function: { name: 'hent_oversikt', description: 'Nøkkeltall nå: saldo i bank, resultat hittil i år, hvem som skylder oss, hva vi skylder, MVA-status og neste frister.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'sok_kunde', description: 'Finn kunder på navn eller org.nr. Bruk før du lager faktura, så du har riktig kunde_id.', parameters: { type: 'object', properties: { sok: { type: 'string' } }, required: ['sok'] } } },
  { type: 'function', function: { name: 'vis_fakturaer', description: 'Viser fakturaer som tabell brukeren kan trykke på. filter: ubetalt, forfalt eller alle.', parameters: { type: 'object', properties: { filter: { type: 'string', enum: ['ubetalt', 'forfalt', 'alle'] }, kunde: { type: 'string', description: 'Valgfritt: del av kundenavnet' } }, required: ['filter'] } } },
  { type: 'function', function: { name: 'vis_resultat_per_maned', description: 'Graf over inntekter, kostnader og resultat per måned i et år. Brukeren kan trykke på en måned for detaljer.', parameters: { type: 'object', properties: { ar: { type: 'integer' } } } } },
  { type: 'function', function: { name: 'vis_storste_kostnader', description: 'Hva firmaet bruker mest penger på i år.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'likviditet_30_dager', description: 'Forventet penger inn og ut de neste 30 dagene, og saldo etterpå.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'lag_faktura', description: 'Lager et forslag til faktura som brukeren ser og godkjenner. Priser er eks. MVA i kroner.', parameters: { type: 'object', properties: {
    kunde_id: { type: 'string', description: 'Fra sok_kunde' },
    linjer: { type: 'array', items: { type: 'object', properties: { beskrivelse: { type: 'string' }, antall: { type: 'number' }, pris_eks_mva: { type: 'number' }, mva_sats: { type: 'integer', enum: [25, 15, 12, 0] } }, required: ['beskrivelse', 'antall', 'pris_eks_mva'] } },
    dato: { type: 'string', description: 'ÅÅÅÅ-MM-DD, standard i dag' }, forfall_dager: { type: 'integer' }, referanse: { type: 'string' },
  }, required: ['kunde_id', 'linjer'] } } },
  { type: 'function', function: { name: 'registrer_kostnad', description: 'Lager et forslag til registrering av et kjøp/en kostnad. Beløp er inkl. MVA i kroner.', parameters: { type: 'object', properties: {
    leverandor: { type: 'string' }, beskrivelse: { type: 'string' }, total_inkl_mva: { type: 'number' }, mva_sats: { type: 'integer', enum: [25, 15, 12, 0] },
    dato: { type: 'string' }, betalt: { type: 'string', enum: ['bank', 'ubetalt', 'privat', 'kontant'], description: 'bank = firmakort/bank, ubetalt = regning, privat = egne penger' }, forfall: { type: 'string' },
  }, required: ['leverandor', 'beskrivelse', 'total_inkl_mva'] } } },
  { type: 'function', function: { name: 'registrer_innbetaling', description: 'Forslag om å registrere at en kunde har betalt en faktura.', parameters: { type: 'object', properties: { faktura_nr: { type: 'integer' }, belop: { type: 'number', description: 'Kroner. Standard: hele restbeløpet' }, dato: { type: 'string' } }, required: ['faktura_nr'] } } },
  { type: 'function', function: { name: 'send_purring', description: 'Forslag om å sende purring (betalingspåminnelse) på en forfalt faktura.', parameters: { type: 'object', properties: { faktura_nr: { type: 'integer' } }, required: ['faktura_nr'] } } },
  { type: 'function', function: { name: 'lag_kreditnota', description: 'Forslag om kreditnota på en faktura, helt eller delvis.', parameters: { type: 'object', properties: { faktura_nr: { type: 'integer' }, grunn: { type: 'string' }, belop: { type: 'number', description: 'Kroner inkl. MVA. Tom = hele fakturaen' } }, required: ['faktura_nr', 'grunn'] } } },
  { type: 'function', function: { name: 'mva_status', description: 'Viser MVA-meldingen for gjeldende termin: tallene, hva som mangler og beløpet, som et kort brukeren kan sende fra.', parameters: { type: 'object', properties: {} } } },
];

const ENDRER = new Set(['lag_faktura', 'registrer_kostnad', 'registrer_innbetaling', 'send_purring', 'lag_kreditnota']);

async function lagreForslag(k: Ktx, art: Art, data: Record<string, unknown>): Promise<Kort> {
  const r = await k.db.en<{ id: string }>('insert into ai_forslag (organisasjon_id, bruker_id, art, data) values ($1,$2,$3,$4) returning id', [k.orgId, k.brukerId, art, JSON.stringify(data)]);
  return { type: 'forslag', id: r!.id, art, status: 'venter', data };
}

async function fakturaNr(t: Sporring, orgId: string, nr: number) {
  const f = await t.en<{ id: string; nr: number; kunde: string; epost: string | null; forfall: string | null; total: number; rest: number; status: string }>(
    `select f.id, f.nr, coalesce(c.navn,'') as kunde, c.epost, f.forfall::text as forfall, f.total,
      (f.total - f.betalt - coalesce((select sum(k.total) from faktura k where k.krediterer_id = f.id and k.status <> 'utkast'),0))::bigint as rest, f.status
     from faktura f left join kontakt c on c.id = f.kontakt_id where f.organisasjon_id = $1 and f.nr = $2 and f.type = 'faktura' and f.status <> 'utkast'`, [orgId, nr]);
  if (!f) throw new RegnskapsFeil(`Fant ikke faktura ${nr}.`);
  return { ...f, total: Number(f.total), rest: Number(f.rest) };
}

/** Kjører ett verktøy. Gir svaret til modellen (kort tekst/JSON) og eventuelt et kort til chatten. */
export async function kjorVerktoy(k: Ktx, navn: string, a: Record<string, unknown>): Promise<{ svar: unknown; kort?: Kort }> {
  if (ENDRER.has(navn) && !k.kanEndre) return { svar: { feil: 'Brukeren har bare lesetilgang og kan ikke gjøre endringer.' } };
  const ar = Number(k.idag.slice(0, 4));
  switch (navn) {
    case 'hent_oversikt': {
      const f = await hentFakta(k.db, k.orgId, k.idag);
      return { svar: { ...f, kunder: f.kunder.slice(0, 15), leverandorer: f.leverandorer.slice(0, 15), merk: 'Alle beløp er i øre.' } };
    }
    case 'sok_kunde': {
      const s = String(a.sok ?? '').trim();
      const r = await k.db.q(`select id as kunde_id, navn, orgnr, epost, poststed from kontakt where organisasjon_id = $1 and type in ('kunde','begge') and (navn ilike $2 or orgnr = $3) order by navn limit 8`, [k.orgId, `%${s}%`, s.replace(/\s/g, '')]);
      return { svar: r.length ? r : { ingen: `Fant ingen kunde som heter «${s}». Be brukeren legge den til under Penger inn, eller sjekk skrivemåten.` } };
    }
    case 'vis_fakturaer': {
      const d = await rapportData(k.db, k.orgId, ar, k.idag);
      let rader = d.kundePoster.filter(x => x.id && (a.filter === 'alle' || x.rest > 0)).map(x => ({ id: x.id, nr: x.nr, kunde: x.kunde, forfall: x.forfall, rest: x.rest, forfalt: !!x.forfall && x.forfall < k.idag && x.rest > 0 }));
      if (a.filter === 'forfalt') rader = rader.filter(x => x.forfalt);
      if (a.kunde) rader = rader.filter(x => x.kunde.toLowerCase().includes(String(a.kunde).toLowerCase()));
      const tittel = a.filter === 'forfalt' ? 'Forfalte fakturaer' : a.filter === 'ubetalt' ? 'Ubetalte fakturaer' : 'Fakturaer';
      return { svar: { antall: rader.length, sum_ore: rader.reduce((s, x) => s + x.rest, 0), fakturaer: rader.slice(0, 20) }, kort: { type: 'tabell_fakturaer', tittel, rader: rader.slice(0, 30) } };
    }
    case 'vis_resultat_per_maned': {
      const aar = Number(a.ar) || ar;
      const d = await rapportData(k.db, k.orgId, aar, aar === ar ? k.idag : `${aar}-12-31`);
      const maneder = d.mnd.map(m => {
        const mm = `${aar}-${String(m.maned).padStart(2, '0')}`;
        const rader = d.rader.filter(r => r.dato.startsWith(mm));
        const perKonto = new Map<number, number>();
        for (const r of rader) if (kontoType(r.konto) === 'kostnad' && r.konto < 8000) perKonto.set(r.konto, (perKonto.get(r.konto) ?? 0) + r.debet - r.kredit);
        const topp = [...perKonto.entries()].filter(([, b]) => b > 0).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([kt, b]) => ({ navn: finnKonto(kt)?.navn ?? String(kt), belop: b }));
        return { maned: m.maned, inn: m.inn, ut: m.ut, resultat: m.inn - m.ut, topp, bilag: new Set(rader.map(r => r.bilagId)).size };
      }).filter(m => m.inn || m.ut || m.maned <= Number(k.idag.slice(5, 7)) || aar < ar);
      return { svar: { ar: aar, maneder: maneder.map(m => ({ maned: m.maned, inn: m.inn, ut: m.ut, resultat: m.resultat })), merk: 'Øre. Grafen vises for brukeren.' }, kort: { type: 'graf_maned', ar: aar, maneder } };
    }
    case 'vis_storste_kostnader': {
      const d = await rapportData(k.db, k.orgId, ar, k.idag);
      const rader = d.ut.filter(x => x.belop > 0).map(x => ({ navn: x.navn, belop: x.belop, lenke: x.konto ? `/rapporter?tab=res` : undefined }));
      return { svar: { kostnader_ore: rader }, kort: { type: 'liste', tittel: `Største kostnader i ${ar}`, rader } };
    }
    case 'likviditet_30_dager': {
      const f = await hentFakta(k.db, k.orgId, k.idag);
      const om30 = (d: string | null) => !!d && (Date.parse(d) - Date.parse(k.idag)) / 86400000 <= 30;
      const inn = f.kunder.filter(x => x.rest > 0 && om30(x.forfall)).reduce((s, x) => s + x.rest, 0);
      const ut = f.leverandorer.filter(x => om30(x.forfall)).reduce((s, x) => s + x.total, 0) + Math.max(0, f.skyldigMva) + Math.max(0, f.trekk) + Math.max(0, f.aga);
      const rader = [{ navn: 'I banken nå', belop: f.bank }, { navn: 'Inn fra kunder (forfaller innen 30 dager)', belop: inn }, { navn: 'Ut: regninger, MVA, skattetrekk og AGA', belop: -ut }, { navn: 'Omtrent i banken om 30 dager', belop: f.bank + inn - ut }];
      return { svar: { bank: f.bank, inn, ut, etter: f.bank + inn - ut, merk: 'Øre' }, kort: { type: 'liste', tittel: 'Likviditet neste 30 dager', rader } };
    }
    case 'lag_faktura': {
      const kunde = await k.db.en<{ id: string; navn: string; orgnr: string | null; adresse: string | null; postnr: string | null; poststed: string | null; epost: string | null; kundenr: number | null }>(
        `select id, navn, orgnr, adresse, postnr, poststed, epost, kundenr from kontakt where id::text = $2 and organisasjon_id = $1`, [k.orgId, String(a.kunde_id ?? '')]);
      if (!kunde) return { svar: { feil: 'Ukjent kunde_id. Bruk sok_kunde først.' } };
      const org = await hentOrg(k.db, k.orgId) as Awaited<ReturnType<typeof hentOrg>> & { faktura_tekst?: string | null };
      const inn = Array.isArray(a.linjer) ? a.linjer as Record<string, unknown>[] : [];
      if (!inn.length) return { svar: { feil: 'Fakturaen trenger minst én linje.' } };
      const linjer: FakturaLinje[] = inn.map(l => ({ beskrivelse: String(l.beskrivelse ?? '').slice(0, 200), antallMilli: Math.round(tall(l.antall, 'antall') * 1000), pris: ore(l.pris_eks_mva, 'pris'), sats: org.mva_registrert ? Number(l.mva_sats ?? 25) : 0 }));
      const d = dato(a.dato, k.idag);
      const forfall = forfallFra(d, Number(a.forfall_dager) || org.faktura_forfall_dager);
      const sum = fakturaSummer(linjer, org.mva_registrert);
      const avsender = { navn: org.navn, orgnr: org.orgnr, orgform: org.orgform, adresse: org.adresse, postnr: org.postnr, poststed: org.poststed, kontonr: org.kontonr, epost: org.epost, telefon: org.telefon, tekst: org.faktura_tekst ?? null, mvaRegistrert: org.mva_registrert };
      const kort = await lagreForslag(k, 'faktura', { kunde, dato: d, forfall, referanse: a.referanse ? String(a.referanse) : null, linjer, sum: { netto: sum.netto, mva: sum.mva, total: sum.total }, avsender });
      return { svar: { forslag: 'faktura', kunde: kunde.navn, total_ore: sum.total, forfall, kunde_har_epost: !!kunde.epost, merk: 'Kortet vises for brukeren med Send / Sett på vent.' }, kort };
    }
    case 'registrer_kostnad': {
      const total = ore(a.total_inkl_mva, 'beløp');
      if (total <= 0) return { svar: { feil: 'Beløpet må være større enn 0.' } };
      const org = await hentOrg(k.db, k.orgId);
      const sats = org.mva_registrert ? Number(a.mva_sats ?? 25) : 0;
      const mva = sats ? splittBrutto(total, sats).mva : 0;
      const lev = String(a.leverandor ?? '').trim().slice(0, 120);
      const tekst = String(a.beskrivelse ?? '').trim().slice(0, 200);
      const forslag = foreslaKonto(`${tekst} ${lev}`);
      const betaltMed = ['bank', 'ubetalt', 'privat', 'kontant'].includes(String(a.betalt)) ? String(a.betalt) : 'bank';
      const d = dato(a.dato, k.idag);
      const dup = await finnDuplikat(k.db, k.orgId, lev, total, d);
      const kort = await lagreForslag(k, 'kostnad', { leverandor: lev, tekst, dato: d, total, mva, sats, konto: forslag?.konto.nr ?? 6800, kontoNavn: forslag?.konto.navn ?? 'Kontorrekvisita', grunn: forslag?.grunn ?? null, betaltMed, forfall: betaltMed === 'ubetalt' ? dato(a.forfall, forfallFra(d, 14)) : null, duplikat: dup });
      return { svar: { forslag: 'kostnad', konto: forslag?.konto.navn, mulig_duplikat: dup, merk: 'Kortet vises for brukeren med Registrer / Sett på vent.' }, kort };
    }
    case 'registrer_innbetaling': {
      const f = await fakturaNr(k.db, k.orgId, tall(a.faktura_nr, 'fakturanummer'));
      if (f.rest <= 0) return { svar: { feil: `Faktura ${f.nr} er allerede betalt.` } };
      const belop = a.belop ? ore(a.belop, 'beløp') : f.rest;
      const kort = await lagreForslag(k, 'betaling', { fakturaId: f.id, nr: f.nr, kunde: f.kunde, belop, rest: f.rest, dato: dato(a.dato, k.idag) });
      return { svar: { forslag: 'innbetaling', faktura: f.nr, belop_ore: belop }, kort };
    }
    case 'send_purring': {
      const f = await fakturaNr(k.db, k.orgId, tall(a.faktura_nr, 'fakturanummer'));
      if (f.rest <= 0) return { svar: { feil: `Faktura ${f.nr} er betalt, så den trenger ikke purring.` } };
      if (!f.forfall || f.forfall >= k.idag) return { svar: { feil: `Faktura ${f.nr} har ikke forfalt ennå (forfall ${f.forfall}).` } };
      if (!f.epost) return { svar: { feil: `${f.kunde} har ingen e-postadresse. Legg den til på kunden først.` } };
      const kort = await lagreForslag(k, 'purring', { fakturaId: f.id, nr: f.nr, kunde: f.kunde, epost: f.epost, rest: f.rest, forfall: f.forfall });
      return { svar: { forslag: 'purring', faktura: f.nr, til: f.epost }, kort };
    }
    case 'lag_kreditnota': {
      const f = await fakturaNr(k.db, k.orgId, tall(a.faktura_nr, 'fakturanummer'));
      const belop = a.belop ? ore(a.belop, 'beløp') : f.total;
      if (belop <= 0 || belop > f.total) return { svar: { feil: 'Beløpet må være mellom 0 og fakturaens total.' } };
      const kort = await lagreForslag(k, 'kreditnota', { fakturaId: f.id, nr: f.nr, kunde: f.kunde, belop, total: f.total, grunn: String(a.grunn ?? '').slice(0, 200) });
      return { svar: { forslag: 'kreditnota', faktura: f.nr, belop_ore: belop }, kort };
    }
    case 'mva_status': {
      const org = await hentOrg(k.db, k.orgId);
      if (!org.mva_registrert) return { svar: { info: 'Foretaket er ikke MVA-registrert.' } };
      const termin = await aktuellTermin(k.db, k.orgId, k.idag);
      if (!termin) return { svar: { info: 'Ingen MVA-termin å levere nå.' } };
      const st = await mvaStatus(k.db, k.orgId, termin);
      const data = { termin, aBetale: st.sendt ? st.sendt.aBetale : st.tall.aBetale, sendt: !!st.sendt, mangler: st.manglerBilag.length, funn: st.funn.map(x => x.tekst).slice(0, 5), frist: termin.frist };
      if (st.sendt) return { svar: { ...data, info: 'Allerede sendt.' }, kort: { type: 'liste', tittel: `${termin.tittel}: sendt`, rader: [{ navn: 'Beløp', belop: data.aBetale, lenke: '/mva' }] } };
      const kort = k.kanEndre ? await lagreForslag(k, 'mva', data) : { type: 'liste' as const, tittel: termin.tittel, rader: [{ navn: 'Å betale', belop: data.aBetale, lenke: '/mva' }] };
      return { svar: data, kort };
    }
  }
  return { svar: { feil: `Ukjent verktøy ${navn}` } };
}
