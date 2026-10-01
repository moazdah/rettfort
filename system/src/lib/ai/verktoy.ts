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
import { forhandsvisLonn, type LonnInput } from '../tjenester/lonn';
import { nesteFrister } from '../tjenester/oversikt';
import { hentUke, forslagUke, vakterMellom, vaktAnsatte, tilgjengelighet, godkjenteTimer } from '../tjenester/vaktplan';
import { isoUke, ukeDager, advarsler as vaktAdvarsler, kortTid, timer as tTimer } from '../vaktplan';
import { harVaktplan } from '../pakker';

export interface Ktx { db: Db; orgId: string; brukerId: string; idag: string; kanEndre: boolean }

export type Kort =
  | { type: 'forslag'; id: string; art: Art; status: string; data: Record<string, unknown>; melding?: string; lenke?: string }
  | { type: 'graf_maned'; ar: number; maneder: { maned: number; inn: number; ut: number; resultat: number; topp: { navn: string; belop: number }[]; bilag: number }[] }
  | { type: 'tabell_fakturaer'; tittel: string; rader: { id: string; nr: number; kunde: string; forfall: string | null; rest: number; forfalt: boolean }[] }
  | { type: 'liste'; tittel: string; rader: { navn: string; belop: number; tekst?: string; lenke?: string }[] };

export type Art = 'faktura' | 'kostnad' | 'betaling' | 'purring' | 'kreditnota' | 'mva' | 'skannelenke' | 'invitasjon' | 'lonn' | 'lonnslipp' | 'kunde' | 'vaktplan' | 'tildel_vakt' | 'publiser_uke';

