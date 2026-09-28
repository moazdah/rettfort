// Ende-til-ende-test i Chromium mot en kjørende server (next start -p 3100, RETTFORT_IDAG=2026-10-05).
// Kjør: S=<mappe for skjermbilder> node tests-e2e/e2e.mjs  (krever playwright-core)
import { chromium } from 'playwright-core';
const B = 'http://localhost:3100', S = process.env.S;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
const feil = [];
p.on('pageerror', e => feil.push('pageerror ' + p.url() + ' ' + e.message));
p.on('response', r => { if (r.status() >= 500) feil.push(`${r.status()} ${r.url()}`); });
p.on('dialog', d => d.accept());
const steg = async (navn, fn) => { try { await fn(); console.log('OK  ', navn); } catch (e) { console.log('FEIL', navn, '-', e.message.split('\n')[0]); await p.screenshot({ path: `${S}/feil-${navn.replace(/\W+/g, '_')}.png`, fullPage: true }); } };
const tekst = async t => p.getByText(t, { exact: false }).first().waitFor({ timeout: 20000 });

await steg('logg inn', async () => {
  await p.goto(B + '/logg-inn');
  await p.fill('input[name=epost]', 'demo@rettfort.no'); await p.fill('input[name=passord]', 'rettfort-demo');
  await Promise.all([p.waitForURL(/hjem/, { timeout: 60000 }), p.click('button:has-text("Logg inn")')]);
});
for (const s of ['/hjem', '/kjop', '/salg', '/bank', '/lonn', '/rapporter', '/mva', '/frister', '/aarsavslutning', '/regnskapsforer', '/innstillinger', '/meny', '/rapporter?tab=bal', '/rapporter?tab=sb', '/rapporter?tab=hb', '/innstillinger?vis=faktura', '/innstillinger?vis=brukere', '/innstillinger?vis=abonnement', '/innstillinger?vis=avansert', '/lonn?vis=historikk', '/lonn?vis=oppsett', '/mva?fra=2026-05-01', '/bank?maned=2026-08'])
  await steg('side ' + s, async () => { const r = await p.goto(B + s); if (r.status() !== 200) throw new Error('status ' + r.status()); await p.locator('h1').first().waitFor(); });

await steg('balansen går opp', async () => { await p.goto(B + '/rapporter?tab=bal'); if (await p.getByText('Balansen går ikke opp').count()) throw new Error('differanse'); });

await steg('kjøp uten kvittering', async () => {
  await p.goto(B + '/kjop/ny');
  await p.click('text=Fyll ut uten kvittering');
  await p.getByLabel('Hvem har du kjøpt fra?').fill('Testbutikken AS');
  await p.getByLabel('Beløp med MVA').fill('1250');
  await p.getByLabel('Beløp med MVA').blur();
  await p.waitForTimeout(1200);
  const mva = await p.getByLabel('Herav MVA').inputValue();
  if (mva !== '250,00') throw new Error('MVA ble ' + mva);
  await p.click('button:has-text("Registrer kjøpet")');
  await tekst('Kjøpet er registrert.');
});
await steg('duplikat oppdages', async () => {
  await p.goto(B + '/kjop/ny');
  await p.click('text=Fyll ut uten kvittering');
  await p.getByLabel('Hvem har du kjøpt fra?').fill('Testbutikken AS');
  await p.getByLabel('Beløp med MVA').fill('1250');
  await tekst('er allerede ført');
  if (await p.locator('button:has-text("Registrer kjøpet")').isEnabled()) throw new Error('knappen skulle vært låst');
});

