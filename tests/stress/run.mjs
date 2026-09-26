// Kjører stresstesten: node tests/stress/run.mjs [filter]
// Krever playwright-core (npm i -D playwright-core) og Chromium.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { CASES } from './cases.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const require = createRequire(process.env.PW_MODULE_DIR ? path.join(process.env.PW_MODULE_DIR, 'x.js') : import.meta.url);
const { chromium } = require('playwright-core');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };
const server = http.createServer((q, s) => {
  const p = path.join(root, decodeURIComponent(q.url.split('?')[0]));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s);
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
let page;
const fresh = async () => { if (page) await page.close(); page = await browser.newPage(); await page.goto(`http://localhost:${port}/tests/stress/harness.html`); await page.waitForFunction(() => window.ready); };
await fresh();

const b64 = u8 => Buffer.from(u8).toString('base64');
const filter = process.argv[2];
const results = [];
const LABEL = { find: 'Ikke oppdaget', none: 'Falskt funn', noneAll: 'Falske funn', throws: 'Mangler tydelig feilmelding', ok: 'Krasjet', status: 'Feil status', custom: 'Avvik', survives: 'Tåler ikke filen' };

function invariants(r) {
  const bad = [];
  const s = JSON.stringify({ f: r.findings, recon: r.recon, pay: r.pay });
  if (/NaN|Infinity/.test(s)) bad.push('NaN eller Infinity i resultatet');
  if (/undefined/.test(JSON.stringify(r.findings.map(f => [f.title, f.summary])))) bad.push('«undefined» i tittel eller sammendrag');
  r.findings.forEach(f => { if (!f.title || !f.summary) bad.push(`Funn uten tittel/sammendrag (${f.controlId})`); if (f.amount != null && !Number.isFinite(f.amount)) bad.push(`Ugyldig beløp (${f.controlId})`); });
  return bad;
}

for (const c of CASES) {
  if (filter && !c.id.includes(filter) && !c.group.includes(filter)) continue;
  let input;
  try { input = c.build(); } catch (e) { results.push({ ...meta(c), status: 'FEIL I TEST', notes: ['build: ' + e.message] }); continue; }
  const payload = { saft: input.saft, prev: input.prev, curr: input.curr, settings: input.settings, grounded: input.grounded };
  if (input.saftBytes) payload.saftB64 = b64(input.saftBytes);
  if (input.prevBytes) payload.prevB64 = b64(input.prevBytes);
  if (input.currBytes) payload.currB64 = b64(input.currBytes);
  let out;
  try {
    out = await Promise.race([page.evaluate(x => window.runCase(x), payload), new Promise((_, j) => setTimeout(() => j(new Error('Tidsavbrudd etter 60 s')), 60000))]);
  } catch (e) { out = { ok: false, error: 'Nettleseren: ' + e.message, hang: true }; await fresh(); }
  const fails = [], passes = [];
  for (const x of c.expect) {
    const kind = Object.keys(x).find(k => LABEL[k]);
    let ok, detail = '';
    if (kind === 'survives') { ok = !out.hang && (out.ms || 0) < x.survives; detail = out.hang ? out.error : `${Math.round(out.ms)} ms, ${out.ok ? 'analysert' : 'avvist: «' + out.error + '»'}`; }
    else if (kind === 'throws') { ok = !out.ok && x.throws.test(out.error); detail = out.ok ? 'Analysen gikk gjennom uten feilmelding' : `Melding: «${out.error}»`; }
    else if (!out.ok) { ok = false; detail = `Motoren stoppet: «${out.error}»`; }
    else {
      const r = out.r, F = r.findings;
      if (kind === 'find') { const hit = F.filter(f => f.controlId === x.find && (!x.match || x.match(f))); ok = hit.length > 0; detail = ok ? hit.map(f => f.title).slice(0, 2).join(' / ') : `Ingen ${x.find}-funn${F.filter(f => f.controlId === x.find).length ? ' som passer (fant: ' + F.filter(f => f.controlId === x.find).map(f => f.title).join(' / ') + ')' : ''}`; }
      else if (kind === 'none') { const hit = F.filter(f => f.controlId === x.none && (!x.match || x.match(f))); ok = !hit.length; detail = ok ? '' : hit.map(f => `${f.title}: ${f.summary}`).slice(0, 3).join(' / '); }
      else if (kind === 'noneAll') { ok = !F.length; detail = ok ? '' : F.map(f => `[${f.controlId}] ${f.title}`).slice(0, 8).join(' / '); }
      else if (kind === 'status') { const [id, want] = x.status; const got = (r.controls.find(k => k.id === id) || {}).status; ok = got === want; detail = `${id}: ${got} (forventet ${want})`; }
      else if (kind === 'ok') { ok = true; }
      else if (kind === 'custom') { const [k, d] = x.custom(r); ok = k; detail = d; }
    }
    (ok ? passes : fails).push({ kind, label: x.label || LABEL[kind], detail, why: x.why });
  }
  const inv = out.ok ? invariants(out.r) : [];
  const status = fails.length ? (out.hang ? 'HENGER' : 'AVVIK') : inv.length ? 'AVVIK' : 'OK';
  results.push({ ...meta(c), status, ms: Math.round(out.ms || 0), error: out.ok ? null : out.error, fails, passes, invariants: inv, nFindings: out.ok ? out.r.findings.length : null, findings: out.ok ? out.r.findings.map(f => `[${f.controlId}] ${f.title}`) : [] });
  process.stdout.write(`${status === 'OK' ? '✓' : '✗'} ${c.id} ${c.title} (${Math.round(out.ms || 0)} ms)\n`);
}
function meta(c) { return { id: c.id, group: c.group, title: c.title, planted: c.planted, severity: c.severity || 'middels' }; }

await browser.close(); server.close();
fs.mkdirSync(path.join(here, 'out'), { recursive: true });
fs.writeFileSync(path.join(here, 'out', 'results.json'), JSON.stringify(results, null, 2));
const n = s => results.filter(r => r.status === s).length;
console.log(`\n${results.length} tilfeller: ${n('OK')} OK, ${n('AVVIK')} avvik, ${n('HENGER')} henger, ${n('FEIL I TEST')} feil i test`);
