// Kontoplan etter Norsk Standard NS 4102, med vanlige ord slik at brukeren
// kan søke «strøm», «bil» eller «kaffe» i stedet for å kunne kontonummer.

export type KontoType = 'eiendel' | 'egenkapital' | 'gjeld' | 'inntekt' | 'kostnad' | 'finansinntekt' | 'finanskostnad' | 'skatt' | 'disponering';

export interface Konto {
  nr: number;
  navn: string;
  /** Én setning på vanlig norsk. */
  beskrivelse: string;
  sokeord: string[];
  /** Standard MVA-kode ved kjøp (SAF-T). '0' = ingen MVA-behandling. */
  mvaKjop?: string;
  /** Kan velges som «Hva slags kjøp er dette?». */
  kjop?: boolean;
  /** Kan brukes som inntektskonto på faktura. */
  salg?: boolean;
  /** Ikke fradrag for inngående MVA (f.eks. representasjon). */
  ikkeFradrag?: boolean;
}

const K = (nr: number, navn: string, beskrivelse: string, sokeord: string[] = [], ekstra: Partial<Konto> = {}): Konto => ({ nr, navn, beskrivelse, sokeord, ...ekstra });
const kjop = { kjop: true, mvaKjop: '1' };

export const KONTOPLAN: Konto[] = [
  // 1 Eiendeler
  K(1200, 'Maskiner og anlegg', 'Maskiner og utstyr som skal brukes i flere år og koster over 30 000 kr.', ['maskin', 'anlegg', 'utstyr'], kjop),
  K(1230, 'Personbiler', 'Firmabil som er personbil.', ['bil', 'personbil', 'firmabil']),
  K(1240, 'Varebiler og lastebiler', 'Varebil, lastebil og tilhenger.', ['varebil', 'lastebil', 'henger'], kjop),
  K(1250, 'Inventar og datautstyr (eiendel)', 'Inventar og datautstyr over 30 000 kr som avskrives.', ['inventar', 'pc', 'server'], kjop),
  K(1400, 'Varelager', 'Varer på lager som skal selges.', ['lager', 'varer']),
  K(1500, 'Kundefordringer', 'Det kundene skylder deg for sendte fakturaer.', ['kunde', 'fordring', 'utestående']),
  K(1570, 'Andre kortsiktige fordringer', 'Andre krav, for eksempel lån til eier eller ansatte.', ['lån', 'forskudd', 'fordring']),
  K(1700, 'Forskuddsbetalte kostnader', 'Kostnader som er betalt, men gjelder en senere periode.', ['forskudd', 'periodisering', 'forsikring']),
  K(1900, 'Kontanter', 'Kontanter i kassen.', ['kasse', 'kontant']),
  K(1920, 'Bankinnskudd', 'Driftskontoen i banken.', ['bank', 'driftskonto', 'konto']),
  K(1921, 'Bankinnskudd, annen konto', 'Sparekonto eller annen egen bankkonto.', ['sparekonto', 'overføring']),
  K(1950, 'Bankinnskudd for skattetrekk', 'Egen konto for skattetrekk fra lønn.', ['skattetrekkskonto']),
  // 2 Egenkapital og gjeld
  K(2000, 'Aksjekapital', 'Innskutt aksjekapital i AS.', ['aksjekapital']),
  K(2050, 'Annen egenkapital', 'Opptjent egenkapital. I enkeltpersonforetak også privatuttak og innskudd.', ['egenkapital', 'privat', 'uttak']),
  K(2400, 'Leverandørgjeld', 'Det du skylder leverandører for mottatte fakturaer.', ['leverandør', 'gjeld', 'ubetalt']),
  K(2600, 'Forskuddstrekk', 'Skattetrekk fra lønn som skal betales til Skatteetaten.', ['skattetrekk', 'forskuddstrekk']),
  K(2700, 'Utgående merverdiavgift', 'MVA du har lagt på salget ditt.', ['mva salg', 'utgående']),
  K(2710, 'Inngående merverdiavgift', 'MVA på kjøp som du får fradrag for.', ['mva kjøp', 'inngående', 'fradrag']),
  K(2740, 'Oppgjørskonto merverdiavgift', 'MVA som skal betales til eller tilbake fra Skatteetaten for en termin.', ['mva oppgjør']),
  K(2770, 'Skyldig arbeidsgiveravgift', 'Arbeidsgiveravgift som skal betales.', ['arbeidsgiveravgift', 'aga']),
  K(2785, 'Påløpt arbeidsgiveravgift på feriepenger', 'Arbeidsgiveravgift på opptjente feriepenger.', ['aga feriepenger']),
  K(2910, 'Gjeld til ansatte og eiere', 'Utlegg og annet du skylder ansatte eller eiere.', ['utlegg', 'skylder eier']),
  K(2930, 'Skyldig lønn', 'Lønn som er opptjent, men ikke utbetalt.', ['skyldig lønn']),
  K(2940, 'Skyldige feriepenger', 'Feriepenger de ansatte har tjent opp.', ['feriepenger']),
  K(2990, 'Annen kortsiktig gjeld', 'Annen gjeld som skal betales innen ett år.', ['gjeld']),
  // 3 Inntekter
  K(3000, 'Salgsinntekt, avgiftspliktig', 'Salg av varer og tjenester med MVA.', ['salg', 'tjenester', 'konsulent', 'timer'], { salg: true }),
  K(3100, 'Salgsinntekt, avgiftsfri', 'Salg som er fritatt for MVA, for eksempel eksport.', ['fritatt', 'eksport'], { salg: true }),
  K(3200, 'Salgsinntekt, utenfor avgiftsområdet', 'Salg som er utenfor MVA-loven, for eksempel helsetjenester.', ['utenfor mva', 'helse', 'undervisning'], { salg: true }),
  K(3400, 'Offentlig tilskudd', 'Tilskudd og støtte fra det offentlige.', ['tilskudd', 'støtte']),
  K(3600, 'Leieinntekt', 'Inntekt fra utleie.', ['leie', 'utleie'], { salg: true }),
  K(3900, 'Annen driftsinntekt', 'Andre inntekter fra driften.', ['annen inntekt', 'viderefakturering'], { salg: true }),
  // 4 Varekostnad
  K(4000, 'Innkjøp av varer for videresalg', 'Varer du kjøper for å selge videre.', ['varer', 'innkjøp', 'videresalg', 'grossist'], kjop),
  K(4300, 'Innkjøp av råvarer og halvfabrikata', 'Materialer som brukes i det du lager eller bygger.', ['materialer', 'råvarer', 'byggevarer', 'trelast'], kjop),
  K(4500, 'Fremmedytelser og underentreprise', 'Arbeid du kjøper inn fra andre til dine prosjekter.', ['underleverandør', 'underentreprenør', 'innleid'], kjop),
  // 5 Lønn
  K(5000, 'Lønn til ansatte', 'Fast lønn og timelønn.', ['lønn', 'timelønn']),
  K(5020, 'Feriepenger', 'Feriepenger de ansatte tjener opp.', ['feriepenger']),
  K(5092, 'Innleid arbeidskraft', 'Bemanningsbyrå og innleie.', ['bemanning', 'vikar'], kjop),
  K(5400, 'Arbeidsgiveravgift', 'Arbeidsgiveravgift av lønn.', ['aga']),
  K(5405, 'Arbeidsgiveravgift på feriepenger', 'Arbeidsgiveravgift av opptjente feriepenger.', ['aga feriepenger']),
  K(5420, 'Innberetningspliktig pensjonskostnad', 'Obligatorisk tjenestepensjon (OTP).', ['otp', 'pensjon'], { kjop: true, mvaKjop: '0' }),
  K(5900, 'Annen personalkostnad', 'Kurs, julebord og andre kostnader for de ansatte.', ['personal', 'julebord', 'sosialt', 'firmatur'], { kjop: true, mvaKjop: '0', ikkeFradrag: true }),
  K(5910, 'Kantinekostnad', 'Mat og drikke til de ansatte på jobb.', ['kantine', 'kaffe', 'frukt', 'lunsj'], { kjop: true, mvaKjop: '0', ikkeFradrag: true }),
  K(5930, 'Arbeidsklær', 'Arbeidstøy og verneutstyr.', ['arbeidsklær', 'verneutstyr', 'klær'], kjop),
  // 6 Andre driftskostnader
  K(6000, 'Avskrivninger', 'Årets verdifall på eiendeler.', ['avskrivning']),
  K(6100, 'Frakt og transport ved salg', 'Porto og frakt av varer til kunder.', ['frakt', 'porto', 'post', 'bring', 'posten'], kjop),
  K(6300, 'Leie av lokale', 'Husleie for kontor, butikk eller lager.', ['husleie', 'leie', 'lokale', 'kontorleie'], kjop),
  K(6340, 'Lys og varme', 'Strøm og oppvarming.', ['strøm', 'lys', 'varme', 'fjernvarme', 'nettleie'], kjop),
  K(6360, 'Renhold', 'Vask og renhold av lokaler.', ['renhold', 'vask', 'rengjøring'], kjop),
  K(6400, 'Leie av maskiner', 'Leie av maskiner og utstyr.', ['leie maskin', 'utstyrsleie'], kjop),
  K(6420, 'Programvare og lisenser', 'Abonnement på programmer og nettjenester.', ['programvare', 'lisens', 'abonnement', 'microsoft', 'adobe', 'google', 'saas', 'app'], kjop),
  K(6500, 'Verktøy', 'Verktøy og små maskiner.', ['verktøy', 'drill', 'jula', 'biltema', 'clas ohlson'], kjop),
  K(6540, 'Inventar', 'Møbler og inventar under 30 000 kr.', ['inventar', 'møbler', 'stol', 'pult', 'hylle', 'ikea'], kjop),
  K(6551, 'Datautstyr', 'PC, skjerm og annet datautstyr under 30 000 kr.', ['pc', 'datamaskin', 'skjerm', 'mobil', 'telefon', 'elkjøp', 'komplett', 'mac'], kjop),
  K(6600, 'Reparasjon og vedlikehold', 'Reparasjon av lokaler og utstyr.', ['reparasjon', 'vedlikehold', 'service', 'håndverker'], kjop),
  K(6700, 'Revisjon og regnskap', 'Regnskapsfører, revisor og rådgivning.', ['regnskapsfører', 'revisor', 'regnskap'], kjop),
  K(6720, 'Andre honorarer', 'Advokat og annen rådgivning.', ['advokat', 'konsulent', 'rådgivning', 'honorar'], kjop),
  K(6800, 'Kontorrekvisita', 'Papir, penner, blekk og annet småutstyr til kontoret.', ['kontor', 'papir', 'penn', 'blekk', 'rekvisita', 'kontorrekvisita'], kjop),
  K(6860, 'Møter, kurs og oppdatering', 'Kurs, konferanser og faglitteratur.', ['kurs', 'konferanse', 'seminar', 'møte', 'bok'], kjop),
  K(6900, 'Telefon og internett', 'Mobilabonnement, fasttelefon og internett.', ['telefon', 'mobil', 'internett', 'bredbånd', 'telenor', 'telia', 'ice'], kjop),
  K(6940, 'Porto', 'Porto og frimerker.', ['porto', 'frimerke'], kjop),
  // 7 Andre driftskostnader forts.
  K(7000, 'Drivstoff', 'Bensin, diesel og lading.', ['drivstoff', 'bensin', 'diesel', 'lading', 'circle k', 'esso', 'shell', 'uno-x', 'yx'], kjop),
  K(7040, 'Forsikring og vedlikehold av bil', 'Service, dekk og forsikring på firmabil.', ['bilservice', 'dekk', 'verksted'], kjop),
  K(7100, 'Bilgodtgjørelse', 'Kilometergodtgjørelse når egen bil brukes i jobb.', ['kilometer', 'km', 'bilgodtgjørelse'], { kjop: true, mvaKjop: '0' }),
  K(7130, 'Reisekostnad, ikke oppgavepliktig', 'Tog, fly, taxi og hotell (12 % MVA). Parkering og bompenger har 25 % eller ingen MVA, se kvitteringen.', ['reise', 'fly', 'tog', 'taxi', 'hotell', 'buss', 'sas', 'norwegian', 'vy', 'parkering', 'bom'], { kjop: true, mvaKjop: '13' }),
  K(7140, 'Reisekostnad, oppgavepliktig', 'Diett og nattillegg til ansatte.', ['diett', 'nattillegg'], { kjop: true, mvaKjop: '0' }),
  K(7320, 'Reklamekostnad', 'Annonser og markedsføring.', ['reklame', 'annonse', 'markedsføring', 'facebook', 'google ads'], kjop),
  K(7350, 'Representasjon', 'Mat og drikke med kunder og samarbeidspartnere. Ikke fradrag for MVA.', ['representasjon', 'kundemiddag', 'restaurant', 'middag', 'lunsj med kunde'], { kjop: true, mvaKjop: '0', ikkeFradrag: true }),
  K(7400, 'Kontingenter', 'Medlemskap i foreninger og bransjeorganisasjoner.', ['kontingent', 'medlemskap', 'forening'], { kjop: true, mvaKjop: '0' }),
  K(7500, 'Forsikringspremie', 'Forsikring for bedriften. Uten MVA.', ['forsikring', 'if', 'gjensidige', 'tryg'], { kjop: true, mvaKjop: '0' }),
  K(7770, 'Bank- og kortgebyr', 'Gebyrer fra banken og kortterminal.', ['gebyr', 'bankgebyr', 'kortgebyr', 'vipps'], { kjop: true, mvaKjop: '0' }),
  K(7790, 'Annen kostnad', 'Kostnader som ikke passer andre steder.', ['annet', 'diverse'], kjop),
  K(7830, 'Tap på fordringer', 'Kunder som ikke betaler.', ['tap', 'konstatert tap']),
  // 8 Finans og skatt
  K(8040, 'Renteinntekt', 'Renter fra banken.', ['renter', 'renteinntekt'], {}),
  K(8140, 'Rentekostnad', 'Renter på lån og forsinkelsesrenter.', ['rente', 'rentekostnad', 'forsinkelsesrente'], { kjop: true, mvaKjop: '0' }),
  K(8300, 'Betalbar skatt', 'Skatt på årets overskudd.', ['skatt']),
  K(8800, 'Årsresultat', 'Overføring av årets resultat til egenkapitalen.', []),
];