let fakturaUrl = '';
await steg('faktura', async () => {
  await p.goto(B + '/salg/ny');
  await p.click('button:has-text("Kvam Transport AS")');
  await p.getByLabel('Hva har du levert?').fill('Konsulenttimer');
  await p.getByLabel('Antall').first().fill('10');
  await p.getByLabel('Pris eks. MVA').first().fill('1000');
  await tekst('12 500,00');
  await p.click('button:has-text("Lag faktura")');
  await tekst('er klar.');
  await p.click('text=Se fakturaen');
  await p.waitForURL(/salg\/[0-9a-f-]{36}/);
  fakturaUrl = p.url();
});
await steg('faktura-PDF', async () => {
  const id = fakturaUrl.split('/').pop();
  const r = await p.request.get(`${B}/api/faktura/${id}/pdf`);
  if (r.status() !== 200 || !(r.headers()['content-type'] || '').includes('pdf')) throw new Error('pdf ' + r.status());
  const buf = await r.body(); if (buf.slice(0, 4).toString() !== '%PDF') throw new Error('ikke pdf');
});
await steg('registrer delbetaling', async () => {
  await p.goto(fakturaUrl);
  await p.click('button:has-text("Registrer betaling")');
  await p.getByLabel('Beløp').fill('5000');
  await p.click('button:has-text("Registrer 5000 kr")');
  await tekst('Betalingen er registrert');
  await p.reload(); await tekst('7 500,00 kr gjenstår');
});
await steg('kreditnota for resten', async () => {
  await p.goto(fakturaUrl);
  await p.click('button:has-text("Lag kreditnota")');
  await p.getByText('Et beløp').click();
  await p.getByLabel('Beløp med MVA').fill('7500');
  await p.getByLabel('Hvorfor? Kunden ser dette.').fill('Rabatt');
  await p.click('.kort button:has-text("Lag kreditnota")');
  await p.waitForURL(u => u.toString() !== fakturaUrl, { timeout: 20000 });
  await tekst('Kreditnota for');
  await p.goto(fakturaUrl); await tekst('Betalt');
});
await steg('bank godkjenn forslag', async () => {
  await p.goto(B + '/bank?maned=2026-08');
  const n = await p.locator('button:has-text("Godkjenn"), button:has-text("Koble til"), button:has-text("Før automatisk")').count();
  for (let i = 0; i < n; i++) { const k = p.locator('button:has-text("Godkjenn"), button:has-text("Koble til"), button:has-text("Før automatisk")').first(); if (!(await k.count())) break; await k.click(); await p.waitForTimeout(1500); }
  console.log('     godkjente', n);
});
await steg('bank CircleK som kjøp', async () => {
  await p.goto(B + '/bank?maned=2026-08');
  const rad = p.locator('.linje', { hasText: /circle k/i }).first();
  await rad.locator('text=Registrer kjøp').click();
  await p.waitForURL(/kjop\/ny/);
  await p.waitForTimeout(1200);
  await p.click('button:has-text("Registrer kjøpet")');
  await tekst('Kjøpet er registrert.');
  await p.goto(B + '/bank?maned=2026-08');
  const rad2 = p.locator('.linje', { hasText: /circle k/i }).first();
  await rad2.locator('button:has-text("Koble til")').click();
  await p.waitForTimeout(1500);
  await p.reload();
  await p.locator('.linje', { hasText: /circle k/i }).first().getByText('Avstemt').waitFor();
});
await steg('csv og saf-t', async () => {
  for (const u of ['/api/rapport?type=res&ar=2026', '/api/rapport?type=hb&ar=2026', '/api/saft?ar=2026', '/api/lonn?ar=2026']) {
    const r = await p.request.get(B + u); if (r.status() !== 200) throw new Error(u + ' ' + r.status());
  }
  const x = await (await p.request.get(B + '/api/saft?ar=2026')).text();
  const d = x.match(/<n1:TotalDebit>([\d.]+)</)[1], k = x.match(/<n1:TotalCredit>([\d.]+)</)[1];
  if (d !== k) throw new Error(`debet ${d} kredit ${k}`);
});
await steg('kalenderlenke', async () => {
  await p.goto(B + '/frister');
  await p.click('button:has-text("Outlook")');
  const l = await p.locator('.mono.liten').first().textContent();
  const r = await p.request.get(l.trim()); const t = await r.text();
  if (!t.startsWith('BEGIN:VCALENDAR')) throw new Error('ikke ics');
});
await steg('lønn', async () => {
  await p.goto(B + '/lonn');
  const timer = p.getByLabel(/Timer i/);
  if (!(await timer.count())) { await p.locator('.valgkort', { hasText: 'Timelønn' }).first().click(); }
  await p.getByLabel(/Timer i/).fill('100');
  await p.click('button:has-text("Kjør lønn for")');
  await tekst('er kjørt');
});
await steg('inviter regnskapsfører', async () => {
  await p.goto(B + '/regnskapsforer');
  await p.getByLabel('E-posten til regnskapsføreren').fill('ny@byra.no');
  await p.click('button:has-text("Lag invitasjon")');
  await tekst('/invitasjon/');
});
await steg('mobil hjem', async () => {
  await p.setViewportSize({ width: 390, height: 844 });
  for (const s of ['/hjem', '/salg/ny', '/kjop/ny', '/bank', '/mva', '/rapporter']) { await p.goto(B + s); await p.screenshot({ path: `${S}/mobil${s.replace(/\W+/g, '_')}.png`, fullPage: true }); const w = await p.evaluate(() => document.documentElement.scrollWidth); if (w > 392) console.log('     for bred', s, w); }
  await p.setViewportSize({ width: 1280, height: 900 });
});

