import { chromium } from 'playwright-core';
// Vaktplan v2 fra start til slutt: leder og ansatt. Kjør mot «next start -p 3100» med RETTFORT_IDAG=2026-10-05.
const B = 'http://localhost:3100', S = process.env.S ?? '/tmp';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let p;
const steg = async (navn, fn) => { try { await fn(); console.log('OK  ', navn); } catch (e) { console.log('FEIL', navn, '-', e.message.split('\n')[0]); await p.screenshot({ path: `${S}/feil-${navn.replace(/\W+/g, '_')}.png`, fullPage: true }); } };
const toast = async re => { await p.locator('.v2-toast').filter({ hasText: re }).waitFor({ timeout: 15000 }); };
const lc = await b.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
p = await lc.newPage(); p.on('pageerror', e => console.log('pageerror', e.message));
await p.goto(B + '/logg-inn');
await Promise.all([p.waitForURL(/hjem/, { timeout: 90000 }), p.click('button:has-text("Gå inn som bedrift")')]);
await steg('regnskapet sender /vaktplan til /vp', async () => { await p.goto(B + '/vaktplan'); await p.waitForURL(/\/vp/); await p.getByRole('heading', { name: 'Uke 41' }).waitFor(); });
await steg('ny vakt med advarsel og Angre', async () => {
  await p.locator('.v2l-rad', { hasText: 'Sara Havøy' }).locator('.v2l-pluss').last().click();
  await p.getByRole('dialog').getByText('Gir Sara').waitFor();
  await p.screenshot({ path: `${S}/F-vakt-pc.png` });
  await p.getByRole('button', { name: 'Lagre likevel' }).click();
  await toast(/Vakten er lagt til\. Publiser for å varsle\./);
  await p.locator('.v2-toast button', { hasText: 'Angre' }).click(); await toast(/Angret/);
});
await steg('godkjenn fri som fravær, vakten til Emma', async () => {
  await p.locator('.v2l-svar', { hasText: 'Jonas Berg ber om fri' }).getByRole('button', { name: 'Godkjenn' }).click();
  const d = p.getByRole('dialog');
  await d.getByRole('button', { name: 'Velferdspermisjon' }).click();
  await d.getByRole('button', { name: 'Gi til …' }).click();
  await d.locator('.v2-pille', { hasText: 'Emma' }).click();
  await p.screenshot({ path: `${S}/F-fravaer-pc.png` });
  await d.getByRole('button', { name: 'Godkjenn', exact: true }).click();
  await toast(/Velferdspermisjon er registrert for Jonas, med lønn\. Vakten er gitt til Emma\./);
});
await steg('gi ledig lørdag til Emma', async () => { await p.locator('.v2l-svar', { hasText: 'Ledig lørdag' }).getByRole('button', { name: 'Gi til Emma' }).click(); await toast(/er gitt til Emma/); });
await steg('publiser', async () => { await p.getByRole('button', { name: 'Publiser og varsle' }).click(); await toast(/Endringene er publisert/); await p.locator('.v2l-publiser:disabled').waitFor(); });
await steg('timer: godkjenn de som stemmer', async () => { await p.getByRole('button', { name: 'Se timer' }).click(); await p.getByRole('button', { name: 'Godkjenn de som stemmer' }).first().click(); await toast(/timelister? er godkjent/); await p.screenshot({ path: `${S}/F-timer-pc.png`, fullPage: true }); });
await steg('innstillinger: slå av ledige vakter og lagre', async () => {
  await p.locator('.v2l-faner button', { hasText: 'Innstillinger' }).click();
  await p.getByRole('switch', { name: 'Ledige vakter' }).click();
  await p.locator('.v2-forh').filter({ hasNotText: 'Jeg tar den' }).waitFor();
  await p.getByRole('button', { name: 'Lagre', exact: true }).click(); await toast(/Innstillingene er lagret/);
  await p.screenshot({ path: `${S}/F-innst-pc.png`, fullPage: true });
});
await steg('inviter ansatt (lenke vises når e-post ikke sendes)', async () => {
  await p.locator('.v2l-faner button', { hasText: 'Ansatte' }).click();
  await p.getByRole('button', { name: 'Inviter ansatt' }).click();
  const d = p.getByRole('dialog');
  await d.getByRole('button', { name: 'Send invitasjon' }).click(); await d.getByText('Skriv inn navnet til den ansatte.').waitFor();
  await d.getByLabel('Navn').fill('Nora Ny'); await d.getByLabel('E-post').fill('nora@example.com');
  await d.getByRole('button', { name: 'Send invitasjon' }).click();
  await d.locator('.v2-lenke').waitFor();
  globalThis.nora = (await d.locator('.v2-lenke').innerText()).replace(/^https?:\/\/[^/]+/, B);
  await d.getByRole('button', { name: 'Ferdig' }).click();
  await p.locator('.v2-at-rad', { hasText: 'Nora Ny' }).waitFor();
});
// Ansatt
const ac = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, ignoreHTTPSErrors: true });
p = await ac.newPage(); p.on('pageerror', e => console.log('pageerror', e.message));
await steg('Nora logger inn med lenken', async () => { await p.goto(globalThis.nora); await p.waitForURL(/\/vakt$/); await p.getByRole('heading', { name: 'Hei, Nora.' }).waitFor(); });
await steg('ledige er skjult når lederen har slått dem av', async () => { if (await p.locator('nav:visible button:has(span:text-is("Ledige"))').count()) throw new Error('Ledige vises'); });
await steg('kan ikke jobbe og angre', async () => {
  await p.locator('nav:visible button:has(span:text-is("Vakter"))').click();
  await p.locator('.v2a-tilgrad').first().getByRole('button', { name: 'Kan ikke' }).click();
  await toast(/Lagret: du kan ikke jobbe/);
  await p.locator('.v2-toast button', { hasText: 'Angre' }).click(); await toast(/Angret/);
});
await steg('søknad om ferie', async () => {
  await p.locator('nav:visible button:has(span:text-is("Mer"))').click(); await p.locator('.v2a-linje', { hasText: 'Fravær' }).click();
  await p.getByRole('button', { name: 'Ny søknad' }).click(); await p.getByRole('dialog').getByRole('button', { name: 'Send' }).click();
  await toast(/Søknaden er sendt til lederen/);
});
await steg('ansatt sperret fra regnskapet', async () => { await p.goto(B + '/salg'); await p.waitForURL(/\/vakt/); });
await b.close();
