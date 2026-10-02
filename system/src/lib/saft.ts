// SAF-T Regnskap (Financial) versjon 1.30 for Norge. Brukes ved bytte av system, til regnskapsfører
// og når Skatteetaten ber om det. Hele året, med åpnings- og sluttsaldo per konto, kunde og leverandør.

import type { Sporring } from './db';
import { kontoNavn } from './kontoplan';
import { MVA_KODER } from './mva';

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const bel = (ore: number) => (Math.abs(ore) / 100).toFixed(2);
const el = (n: string, v: unknown) => (v === null || v === undefined || v === '' ? '' : `<n1:${n}>${esc(v)}</n1:${n}>`);

function saldoEl(prefiks: 'Opening' | 'Closing', saldo: number): string {
  return saldo >= 0 ? `<n1:${prefiks}DebitBalance>${bel(saldo)}</n1:${prefiks}DebitBalance>` : `<n1:${prefiks}CreditBalance>${bel(saldo)}</n1:${prefiks}CreditBalance>`;
}

function adresse(a: { adresse: string | null; postnr: string | null; poststed: string | null }): string {
  return `<n1:Address>${el('StreetName', a.adresse || 'Ukjent')}${el('City', a.poststed || 'Ukjent')}${el('PostalCode', a.postnr || '0000')}<n1:Country>NO</n1:Country></n1:Address>`;
}

