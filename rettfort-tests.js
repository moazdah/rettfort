// Automatiske tester for krysskontrollene (lønn × regnskap). Kjøres med runTests(motor).
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const A = n => `<Amount>${n.toFixed(2)}</Amount>`;

export function buildSaft({ start = '2026-09-01', end = '2026-09-30', txs = [] } = {}) {
  const accs = ['1920', '2600', '2770', '2940', '5000', '5020', '5400', '5405', '5990', '6900'];
  const tx = txs.map((t, i) => `<Transaction><TransactionID>${9000 + i}</TransactionID><TransactionDate>${t.date}</TransactionDate><GLPostingDate>${t.date}</GLPostingDate><Description>${esc(t.desc)}</Description>${t.lines.map(l => `<Line><AccountID>${l.acc}</AccountID><Description>${esc(l.desc || t.desc)}</Description>${l.d ? `<DebitAmount>${A(l.d)}</DebitAmount>` : `<CreditAmount>${A(l.c)}</CreditAmount>`}</Line>`).join('')}</Transaction>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><AuditFile xmlns="urn:StandardAuditFile-Taxation-Financial:NO"><Header><AuditFileVersion>1.30</AuditFileVersion><Company><RegistrationNumber>999999999</RegistrationNumber><Name>Test AS</Name></Company><SelectionCriteria><SelectionStartDate>${start}</SelectionStartDate><SelectionEndDate>${end}</SelectionEndDate></SelectionCriteria></Header><MasterFiles><GeneralLedgerAccounts>${accs.map(a => `<Account><AccountID>${a}</AccountID><AccountDescription>Konto ${a}</AccountDescription></Account>`).join('')}</GeneralLedgerAccounts></MasterFiles><GeneralLedgerEntries><Journal>${tx}</Journal></GeneralLedgerEntries></AuditFile>`;
}

const PH = 'ansattnummer,navn,periode,fastlonn,skatt,bruttolonn,nettolonn';
export function buildPayroll(period, extra = {}) {
  const cols = PH + (extra.cols ? ',' + extra.cols.join(',') : '');
  const rows = [['E1', 'Ola Nordmann', period, 50000, 15000, 50000, 35000], ['E2', 'Kari Hansen', period, 40000, 12000, 40000, 28000]];
  return [cols, ...rows.map((r, i) => r.concat(extra.vals ? extra.vals[i] : []).join(','))].join('\n');
}

// Grunnoppsett: bruttolønn 90 000, skatt 27 000, AGA sone I 12 690.
export function baseTxs(o = {}) {
  const g = o.gross ?? 90000, t = o.tax ?? 27000, aga = o.aga ?? 12690;
  const T = [
    { date: '2026-09-14', desc: 'Betaling forskuddstrekk august', lines: [{ acc: '2600', d: 27000 }, { acc: '1920', c: 27000 }] },
    { date: '2026-09-25', desc: 'Lønn september', lines: [{ acc: '5000', d: g }, { acc: '2600', c: t }, { acc: '1920', c: g - t }] },
    { date: '2026-09-25', desc: 'Arbeidsgiveravgift september', lines: [{ acc: '5400', d: aga }, { acc: '2770', c: aga }] },
    { date: '2026-09-30', desc: 'Avsetning feriepenger september', lines: [{ acc: '5020', d: 10800 }, { acc: '2940', c: 10800 }, { acc: '5405', d: 1522.8 }, { acc: '2770', c: 1522.8 }] }
  ];
  return T.concat(o.more || []);
}

export function runTests(E) {
  const out = [];
  const run = (o = {}) => E.analyze({ saft: buildSaft({ start: o.start, end: o.end, txs: baseTxs(o) }), prev: buildPayroll('2026-08'), curr: o.curr || buildPayroll('2026-09', o.extra), settings: o.settings });
  const row = (r, k) => r.recon.rows.find(x => x.key === k);
  const kryss = r => r.findings.filter(f => f.area === 'kryss');
  const t = (name, fn) => { try { const d = fn(); out.push({ name, ok: d.ok, detail: d.detail }); } catch (e) { out.push({ name, ok: false, detail: 'Feil: ' + e.message }); } };
  const st = r => ['brutto', 'skatt', 'aga'].map(k => `${k}: ${row(r, k).status} (${row(r, k).diff})`).join(', ');

  t('1. Lønn og regnskap stemmer → ingen funn', () => { const r = run(); return { ok: kryss(r).length === 0 && r.recon.rows.every(x => x.status === 'stemmer'), detail: st(r) }; });
  t('2. Reell differanse i bruttolønn → funn', () => { const r = run({ gross: 90500, tax: 27000 }); const b = row(r, 'brutto'); return { ok: b.status === 'avvik' && b.diff === 500 && kryss(r).some(f => f.controlId === 'avst-brutto'), detail: `bokført ${b.booked}, forventet ${b.expected}, diff ${b.diff}` }; });
  t('3. Reell differanse i forskuddstrekk → funn', () => { const r = run({ tax: 26000 }); const b = row(r, 'skatt'); return { ok: b.status === 'avvik' && b.diff === -1000 && kryss(r).some(f => f.controlId === 'avst-skatt'), detail: `bokført ${b.booked}, forventet ${b.expected}, diff ${b.diff}` }; });
  t('4. Reell differanse i AGA → funn', () => { const r = run({ aga: 12000 }); const b = row(r, 'aga'); return { ok: b.status === 'avvik' && b.diff === -690 && kryss(r).some(f => f.controlId === 'avst-aga'), detail: `bokført ${b.booked}, forventet ${b.expected}, diff ${b.diff}` }; });
  t('5. Sone I og sone II gir ulik forventet AGA', () => { const a = row(run(), 'aga'), b = row(run({ settings: { agaZone: 'II' } }), 'aga'); return { ok: a.expected === 12690 && b.expected === 9540 && a.rateUsed === '14,1 %' && b.rateUsed === '10,6 %', detail: `sone I ${a.expected} (${a.rateUsed}), sone II ${b.expected} (${b.rateUsed}), sone II gir funn: ${b.status}` }; });
  t('6. Differanse innenfor toleranse → ikke avviksfunn', () => { const r = run({ aga: 12692 }); const b = row(r, 'aga'); return { ok: b.status === 'innenfor' && !kryss(r).some(f => f.controlId === 'avst-aga'), detail: `diff ${b.diff}, toleranse ${b.tol}, status ${b.statusL}` }; });
  t('7. Feriepenger blandes ikke inn i bruttolønn', () => { const r = run(); const b = row(r, 'brutto'); return { ok: b.booked === 90000 && b.excluded.some(p => p.acc === '5020') && !b.postings.some(p => p.acc === '5020'), detail: `bokført ${b.booked}, holdt utenfor: ${b.excluded.map(p => p.acc + ' ' + p.amount).join(', ')}` }; });
  t('8. Betaling av forskuddstrekk gir ikke falskt avvik', () => { const r = run(); const b = row(r, 'skatt'); const saldo = 27000 - 27000; return { ok: b.status === 'stemmer' && b.excluded.some(p => p.reason === 'Betaling av forskuddstrekk'), detail: `saldoendring på 2600 i september: ${saldo}, lønnsbilagets kredit: ${b.booked}, status ${b.status}` }; });
  t('9. Mulig naturalytelse uten lønnsart → kontrollsignal', () => { const r = run({ more: [{ date: '2026-09-10', desc: 'Treningskort Ola Nordmann', lines: [{ acc: '5990', d: 4800 }, { acc: '1920', c: 4800 }] }] }); const f = r.findings.filter(x => x.controlId === 'fordel'); return { ok: f.length === 1 && /^Mulig/.test(f[0].title) && f[0].facts.detaljer.tilsvarende_fordel_funnet === false, detail: f.map(x => x.title).join('; ') }; });
  t('10. «Parkering» og «trening» konkluderes ikke som skattepliktig', () => {
    const r = run({ more: [{ date: '2026-09-05', desc: 'Parkering september', lines: [{ acc: '6900', d: 2500 }, { acc: '1920', c: 2500 }] }, { date: '2026-09-06', desc: 'Trening personalfest', lines: [{ acc: '5990', d: 3000 }, { acc: '1920', c: 3000 }] }, { date: '2026-09-07', desc: 'Parkering Kari Hansen', lines: [{ acc: '6900', d: 900 }, { acc: '1920', c: 900 }] }] });
    const f = r.findings.filter(x => x.controlId === 'fordel'); const txt = f.map(x => x.title + ' ' + x.summary).join(' ');
    return { ok: f.length === 1 && f[0].sev === 'lav' && /kan være/.test(f[0].summary) && !/ikke rapportert skattepliktig/i.test(txt) && row(r, 'aga').expected === 12690, detail: `${f.length} funn (bare kostnaden med ansattnavn). Tittel: «${f[0] && f[0].title}». AGA-grunnlag uendret: ${row(r, 'aga').base}` };
  });
  t('11. Kjøres ikke når periodene ikke matcher', () => { const r = run({ start: '2026-08-01', end: '2026-08-31', curr: buildPayroll('2026-09') }); const c = r.controls.filter(x => x.area === 'kryss'); return { ok: !!r.recon.reason && c.every(x => x.status === 'ikke') && kryss(r).length === 0, detail: r.recon.reason }; });
  t('12. AGA fra lønnsfilen brukes før beregning', () => { const r = run({ extra: { cols: ['arbeidsgiveravgift'], vals: [[7050], [5640]] } }); const b = row(r, 'aga'); return { ok: b.expected === 12690 && b.rateUsed === 'Fra lønnsfilen' && b.source === 'Feltet arbeidsgiveravgift', detail: `${b.source}, forventet ${b.expected}` }; });
  t('13. Fordel tas bare med i AGA-grunnlaget når den er klassifisert', () => {
    const a = row(run({ extra: { cols: ['fordel_fri_bil'], vals: [[4000], [0]] } }), 'aga'), b = row(run({ extra: { cols: ['fordel_avgiftspliktig'], vals: [[4000], [0]] } }), 'aga');
    return { ok: a.base === 90000 && b.base === 94000, detail: `uklassifisert: grunnlag ${a.base}; avgiftspliktig: grunnlag ${b.base}` };
  });
  t('14. Toleransen kan endres i innstillingene', () => { const r = run({ gross: 90500, settings: { tolerance: { 'avst-brutto': 1000 } } }); const b = row(r, 'brutto'); return { ok: b.status === 'innenfor', detail: `diff ${b.diff}, toleranse ${b.tol}` }; });
  t('15. Kontomappingen kan endres', () => { const r = run({ more: [{ date: '2026-09-25', desc: 'Lønn timelønnede', lines: [{ acc: '5100', d: 1000 }, { acc: '1920', c: 1000 }] }], settings: { mapping: { grossSalary: ['5000-5019', '5100'] } } }); const b = row(r, 'brutto'); return { ok: b.booked === 91000 && b.status === 'avvik', detail: `med 5100 i mappingen: bokført ${b.booked}` }; });
  const demo = () => { const p = E.samplePayroll(); return E.analyze({ saft: E.sampleSaft(), prev: p.prev, curr: p.curr }); };
  t('16. Demodata gir forventede funn per fagområde', () => { const r = demo(); const by = a => r.findings.filter(f => f.area === a).map(f => f.controlId); const rr = k => r.recon.rows.find(x => x.key === k).status; return { ok: by('regnskap').length === 3 && by('lonn').length === 3 && by('kryss').length === 2 && by('revisjon').length === 3 && rr('brutto') === 'stemmer' && rr('skatt') === 'stemmer' && rr('aga') === 'avvik', detail: `regnskap ${by('regnskap')} | lønn ${by('lonn')} | kryss ${by('kryss')} | revisjon ${by('revisjon')} | ${r.stats.lines} posteringer, ${r.stats.emps} ansatte` }; });
  t('17. Demodata har realistiske beløp', () => { const r = demo(); const mx = Math.max(...r.findings.map(f => Math.abs(f.amount || 0)), ...r.recon.rows.map(x => Math.abs(x.booked))); return { ok: mx < 1e7, detail: `største beløp ${mx}` }; });
  t('18. Regelbasert forklaring finnes for alle funn', () => { const r = demo(); const bad = r.findings.filter(f => { const x = E.explain(f); return !x.ser || !x.forklaring.length || !x.kontroller.length; }); return { ok: !bad.length, detail: bad.length ? bad.map(f => f.controlId).join(',') : `${r.findings.length} funn har forklaring` }; });
  t('19. Prioritering bruker bare eksisterende funn', () => { const r = demo(); const p = E.fallbackPriority(r.findings); const ids = new Set(r.findings.map(f => f.id)); return { ok: p.length === 3 && p.every(x => ids.has(x.id)), detail: p.map(x => x.id).join(', ') }; });
  t('20. Tallvakt avviser AI-tall som ikke finnes i grunnlaget', () => ({ ok: E.numbersGrounded('Differansen er 2 679 kr i bilag 1234.', '{"d":2679,"b":"1234"}') && !E.numbersGrounded('Differansen er 3 100 kr.', '{"d":2679}'), detail: 'godtar 2 679, avviser 3 100' }));
  t('21. AGA-hint forklarer differansen i demodata', () => { const r = demo(); const a = r.recon.rows.find(x => x.key === 'aga'); return { ok: a.hints.length === 1, detail: `${a.diff} · ${a.hints[0] || 'ingen hint'}` }; });
  return out;
}
