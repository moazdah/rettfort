// Rettført – kjører kontrollmotoren på brukerens egne filer i en egen tråd,
// slik at siden ikke fryser på store filer. Filene sendes hit som bytes fra
// nettleseren og forlater aldri maskinen.
import * as E from './rettfort-engine.js';

const AREA_L = { regnskap: 'Regnskap', revisjon: 'Revisjonsblikk', lonn: 'Lønn', kryss: 'Lønn × regnskap' };
const SEV = { hoy: 'Høy', middels: 'Middels', lav: 'Lav' };
const S = x => E.safeText(String(x ?? ''));
const uniq = a => [...new Set(a.filter(Boolean))];

// Oversetter et funn fra motoren til formatet demoen viser.
function mapFinding(f, i, r, co) {
  const c = r.controls.find(x => x.id === f.controlId) || {};
  const x = E.explain(f);
  const ev = f.ev || { cols: [], rows: [] };
  const col = n => ev.cols.indexOf(n);
  const bilag = col('Bilag') >= 0 ? uniq(ev.rows.map(row => String(row[col('Bilag')] || '')).filter(v => v !== '—')) : [];
  const konto = col('Konto') >= 0 ? uniq(ev.rows.map(row => String(row[col('Konto')] || '').split(' ')[0])) : [];
  const amount = f.amount == null ? '—' : E.fmt(Math.abs(f.amount), 2);
  const trace = [[S(c.t || 'Kontroll'), S(AREA_L[c.area] || '')]]
    .concat(bilag.slice(0, 3).map(b => ['Bilag ' + S(b), '']))
    .concat(konto.slice(0, 2).map(k => ['Konto ' + S(k), '']))
    .concat([['Funn', amount, 1]]);
  return {
    id: f.id, n: String(i + 1).padStart(2, '0'), sev: SEV[f.sev] || 'Middels',
    area: `${AREA_L[f.area] || ''} · ${S(c.t)}`, title: S(f.title), amount,
    what: S(f.summary),
    rule: S(c.d ? `${c.d} Terskel: ${c.th}.` : c.th),
    ref: S(c.rule),
    impact: S((f.why || []).join(' ')),
    cols: ev.cols.map(S), rows: ev.rows.slice(0, 40).map(row => row.map(S)),
    trace,
    checks: x.kontroller.map(S), expl: x.forklaring.map(S),
    src: [bilag.length ? 'bilag ' + bilag.slice(0, 4).join(', ') : '', konto.length ? 'konto ' + konto.slice(0, 3).join(', ') : ''].filter(Boolean).join(' · ') || S(c.t),
    sugg: ['Hva kan forklare dette?', 'Hva bør jeg sjekke først?', 'Hvordan dokumenterer jeg vurderingen?'],
    client: `Hei,\n\nI kontrollen av ${co} fant vi dette: ${S(f.summary)}\n\nKan du sende dokumentasjon eller en kort forklaring?\n\nVennlig hilsen\nDina Berg`,
    docs: false, facts: f.facts
  };
}

// Leser lønnsperioden i en fil, for å sortere to lønnsfiler riktig.
const periodOf = t => { try { return E.parsePayroll(t).period || ''; } catch (e) { return ''; } };

self.onmessage = ({ data }) => {
  try {
    const dec = (f, kind, label) => { try { return E.decodeFile(f.buf, kind); } catch (e) { throw new Error(`${label} («${f.name}»): ${e.message}`); } };
    const saft = data.saft ? dec(data.saft, 'xml', 'SAF-T') : undefined;
    let pay = (data.lonn || []).map(f => ({ name: f.name, text: dec(f, 'csv', 'Lønn') }));
    pay = pay.map(p => ({ ...p, period: periodOf(p.text) })).sort((a, b) => (a.period || '').localeCompare(b.period || ''));
    const curr = pay.length ? pay[pay.length - 1].text : undefined, prev = pay.length > 1 ? pay[0].text : undefined;
    const r = E.analyze({ saft, prev, curr });
    const co = r.company || 'selskapet';
    const per = r.payPeriods ? r.payPeriods[1] : (r.end || '').slice(0, 7);
    const byArea = a => r.controls.filter(c => c.area === a);
    const own = {
      company: r.company || (pay.length ? 'Lønnskontroll' : 'Eget selskap'), org: r.org || '',
      start: r.start, end: r.end, periodL: E.monthName(per), monthL: E.monthName(per).split(' ')[0] || '',
      lines: r.stats.lines, emps: r.stats.emps,
      total: r.controls.length,
      ok: r.controls.filter(c => c.status === 'ok').length,
      notRun: r.controls.filter(c => c.status === 'ikke').length,
      areas: ['regnskap', 'revisjon', 'lonn', 'kryss'].map(a => ({ t: AREA_L[a], n: byArea(a).length, ok: byArea(a).filter(c => c.status === 'ok').length, ikke: byArea(a).filter(c => c.status === 'ikke').length, okNames: byArea(a).filter(c => c.status === 'ok').map(c => c.t), ikkeNames: byArea(a).filter(c => c.status === 'ikke').map(c => c.t) })),
      findings: r.findings.map((f, i) => mapFinding(f, i, r, co)),
      warnings: (r.warnings || []).map(w => `${w.fil}: ${w.tekst}${w.antall > 1 ? ` (${w.antall} tilfeller)` : ''}`),
      reconReason: r.recon && r.recon.reason ? r.recon.reason : '',
      files: { saft: data.saft ? data.saft.name : '', lonn: pay.map(p => p.name) }
    };
    self.postMessage({ ok: true, own });
  } catch (e) {
    self.postMessage({ ok: false, error: String(e && e.message || e) });
  }
};
