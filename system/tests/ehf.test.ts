import { describe, it, expect } from 'vitest';
import { lagEhf, ehfMangler, type EhfData } from '@/lib/ehf';
import { fakturaSummer, linjeNetto } from '@/lib/hovedbok';
import { parseEhf as parseEhfRaw } from '@/lib/motor/rettfort-motor.js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const parseEhf = parseEhfRaw as (x: string) => { fields: any };

const grunn: EhfData = {
  type: 'faktura', nr: 10044, dato: '2026-10-05', forfall: '2026-10-19', kid: '0010044012', referanse: 'Ola Nordmann',
  selger: { navn: 'Havøy Fisk AS', orgnr: '912 345 688', adresse: 'Strandveien 12', postnr: '9008', poststed: 'Tromsø', kontonr: '1506.22.33445', mvaRegistrert: true, orgform: 'AS', epost: 'post@havoy.no' },
  kunde: { navn: 'Kvam Transport & Sønn AS', orgnr: '923456783', adresse: 'Kvamsveien 1', postnr: '5600', poststed: 'Norheimsund' },
  linjer: [
    { beskrivelse: 'Konsulenttimer', antallMilli: 12500, pris: 115000, sats: 25 },
    { beskrivelse: 'Fisk <ferskvare>', antallMilli: 3333, pris: 4990, sats: 15 },
    { beskrivelse: 'Transport', antallMilli: 1000, pris: 89900, sats: 12 },
  ],
};

describe('EHF (Peppol BIS Billing 3.0)', () => {
  it('filen leses tilbake med nøyaktig samme tall som regnskapet', () => {
    const xml = lagEhf(grunn);
    const s = fakturaSummer(grunn.linjer, true);
    const f = parseEhf(xml).fields;
    expect(f.invoiceNo).toBe('10044');
    expect(f.date).toBe('2026-10-05');
    expect(f.dueDate).toBe('2026-10-19');
    expect(Math.round(f.total * 100)).toBe(s.total);
    expect(Math.round(f.vat * 100)).toBe(s.mva);
    expect(Math.round(f.net * 100)).toBe(s.netto);
    expect(f.kid).toBe('0010044012');
    expect(f.account).toBe('15062233445');
    expect(f.supplier).toBe('Havøy Fisk AS');
  });
  it('regnestykket i filen går opp (Peppol-reglene BR-CO-10, 13, 15)', () => {
    const xml = lagEhf(grunn);
    const tall = (tag: string) => [...xml.matchAll(new RegExp(`<cbc:${tag} currencyID="NOK">([\\d.-]+)<`, 'g'))].map(m => Math.round(Number(m[1]) * 100));
    const linjer = grunn.linjer.map(linjeNetto);
    const [, ...linjeBelop] = tall('LineExtensionAmount'); // første er totalen
    expect(linjeBelop).toEqual(linjer);
    const sumLinjer = tall('LineExtensionAmount')[0];
    expect(sumLinjer).toBe(linjer.reduce((a, b) => a + b, 0));
    expect(tall('TaxInclusiveAmount')[0]).toBe(tall('TaxExclusiveAmount')[0] + tall('TaxAmount')[0]);
    expect(xml).toContain('<cbc:CompanyID>NO912345688MVA</cbc:CompanyID>');
    expect(xml).toContain('<cbc:CompanyID>Foretaksregisteret</cbc:CompanyID>');
    expect(xml).toContain('Kvam Transport &amp; Sønn AS');
    expect(xml).toContain('Fisk &lt;ferskvare&gt;');
  });
  it('kreditnota viser til fakturaen den krediterer', () => {
    const xml = lagEhf({ ...grunn, type: 'kreditnota', nr: 10045, krediterer: { nr: 10044, dato: '2026-10-05' }, kreditgrunn: 'Feil antall timer' });
    expect(xml).toContain('<CreditNote ');
    expect(xml).toContain('<cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>');
    expect(xml).toContain('<cac:InvoiceDocumentReference><cbc:ID>10044</cbc:ID>');
    expect(parseEhf(xml).fields.invoiceNo).toBe('10045');
  });
  it('foretak uten MVA-registrering får kategori O og ingen MVA', () => {
    const xml = lagEhf({ ...grunn, selger: { ...grunn.selger, mvaRegistrert: false, orgform: 'ENK' } });
    expect(xml).not.toContain('MVA</cbc:CompanyID>');
    expect(xml).toContain('<cbc:ID>O</cbc:ID>');
    expect(Math.round(parseEhf(xml).fields.vat * 100)).toBe(0);
  });
  it('sier fra om det som mangler', () => {
    expect(ehfMangler(grunn)).toEqual([]);
    expect(ehfMangler({ ...grunn, kunde: { ...grunn.kunde, orgnr: null } })[0]).toMatch(/Kunden mangler organisasjonsnummer/);
  });
});
