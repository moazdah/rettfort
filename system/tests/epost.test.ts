import { describe, it, expect, vi, afterEach } from 'vitest';
vi.mock('next/headers', () => ({ headers: async () => new Map() }));
import { sendEpost, maler, somHtml, epostPa } from '@/lib/epost';

afterEach(() => { vi.unstubAllGlobals(); delete process.env.RESEND_API_KEY; });

describe('e-post', () => {
  it('sender ingenting uten nøkkel', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    expect(epostPa()).toBe(false);
    expect(await sendEpost({ til: 'a@b.no', emne: 'x', tekst: 'y' })).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
  it('sender faktura med PDF-vedlegg og svar-til', async () => {
    process.env.RESEND_API_KEY = 're_test';
    const f = vi.fn(async () => new Response('{"id":"1"}', { status: 200 })); vi.stubGlobal('fetch', f);
    const m = maler.faktura({ type: 'faktura', nr: 1044, foretak: 'Havøy Fisk AS', kunde: 'Kvam Transport AS', belop: '17 250,00', forfall: '19.09.2026', kid: '0000104400', kontonr: '1506 22 33445' });
    expect(await sendEpost({ til: 'post@kvam.no', ...m, svarTil: 'post@havoy.no', vedlegg: [{ filnavn: 'faktura-1044.pdf', innhold: new Uint8Array([37, 80, 68, 70]) }] })).toBe(true);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ to: ['post@kvam.no'], subject: 'Faktura 1044 fra Havøy Fisk AS', reply_to: 'post@havoy.no', attachments: [{ filename: 'faktura-1044.pdf', content: 'JVBERg==' }] });
    expect(body.text).toContain('KID: 0000104400');
    // HTML-versjonen har logo, figur og betalingsinfo.
    expect(body.html).toContain('/epost/logo.png');
    expect(body.html).toContain('/epost/figur.png');
    expect(body.html).toContain('0000104400');
    expect(body.html).toContain('Fakturaen ligger vedlagt som PDF.');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer re_test');
  });
  it('feil fra tjenesten gir false, ikke unntak', async () => {
    process.env.RESEND_API_KEY = 're_test';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nei', { status: 422 })));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await sendEpost({ til: 'a@b.no', emne: 'x', tekst: 'y' })).toBe(false);
  });
  it('malene escaper navn fra brukeren', () => {
    const m = maler.invitasjon('<script>x</script>', 'A & B AS', 'som regnskapsfører', 'https://min.xn--rettfrt-u1a.no/invitasjon/abc');
    expect(m.html).not.toContain('<script>x');
    expect(m.html).toContain('A &amp; B AS');
    expect(m.html).toContain('Godta invitasjonen');
  });
  it('HTML-versjonen escaper tekst og lager lenker', () => {
    const h = somHtml('Hei <b>!\n\nhttps://min.xn--rettfrt-u1a.no/invitasjon/abc');
    expect(h).toContain('&lt;b&gt;');
    expect(h).toContain('<a href="https://min.xn--rettfrt-u1a.no/invitasjon/abc"');
  });
});
