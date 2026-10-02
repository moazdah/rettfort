import { describe, it, expect, vi, afterEach } from 'vitest';
vi.mock('next/headers', () => ({ headers: async () => new Map() }));
import { nyTestDb } from '@/lib/db';
import { hashPassord } from '@/lib/auth';
import { kjorLonn } from '@/lib/tjenester/lonn';
import { gyldigFnr, planleggUtsending, sendForfalte, apneLonnslipp, lonnslippInfo, lonnslippPdf } from '@/lib/tjenester/lonnslipp';

afterEach(() => { vi.unstubAllGlobals(); delete process.env.RESEND_API_KEY; });

// Syntetiske fødselsnumre med gyldige kontrollsiffer (ikke ekte personer).
const FNR = '01010112377';

async function oppsett(passord: 'fnr' | 'eget' | null) {
  const db = await nyTestDb();
  const o = (await db.en<{ id: string }>(`insert into organisasjon (type, navn, orgnr, lonningsdag, epost) values ('selskap','Lønn AS','315000009',25,'post@lonn.no') returning id`))!.id;
  const hash = passord === 'fnr' ? await hashPassord(FNR) : passord === 'eget' ? await hashPassord('hemmelig1') : null;
  const a = (await db.en<{ id: string }>(`insert into ansatt (organisasjon_id, navn, epost, lonn_type, manedslonn, skatteprosent, slipp_passord_hash, slipp_passord_type) values ($1,'Ola Nordmann','ola@test.no','fast',4000000,30,$2,$3) returning id`, [o, hash, passord]))!.id;
  const k = await db.tx(t => kjorLonn(t, o, '2026-09', '2026-09-25', []));
  return { db, o, a, k };
}

describe('lønnslipp på e-post', () => {
  it('kjenner igjen gyldige fødselsnumre', () => {
    expect(gyldigFnr(FNR)).toBe(true);
    expect(gyldigFnr('010101 12377')).toBe(true);
    expect(gyldigFnr('01010112378')).toBe(false);
    expect(gyldigFnr('123')).toBe(false);
  });

  it('lager PDF for arbeidsgiveren', async () => {
    const { db, o, a } = await oppsett(null);
    const r = await lonnslippPdf(db, o, '2026-09', a);
    expect(Buffer.from(r!.pdf.slice(0, 4)).toString()).toBe('%PDF');
    expect(r!.filnavn).toBe('lonnslipp-2026-09-ola-nordmann.pdf');
  });

  it('«på utbetalingsdagen» venter, og hver slipp sendes bare én gang', async () => {
    process.env.RESEND_API_KEY = 're_test';
    const f = vi.fn(async () => new Response('{"id":"1"}', { status: 200 })); vi.stubGlobal('fetch', f);
    const { db, k } = await oppsett(null);
    await db.tx(t => planleggUtsending(t, k.id, 'utbetaling', '2099-01-25'));
    expect((await sendForfalte(db, 'https://x')).sendt).toEqual([]);
    await db.tx(t => planleggUtsending(t, k.id, 'na', '2026-09-25'));
    expect((await sendForfalte(db, 'https://x')).sendt).toEqual(['Ola Nordmann']);
    expect((await sendForfalte(db, 'https://x')).sendt).toEqual([]);
    expect(f).toHaveBeenCalledTimes(1);
    // Uten passord: PDF som vedlegg
    const body = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.attachments[0].filename).toBe('lonnslipp-2026-09.pdf');
    expect(body.subject).toBe('Lønnslipp for september 2026 fra Lønn AS');
  });

  it('«ikke send» sender ingenting', async () => {
    process.env.RESEND_API_KEY = 're_test';
    const f = vi.fn(async () => new Response('{}', { status: 200 })); vi.stubGlobal('fetch', f);
    const { db, k } = await oppsett(null);
    await db.tx(t => planleggUtsending(t, k.id, 'ingen', '2026-09-25'));
    await sendForfalte(db, 'https://x');
    expect(f).not.toHaveBeenCalled();
  });

  it('med fødselsnummer: bare lenke i e-posten, åpnes med riktig nummer, sperres etter 5 feil', async () => {
    process.env.RESEND_API_KEY = 're_test';
    const f = vi.fn(async () => new Response('{"id":"1"}', { status: 200 })); vi.stubGlobal('fetch', f);
    const { db, k } = await oppsett('fnr');
    await db.tx(t => planleggUtsending(t, k.id, 'na', '2026-09-25'));
    await sendForfalte(db, 'https://min.rettfort.test');
    const body = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.attachments).toBeUndefined();
    const lenke = String(body.text).match(/https:\/\/min\.rettfort\.test\/lonnslipp\/([\w-]+)/)!;
    const token = lenke[1];
    expect(await lonnslippInfo(db, token)).toMatchObject({ foretak: 'Lønn AS', type: 'fnr', fornavn: 'Ola' });
    await expect(apneLonnslipp(db, token, '01010112458')).rejects.toThrow('Fødselsnummeret stemmer ikke.');
    const r = await apneLonnslipp(db, token, '010101 12377');
    expect(r.data.netto).toBe(2800000);
    for (let i = 0; i < 5; i++) await apneLonnslipp(db, token, '00000000000').catch(() => {});
    await expect(apneLonnslipp(db, token, FNR)).rejects.toThrow('For mange feil forsøk');
    await expect(apneLonnslipp(db, 'feil-token-som-ikke-finnes-xx', FNR)).rejects.toThrow('Lenken er ikke gyldig.');
  });

  it('feilet sending kan prøves igjen senere', async () => {
    process.env.RESEND_API_KEY = 're_test';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nei', { status: 500 })));
    const { db, k } = await oppsett('eget');
    await db.tx(t => planleggUtsending(t, k.id, 'na', '2026-09-25'));
    const r = await sendForfalte(db, 'https://x');
    expect(r.feilet).toEqual(['Ola Nordmann']);
    const s = await db.en<{ sendt_tid: string | null }>('select sendt_tid from lonnslipp where lonnskjoring_id = $1', [k.id]);
    expect(s!.sendt_tid).toBeNull();
  });
});
