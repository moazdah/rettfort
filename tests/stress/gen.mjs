// Generator for stresstest: en ryddig testbedrift (juli–september 2026) som
// testtilfellene kan endre på. Modellen er vanlige JS-objekter; toSaft/toCsv
// gjør den om til filer med valgfrie formatvarianter.

export const pad = n => String(n).padStart(2, '0');
const r2 = n => Math.round(n * 100) / 100;
export function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export const clone = x => JSON.parse(JSON.stringify(x));
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export const ACCOUNTS = [
  ['1500', 'Kundefordringer'], ['1920', 'Bankinnskudd'], ['2050', 'Annen egenkapital'], ['2400', 'Leverandørgjeld'],
  ['2600', 'Forskuddstrekk'], ['2700', 'Utgående merverdiavgift'], ['2710', 'Inngående merverdiavgift'],
  ['2770', 'Skyldig arbeidsgiveravgift'], ['2940', 'Skyldige feriepenger'], ['3000', 'Salgsinntekt'],
  ['4300', 'Innkjøp varer'], ['5000', 'Lønn'], ['5020', 'Feriepenger'], ['5400', 'Arbeidsgiveravgift'],
  ['5405', 'Arbeidsgiveravgift av feriepenger'], ['5990', 'Annen personalkostnad'], ['6300', 'Leie lokaler'],
  ['6800', 'Kontorrekvisita'], ['6860', 'Møter og kurs'], ['6900', 'Telefon'], ['7140', 'Reisekostnad'],
  ['7350', 'Representasjon'], ['7770', 'Bankgebyr']
];
export const SUPPLIERS = [['S1', 'Havnegården Eiendom AS'], ['S2', 'Byggmakker Vest AS'], ['S3', 'Kontorspar AS'], ['S4', 'Fjordnett Telekom AS'], ['S5', 'Elektrogrossisten AS'], ['S6', 'Reisebyrået AS']];
export const CUSTOMERS = [['C1', 'Havneparken Sameie'], ['C2', 'Nordkai Logistikk AS'], ['C3', 'Brygga Hotell AS'], ['C4', 'Solvang Omsorgssenter']];

export const EMPLOYEES = [
  { id: '1001', name: 'Sara Hansen', pct: 100, start: '2021-03-01', end: '', bank: '15031234561', fast: 41200.5, ot_t: 4, ot: 1800 },
  { id: '1002', name: 'Jonas Berg', pct: 100, start: '2019-08-15', end: '', bank: '15031234562', fast: 45750, ot_t: 0, ot: 0 },
  { id: '1003', name: 'Ingrid Moen', pct: 80, start: '2022-01-10', end: '', bank: '15031234563', fast: 33120, ot_t: 2, ot: 830.4 },
  { id: '1004', name: 'Amir Khalil', pct: 100, start: '2020-05-01', end: '', bank: '15031234564', fast: 52300, ot_t: 6, ot: 2940 },
  { id: '1005', name: 'Thea Solheim', pct: 100, start: '2023-02-01', end: '', bank: '15031234565', fast: 39800, ot_t: 0, ot: 0 },
  { id: '1006', name: 'Martin Dahl', pct: 60, start: '2024-09-01', end: '', bank: '15031234566', fast: 24480, ot_t: 3, ot: 1215 }
];
export const empGross = e => r2(e.fast + e.ot + (e.bonus || 0) + (e.tillegg || 0));
export const empTax = e => Math.round(empGross(e) * 0.3);

const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];