const tall = (v: unknown, navn: string) => { const n = Number(v); if (!Number.isFinite(n)) throw new RegnskapsFeil(`Mangler ${navn}.`); return n; };
const ore = (kr: unknown, navn: string) => Math.round(tall(kr, navn) * 100);
const dato_ = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
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
  { type: 'function', function: { name: 'vis_lonn', description: 'Ansatte (lønnstype, månedslønn/timesats, skatteprosent, e-post) og de siste lønnskjøringene. Bruk før kjor_lonn og send_lonnslipp.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'kjor_lonn', description: 'Lager et forslag til lønnskjøring for en måned. Brukeren ser hver lønnslipp og trykker Kjør lønn. Timer/overtid/provisjon oppgis per ansatt der det trengs.', parameters: { type: 'object', properties: {
    periode: { type: 'string', description: 'ÅÅÅÅ-MM, standard inneværende måned' }, utbetalingsdato: { type: 'string', description: 'ÅÅÅÅ-MM-DD, standard lønningsdagen' },
    ansatte: { type: 'array', items: { type: 'object', properties: { navn: { type: 'string' }, timer: { type: 'number' }, overtid_timer: { type: 'number' }, provisjon_grunnlag_kr: { type: 'number' } }, required: ['navn'] } },
    send_slipper: { type: 'string', enum: ['utbetaling', 'na', 'ingen'], description: 'Når lønnslippene sendes på e-post. Standard: på utbetalingsdagen.' },
  } } } },
  { type: 'function', function: { name: 'send_lonnslipp', description: 'Forslag om å sende lønnslippen for en måned på e-post til en ansatt.', parameters: { type: 'object', properties: { navn: { type: 'string' }, periode: { type: 'string', description: 'ÅÅÅÅ-MM, standard siste kjørte' } }, required: ['navn'] } } },
  { type: 'function', function: { name: 'send_skannelenke', description: 'Forslag om å sende en lenke (med QR-kode) på e-post, så en klient eller ansatt kan ta bilde av kvitteringer med mobilen. Ansatt: bruk navnet fra vis_lonn.', parameters: { type: 'object', properties: { type: { type: 'string', enum: ['klient', 'ansatt'] }, navn: { type: 'string' }, epost: { type: 'string' } }, required: ['type'] } } },
  { type: 'function', function: { name: 'inviter_bruker', description: 'Forslag om å invitere noen til foretaket. rolle: full (kan føre), les (kan se), kvittering (kan bare levere kvitteringer).', parameters: { type: 'object', properties: { epost: { type: 'string' }, rolle: { type: 'string', enum: ['full', 'les', 'kvittering'] } }, required: ['epost', 'rolle'] } } },
  { type: 'function', function: { name: 'ny_kunde', description: 'Forslag om å legge til en ny kunde. Bruk når sok_kunde ikke finner kunden og brukeren vil fakturere den.', parameters: { type: 'object', properties: { navn: { type: 'string' }, epost: { type: 'string' }, adresse: { type: 'string' }, postnr: { type: 'string' }, poststed: { type: 'string' }, orgnr: { type: 'string' } }, required: ['navn'] } } },
  { type: 'function', function: { name: 'vis_frister', description: 'De neste fristene (MVA, a-melding, skattetrekk, årsoppgjør) med dato.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'vis_vaktplan', description: 'Vaktplanen for en uke: hvem som jobber når, ledige vakter, timer, overtid og merarbeid per ansatt, og om uka er publisert.', parameters: { type: 'object', properties: { uke: { type: 'integer', description: 'Ukenummer, standard denne uka' }, aar: { type: 'integer' } } } } },
  { type: 'function', function: { name: 'lag_vaktplan', description: 'Lager et utkast til vaktplan for en tom uke ut fra forrige uke og når de ansatte kan jobbe, og unngår overtid. Brukeren ser utkastet og trykker Lag utkast.', parameters: { type: 'object', properties: { uke: { type: 'integer' }, aar: { type: 'integer' } }, required: ['uke'] } } },
  { type: 'function', function: { name: 'foreslaa_til_ledig_vakt', description: 'Finner hvem som bør ta en ledig vakt en dag (de som har meldt interesse først, så de som ikke får overtid eller merarbeid). Lager et forslag med «Gi til X».', parameters: { type: 'object', properties: { dato: { type: 'string', description: 'ÅÅÅÅ-MM-DD' }, start: { type: 'string', description: 'HH:MM, valgfritt hvis det er flere ledige den dagen' } }, required: ['dato'] } } },
  { type: 'function', function: { name: 'overtid', description: 'Overtid og merarbeid per ansatt i en uke.', parameters: { type: 'object', properties: { uke: { type: 'integer' }, aar: { type: 'integer' } } } } },
  { type: 'function', function: { name: 'publiser_uke', description: 'Forslag om å publisere vaktplanen for en uke og varsle de ansatte på e-post. Krever at brukeren bekrefter.', parameters: { type: 'object', properties: { uke: { type: 'integer' }, aar: { type: 'integer' } }, required: ['uke'] } } },
];

const ENDRER = new Set(['lag_faktura', 'registrer_kostnad', 'registrer_innbetaling', 'send_purring', 'lag_kreditnota', 'kjor_lonn', 'send_lonnslipp', 'send_skannelenke', 'inviter_bruker', 'ny_kunde', 'lag_vaktplan', 'foreslaa_til_ledig_vakt', 'publiser_uke']);

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
    case 'vis_lonn': {
      const ansatte = await k.db.q<{ id: string; navn: string; epost: string | null; lonn_type: string; manedslonn: number; timesats: number; skatteprosent: number; stillingsprosent: number }>(
        `select id, navn, epost, lonn_type, manedslonn, timesats, skatteprosent, stillingsprosent from ansatt where organisasjon_id = $1 and aktiv order by navn`, [k.orgId]);
      const kj = await k.db.q<{ periode: string; utbetalingsdato: string; brutto: number; netto: number; skatt: number; aga: number }>(
        `select periode, utbetalingsdato::text as utbetalingsdato, brutto, netto, skatt, aga from lonnskjoring where organisasjon_id = $1 order by periode desc limit 6`, [k.orgId]);
      const org = await k.db.en<{ lonningsdag: number | null }>('select lonningsdag from organisasjon where id = $1', [k.orgId]);
      return {
        svar: { ansatte: ansatte.map(a => ({ navn: a.navn, epost: a.epost, lonnstype: a.lonn_type, manedslonn_ore: Number(a.manedslonn), timesats_ore: Number(a.timesats), skatteprosent: Number(a.skatteprosent), stillingsprosent: Number(a.stillingsprosent) })), siste_kjoringer: kj.map(x => ({ ...x, brutto: Number(x.brutto), netto: Number(x.netto), skatt: Number(x.skatt), aga: Number(x.aga) })), lonningsdag: org?.lonningsdag ?? null, merk: 'Øre.' },
        kort: { type: 'liste', tittel: 'Lønn', rader: kj.length ? kj.map(x => ({ navn: `Lønn ${x.periode} (brutto)`, belop: Number(x.brutto), lenke: '/lonn?vis=historikk' })) : ansatte.map(a => ({ navn: `${a.navn} (${a.lonn_type === 'time' ? 'timelønn' : a.lonn_type === 'provisjon' ? 'provisjon' : 'fastlønn'})`, belop: Number(a.lonn_type === 'time' ? a.timesats : a.manedslonn), lenke: '/lonn' })) },
      };
    }
    case 'kjor_lonn': {
      const periode = typeof a.periode === 'string' && /^\d{4}-\d{2}$/.test(a.periode) ? a.periode : k.idag.slice(0, 7);
      if (await k.db.en('select 1 from lonnskjoring where organisasjon_id = $1 and periode = $2', [k.orgId, periode])) return { svar: { feil: `Lønn for ${periode} er allerede kjørt.` } };
      const ansatte = await k.db.q<{ id: string; navn: string; epost: string | null }>('select id, navn, epost from ansatt where organisasjon_id = $1 and aktiv order by navn', [k.orgId]);
      if (!ansatte.length) return { svar: { feil: 'Foretaket har ingen ansatte. Legg dem til under Lønn.' } };
      const inn: LonnInput[] = [];
      for (const x of (Array.isArray(a.ansatte) ? a.ansatte : []) as Record<string, unknown>[]) {
        const n = String(x.navn ?? '').toLowerCase().trim();
        const treff = ansatte.filter(y => y.navn.toLowerCase().includes(n));
        if (treff.length !== 1) return { svar: { feil: treff.length ? `Flere ansatte heter «${x.navn}». Bruk fullt navn.` : `Fant ingen ansatt som heter «${x.navn}».` } };
        inn.push({ ansattId: treff[0].id, timer: x.timer != null ? Number(x.timer) : undefined, overtidTimer: x.overtid_timer != null ? Number(x.overtid_timer) : undefined, provisjonGrunnlag: x.provisjon_grunnlag_kr != null ? ore(x.provisjon_grunnlag_kr, 'provisjonsgrunnlag') : undefined });
      }
      // Godkjente timer fra vaktplanen brukes når brukeren ikke har oppgitt noe selv.
      const fraVakt = await godkjenteTimer(k.db, k.orgId);
      for (const [id, v] of Object.entries(fraVakt)) {
        if (inn.some(x => x.ansattId === id)) continue;
        const an = await k.db.en<{ lonn_type: string }>('select lonn_type from ansatt where id = $1', [id]);
        inn.push({ ansattId: id, timer: an?.lonn_type === 'time' ? Math.max(0, v.timer - v.overtid) : undefined, overtidTimer: v.overtid || undefined });
      }
      const slipper = (await forhandsvisLonn(k.db, k.orgId, inn)).filter(x => x.brutto > 0);
      if (!slipper.length) return { svar: { feil: 'Ingen har lønn med disse tallene. Timelønnede trenger timer.' } };
      const org = await k.db.en<{ lonningsdag: number | null }>('select lonningsdag from organisasjon where id = $1', [k.orgId]);
      const [y, m] = periode.split('-').map(Number);
      const siste = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const std = `${periode}-${String(Math.min(org?.lonningsdag ?? 20, siste)).padStart(2, '0')}`;
      const utbetalingsdato = dato(a.utbetalingsdato, std);
      const send = ['na', 'utbetaling', 'ingen'].includes(String(a.send_slipper)) ? String(a.send_slipper) : 'utbetaling';
      const sum = (f: 'brutto' | 'skatt' | 'netto' | 'aga' | 'feriepenger') => slipper.reduce((s2, x) => s2 + x[f], 0);
      const data = { periode, utbetalingsdato, send, input: inn, slipper: slipper.map(x => ({ navn: x.navn, brutto: x.brutto, skatt: x.skatt, netto: x.netto, epost: ansatte.find(y => y.id === x.ansattId)?.epost ?? null, advarsler: x.advarsler })), sum: { brutto: sum('brutto'), skatt: sum('skatt'), netto: sum('netto'), aga: sum('aga'), feriepenger: sum('feriepenger') } };
      const kort = await lagreForslag(k, 'lonn', data);
      return { svar: { forslag: 'lonn', periode, utbetalingsdato, ansatte: data.slipper.map(x => ({ navn: x.navn, netto_ore: x.netto })), sum_netto_ore: data.sum.netto, merk: 'Kortet vises med Kjør lønn / Sett på vent.' }, kort };
    }
    case 'send_lonnslipp': {
      const n = String(a.navn ?? '').toLowerCase().trim();
      const r = await k.db.q<{ ansatt_id: string; navn: string; epost: string | null; periode: string; netto: number }>(
        `select a.id as ansatt_id, a.navn, a.epost, l.periode, ls.netto from lonnslipp ls join lonnskjoring l on l.id = ls.lonnskjoring_id join ansatt a on a.id = ls.ansatt_id
         where l.organisasjon_id = $1 and lower(a.navn) like $2 ${typeof a.periode === 'string' && /^\d{4}-\d{2}$/.test(a.periode) ? 'and l.periode = $3' : ''} order by l.periode desc limit 5`,
        typeof a.periode === 'string' && /^\d{4}-\d{2}$/.test(a.periode) ? [k.orgId, `%${n}%`, a.periode] : [k.orgId, `%${n}%`]);
      if (!r.length) return { svar: { feil: `Fant ingen lønnslipp for «${a.navn}».` } };
      if (new Set(r.map(x => x.ansatt_id)).size > 1) return { svar: { feil: `Flere ansatte passer: ${[...new Set(r.map(x => x.navn))].join(', ')}. Spør hvem.` } };
      const x = r[0];
      if (!x.epost) return { svar: { feil: `${x.navn} har ikke e-post. Legg den inn under Lønn.` } };
      const kort = await lagreForslag(k, 'lonnslipp', { ansattId: x.ansatt_id, navn: x.navn, epost: x.epost, periode: x.periode, netto: Number(x.netto) });
      return { svar: { forslag: 'lonnslipp', navn: x.navn, periode: x.periode, til: x.epost }, kort };
    }
    case 'send_skannelenke': {
      const type = a.type === 'ansatt' ? 'ansatt' : 'klient';
      let navn = a.navn ? String(a.navn).trim() : null;
      let epost = a.epost ? String(a.epost).trim().toLowerCase() : null;
      let ansattId: string | null = null;
      if (type === 'ansatt') {
        const n = (navn ?? '').toLowerCase();
        const treff = await k.db.q<{ id: string; navn: string; epost: string | null }>('select id, navn, epost from ansatt where organisasjon_id = $1 and aktiv and lower(navn) like $2', [k.orgId, `%${n}%`]);
        if (treff.length !== 1) return { svar: { feil: treff.length ? `Flere ansatte passer: ${treff.map(t2 => t2.navn).join(', ')}.` : `Fant ingen ansatt som heter «${navn ?? ''}».` } };
        ansattId = treff[0].id; navn = treff[0].navn; epost = epost ?? treff[0].epost;
      }
      if (!epost || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(epost)) return { svar: { feil: 'Trenger en gyldig e-postadresse å sende lenken til.' } };
      const kort = await lagreForslag(k, 'skannelenke', { type, navn, epost, ansattId });
      return { svar: { forslag: 'skannelenke', til: epost, type }, kort };
    }
    case 'inviter_bruker': {
      const epost = String(a.epost ?? '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(epost)) return { svar: { feil: 'Trenger en gyldig e-postadresse.' } };
      const rolle = ['full', 'les', 'kvittering'].includes(String(a.rolle)) ? String(a.rolle) : 'les';
      if (await k.db.en('select 1 from medlemskap m join bruker b on b.id = m.bruker_id where m.organisasjon_id = $1 and b.epost = $2', [k.orgId, epost])) return { svar: { feil: `${epost} har allerede tilgang.` } };
      const kort = await lagreForslag(k, 'invitasjon', { epost, rolle });
      return { svar: { forslag: 'invitasjon', epost, rolle }, kort };
    }
    case 'ny_kunde': {
      const navn = String(a.navn ?? '').trim();
      if (navn.length < 2) return { svar: { feil: 'Trenger navnet på kunden.' } };
      const epost = a.epost ? String(a.epost).trim().toLowerCase() : null;
      if (epost && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(epost)) return { svar: { feil: 'E-postadressen ser ikke riktig ut.' } };
      const postnr = a.postnr ? String(a.postnr).trim() : null;
      if (postnr && !/^\d{4}$/.test(postnr)) return { svar: { feil: 'Postnummeret skal ha 4 siffer.' } };
      const finnes = await k.db.en<{ id: string }>(`select id from kontakt where organisasjon_id = $1 and type in ('kunde','begge') and lower(navn) = lower($2)`, [k.orgId, navn]);
      if (finnes) return { svar: { info: 'Kunden finnes allerede.', kunde_id: finnes.id } };
      const kort = await lagreForslag(k, 'kunde', { navn, epost, adresse: a.adresse ? String(a.adresse) : null, postnr, poststed: a.poststed ? String(a.poststed) : null, orgnr: a.orgnr ? String(a.orgnr).replace(/\s/g, '') : null });
      return { svar: { forslag: 'kunde', navn, merk: 'Når brukeren har lagt den til, kan du lage fakturaen (finn kunde_id med sok_kunde).' }, kort };
    }
    case 'vis_frister': {
      const f = (await nesteFrister(k.db, k.orgId, k.idag, 6)).slice(0, 8);
      return { svar: { frister: f.map(x => ({ dato: x.dato, tittel: x.tittel, beskrivelse: x.beskrivelse })) }, kort: { type: 'liste', tittel: 'Neste frister', rader: f.map(x => ({ navn: x.tittel, belop: 0, tekst: x.dato.split('-').reverse().join('.'), lenke: '/frister' })) } };
    }
    case 'vis_vaktplan': case 'lag_vaktplan': case 'foreslaa_til_ledig_vakt': case 'overtid': case 'publiser_uke': {
      const pakke = (await k.db.en<{ pakke: string }>('select pakke from organisasjon where id = $1', [k.orgId]))?.pakke ?? 'gratis';
      if (!harVaktplan(pakke)) return { svar: { feil: 'Vaktplan er med i Start og Selskap. Brukeren kan oppgradere under Innstillinger → Abonnement.' } };
      const naa = isoUke(k.idag);
      const uke = Number(a.uke) >= 1 && Number(a.uke) <= 53 ? Number(a.uke) : naa.uke;
      const aar = Number(a.aar) > 2000 ? Number(a.aar) : uke < naa.uke - 26 ? naa.aar + 1 : naa.aar;
      if (navn === 'vis_vaktplan' || navn === 'overtid') {
        const u = await hentUke(k.db, k.orgId, aar, uke);
        const per = u.ansatte.map(x => ({ navn: x.navn, timer: tTimer(u.perAnsatt[x.id]?.arbeid ?? 0), avtalt: u.perAnsatt[x.id]?.avtalt ? tTimer(u.perAnsatt[x.id].avtalt!) : 'timelønn', overtid: tTimer(u.perAnsatt[x.id]?.overtid ?? 0), merarbeid: tTimer(u.perAnsatt[x.id]?.merarbeid ?? 0) }));
        if (navn === 'overtid') return { svar: { uke, aar, ansatte: per.filter(x => x.overtid !== '0 t' || x.merarbeid !== '0 t'), merk: 'Overtid: over 9 t/dag eller 40 t/uke. Merarbeid: deltid over avtalt, under 40 t.' } };
        const vakter = u.vakter.map(v => ({ dag: v.dato, tid: kortTid(v.start, v.slutt), hvem: u.ansatte.find(x => x.id === v.ansattId)?.navn ?? 'LEDIG', vil_bytte: v.utlagt, interesserte: v.interesse.length }));
        return { svar: { uke, aar, status: u.status, vakter, per_ansatt: per }, kort: { type: 'liste', tittel: `Vaktplan uke ${uke}`, rader: u.ansatte.map(x => ({ navn: x.navn, belop: 0, tekst: `${tTimer(u.perAnsatt[x.id]?.arbeid ?? 0)}${u.perAnsatt[x.id]?.overtid ? ` · ${tTimer(u.perAnsatt[x.id].overtid)} overtid` : ''}`, lenke: `/vaktplan?uke=${aar}-${uke}` })) } };
      }
      if (navn === 'lag_vaktplan') {
        const f = await forslagUke(k.db, k.orgId, aar, uke);
        if (f.finnes) return { svar: { feil: `Uke ${uke} har allerede ${f.finnes} vakter. Endre dem under Vaktplan, eller velg en tom uke.` } };
        if (!f.vakter.length) return { svar: { feil: `Forrige uke (uke ${uke - 1 || 52}) har ingen vakter å bygge på. Legg inn noen vakter først, eller kopier en annen uke under Vaktplan.` } };
        const kort = await lagreForslag(k, 'vaktplan', f as unknown as Record<string, unknown>);
        return { svar: { forslag: 'vaktplan', uke, vakter: f.vakter.length, ledige: f.ledige, overtid_timer: f.overtidMin / 60, hensyn: f.hensyn, merk: 'Kortet vises med Lag utkast / Sett på vent. Utkastet publiseres ikke før brukeren gjør det.' }, kort };
      }
      if (navn === 'foreslaa_til_ledig_vakt') {
        const dato = dato_(a.dato);
        if (!dato) return { svar: { feil: 'Trenger datoen (ÅÅÅÅ-MM-DD).' } };
        const d = ukeDager(isoUke(dato).aar, isoUke(dato).uke);
        const [alle, ansatte, tilgj] = await Promise.all([vakterMellom(k.db, k.orgId, d[0], d[6]), vaktAnsatte(k.db, k.orgId), tilgjengelighet(k.db, k.orgId, dato, dato)]);
        const ledige = alle.filter(v => v.dato === dato && (!v.ansattId || v.utlagt) && (!a.start || v.start === String(a.start).slice(0, 5)));
        if (!ledige.length) return { svar: { feil: `Ingen ledige vakter ${dato}${a.start ? ` kl. ${a.start}` : ''}.` } };
        if (ledige.length > 1 && !a.start) return { svar: { flere: ledige.map(v => kortTid(v.start, v.slutt)), merk: 'Spør hvilken vakt.' } };
        const v = ledige[0];
        const kandidater = ansatte.filter(x => x.id !== v.ansattId).map(x => {
          const w = vaktAdvarsler({ ansattId: x.id, dato, start: v.start, slutt: v.slutt }, alle.filter(y => y.id !== v.id), x, tilgj);
          const t = tilgj.find(y => y.ansattId === x.id);
          const timerUka = alle.filter(y => y.ansattId === x.id).length;
          const poeng = (v.interesse.includes(x.id) ? 100 : 0) + (t?.status === 'kan' ? 20 : 0) - (t?.status === 'kan_ikke' ? 200 : 0) - (w.some(z => /allerede/.test(z)) ? 150 : 0) - (w.some(z => /overtid/.test(z)) ? 60 : 0) - (w.some(z => /merarbeid/.test(z)) ? 15 : 0) - timerUka;
          return { id: x.id, navn: x.navn, interessert: v.interesse.includes(x.id), merknad: w.join(' ') || null, poeng };
        }).filter(x => x.poeng > -150).sort((p, q) => q.poeng - p.poeng);
        if (!kandidater.length) return { svar: { feil: 'Ingen kan ta vakten uten å ha sagt nei eller allerede ha vakt den dagen.' } };
        const kort = await lagreForslag(k, 'tildel_vakt', { vaktId: v.id, dato, start: v.start, slutt: v.slutt, ansattId: kandidater[0].id, navn: kandidater[0].navn, merknad: kandidater[0].merknad, interessert: kandidater[0].interessert, alternativer: kandidater.slice(1, 4).map(x => ({ navn: x.navn, merknad: x.merknad, interessert: x.interessert })) });
        return { svar: { forslag: 'tildel_vakt', beste: kandidater[0], andre: kandidater.slice(1, 4) }, kort };
      }
      const u = await hentUke(k.db, k.orgId, aar, uke);
      if (!u.vakter.some(v => v.ansattId)) return { svar: { feil: `Uke ${uke} har ingen vakter å publisere.` } };
      if (u.status === 'publisert') return { svar: { info: `Uke ${uke} er allerede publisert, og ingenting er endret siden.` } };
      const kort = await lagreForslag(k, 'publiser_uke', { aar, uke, status: u.status, vakter: u.vakter.length, ledige: u.vakter.filter(v => !v.ansattId).length, ansatte: u.ansatte.filter(x => u.vakter.some(v => v.ansattId === x.id)).map(x => x.navn) });
      return { svar: { forslag: 'publiser_uke', uke, merk: 'Kortet vises med Publiser og varsle.' }, kort };
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