const INDEKS = new Map(KONTOPLAN.map(k => [k.nr, k]));

export function konto(nr: number): Konto | undefined {
  return INDEKS.get(nr);
}

export function kontoNavn(nr: number): string {
  const k = INDEKS.get(nr);
  return k ? `${k.navn} · ${nr}` : String(nr);
}

/** Kontotype ut fra NS 4102-klassen. */
export function kontoType(nr: number): KontoType {
  if (nr >= 1000 && nr < 2000) return 'eiendel';
  if (nr >= 2000 && nr < 2100) return 'egenkapital';
  if (nr >= 2100 && nr < 3000) return 'gjeld';
  if (nr >= 3000 && nr < 4000) return 'inntekt';
  if (nr >= 4000 && nr < 8000) return 'kostnad';
  if (nr >= 8000 && nr < 8100) return 'finansinntekt';
  if (nr >= 8100 && nr < 8300) return 'finanskostnad';
  if (nr >= 8300 && nr < 8800) return 'skatt';
  if (nr >= 8800 && nr < 9000) return 'disponering';
  throw new Error(`Kontonummer ${nr} finnes ikke i kontoplanen.`);
}

export function erResultatkonto(nr: number): boolean {
  return nr >= 3000 && nr < 9000;
}

function normaliser(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9æøå ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Søk med vanlige ord. Treffer navn, beskrivelse, søkeord og nummer. Maks 8 treff, best først. */
export function sokKonto(q: string, bareKjop = true, maks = 8): Konto[] {
  const liste = bareKjop ? KONTOPLAN.filter(k => k.kjop) : KONTOPLAN;
  const n = normaliser(q);
  if (!n) return [];
  const alleOrd = n.split(' ');
  // Enkeltbokstaver («k» i «circle k») gir for mange treff alene, men teller i hele frasen.
  const ord = alleOrd.length > 1 ? alleOrd.filter(o => o.length > 1) : alleOrd;
  const poeng = (k: Konto): number => {
    let p = 0;
    if (alleOrd.length > 1) {
      if (k.sokeord.some(s => normaliser(s) === n)) p += 120;
      else if (k.sokeord.some(s => normaliser(s).includes(n)) || normaliser(k.navn).includes(n)) p += 60;
    }
    const navn = normaliser(k.navn), besk = normaliser(k.beskrivelse), sok = k.sokeord.map(normaliser);
    for (const o of ord) {
      if (String(k.nr).startsWith(o)) p += 50;
      if (sok.some(s => s === o)) p += 40;
      else if (sok.some(s => s.startsWith(o) || s.includes(o))) p += 25;
      if (navn.split(' ').some(w => w.startsWith(o))) p += 20;
      else if (navn.includes(o)) p += 10;
      if (besk.includes(o)) p += 5;
    }
    return p;
  };
  return liste.map(k => ({ k, p: poeng(k) })).filter(x => x.p > 0).sort((a, b) => b.p - a.p || a.k.nr - b.k.nr).slice(0, maks).map(x => x.k);
}

/** Regelbasert kontoforslag fra leverandørnavn og varetekst. Gratis, uten AI. */
export function foreslaKonto(tekst: string): { konto: Konto; grunn: string } | null {
  const treff = sokKonto(tekst, true, 1);
  if (!treff.length) return null;
  const k = treff[0];
  return { konto: k, grunn: `«${tekst.trim()}» passer med ${k.navn.toLowerCase()}.` };
}
