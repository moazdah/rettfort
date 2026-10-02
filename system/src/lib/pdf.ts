// Faktura som PDF (A4). Standardfonter i pdf-lib dekker norske bokstaver (WinAnsi).

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { fakturaSummer, linjeNetto, type FakturaLinje } from './hovedbok';
import { formaterOrgnr } from './brreg';
import { kr } from './penger';
import { formaterKontonr } from './vis';

const BLA = rgb(11 / 255, 37 / 255, 69 / 255);
const MUT = rgb(0.35, 0.38, 0.45);
const LINJE = rgb(0.89, 0.87, 0.83);
const TITTEL: Record<string, string> = { faktura: 'Faktura', tilbud: 'Tilbud', kvittering: 'Kvittering', kreditnota: 'Kreditnota' };

/** Fjerner tegn som WinAnsi ikke kan skrive. */
const rens = (s: string | null | undefined) => (s ?? '').replace(/[  ]/g, ' ').replace(/−/g, '-').replace(/[«»]/g, '"').replace(/[–—]/g, '-').replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
const nd = (d?: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('.') : '');

/** Logoen til foretaket, øverst til venstre. */
export interface PdfLogo { bytes: Uint8Array; mime: string }

/** Tegner logoen med toppen på y = 806, høyst 48 pt høy og 180 pt bred. Gir hvor navnet skal stå under. */
async function tegnLogo(doc: PDFDocument, side: PDFPage, logo: PdfLogo | null | undefined, x: number): Promise<number> {
  if (!logo) return 790;
  try {
    const bilde = logo.mime === 'image/png' ? await doc.embedPng(logo.bytes) : await doc.embedJpg(logo.bytes);
    const skala = Math.min(48 / bilde.height, 180 / bilde.width);
    const w = bilde.width * skala, h = bilde.height * skala;
    side.drawImage(bilde, { x, y: 806 - h, width: w, height: h });
    return 806 - h - 22;
  } catch {
    return 790; // Et bilde pdf-lib ikke kan lese, skal aldri stoppe fakturaen.
  }
}

export interface PdfData {
  type: string; nr: number | null; dato: string; forfall: string | null; levert: string | null; referanse: string | null; kid: string | null; kreditgrunn?: string | null;
  avsender: { navn: string; orgnr: string | null; adresse: string | null; postnr: string | null; poststed: string | null; kontonr: string | null; epost: string | null; telefon: string | null; tekst: string | null; mvaRegistrert: boolean; orgform: string };
  kunde: { navn: string; orgnr: string | null; adresse: string | null; postnr: string | null; poststed: string | null } | null;
  linjer: FakturaLinje[];
  logo?: PdfLogo | null;
}