// Bygger en ren modell: ingen kontroller skal slå ut på denne.
export function baseline(seed = 7) {
  const R = rng(seed), between = (a, b) => a + R() * (b - a), ri = (a, b) => Math.floor(between(a, b + 1));
  const T = []; let inv = 7000, sinv = 90000;
  const add = (date, desc, lines, o = {}) => { const t = { date, posted: o.posted || addDays(date, 1), desc, lines }; T.push(t); return t; };
  const buy = (date, sup, acc, net, desc, o = {}) => {
    const pct = o.pct ?? 25, vat = o.vat != null ? o.vat : r2(net * pct / 100), ref = o.ref || String(++sinv);
    const L = [{ acc, d: net, desc, tax: pct ? { code: '1', pct, base: net, amt: vat } : null }];
    if (vat) L.push({ acc: '2710', d: vat, desc: 'Inngående MVA' });
    L.push({ acc: '2400', c: r2(net + vat), sup, ref, desc });
    return add(date, desc, L, o);
  };
  const sale = (date, cus, net) => { inv++; const vat = r2(net * 0.25); return add(date, `Faktura ${inv}`, [{ acc: '1500', d: r2(net + vat), cus, desc: `Faktura ${inv}` }, { acc: '3000', c: net, desc: `Faktura ${inv}`, tax: { code: '3', pct: 25, base: net, amt: vat } }, { acc: '2700', c: vat, desc: 'Utgående MVA' }]); };
  const payP = clone(EMPLOYEES), payC = clone(EMPLOYEES);
  payC[0].ot_t = 5; payC[0].ot = 2250; // litt variasjon mellom periodene
  const G = rs => r2(rs.reduce((a, e) => a + empGross(e), 0)), S = rs => rs.reduce((a, e) => a + empTax(e), 0);
  let lastTax = 0;
  for (const m of [7, 8, 9]) {
    const mn = MONTHS[m - 1], d = n => `2026-${pad(m)}-${pad(n)}`;
    buy(d(1), 'S1', '6300', 45000, `Husleie ${mn}`, { pct: 0 });
    buy(d(4), 'S4', '6900', r2(2190.4 + m), `Telefon og internett ${mn}`);
    for (let i = 0; i < 8; i++) buy(d(ri(2, 27)), ['S2', 'S5'][i % 2], '4300', r2(between(3000, 11000)), ['Byggevarer', 'Elektromateriell'][i % 2]);
    for (let i = 0; i < 3; i++) buy(d(ri(2, 27)), 'S3', '6800', r2(between(300, 1900)), 'Kontorrekvisita');
    buy(d(ri(5, 20)), 'S6', '7140', r2(between(1200, 3900)), 'Reise og hotell', { pct: 12 });
    add(d(28), `Bankgebyr ${mn}`, [{ acc: '7770', d: 195, desc: 'Bankgebyr' }, { acc: '1920', c: 195, desc: 'Bankgebyr' }]);
    const rs = m === 9 ? payC : payP, g = G(rs), tax = m === 9 ? S(payC) : S(payP), aga = r2(g * 0.141), hol = r2(g * 0.12), hAga = r2(hol * 0.141);
    if (lastTax) add(d(12), `Betaling forskuddstrekk ${MONTHS[m - 2]}`, [{ acc: '2600', d: lastTax, desc: 'Betaling forskuddstrekk' }, { acc: '1920', c: lastTax, desc: 'Betaling forskuddstrekk' }]);
    lastTax = tax;
    add(d(25), `Lønn ${mn}`, [{ acc: '5000', d: g, desc: `Lønn ${mn}` }, { acc: '2600', c: tax, desc: 'Forskuddstrekk' }, { acc: '1920', c: r2(g - tax), desc: 'Nettolønn' }]);
    add(d(25), `Arbeidsgiveravgift ${mn}`, [{ acc: '5400', d: aga, desc: 'Arbeidsgiveravgift' }, { acc: '2770', c: aga, desc: 'Skyldig arbeidsgiveravgift' }]);
    add(d(28), `Avsetning feriepenger ${mn}`, [{ acc: '5020', d: hol, desc: 'Avsetning feriepenger' }, { acc: '2940', c: hol, desc: 'Skyldige feriepenger' }, { acc: '5405', d: hAga, desc: 'AGA av feriepenger' }, { acc: '2770', c: hAga, desc: 'AGA av feriepenger' }]);
    for (let i = 0; i < 10; i++) sale(d(ri(1, 28)), CUSTOMERS[ri(0, 3)][0], r2(between(20000, 90000)));
  }
  return { company: 'Stresstest Drift AS', org: '999888777', start: '2026-07-01', end: '2026-09-30', accounts: clone(ACCOUNTS), suppliers: clone(SUPPLIERS), customers: clone(CUSTOMERS), open: { '1920': 2500000 }, txs: T, payPrev: payP, payCurr: payC, prevPeriod: '2026-08', currPeriod: '2026-09' };
}

