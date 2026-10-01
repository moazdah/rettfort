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

describe('nye verktøy: lønn, skannelenke, invitasjon, kunde, frister', () => {
  it('kjører lønn som forslag og utfører den', async () => {
    const v = await kjorVerktoy(k, 'vis_lonn', {});
    const ansatte = (v.svar as { ansatte: { navn: string; lonnstype: string }[] }).ansatte;
    expect(ansatte.length).toBeGreaterThan(0);
    const timelonn = ansatte.filter(x => x.lonnstype === 'time').map(x => ({ navn: x.navn, timer: 100 }));
    const f = forslag(await kjorVerktoy(k, 'kjor_lonn', { periode: '2026-10', ansatte: timelonn, send_slipper: 'ingen' }));
    const d = f.data as { utbetalingsdato: string; sum: { netto: number; brutto: number } };
    expect(d.utbetalingsdato.startsWith('2026-10-')).toBe(true);
    expect(d.sum.netto).toBeGreaterThan(0);
    expect((await kjorVerktoy(k, 'kjor_lonn', { ansatte: [{ navn: 'Finnes Ikke' }] })).svar).toHaveProperty('feil');
    const r = await utforForslag(db, o(), f.id, 'utfor');
    expect(r.melding).toMatch(/Lønn for 2026-10 er kjørt/);
    expect((await kjorVerktoy(k, 'kjor_lonn', { periode: '2026-10' })).svar).toHaveProperty('feil');
    expect(balanse(await hentPosteringer(db, org), '2026-12-31').differanse).toBe(0);
  });

  it('sender lønnslipp, skannelenke og invitasjon på e-post', async () => {
    const navn = (await db.en<{ navn: string }>(`select a.navn from lonnslipp ls join ansatt a on a.id = ls.ansatt_id join lonnskjoring l on l.id = ls.lonnskjoring_id where l.organisasjon_id = $1 and a.epost is not null order by l.periode desc limit 1`, [org]))?.navn;
    if (navn) {
      const ls = forslag(await kjorVerktoy(k, 'send_lonnslipp', { navn }));
      expect((ls.data as { epost: string }).epost).toMatch(/@/);
    }
    const sl = forslag(await kjorVerktoy(k, 'send_skannelenke', { type: 'klient', navn: 'Per Klient', epost: 'per@example.com' }));
    const r = await utforForslag(db, { ...o(), grunnadresse: 'https://min.test' }, sl.id, 'utfor');
    expect(r.melding).toMatch(/QR-kode er sendt til per@example.com/);
    expect(await db.en(`select 1 from skannelenke where organisasjon_id = $1 and epost = 'per@example.com'`, [org])).toBeTruthy();
    const kall = (sendEpost as unknown as { mock: { calls: [{ vedlegg?: { cid?: string }[]; html?: string }][] } }).mock.calls.at(-1)![0];
    expect(kall.vedlegg?.[0]?.cid).toBe('qr-kode');
    expect(kall.html).toContain('cid:qr-kode');
    expect((await kjorVerktoy(k, 'send_skannelenke', { type: 'klient' })).svar).toHaveProperty('feil');

    const inv = forslag(await kjorVerktoy(k, 'inviter_bruker', { epost: 'ny@example.com', rolle: 'les' }));
    expect((await utforForslag(db, o(), inv.id, 'utfor')).melding).toMatch(/Invitasjonen er sendt/);
    expect(await db.en(`select 1 from invitasjon where organisasjon_id = $1 and epost = 'ny@example.com' and rolle = 'les'`, [org])).toBeTruthy();
  });

  it('legger til ny kunde og viser frister', async () => {
    const kf = forslag(await kjorVerktoy(k, 'ny_kunde', { navn: 'Nordlys Testkunde AS', epost: 'post@nordlys.no', postnr: '9008', poststed: 'Tromsø' }));
    await utforForslag(db, o(), kf.id, 'utfor');
    const sok = (await kjorVerktoy(k, 'sok_kunde', { sok: 'Nordlys Testkunde' })).svar as { epost: string }[];
    expect(sok[0].epost).toBe('post@nordlys.no');
    expect((await kjorVerktoy(k, 'ny_kunde', { navn: 'Nordlys Testkunde AS' })).svar).toHaveProperty('info');
    const fr = await kjorVerktoy(k, 'vis_frister', {});
    expect(fr.kort?.type).toBe('liste');
    expect(((fr.kort as { rader: { tekst?: string }[] }).rader[0].tekst ?? '')).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
  });

  it('lesetilgang kan ikke kjøre lønn eller invitere', async () => {
    for (const v of ['kjor_lonn', 'inviter_bruker', 'send_skannelenke', 'ny_kunde', 'send_lonnslipp'])
      expect((await kjorVerktoy({ ...k, kanEndre: false }, v, {})).svar).toHaveProperty('feil');
  });
});