// Regnskapsfører
const p2 = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
p2.on('pageerror', e => feil.push('pageerror ' + e.message));
p2.on('response', r => { if (r.status() >= 500) feil.push(`${r.status()} ${r.url()}`); });
await steg('byrå', async () => {
  await p2.goto(B + '/logg-inn');
  await p2.fill('input[name=epost]', 'regnskap@rettfort.no'); await p2.fill('input[name=passord]', 'rettfort-demo');
  await Promise.all([p2.waitForURL(/byra/, { timeout: 60000 }), p2.click('button:has-text("Logg inn")')]);
  await p2.screenshot({ path: `${S}/byra.png`, fullPage: true });
  await p2.locator('td button:has-text("Åpne")').first().click();
  await p2.waitForURL(/hjem/);
  await p2.getByText('Alle kunder').first().waitFor();
});
// Ny bruker
const p3 = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
p3.on('pageerror', e => feil.push('pageerror ' + e.message));
await steg('ny bruker og foretak', async () => {
  await p3.goto(B + '/registrer');
  await p3.fill('input[name=navn]', 'Ola Test'); await p3.fill('input[name=epost]', `ola${Date.now()}@test.no`); await p3.fill('input[name=passord]', 'hemmelig123');
  await p3.click('button:has-text("Lag kontoen")');
  await p3.waitForURL(/velkommen/);
  const kode = (await p3.locator('.testmodus b.mono').textContent()).trim();
  await p3.fill('input[autocomplete=one-time-code]', kode);
  await p3.getByText('Foretaket er ikke registrert ennå').click();
  await p3.getByLabel('Navn').fill('Ola Test ENK');
  await p3.click('button:has-text("Stemmer")');
  await p3.click('button:has-text("Fortsett")');
  await p3.getByText('Ferdig. Dette har vi satt opp').waitFor();
  await p3.click('button:has-text("Gå til Hjem")');
  await p3.waitForURL(/hjem/);
  for (const s of ['/kjop/ny', '/salg/ny', '/bank', '/lonn', '/rapporter', '/mva', '/frister', '/innstillinger?vis=avansert']) { const r = await p3.goto(B + s); if (r.status() !== 200) throw new Error(s + ' ' + r.status()); }
});
await steg('tilgang på tvers av firma nektes', async () => {
  const id = fakturaUrl.split('/').pop();
  const r = await p3.request.get(`${B}/api/faktura/${id}/pdf`);
  if (r.status() !== 404) throw new Error('fikk ' + r.status());
  const r2 = await p3.goto(fakturaUrl); if (r2.status() !== 404) throw new Error('side ' + r2.status());
});
console.log('\nFEIL I NETTLESER/SERVER:\n' + [...new Set(feil)].join('\n'));
await b.close();
