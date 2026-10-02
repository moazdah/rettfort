// Lager EHF-faktura og -kreditnota (Peppol BIS Billing 3.0, UBL 2.1). Beløpene regnes med de samme
// funksjonene som fakturaen i regnskapet, så filen og regnskapet alltid viser like tall.
// Filen kan lastes ned og sendes nå; når et aksesspunkt er koblet til, sendes den samme filen over Peppol.

import { fakturaSummer, linjeNetto, type FakturaLinje } from './hovedbok';

export interface EhfPart { navn: string; orgnr: string | null; adresse: string | null; postnr: string | null; poststed: string | null; epost?: string | null }
export interface EhfData {
  type: 'faktura' | 'kreditnota';
  nr: number;
  dato: string;
  forfall: string | null;
  kid: string | null;
  referanse: string | null;
  krediterer?: { nr: number; dato: string } | null;
  kreditgrunn?: string | null;
  selger: EhfPart & { kontonr: string | null; mvaRegistrert: boolean; orgform: string };
  kunde: EhfPart;
  linjer: FakturaLinje[];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const b = (ore: number) => (ore / 100).toFixed(2);
const tall = (orgnr: string | null) => (orgnr ?? '').replace(/\D/g, '');
const kategori = (sats: number, mvaReg: boolean) => (!mvaReg ? 'O' : sats === 0 ? 'Z' : 'S');

function part(p: EhfPart, selger?: { mvaRegistrert: boolean; orgform: string }) {
  const org = tall(p.orgnr);
  return `<cac:Party>
      ${org ? `<cbc:EndpointID schemeID="0192">${org}</cbc:EndpointID>` : ''}
      <cac:PartyName><cbc:Name>${esc(p.navn)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        ${p.adresse ? `<cbc:StreetName>${esc(p.adresse)}</cbc:StreetName>` : ''}
        ${p.poststed ? `<cbc:CityName>${esc(p.poststed)}</cbc:CityName>` : ''}
        ${p.postnr ? `<cbc:PostalZone>${esc(p.postnr)}</cbc:PostalZone>` : ''}
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      ${selger?.mvaRegistrert && org ? `<cac:PartyTaxScheme><cbc:CompanyID>NO${org}MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : ''}
      ${selger && selger.orgform === 'AS' ? `<cac:PartyTaxScheme><cbc:CompanyID>Foretaksregisteret</cbc:CompanyID><cac:TaxScheme><cbc:ID>TAX</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : ''}
      <cac:PartyLegalEntity><cbc:RegistrationName>${esc(p.navn)}</cbc:RegistrationName>${org ? `<cbc:CompanyID schemeID="0192">${org}</cbc:CompanyID>` : ''}</cac:PartyLegalEntity>
      ${p.epost ? `<cac:Contact><cbc:ElectronicMail>${esc(p.epost)}</cbc:ElectronicMail></cac:Contact>` : ''}
    </cac:Party>`;
}

/** Hva som mangler for at filen skal kunne sendes over Peppol. Tom liste = klar. */
export function ehfMangler(d: EhfData): string[] {
  const m: string[] = [];
  if (!tall(d.selger.orgnr)) m.push('Foretaket mangler organisasjonsnummer.');
  if (!tall(d.kunde.orgnr)) m.push('Kunden mangler organisasjonsnummer. EHF kan bare sendes til foretak.');
  if (d.type === 'faktura' && !d.selger.kontonr) m.push('Foretaket mangler kontonummer.');
  return m;
}

export function lagEhf(d: EhfData): string {
  const kredit = d.type === 'kreditnota';
  const rot = kredit ? 'CreditNote' : 'Invoice';
  const s = fakturaSummer(d.linjer, d.selger.mvaRegistrert);
  const mvaReg = d.selger.mvaRegistrert;
  const linjer = d.linjer.map((l, i) => {
    const sats = mvaReg ? l.sats : 0;
    const antall = (l.antallMilli / 1000).toString();
    return `<cac:${kredit ? 'CreditNoteLine' : 'InvoiceLine'}>
    <cbc:ID>${i + 1}</cbc:ID>
    <cbc:${kredit ? 'CreditedQuantity' : 'InvoicedQuantity'} unitCode="EA">${antall}</cbc:${kredit ? 'CreditedQuantity' : 'InvoicedQuantity'}>
    <cbc:LineExtensionAmount currencyID="NOK">${b(linjeNetto(l))}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${esc(l.beskrivelse.slice(0, 200) || 'Vare/tjeneste')}</cbc:Name>
      <cac:ClassifiedTaxCategory><cbc:ID>${kategori(sats, mvaReg)}</cbc:ID>${mvaReg ? `<cbc:Percent>${sats}</cbc:Percent>` : ''}<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">${b(l.pris)}</cbc:PriceAmount></cac:Price>
  </cac:${kredit ? 'CreditNoteLine' : 'InvoiceLine'}>`;
  }).join('\n  ');
  const skatt = s.perSats.map(p => `<cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">${b(p.grunnlag)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">${b(p.mva)}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>${kategori(p.sats, mvaReg)}</cbc:ID>${mvaReg ? `<cbc:Percent>${p.sats}</cbc:Percent>` : ''}${!mvaReg ? '<cbc:TaxExemptionReason>Ikke merverdiavgiftspliktig</cbc:TaxExemptionReason>' : ''}<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>`).join('\n    ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<${rot} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${rot}-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${d.nr}</cbc:ID>
  <cbc:IssueDate>${d.dato}</cbc:IssueDate>
  ${!kredit && d.forfall ? `<cbc:DueDate>${d.forfall}</cbc:DueDate>` : ''}
  <cbc:${kredit ? 'CreditNoteTypeCode' : 'InvoiceTypeCode'}>${kredit ? 381 : 380}</cbc:${kredit ? 'CreditNoteTypeCode' : 'InvoiceTypeCode'}>
  ${kredit && d.kreditgrunn ? `<cbc:Note>${esc(d.kreditgrunn)}</cbc:Note>` : ''}
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cbc:BuyerReference>${esc(d.referanse?.trim() || d.kunde.navn)}</cbc:BuyerReference>
  ${kredit && d.krediterer ? `<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${d.krediterer.nr}</cbc:ID><cbc:IssueDate>${d.krediterer.dato}</cbc:IssueDate></cac:InvoiceDocumentReference></cac:BillingReference>` : ''}
  <cac:AccountingSupplierParty>
    ${part(d.selger, d.selger)}
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    ${part(d.kunde)}
  </cac:AccountingCustomerParty>
  ${!kredit && d.selger.kontonr ? `<cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
    ${d.kid ? `<cbc:PaymentID>${esc(d.kid)}</cbc:PaymentID>` : ''}
    <cac:PayeeFinancialAccount><cbc:ID>${tall(d.selger.kontonr)}</cbc:ID></cac:PayeeFinancialAccount>
  </cac:PaymentMeans>` : ''}
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">${b(s.mva)}</cbc:TaxAmount>
    ${skatt}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${b(s.netto)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${b(s.netto)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${b(s.total)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${b(s.total)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  ${linjer}
</${rot}>
`;
}