export async function lagFakturaPdf(f: PdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${TITTEL[f.type] ?? 'Faktura'} ${f.nr ?? ''} ${rens(f.avsender.navn)}`.trim());
  doc.setCreator('Rettført');
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const fet = await doc.embedFont(StandardFonts.HelveticaBold);
  let side = doc.addPage([595.28, 841.89]);
  const V = 50, H = 545;
  let y = 790;
  const tekst = (p: PDFPage, t: string, x: number, yy: number, o: { font?: PDFFont; size?: number; farge?: ReturnType<typeof rgb>; hoyre?: boolean } = {}) => {
    const font = o.font ?? reg, size = o.size ?? 10, s = rens(t);
    p.drawText(s, { x: o.hoyre ? x - font.widthOfTextAtSize(s, size) : x, y: yy, font, size, color: o.farge ?? BLA });
  };
  const a = f.avsender;
  const navnY = await tegnLogo(doc, side, f.logo, V);
  tekst(side, a.navn, V, navnY, { font: fet, size: 14 });
  const avLinjer = [
    [a.adresse, [a.postnr, a.poststed].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    a.orgnr ? `Org.nr ${formaterOrgnr(a.orgnr)}${a.mvaRegistrert ? ' MVA' : ''}` : '',
    a.orgform === 'AS' ? 'Foretaksregisteret' : '',
    [a.epost, a.telefon].filter(Boolean).join('  ·  '),
  ].filter(Boolean);
  avLinjer.forEach((l, i) => tekst(side, l, V, navnY - 16 - i * 13, { size: 9.5, farge: MUT }));
  tekst(side, TITTEL[f.type] ?? 'Faktura', H, y, { font: fet, size: 20, hoyre: true });
  const hoyre = [
    `Nr. ${f.nr ?? ''}`, `Dato ${nd(f.dato)}`,
    f.levert ? `Levert ${f.levert}` : '',
    f.type === 'faktura' && f.forfall ? `Forfall ${nd(f.forfall)}` : '',
    f.type === 'tilbud' && f.forfall ? `Gyldig til ${nd(f.forfall)}` : '',
    f.kid ? `KID ${f.kid}` : '', f.referanse ? `Ref. ${f.referanse}` : '',
  ].filter(Boolean);
  hoyre.forEach((l, i) => tekst(side, l, H, y - 20 - i * 13, { size: 9.5, farge: l.startsWith('KID') ? BLA : MUT, font: l.startsWith('KID') ? fet : reg, hoyre: true }));
  y = Math.min(navnY - 40 - avLinjer.length * 13, y - 40 - hoyre.length * 13);
  tekst(side, 'TIL', V, y, { size: 8, farge: MUT, font: fet });
  if (f.kunde) {
    tekst(side, f.kunde.navn, V, y - 14, { font: fet, size: 11 });
    const k = [[f.kunde.adresse, [f.kunde.postnr, f.kunde.poststed].filter(Boolean).join(' ')].filter(Boolean).join(', '), f.kunde.orgnr ? `Org.nr ${formaterOrgnr(f.kunde.orgnr)}` : ''].filter(Boolean);
    k.forEach((l, i) => tekst(side, l, V, y - 28 - i * 12, { size: 9.5, farge: MUT }));
    y -= 30 + k.length * 12;
  }
  y -= 20;
  if (f.kreditgrunn) { tekst(side, `Grunn: ${f.kreditgrunn}`, V, y); y -= 20; }
  const kol = { antall: 360, pris: 430, mva: 480, belop: H };
  const hode = () => {
    tekst(side, 'Beskrivelse', V, y, { size: 8.5, farge: MUT });
    tekst(side, 'Antall', kol.antall, y, { size: 8.5, farge: MUT, hoyre: true });
    tekst(side, 'Pris', kol.pris, y, { size: 8.5, farge: MUT, hoyre: true });
    if (a.mvaRegistrert) tekst(side, 'MVA', kol.mva, y, { size: 8.5, farge: MUT, hoyre: true });
    tekst(side, 'Beløp', kol.belop, y, { size: 8.5, farge: MUT, hoyre: true });
    side.drawLine({ start: { x: V, y: y - 5 }, end: { x: H, y: y - 5 }, thickness: 0.7, color: LINJE });
    y -= 20;
  };
  hode();
  for (const l of f.linjer) {
    // Lange beskrivelser brytes over flere linjer.
    const ord = rens(l.beskrivelse).split(' ');
    const rader: string[] = [];
    let rad = '';
    for (const o of ord) { const prov = rad ? `${rad} ${o}` : o; if (reg.widthOfTextAtSize(prov, 10) > 270 && rad) { rader.push(rad); rad = o; } else rad = prov; }
    rader.push(rad);
    if (y - rader.length * 13 < 140) { side = doc.addPage([595.28, 841.89]); y = 790; hode(); }
    rader.forEach((r, i) => tekst(side, r, V, y - i * 13));
    tekst(side, (l.antallMilli / 1000).toLocaleString('nb-NO', { maximumFractionDigits: 3 }), kol.antall, y, { hoyre: true });
    tekst(side, kr(l.pris), kol.pris, y, { hoyre: true });
    if (a.mvaRegistrert) tekst(side, `${l.sats} %`, kol.mva, y, { hoyre: true });
    tekst(side, kr(linjeNetto(l)), kol.belop, y, { hoyre: true });
    y -= rader.length * 13 + 6;
    side.drawLine({ start: { x: V, y: y + 3 }, end: { x: H, y: y + 3 }, thickness: 0.4, color: LINJE });
    y -= 8;
  }
  const s = fakturaSummer(f.linjer, a.mvaRegistrert);
  y -= 6;
  const sumLinje = (t: string, b: string, fetSkrift = false) => { tekst(side, t, 400, y, { farge: fetSkrift ? BLA : MUT, font: fetSkrift ? fet : reg, size: fetSkrift ? 12 : 10 }); tekst(side, b, H, y, { hoyre: true, font: fetSkrift ? fet : reg, size: fetSkrift ? 12 : 10 }); y -= fetSkrift ? 18 : 14; };
  sumLinje('Netto', kr(s.netto));
  for (const g of s.perSats.filter(x => x.sats > 0)) sumLinje(`MVA ${g.sats} %`, kr(g.mva));
  side.drawLine({ start: { x: 400, y: y + 9 }, end: { x: H, y: y + 9 }, thickness: 0.7, color: LINJE });
  y -= 4;
  sumLinje(f.type === 'kvittering' ? 'Betalt' : f.type === 'kreditnota' ? 'Til gode' : f.type === 'tilbud' ? 'Totalt' : 'Å betale', `${kr(s.total)} kr`, true);
  // Betalingsinformasjon nederst
  let by = 110;
  side.drawLine({ start: { x: V, y: by + 18 }, end: { x: H, y: by + 18 }, thickness: 0.7, color: LINJE });
  if (f.type === 'faktura') {
    tekst(side, 'Betalingsinformasjon', V, by, { font: fet, size: 10 }); by -= 15;
    tekst(side, `Kontonummer: ${formaterKontonr(a.kontonr)}`, V, by, { size: 10 });
    if (f.kid) tekst(side, `KID: ${f.kid}`, 250, by, { size: 10, font: fet });
    tekst(side, `Beløp: ${kr(s.total)} kr`, H, by, { size: 10, hoyre: true }); by -= 14;
    if (f.forfall) { tekst(side, `Betales innen ${nd(f.forfall)}`, V, by, { size: 9.5, farge: MUT }); by -= 14; }
  }
  if (a.tekst) { tekst(side, a.tekst, V, by, { size: 9, farge: MUT }); by -= 12; }
  if (!a.mvaRegistrert) tekst(side, 'Foretaket er ikke registrert i Merverdiavgiftsregisteret.', V, by, { size: 9, farge: MUT });
  return doc.save();
}

export interface LonnslippPdfData {
  foretak: { navn: string; orgnr: string | null; adresse: string | null; postnr: string | null; poststed: string | null };
  ansatt: { navn: string; stilling: string | null; kontonr: string | null };
  periodeTekst: string; utbetalt: string; skatteprosent: number;
  linjer: { tekst: string; antall?: number; sats?: number; belop: number }[];
  brutto: number; skatt: number; netto: number; feriepenger: number; feriePst: number;
  /** Utlegg som betales tilbake sammen med lønnen. Skattefritt, legges til etter skattetrekket. */
  utlegg?: { tekst: string; belop: number }[];
  logo?: PdfLogo | null;
  /** Samme logo som data-URL, til lønnslippen på nettsiden. */
  logoUrl?: string | null;
}

/** Lønnslipp som PDF (A4), samme oppsett som den den ansatte ser i systemet. */
export async function lagLonnslippPdf(l: LonnslippPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Lønnslipp ${l.periodeTekst} ${rens(l.ansatt.navn)}`);
  doc.setCreator('Rettført');
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const fet = await doc.embedFont(StandardFonts.HelveticaBold);
  const side = doc.addPage([595.28, 841.89]);
  const V = 50, H = 545;
  let y = 790;
  const tekst = (t: string, x: number, yy: number, o: { font?: PDFFont; size?: number; farge?: ReturnType<typeof rgb>; hoyre?: boolean } = {}) => {
    const font = o.font ?? reg, size = o.size ?? 10, s = rens(t);
    side.drawText(s, { x: o.hoyre ? x - font.widthOfTextAtSize(s, size) : x, y: yy, font, size, color: o.farge ?? BLA });
  };
  const f = l.foretak;
  const navnY = await tegnLogo(doc, side, l.logo, V);
  tekst(f.navn, V, navnY, { font: fet, size: 14 });
  [[f.adresse, [f.postnr, f.poststed].filter(Boolean).join(' ')].filter(Boolean).join(', '), f.orgnr ? `Org.nr ${formaterOrgnr(f.orgnr)}` : ''].filter(Boolean)
    .forEach((t, i) => tekst(t, V, navnY - 16 - i * 13, { size: 9.5, farge: MUT }));
  tekst('Lønnslipp', H, y, { font: fet, size: 20, hoyre: true });
  tekst(l.periodeTekst, H, y - 20, { size: 9.5, farge: MUT, hoyre: true });
  tekst(`Utbetalt ${nd(l.utbetalt)}`, H, y - 33, { size: 9.5, farge: MUT, hoyre: true });
  y = navnY - 80;
  tekst('TIL', V, y, { size: 8, farge: MUT, font: fet });
  tekst(l.ansatt.navn, V, y - 14, { font: fet, size: 11 });
  const info = [l.ansatt.stilling, l.ansatt.kontonr ? `Konto ${formaterKontonr(l.ansatt.kontonr)}` : ''].filter(Boolean).join('  ·  ');
  if (info) tekst(info, V, y - 28, { size: 9.5, farge: MUT });
  y -= 60;
  tekst('Beskrivelse', V, y, { size: 8.5, farge: MUT });
  tekst('Beløp', H, y, { size: 8.5, farge: MUT, hoyre: true });
  side.drawLine({ start: { x: V, y: y - 5 }, end: { x: H, y: y - 5 }, thickness: 0.7, color: LINJE });
  y -= 22;
  const rad = (t: string, b: string) => { tekst(t, V, y); tekst(b, H, y, { hoyre: true }); y -= 8; side.drawLine({ start: { x: V, y }, end: { x: H, y }, thickness: 0.4, color: LINJE }); y -= 14; };
  for (const x of l.linjer) rad(`${x.tekst}${x.antall != null ? `  ·  ${String(x.antall).replace('.', ',')} t à ${kr(x.sats ?? 0)}` : ''}`, kr(x.belop));
  rad('Sum brutto', kr(l.brutto));
  rad(`Skattetrekk ${String(l.skatteprosent).replace('.', ',')} %`, `-${kr(l.skatt)}`);
  for (const u of l.utlegg ?? []) rad(`Refusjon av utlegg: ${u.tekst}`, kr(u.belop));
  y -= 4;
  tekst('Utbetalt', V, y, { font: fet, size: 12 });
  tekst(`${kr(l.netto + (l.utlegg ?? []).reduce((a, u) => a + u.belop, 0))} kr`, H, y, { font: fet, size: 12, hoyre: true });
  y -= 28;
  tekst(`Feriepenger opptjent denne måneden: ${kr(l.feriepenger)} kr (${String(l.feriePst).replace('.', ',')} %). De utbetales etter reglene i ferieloven.`, V, y, { size: 9, farge: MUT });
  tekst('Spørsmål om lønnen? Kontakt arbeidsgiveren din.', V, 90, { size: 9, farge: MUT });
  return doc.save();
}