// Sorterer og nummererer bilag. Kalles før serialisering (etter at et tilfelle har endret modellen).
export function finalize(M, o = {}) {
  if (!o.keepOrder) M.txs.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  M.txs.forEach((t, i) => { if (t.id == null) t.id = o.idFmt ? o.idFmt(i + 1) : String(i + 1); });
  return M;
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// f: formatvarianter
//  version: '1.30' | '1.20'
//  prefix: navnerom-prefiks, f.eks. 'n1'
//  noNs: ingen navnerom
//  amt: funksjon som formaterer beløp
//  header: overstyr NumberOfEntries/TotalDebit/TotalCredit
//  negativeCredit: kredit som negativ DebitAmount
//  taxOnVatLineOnly: MVA-info bare på MVA-linjen, ikke på kostnadslinjen
//  noSelection: dropp SelectionCriteria
//  periodOnly: SelectionCriteria med PeriodStart/PeriodEnd i stedet for datoer
//  doctype: tekst som settes inn før rotelementet
export function toSaft(M, f = {}) {
  const P = f.prefix ? f.prefix + ':' : '';
  const tag = (n, inner, attrs = '') => `<${P}${n}${attrs}>${inner}</${P}${n}>`;
  const A = f.amt || (n => n.toFixed(2));
  const amtTag = (n, v) => tag(n, tag('Amount', A(v)));
  let td = 0, tc = 0, rec = 0;
  const lineXml = l => {
    rec++;
    let d = l.d || 0, c = l.c || 0;
    td += d; tc += c;
    let money;
    if (f.negativeCredit && c) money = amtTag('DebitAmount', -c);
    else money = d ? amtTag('DebitAmount', d) : amtTag('CreditAmount', c);
    let tax = '';
    if (l.tax && !(f.taxOnVatLineOnly)) tax = tag('TaxInformation', tag('TaxType', 'MVA') + tag('TaxCode', l.tax.code) + tag('TaxPercentage', String(l.tax.pct)) + tag('TaxBase', A(l.tax.base)) + amtTag('TaxAmount', l.tax.amt));
    return tag('Line', tag('RecordID', String(rec)) + tag('AccountID', l.acc) + (l.cus ? tag('CustomerID', l.cus) : '') + (l.sup ? tag('SupplierID', l.sup) : '') + (l.ref ? tag('ReferenceNumber', esc(l.ref)) : '') + tag('Description', esc(l.desc ?? '')) + money + tax);
  };
  const txXml = M.txs.map(t => tag('Transaction', tag('TransactionID', esc(t.id)) + tag('Period', String(+t.date.slice(5, 7))) + tag('PeriodYear', t.date.slice(0, 4)) + tag('TransactionDate', t.dateRaw || t.date) + tag('Description', esc(t.desc ?? '')) + tag('SystemEntryDate', t.posted) + tag('GLPostingDate', t.posted) + t.lines.map(lineXml).join(''))).join('\n');
  // Med kredit som negativ debet finnes bare debetfeltet; summen blir netto.
  const H = { n: M.txs.length, td: f.negativeCredit ? td - tc : td, tc: f.negativeCredit ? 0 : tc, ...(f.header || {}) };
  const acc = M.accounts.map(([id, n]) => tag('Account', tag('AccountID', id) + tag('AccountDescription', esc(n)) + tag('StandardAccountID', id.slice(0, 2)) + tag('AccountType', 'GL') + ((M.open || {})[id] ? tag('OpeningDebitBalance', A(M.open[id])) : tag('OpeningDebitBalance', A(0))) + ((M.close || {})[id] != null ? tag('ClosingDebitBalance', A(M.close[id])) : ''))).join('');
  const party = (t, list) => list.map(([id, n]) => tag(t, tag(t + 'ID', id) + tag('Name', esc(n)))).join('');
  const sel = f.noSelection ? '' : tag('SelectionCriteria', f.periodOnly ? tag('PeriodStart', String(+M.start.slice(5, 7))) + tag('PeriodStartYear', M.start.slice(0, 4)) + tag('PeriodEnd', String(+M.end.slice(5, 7))) + tag('PeriodEndYear', M.end.slice(0, 4)) : tag('SelectionStartDate', M.start) + tag('SelectionEndDate', M.end));
  const ns = f.noNs ? '' : ` xmlns${f.prefix ? ':' + f.prefix : ''}="urn:StandardAuditFile-Taxation-Financial:NO"`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n${f.doctype || ''}<${P}AuditFile${ns}>\n` +
    tag('Header', tag('AuditFileVersion', f.version || '1.30') + tag('AuditFileCountry', 'NO') + tag('AuditFileDateCreated', '2026-10-02') + tag('SoftwareCompanyName', 'Stresstest') + tag('SoftwareID', 'gen.mjs') + tag('SoftwareVersion', '1') + tag('Company', tag('RegistrationNumber', M.org) + tag('Name', esc(M.company))) + tag('DefaultCurrencyCode', 'NOK') + sel + tag('TaxAccountingBasis', 'A')) + '\n' +
    tag('MasterFiles', tag('GeneralLedgerAccounts', acc) + tag('Customers', party('Customer', M.customers)) + tag('Suppliers', party('Supplier', M.suppliers)) + tag('TaxTable', tag('TaxTableEntry', tag('TaxType', 'MVA') + tag('Description', 'Merverdiavgift') + tag('TaxCodeDetails', tag('TaxCode', '1') + tag('Description', 'Inngående MVA høy sats') + tag('TaxPercentage', '25') + tag('Country', 'NO') + tag('StandardTaxCode', '1')) + tag('TaxCodeDetails', tag('TaxCode', '3') + tag('Description', 'Utgående MVA høy sats') + tag('TaxPercentage', '25') + tag('Country', 'NO') + tag('StandardTaxCode', '3'))))) + '\n' +
    tag('GeneralLedgerEntries', tag('NumberOfEntries', String(H.n)) + tag('TotalDebit', A(H.td)) + tag('TotalCredit', A(H.tc)) + tag('Journal', tag('JournalID', 'GL') + tag('Description', 'Hovedbok') + tag('Type', 'GL') + '\n' + txXml)) + `\n</${P}AuditFile>`;
}

// Lønns-CSV i "felt"-format (én rad per ansatt).
// f: delim, num (formatter), cols (overstyr kolonnenavn), extraRows, dateFmt
export function toCsv(rows, period, f = {}) {
  const D = f.delim || ',', N = f.num || (n => String(n)), dt = f.dateFmt || (s => s);
  const H = f.cols || ['ansattnummer', 'navn', 'periode', 'stillingsprosent', 'startdato', 'sluttdato', 'bankkonto', 'fastlonn', 'overtid_timer', 'overtid_belop', 'bonus', 'skatt', 'bruttolonn', 'nettolonn'];
  const q = v => { v = String(v ?? ''); return v.includes(D) || v.includes('"') ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const line = e => { const g = e.grossOverride ?? empGross(e), t = e.taxOverride ?? empTax(e); return [e.id, e.name, e.period || period, e.pct, dt(e.start), dt(e.end || ''), e.bank, N(e.fast), N(e.ot_t), N(e.ot), N(e.bonus || 0), N(t), N(g), N(e.netOverride ?? r2(g - t))].map(q).join(D); };
  return [(f.pre || []).join('\n'), H.join(D), ...rows.map(line), ...(f.extraRows || [])].filter(x => x !== '').join(f.eol || '\n');
}
