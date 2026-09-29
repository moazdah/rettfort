// Assistenten svarer på spørsmål om egne tall. Svarene regnes ut her, fra regnskapet, og viser alltid
// hvor tallet kommer fra. Den gjetter aldri: finnes ikke svaret i tallene, sier den det.

import { kr } from './penger';

export interface Fakta {
  idag: string;
  ar: number;
  bank: number;
  kunder: { nr: number; kunde: string; forfall: string | null; rest: number }[];
  leverandorer: { navn: string; forfall: string | null; total: number }[];
  resultat: { inntekter: number; kostnader: number; resultat: number };
  ifjor: { inntekter: number; kostnader: number; resultat: number } | null;
  storsteKostnader: { navn: string; belop: number }[];
  mva: { fra: string; til: string; aBetale: number; sendt: boolean; mangler: number } | null;
  skyldigMva: number;
  trekk: number;
  aga: number;
  frister: { dato: string; tittel: string }[];
}

export interface Svar { tekst: string; kilder: { tekst: string; href: string }[] }

export const FORSLAG = ['Hvor mye har vi i banken?', 'Hvem skylder oss penger?', 'Hva må vi betale snart?', 'Hvor mye MVA skal vi betale?', 'Hvordan går det i år?', 'Hva bruker vi mest penger på?', 'Når er neste frist?'];

const dato = (d: string) => d.split('-').reverse().join('.');
const dagerTil = (idag: string, d: string) => Math.round((Date.parse(d) - Date.parse(idag)) / 86400000);
const flertall = (n: number, en: string, flere: string) => `${n} ${n === 1 ? en : flere}`;

/** Normaliserer spørsmålet så vi kan kjenne igjen ord uansett skrivemåte. */
function norm(s: string) { return ' ' + s.toLowerCase().replace(/[^a-zæøå0-9 ]+/g, ' ').replace(/\s+/g, ' ') + ' '; }
const har = (q: string, ...ord: string[]) => ord.some(o => q.includes(o));

export function svar(sporsmal: string, f: Fakta): Svar {
  const q = norm(sporsmal);

  if (har(q, ' skylder oss', 'skylder meg', 'skylder deg', 'utestående', 'utestaende', 'kundefordring', 'ikke betalt oss', 'forfalt', 'purre', 'hvem skylder', 'ubetalte faktura', 'ikke betalt faktura')) return kunderSvar(f);
  if (har(q, 'betale snart', 'må vi betale', 'må jeg betale', 'regning', 'leverandør', 'leverandor', 'vi skylder', 'jeg skylder', 'gjeld', 'ubetalte kjøp', 'forfaller')) return betaleSvar(f);
  if (har(q, ' mva', 'moms', 'merverdi')) return mvaSvar(f);
  if (har(q, 'frist', 'når må', 'når skal', 'deadline', 'altinn', 'a melding', 'skattemelding', 'årsregnskap')) return fristSvar(f);
  if (har(q, 'bruker vi', 'bruker jeg', 'største kost', 'storste kost', 'mest penger', 'kostnad', 'utgift')) return kostnadSvar(f);
  if (har(q, 'bank', 'saldo', 'likvid', 'penger på konto', 'penger har', 'hvor mye penger', 'råd til', 'rad til', 'kontanter')) return bankSvar(f);
  if (har(q, 'resultat', 'overskudd', 'underskudd', 'går det', 'tjent', 'inntekt', 'omsetning', 'solgt', 'lønnsom', 'lonnsom', 'fortjeneste')) return resultatSvar(f);

  return {
    tekst: 'Det finner jeg ikke svar på i tallene. Jeg kan svare på saldo i banken, hvem som skylder dere penger, hva dere må betale, MVA, frister, resultatet og hva dere bruker penger på.',
    kilder: [],
  };
}

function kunderSvar(f: Fakta): Svar {
  const apne = f.kunder.filter(k => k.rest > 0);
  if (!apne.length) return { tekst: 'Ingen kunder skylder dere penger nå. Alle sendte fakturaer er betalt.', kilder: [{ tekst: 'Penger inn', href: '/salg' }] };
  const sum = apne.reduce((a, k) => a + k.rest, 0);
  const forfalt = apne.filter(k => k.forfall && k.forfall < f.idag);
  const linjer = apne.slice(0, 6).map(k => `• ${k.kunde}${k.nr ? `, faktura ${k.nr}` : ''}: ${kr(k.rest)} kr${k.forfall ? (k.forfall < f.idag ? `, forfalt ${dato(k.forfall)}` : `, forfall ${dato(k.forfall)}`) : ''}`);
  const tekst = `Kundene skylder dere ${kr(sum)} kr fordelt på ${flertall(apne.length, 'post', 'poster')}.${forfalt.length ? ` ${flertall(forfalt.length, 'er forfalt', 'er forfalt')}, til sammen ${kr(forfalt.reduce((a, k) => a + k.rest, 0))} kr.` : ' Ingen er forfalt.'}\n\n${linjer.join('\n')}${apne.length > 6 ? `\n… og ${apne.length - 6} til.` : ''}`;
  return { tekst, kilder: [{ tekst: 'Penger inn', href: '/salg' }, { tekst: 'Kundefordringer (konto 1500)', href: '/rapporter?tab=bal' }] };
}

