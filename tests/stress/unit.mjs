// Kjører motorens egne tester (rettfort-tests.js) i Chromium: node tests/stress/unit.mjs
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../..');
const require = createRequire(process.env.PW_MODULE_DIR ? path.join(process.env.PW_MODULE_DIR, 'x.js') : import.meta.url);
const { chromium } = require('playwright-core');
const server = http.createServer((q, s) => { const p = path.join(root, q.url.split('?')[0]); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'text/javascript' : 'text/html' }); fs.createReadStream(p).pipe(s); });
await new Promise(r => server.listen(0, r));
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
const p = await b.newPage(); await p.goto(`http://localhost:${server.address().port}/tests/stress/harness.html`); await p.waitForFunction(() => window.ready);
const out = await p.evaluate(async () => { const T = await import('/rettfort-tests.js'); return T.runTests(window.E); });
out.forEach(t => console.log(`${t.ok ? '✓' : '✗'} ${t.name} – ${t.detail}`));
console.log(`\n${out.filter(t => t.ok).length}/${out.length} OK`);
await b.close(); server.close(); process.exit(out.every(t => t.ok) ? 0 : 1);
