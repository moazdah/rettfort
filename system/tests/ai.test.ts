import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
vi.mock('next/headers', () => ({ headers: async () => new Map() }));
vi.mock('@/lib/epost', async orig => ({ ...(await orig<typeof import('@/lib/epost')>()), sendEpost: vi.fn(async () => true) }));
import { nyTestDb, type Db } from '@/lib/db';
import { lagTestfirma } from '@/lib/db/eksempel';
import { hentPosteringer } from '@/lib/tjenester/bokforing';
import { balanse } from '@/lib/rapporter';
import { kjorVerktoy, type Ktx, type Kort } from '@/lib/ai/verktoy';
import { svarSomAgent, systemtekst } from '@/lib/ai/agent';
import { utforForslag, ventende, forslagPdf } from '@/lib/ai/utfor';
import { sendEpost } from '@/lib/epost';

const IDAG = '2026-09-29';
let db: Db, org: string, bruker: string, k: Ktx;
const o = () => ({ orgId: org, brukerId: bruker, brukerEpost: 'test@example.com', foretak: 'Testfirma AS', idag: IDAG });
const forslag = (r: { kort?: Kort }) => { expect(r.kort?.type).toBe('forslag'); return r.kort as Extract<Kort, { type: 'forslag' }>; };
const ubetalt = async (forfalt: boolean) => (await db.en<{ nr: number; id: string }>(
  `select f.nr, f.id from faktura f join kontakt k on k.id = f.kontakt_id where f.organisasjon_id = $1 and f.type = 'faktura' and f.status in ('sendt','delbetalt') and k.epost is not null and ${forfalt ? 'f.forfall < $2' : 'f.forfall >= $2'} order by f.nr limit 1`, [org, IDAG]))!;

beforeAll(async () => {
  db = await nyTestDb();
  bruker = (await db.en<{ id: string }>(`insert into bruker (epost, navn, passord_hash, epost_bekreftet) values ('test@example.com', 'Test Person', 'x', true) returning id`))!.id;
  org = await lagTestfirma(db, bruker, 'Test', IDAG);
  k = { db, orgId: org, brukerId: bruker, idag: IDAG, kanEndre: true };
}, 180000);

afterEach(() => { vi.unstubAllGlobals(); delete process.env.DEEPSEEK_API_KEY; });