export async function lagSaft(t: Sporring, orgId: string, ar: number, idag: string): Promise<string> {
  const fra = `${ar}-01-01`, til = `${ar}-12-31`;
  const o = await t.en<{ navn: string; orgnr: string | null; adresse: string | null; postnr: string | null; poststed: string | null; kontonr: string | null; mva_registrert: boolean; epost: string | null; telefon: string | null }>('select * from organisasjon where id = $1', [orgId]);
  const eier = await t.en<{ navn: string }>(`select b.navn from medlemskap m join bruker b on b.id = m.bruker_id where m.organisasjon_id = $1 and m.rolle = 'eier' limit 1`, [orgId]);
  const inng = await t.q<{ konto: number; saldo: number }>(`select konto, sum(debet - kredit)::bigint as saldo from postering where organisasjon_id = $1 and dato < $2 group by konto`, [orgId, fra]);
  const iar = await t.q<{ konto: number; saldo: number }>(`select konto, sum(debet - kredit)::bigint as saldo from postering where organisasjon_id = $1 and dato between $2 and $3 group by konto`, [orgId, fra, til]);
  const kontoer = [...new Set([...inng.map(x => x.konto), ...iar.map(x => x.konto)])].sort((a, b) => a - b);
  // Resultatkontoer starter på null hvert år.
  const apning = (k: number) => (k >= 3000 ? 0 : inng.find(x => x.konto === k)?.saldo ?? 0);
  const slutt = (k: number) => apning(k) + (iar.find(x => x.konto === k)?.saldo ?? 0);

  const kontakter = await t.q<{ id: string; navn: string; orgnr: string | null; adresse: string | null; postnr: string | null; poststed: string | null; kundenr: number | null; type: string }>('select * from kontakt where organisasjon_id = $1', [orgId]);
  const kSaldo = async (konto: number, dato: string, op: '<' | '<=') => new Map((await t.q<{ k: string; s: number }>(`select kontakt_id as k, sum(debet - kredit)::bigint as s from postering where organisasjon_id = $1 and konto = $2 and dato ${op} $3 and kontakt_id is not null group by kontakt_id`, [orgId, konto, dato])).map(x => [x.k, x.s]));
  const [kApn, kSlutt, lApn, lSlutt] = await Promise.all([kSaldo(1500, fra, '<'), kSaldo(1500, til, '<='), kSaldo(2400, fra, '<'), kSaldo(2400, til, '<=')]);
  const kid = (k: { id: string; kundenr: number | null }) => (k.kundenr ? String(k.kundenr) : k.id.slice(0, 8));
  const brukteKontakter = new Set((await t.q<{ k: string }>(`select distinct kontakt_id as k from postering where organisasjon_id = $1 and dato <= $2 and kontakt_id is not null and konto in (1500, 2400)`, [orgId, til])).map(x => x.k));
  const kunder = kontakter.filter(k => brukteKontakter.has(k.id) && (kApn.has(k.id) || kSlutt.has(k.id)));
  const lev = kontakter.filter(k => brukteKontakter.has(k.id) && (lApn.has(k.id) || lSlutt.has(k.id)));

  const bilag = await t.q<{ id: string; nr: number; dato: string; beskrivelse: string | null; opprettet: string }>(`select id, nr, dato::text as dato, beskrivelse, opprettet::text as opprettet from bilag where organisasjon_id = $1 and dato between $2 and $3 order by nr`, [orgId, fra, til]);
  const post = await t.q<{ id: number; bilag_id: string; konto: number; debet: number; kredit: number; mva_kode: string | null; mva_grunnlag: number | null; kontakt_id: string | null; beskrivelse: string | null }>(`select id, bilag_id, konto, debet, kredit, mva_kode, mva_grunnlag, kontakt_id, beskrivelse from postering where organisasjon_id = $1 and dato between $2 and $3 order by bilag_id, linje`, [orgId, fra, til]);
  const perBilag = new Map<string, typeof post>();
  for (const p of post) { const l = perBilag.get(p.bilag_id) ?? []; l.push(p); perBilag.set(p.bilag_id, l); }
  const kontaktAv = new Map(kontakter.map(k => [k.id, k]));
  const sumD = post.reduce((a, p) => a + p.debet, 0), sumK = post.reduce((a, p) => a + p.kredit, 0);
  const brukteKoder = [...new Set(post.map(p => p.mva_kode).filter((k): k is string => !!k && k !== '0' && !!MVA_KODER[k]))].sort((a, b) => Number(a) - Number(b));
  const [fornavn, ...etternavn] = (eier?.navn ?? 'Ukjent').split(' ');

  const x: string[] = [];
  x.push('<?xml version="1.0" encoding="UTF-8"?>');
  x.push('<n1:AuditFile xmlns:n1="urn:StandardAuditFile-Taxation-Financial:NO" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">');
  x.push('<n1:Header><n1:AuditFileVersion>1.30</n1:AuditFileVersion><n1:AuditFileCountry>NO</n1:AuditFileCountry>');
  x.push(`${el('AuditFileDateCreated', idag)}<n1:SoftwareCompanyName>Rettført</n1:SoftwareCompanyName><n1:SoftwareID>Rettført</n1:SoftwareID><n1:SoftwareVersion>1.0</n1:SoftwareVersion>`);
  x.push(`<n1:Company>${el('RegistrationNumber', o?.orgnr ?? '')}${el('Name', o?.navn)}${adresse(o!)}<n1:Contact><n1:ContactPerson>${el('FirstName', fornavn)}${el('LastName', etternavn.join(' ') || fornavn)}</n1:ContactPerson>${el('Telephone', o?.telefon)}${el('Email', o?.epost)}</n1:Contact>`);
  if (o?.mva_registrert && o.orgnr) x.push(`<n1:TaxRegistration>${el('TaxRegistrationNumber', `${o.orgnr}MVA`)}<n1:TaxAuthority>Skatteetaten</n1:TaxAuthority></n1:TaxRegistration>`);
  if (o?.kontonr) x.push(`<n1:BankAccount>${el('BankAccountNumber', o.kontonr.replace(/\D/g, ''))}</n1:BankAccount>`);
  x.push('</n1:Company><n1:DefaultCurrencyCode>NOK</n1:DefaultCurrencyCode>');
  x.push(`<n1:SelectionCriteria><n1:PeriodStart>1</n1:PeriodStart><n1:PeriodStartYear>${ar}</n1:PeriodStartYear><n1:PeriodEnd>12</n1:PeriodEnd><n1:PeriodEndYear>${ar}</n1:PeriodEndYear></n1:SelectionCriteria>`);
  x.push('<n1:TaxAccountingBasis>A</n1:TaxAccountingBasis></n1:Header>');

  x.push('<n1:MasterFiles><n1:GeneralLedgerAccounts>');
  for (const k of kontoer) x.push(`<n1:Account>${el('AccountID', k)}${el('AccountDescription', kontoNavn(k))}${el('StandardAccountID', String(k).slice(0, 2))}<n1:AccountType>GL</n1:AccountType>${saldoEl('Opening', apning(k))}${saldoEl('Closing', slutt(k))}</n1:Account>`);
  x.push('</n1:GeneralLedgerAccounts>');
  if (kunder.length) {
    x.push('<n1:Customers>');
    for (const k of kunder) x.push(`<n1:Customer>${el('RegistrationNumber', k.orgnr)}${el('Name', k.navn)}${adresse(k)}${el('CustomerID', kid(k))}${el('AccountID', 1500)}${saldoEl('Opening', kApn.get(k.id) ?? 0)}${saldoEl('Closing', kSlutt.get(k.id) ?? 0)}</n1:Customer>`);
    x.push('</n1:Customers>');
  }
  if (lev.length) {
    x.push('<n1:Suppliers>');
    for (const k of lev) x.push(`<n1:Supplier>${el('RegistrationNumber', k.orgnr)}${el('Name', k.navn)}${adresse(k)}${el('SupplierID', kid(k))}${el('AccountID', 2400)}${saldoEl('Opening', lApn.get(k.id) ?? 0)}${saldoEl('Closing', lSlutt.get(k.id) ?? 0)}</n1:Supplier>`);
    x.push('</n1:Suppliers>');
  }
  if (brukteKoder.length) {
    x.push('<n1:TaxTable><n1:TaxTableEntry><n1:TaxType>MVA</n1:TaxType><n1:Description>Merverdiavgift</n1:Description>');
    for (const c of brukteKoder) x.push(`<n1:TaxCodeDetails>${el('TaxCode', c)}${el('Description', MVA_KODER[c].navn)}${el('TaxPercentage', MVA_KODER[c].sats)}<n1:Country>NO</n1:Country>${el('StandardTaxCode', c)}<n1:BaseRate>100</n1:BaseRate></n1:TaxCodeDetails>`);
    x.push('</n1:TaxTableEntry></n1:TaxTable>');
  }
  x.push('</n1:MasterFiles>');

  x.push(`<n1:GeneralLedgerEntries>${el('NumberOfEntries', bilag.length)}${el('TotalDebit', bel(sumD))}${el('TotalCredit', bel(sumK))}`);
  x.push('<n1:Journal><n1:JournalID>GL</n1:JournalID><n1:Description>Hovedbok</n1:Description><n1:Type>GL</n1:Type>');
  for (const b of bilag) {
    x.push(`<n1:Transaction>${el('TransactionID', b.nr)}${el('Period', Number(b.dato.slice(5, 7)))}${el('PeriodYear', ar)}${el('TransactionDate', b.dato)}${el('Description', b.beskrivelse || `Bilag ${b.nr}`)}${el('SystemEntryDate', b.opprettet.slice(0, 10))}${el('GLPostingDate', b.dato)}`);
    for (const p of perBilag.get(b.id) ?? []) {
      const k = p.kontakt_id ? kontaktAv.get(p.kontakt_id) : null;
      const kontaktEl = k && p.konto === 1500 ? el('CustomerID', kid(k)) : k && p.konto === 2400 ? el('SupplierID', kid(k)) : '';
      const side = p.debet ? `<n1:DebitAmount>${el('Amount', bel(p.debet))}</n1:DebitAmount>` : `<n1:CreditAmount>${el('Amount', bel(p.kredit))}</n1:CreditAmount>`;
      const mk = p.mva_kode && p.mva_kode !== '0' ? MVA_KODER[p.mva_kode] : null;
      // På MVA-kontoen er linjebeløpet selve avgiften. På kostnads- og inntektslinjen regnes den ut fra grunnlaget.
      const erMvaKonto = p.konto === 2700 || p.konto === 2710;
      const avgift = erMvaKonto ? p.debet || p.kredit : Math.round((Math.abs(p.mva_grunnlag ?? 0) * (mk?.sats ?? 0)) / 100);
      const skatt = mk && p.mva_grunnlag != null ? `<n1:TaxInformation><n1:TaxType>MVA</n1:TaxType>${el('TaxCode', p.mva_kode)}${el('TaxPercentage', mk.sats)}${el('TaxBase', bel(p.mva_grunnlag))}<n1:TaxAmount>${el('Amount', bel(avgift))}</n1:TaxAmount></n1:TaxInformation>` : '';
      x.push(`<n1:Line>${el('RecordID', p.id)}${el('AccountID', p.konto)}${kontaktEl}${el('Description', p.beskrivelse || b.beskrivelse || kontoNavn(p.konto))}${side}${skatt}</n1:Line>`);
    }
    x.push('</n1:Transaction>');
  }
  x.push('</n1:Journal></n1:GeneralLedgerEntries></n1:AuditFile>');
  return x.join('\n');
}