describe('vaktplan i assistenten', () => {
  it('bare i betalte pakker, og lager utkast, foreslår til ledig vakt og publiserer', async () => {
    await db.q(`update organisasjon set pakke = 'gratis' where id = $1`, [org]);
    expect(String(((await kjorVerktoy(k, 'vis_vaktplan', {})).svar as { feil: string }).feil)).toMatch(/Start og Selskap/);
    await db.q(`update organisasjon set pakke = 'start' where id = $1`, [org]);
    const V = await import('@/lib/tjenester/vaktplan');
    const a1 = await V.lagreVaktAnsatt(db, org, { navn: 'Vera Vakt', kontakt: 'vera@example.com', lonnType: 'fast', stillingsprosent: 100, sats: 4000000 });
    const a2 = await V.lagreVaktAnsatt(db, org, { navn: 'Tor Time', kontakt: 'tor@example.com', lonnType: 'time', stillingsprosent: 50, sats: 22000 });
    await V.inviterAnsatt(db, org, a1); await V.inviterAnsatt(db, org, a2);
    // Uke 40 (forrige) har vakter; assistenten bygger uke 41 på dem.
    await V.lagreVakt(db, org, { ansattId: a1, dato: '2026-09-28', start: '07:00', slutt: '15:00' });
    await V.lagreVakt(db, org, { ansattId: a2, dato: '2026-09-29', start: '10:00', slutt: '18:00' });
    const f = forslag(await kjorVerktoy(k, 'lag_vaktplan', { uke: 41, aar: 2026 }));
    expect((f.data as { vakter: unknown[] }).vakter).toHaveLength(2);
    expect((await utforForslag(db, o(), f.id, 'utfor')).melding).toMatch(/Utkast for uke 41 er laget med 2 vakter/);
    expect((await kjorVerktoy(k, 'lag_vaktplan', { uke: 41, aar: 2026 })).svar).toHaveProperty('feil');

    const v = await kjorVerktoy(k, 'vis_vaktplan', { uke: 41, aar: 2026 });
    expect((v.svar as { status: string }).status).toBe('utkast');
    // Gjør tirsdagens vakt ledig, la Vera melde interesse, og be om forslag.
    const tirsdag = (await V.vakterMellom(db, org, '2026-10-06', '2026-10-06'))[0];
    await V.gjorLedig(db, org, tirsdag.id);
    await V.settInteresse(db, org, a1, tirsdag.id, true);
    const t = forslag(await kjorVerktoy(k, 'foreslaa_til_ledig_vakt', { dato: '2026-10-06' }));
    expect((t.data as { navn: string; interessert: boolean })).toMatchObject({ navn: 'Vera Vakt', interessert: true });
    await utforForslag(db, { ...o(), grunnadresse: 'https://min.test' }, t.id, 'utfor');
    expect((await V.vakterMellom(db, org, '2026-10-06', '2026-10-06'))[0].ansattId).toBe(a1);

    const p = forslag(await kjorVerktoy(k, 'publiser_uke', { uke: 41, aar: 2026 }));
    const r = await utforForslag(db, { ...o(), grunnadresse: 'https://min.test' }, p.id, 'utfor');
    expect(r.melding).toMatch(/Uke 41 er publisert\. 1 fikk e-post/);
    expect((await kjorVerktoy(k, 'publiser_uke', { uke: 41, aar: 2026 })).svar).toHaveProperty('info');
    expect((await kjorVerktoy(k, 'overtid', { uke: 41, aar: 2026 })).svar).toHaveProperty('ansatte');
  });
});

describe('tidligere samtaler', () => {
  it('lagres per bruker, kan søkes i og får oppdatert status på forslag', async () => {
    const { lagreSamtale, listSamtaler, hentSamtale } = await import('@/lib/ai/samtale');
    const f = forslag(await kjorVerktoy(k, 'registrer_kostnad', { leverandor: 'Biltema', beskrivelse: 'Lyspære', total_inkl_mva: 99 }));
    const tid = new Date().toISOString();
    const id = await lagreSamtale(db, org, bruker, null, 'Kostnad fra Biltema', [
      { fra: 'bruker', tekst: 'Før lyspæra fra Biltema', tid },
      { fra: 'assistent', tekst: 'Her er forslaget.', tid, kort: [f] },
    ]);
    expect(await lagreSamtale(db, org, bruker, id, 'x', [{ fra: 'bruker', tekst: 'Før lyspæra fra Biltema', tid }, { fra: 'assistent', tekst: 'Her er forslaget.', tid, kort: [f] }])).toBe(id);
    const l = await listSamtaler(db, org, bruker);
    expect(l[0]).toMatchObject({ id, tittel: 'Kostnad fra Biltema', siste: 'Her er forslaget.', sisteFraBruker: false });
    expect((await listSamtaler(db, org, bruker, 'lyspæra')).map(x => x.id)).toContain(id);
    expect(await listSamtaler(db, org, bruker, 'finnes-ikke')).toHaveLength(0);
    // En annen bruker ser den ikke
    const annen = (await db.en<{ id: string }>(`insert into bruker (epost, navn, passord_hash, epost_bekreftet) values ('annen@example.com', 'Annen', 'x', true) returning id`))!.id;
    expect(await hentSamtale(db, org, annen, id)).toBeNull();
    // Forslaget registreres et annet sted: samtalen viser ny status
    await utforForslag(db, o(), f.id, 'utfor');
    const s = await hentSamtale(db, org, bruker, id);
    const kort = (s!.meldinger[1] as { kort: Kort[] }).kort[0] as Extract<Kort, { type: 'forslag' }>;
    expect(kort.status).toBe('utfort');
  });
});