describe('assistentens verktøy', () => {
  it('lesevektøy gir tall og kort', async () => {
    const graf = await kjorVerktoy(k, 'vis_resultat_per_maned', { ar: 2026 });
    expect(graf.kort?.type).toBe('graf_maned');
    const m = (graf.kort as Extract<Kort, { type: 'graf_maned' }>).maneder;
    expect(m.length).toBeGreaterThan(0);
    expect(m.every(x => x.resultat === x.inn - x.ut)).toBe(true);
    const t = await kjorVerktoy(k, 'vis_fakturaer', { filter: 'ubetalt' });
    expect(t.kort?.type).toBe('tabell_fakturaer');
    expect((await kjorVerktoy(k, 'hent_oversikt', {})).svar).toHaveProperty('merk');
    expect((await kjorVerktoy(k, 'ukjent', {})).svar).toHaveProperty('feil');
  });

  it('lesetilgang kan ikke lage forslag', async () => {
    const r = await kjorVerktoy({ ...k, kanEndre: false }, 'registrer_kostnad', { leverandor: 'X', beskrivelse: 'Y', total_inkl_mva: 100 });
    expect(r.kort).toBeUndefined();
    expect(String((r.svar as { feil: string }).feil)).toMatch(/lesetilgang/);
  });

  it('faktura: vent blir utkast, send fører og sender', async () => {
    const kunder = (await kjorVerktoy(k, 'sok_kunde', { sok: 'a' })).svar as { kunde_id: string }[];
    const kundeId = kunder[0].kunde_id;
    const lag = () => kjorVerktoy(k, 'lag_faktura', { kunde_id: kundeId, linjer: [{ beskrivelse: 'Rådgivning', antall: 2, pris_eks_mva: 1000 }] });
    const a = forslag(await lag());
    expect((a.data as { sum: { total: number } }).sum.total).toBe(250000);
    const v = await utforForslag(db, o(), a.id, 'vent');
    expect(v.status).toBe('pa_vent');
    expect(v.lenke).toMatch(/^\/salg\/ny\?utkast=/);
    expect((await db.en<{ status: string }>(`select status from faktura where id = $1`, [v.lenke!.split('=')[1]]))!.status).toBe('utkast');

    const b = forslag(await lag());
    const utkastPdf = await forslagPdf(db, org, b.id);
    expect(utkastPdf!.filnavn).toBe('faktura-forslag.pdf');
    expect(new TextDecoder().decode(utkastPdf!.pdf.slice(0, 5))).toBe('%PDF-');
    const s = await utforForslag(db, o(), b.id, 'utfor');
    expect((await forslagPdf(db, org, b.id))!.filnavn).toMatch(/^faktura-\d+\.pdf$/);
    expect(await forslagPdf(db, 'ffffffff-ffff-ffff-ffff-ffffffffffff', b.id)).toBeNull();
    expect(s.status).toBe('utfort');
    expect(s.melding).toMatch(/Faktura \d+ er laget og ført/);
    await expect(utforForslag(db, o(), b.id, 'utfor')).rejects.toThrow(/allerede gjort/);
    expect(balanse(await hentPosteringer(db, org), '2026-12-31').differanse).toBe(0);
  });

  it('kostnad registreres, avbryt endrer ingenting', async () => {
    const f = forslag(await kjorVerktoy(k, 'registrer_kostnad', { leverandor: 'Kontorbutikken', beskrivelse: 'Printerpapir', total_inkl_mva: 625, mva_sats: 25, betalt: 'bank' }));
    const d = f.data as { total: number; mva: number };
    expect(d.total).toBe(62500);
    expect(d.mva).toBe(12500);
    const r = await utforForslag(db, o(), f.id, 'utfor');
    expect(r.melding).toMatch(/bilag/);
    const g = forslag(await kjorVerktoy(k, 'registrer_kostnad', { leverandor: 'Kontorbutikken', beskrivelse: 'Mer papir', total_inkl_mva: 100 }));
    const for_ = Number((await db.en<{ n: number }>(`select count(*)::int as n from kjop where organisasjon_id = $1`, [org]))!.n);
    expect((await utforForslag(db, o(), g.id, 'avbryt')).status).toBe('avbrutt');
    expect(Number((await db.en<{ n: number }>(`select count(*)::int as n from kjop where organisasjon_id = $1`, [org]))!.n)).toBe(for_);
    expect(balanse(await hentPosteringer(db, org), '2026-12-31').differanse).toBe(0);
  });

  it('purring sendes, og på vent havner den på Hjem', async () => {
    const f = await ubetalt(true);
    const ikke = await ubetalt(false).catch(() => null);
    if (ikke) expect((await kjorVerktoy(k, 'send_purring', { faktura_nr: ikke.nr })).svar).toHaveProperty('feil');
    const a = forslag(await kjorVerktoy(k, 'send_purring', { faktura_nr: f.nr }));
    expect((await utforForslag(db, o(), a.id, 'vent')).status).toBe('pa_vent');
    expect((await ventende(db, org)).map(x => x.id)).toContain(a.id);
    const r = await utforForslag(db, o(), a.id, 'utfor');
    expect(r.melding).toMatch(/Purring på faktura/);
    expect(sendEpost).toHaveBeenCalled();
    expect((await ventende(db, org)).map(x => x.id)).not.toContain(a.id);
  });

  it('innbetaling og kreditnota', async () => {
    const f = await ubetalt(true);
    const b = forslag(await kjorVerktoy(k, 'registrer_innbetaling', { faktura_nr: f.nr }));
    await utforForslag(db, o(), b.id, 'utfor');
    expect((await db.en<{ status: string }>(`select status from faktura where id = $1`, [f.id]))!.status).toBe('betalt');
    expect((await kjorVerktoy(k, 'registrer_innbetaling', { faktura_nr: f.nr })).svar).toHaveProperty('feil');
    const kn = forslag(await kjorVerktoy(k, 'lag_kreditnota', { faktura_nr: f.nr, grunn: 'Feil pris', belop: 100 }));
    const r = await utforForslag(db, o(), kn.id, 'utfor');
    expect(r.melding).toMatch(/Kreditnota \d+/);
    expect(balanse(await hentPosteringer(db, org), '2026-12-31').differanse).toBe(0);
  });
});