function betaleSvar(f: Fakta): Svar {
  const om30 = f.leverandorer.filter(l => !l.forfall || dagerTil(f.idag, l.forfall) <= 30);
  const sumLev = f.leverandorer.reduce((a, l) => a + l.total, 0);
  const deler: string[] = [];
  if (f.leverandorer.length) deler.push(`Ubetalte regninger: ${kr(sumLev)} kr fordelt på ${flertall(f.leverandorer.length, 'regning', 'regninger')}.`);
  else deler.push('Dere har ingen ubetalte regninger fra leverandører.');
  const linjer = om30.slice(0, 6).map(l => `• ${l.navn}: ${kr(l.total)} kr${l.forfall ? (l.forfall < f.idag ? `, forfalt ${dato(l.forfall)}` : `, forfall ${dato(l.forfall)}`) : ''}`);
  if (f.skyldigMva > 0) deler.push(`Skyldig MVA: ${kr(f.skyldigMva)} kr.`);
  if (f.trekk > 0 || f.aga > 0) deler.push(`Skattetrekk og arbeidsgiveravgift: ${kr(f.trekk + f.aga)} kr.`);
  return { tekst: deler.join(' ') + (linjer.length ? `\n\nDe neste 30 dagene:\n${linjer.join('\n')}` : ''), kilder: [{ tekst: 'Penger ut', href: '/kjop' }, { tekst: 'Frister', href: '/frister' }] };
}

function mvaSvar(f: Fakta): Svar {
  if (!f.mva) return { tekst: 'Foretaket er ikke registrert for MVA, så dere har ingen MVA-melding å levere.', kilder: [{ tekst: 'Innstillinger', href: '/innstillinger' }] };
  const m = f.mva;
  const belop = m.aBetale >= 0 ? `${kr(m.aBetale)} kr å betale` : `${kr(-m.aBetale)} kr til gode`;
  const status = m.sendt ? 'Meldingen er sendt.' : m.mangler ? `${flertall(m.mangler, 'ting', 'ting')} må ordnes før den kan sendes.` : 'Alt er klart til å sendes.';
  return { tekst: `For terminen ${dato(m.fra)}–${dato(m.til)} viser tallene ${belop}. ${status}`, kilder: [{ tekst: 'MVA', href: '/mva' }] };
}

function fristSvar(f: Fakta): Svar {
  const neste = f.frister.filter(x => x.dato >= f.idag).slice(0, 4);
  if (!neste.length) return { tekst: 'Jeg finner ingen kommende frister.', kilder: [{ tekst: 'Frister', href: '/frister' }] };
  const [forst, ...resten] = neste;
  const dager = dagerTil(f.idag, forst.dato);
  return {
    tekst: `Neste frist er ${forst.tittel.toLowerCase()} ${dato(forst.dato)}, ${dager === 0 ? 'i dag' : dager === 1 ? 'i morgen' : `om ${dager} dager`}.${resten.length ? `\n\nDeretter:\n${resten.map(x => `• ${dato(x.dato)}: ${x.tittel}`).join('\n')}` : ''}`,
    kilder: [{ tekst: 'Frister', href: '/frister' }],
  };
}

function kostnadSvar(f: Fakta): Svar {
  if (!f.storsteKostnader.length) return { tekst: `Det er ikke ført noen kostnader i ${f.ar} ennå.`, kilder: [{ tekst: 'Rapporter', href: '/rapporter' }] };
  const linjer = f.storsteKostnader.slice(0, 5).map(k => `• ${k.navn}: ${kr(k.belop)} kr`);
  return { tekst: `I ${f.ar} har dere brukt ${kr(f.resultat.kostnader)} kr. Mest går til:\n${linjer.join('\n')}`, kilder: [{ tekst: 'Resultatregnskap', href: '/rapporter?tab=res' }] };
}

function bankSvar(f: Fakta): Svar {
  const ut30 = f.leverandorer.filter(l => l.forfall && dagerTil(f.idag, l.forfall) <= 30).reduce((a, l) => a + l.total, 0) + Math.max(0, f.skyldigMva) + Math.max(0, f.trekk) + Math.max(0, f.aga);
  const inn30 = f.kunder.filter(k => k.rest > 0 && k.forfall && dagerTil(f.idag, k.forfall) <= 30).reduce((a, k) => a + k.rest, 0);
  const tekst = `Saldoen i banken er ${kr(f.bank)} kr ifølge regnskapet.${inn30 || ut30 ? `\n\nDe neste 30 dagene venter dere ${kr(inn30)} kr inn fra kunder og ${kr(ut30)} kr ut til regninger, MVA og skatt. Det gir omtrent ${kr(f.bank + inn30 - ut30)} kr om kundene betaler i tide.` : ''}`;
  return { tekst, kilder: [{ tekst: 'Bank', href: '/bank' }, { tekst: 'Balanse (konto 1920)', href: '/rapporter?tab=bal' }] };
}

function resultatSvar(f: Fakta): Svar {
  const r = f.resultat;
  const ord = r.resultat >= 0 ? 'overskudd' : 'underskudd';
  let tekst = `Hittil i ${f.ar} har dere ${kr(r.inntekter)} kr i inntekter og ${kr(r.kostnader)} kr i kostnader. Det gir et ${ord} på ${kr(Math.abs(r.resultat))} kr.`;
  if (f.ifjor) {
    const diff = r.resultat - f.ifjor.resultat;
    tekst += ` Samme periode i fjor var resultatet ${kr(f.ifjor.resultat)} kr, altså ${diff >= 0 ? kr(diff) + ' kr bedre' : kr(-diff) + ' kr svakere'} i år.`;
  }
  return { tekst, kilder: [{ tekst: 'Resultatregnskap', href: '/rapporter?tab=res' }] };
}
