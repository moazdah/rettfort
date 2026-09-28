// Faktura som PDF (A4). Standardfonter i pdf-lib dekker norske bokstaver (WinAnsi).

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { fakturaSummer, linjeNetto, type FakturaLinje } from './hovedbok';
import { formaterOrgnr } from './brreg';
import { kr } from './penger';

const BLA = rgb(11 / 255, 37 / 255, 69 / 255);
const MUT = rgb(0.35, 0.38, 0.45);
const LINJE = rgb(0.89, 0.87, 0.83);
const TITTEL: Record<string, string> = { faktura: 'Faktura', tilbud: 'Tilbud', kvittering: 'Kvittering', kreditnota: 'Kreditnota' };

/** Fjerner tegn som WinAnsi ikke kan skrive. */
const rens = (s: string | null | undefined) => (s ?? '').replace(/[  ]/g, ' ').replace(/−/g, '-').replace(/[«»]/g, '"').replace(/[–—]/g, '-').replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
const nd = (d?: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('.') : '');

export interface PdfData {
  type: string; nr: number | null; dato: string; forfall: string | null; levert: string | null; referanse: string | null; kid: string | null; kreditgrunn?: string | null;
  avsender: { navn: string; orgnr: string | null; adresse: string | null; postnr: string | null; poststed: string | null; kontonr: string | null; epost: string | null; telefon: string | null; tekst: string | null; mvaRegistrert: boolean; orgform: string };
  kunde: { navn: string; orgnr: string | null; adresse: string | null; postnr: string | null; poststed: string | null } | null;
  linjer: FakturaLinje[];
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
  tekst(side, a.navn, V, y, { font: fet, size: 14 });
  const avLinjer = [
    [a.adresse, [a.postnr, a.poststed].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    a.orgnr ? `Org.nr ${formaterOrgnr(a.orgnr)}${a.mvaRegistrert ? ' MVA' : ''}` : '',
    a.orgform === 'AS' ? 'Foretaksregisteret' : '',
    [a.epost, a.telefon].filter(Boolean).join('  ·  '),
  ].filter(Boolean);
  avLinjer.forEach((l, i) => tekst(side, l, V, y - 16 - i * 13, { size: 9.5, farge: MUT }));
  tekst(side, TITTEL[f.type] ?? 'Faktura', H, y, { font: fet, size: 20, hoyre: true });
  const hoyre = [
    `Nr. ${f.nr ?? ''}`, `Dato ${nd(f.dato)}`,
    f.levert ? `Levert ${f.levert}` : '',
    f.type === 'faktura' && f.forfall ? `Forfall ${nd(f.forfall)}` : '',
    f.type === 'tilbud' && f.forfall ? `Gyldig til ${nd(f.forfall)}` : '',
    f.kid ? `KID ${f.kid}` : '', f.referanse ? `Ref. ${f.referanse}` : '',
  ].filter(Boolean);
  hoyre.forEach((l, i) => tekst(side, l, H, y - 20 - i * 13, { size: 9.5, farge: l.startsWith('KID') ? BLA : MUT, font: l.startsWith('KID') ? fet : reg, hoyre: true }));
  y -= 40 + Math.max(avLinjer.length, hoyre.length) * 13;
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
    tekst(side, `Kontonummer: ${a.kontonr ?? ''}`, V, by, { size: 10 });
    if (f.kid) tekst(side, `KID: ${f.kid}`, 250, by, { size: 10, font: fet });
    tekst(side, `Beløp: ${kr(s.total)} kr`, H, by, { size: 10, hoyre: true }); by -= 14;
    if (f.forfall) { tekst(side, `Betales innen ${nd(f.forfall)}`, V, by, { size: 9.5, farge: MUT }); by -= 14; }
  }
  if (a.tekst) { tekst(side, a.tekst, V, by, { size: 9, farge: MUT }); by -= 12; }
  if (!a.mvaRegistrert) tekst(side, 'Foretaket er ikke registrert i Merverdiavgiftsregisteret.', V, by, { size: 9, farge: MUT });
  return doc.save();
}