describe('assistenten som agent', () => {
  it('systemteksten har dato, ukedag og klokke, og nevner ikke leverandøren', () => {
    const t = systemtekst({ foretak: 'Testfirma AS', orgform: 'AS', mvaRegistrert: true, bruker: 'Test', idag: IDAG, klokke: '14:05', kanEndre: true });
    expect(t).toContain('tirsdag 29.09.2026');
    expect(t).toContain('14:05');
    expect(t.toLowerCase()).not.toContain('deepseek');
  });

  it('kaller verktøy i flere runder og samler kortene', async () => {
    process.env.DEEPSEEK_API_KEY = 'test';
    const kall: { messages: { role: string; content: string }[]; tools: unknown[] }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
      const b = JSON.parse(init.body); kall.push(b);
      const svar = (m: unknown) => new Response(JSON.stringify({ choices: [{ message: m }] }), { status: 200 });
      if (kall.length === 1) return svar({ role: 'assistant', content: null, tool_calls: [{ id: 'k1', type: 'function', function: { name: 'sok_kunde', arguments: '{"sok":"a"}' } }] });
      if (kall.length === 2) {
        const kunder = JSON.parse(b.messages.at(-1).content) as { kunde_id: string }[];
        return svar({ role: 'assistant', content: null, tool_calls: [
          { id: 'k2', type: 'function', function: { name: 'lag_faktura', arguments: JSON.stringify({ kunde_id: kunder[0].kunde_id, linjer: [{ beskrivelse: 'Timer', antall: 1, pris_eks_mva: 500 }] }) } },
          { id: 'k3', type: 'function', function: { name: 'vis_resultat_per_maned', arguments: '{}' } },
        ] });
      }
      return svar({ role: 'assistant', content: 'Her er forslaget. Trykk «Send fakturaen» eller «Sett på vent».' });
    }));
    const r = await svarSomAgent(k, { foretak: 'Testfirma AS', orgform: 'AS', mvaRegistrert: true, bruker: 'Test', idag: IDAG, klokke: '10:00', kanEndre: true }, [{ role: 'user', content: 'Lag faktura på 500 kr for timer' }]);
    expect(r.tekst).toMatch(/Her er forslaget/);
    expect(r.kort.map(x => x.type)).toEqual(['forslag', 'graf_maned']);
    expect(kall).toHaveLength(3);
    expect(kall[0].messages[0].role).toBe('system');
    expect(kall[0].tools.length).toBeGreaterThan(8);
    // Forslaget venter på brukeren; ingenting er sendt
    const f = r.kort[0] as Extract<Kort, { type: 'forslag' }>;
    expect((await db.en<{ status: string }>(`select status from ai_forslag where id = $1`, [f.id]))!.status).toBe('venter');
  });

  it('feil fra modellen blir en norsk melding', async () => {
    process.env.DEEPSEEK_API_KEY = 'test';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nei', { status: 500 })));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(svarSomAgent(k, { foretak: 'X', orgform: 'AS', mvaRegistrert: false, bruker: 'T', idag: IDAG, klokke: '10:00', kanEndre: true }, [{ role: 'user', content: 'hei' }])).rejects.toThrow(/svarer ikke akkurat nå/);
  });
});
