// Databasetilkobling. Bruker Postgres (Supabase) når POSTGRES_URL eller DATABASE_URL finnes, ellers
// PGlite (Postgres i prosessen) som testmodus. Samme SQL i begge.

import { SKJEMA, SKJEMA_VERSJON } from './skjema';

export interface Sporring {
  q<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  en<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
}

export interface Db extends Sporring {
  tx<T>(fn: (t: Sporring) => Promise<T>): Promise<T>;
  modus: 'postgres' | 'testmodus';
}

type Glob = typeof globalThis & { __rfDb?: Promise<Db> };

function dbUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL_UNPOOLED || undefined;
}

async function lagPostgres(url: string): Promise<Db> {
  const { Pool, types } = await import('pg');
  types.setTypeParser(20, v => Number(v)); // bigint → number (beløp i øre er trygt under 2^53)
  types.setTypeParser(1700, v => Number(v)); // numeric
  types.setTypeParser(1082, v => v); // date som tekst
  // sslmode i adressen overstyrer ssl-valget under og gir feil mot Supabase sin sertifikatkjede, så det fjernes.
  const u = new URL(url);
  for (const k of ['sslmode', 'sslrootcert', 'supa', 'pgbouncer']) u.searchParams.delete(k);
  const lokal = ['localhost', '127.0.0.1'].includes(u.hostname);
  const pool = new Pool({ connectionString: u.toString(), max: 3, idleTimeoutMillis: 10_000, ssl: lokal ? undefined : { rejectUnauthorized: false } });
  const lag = (c: { query: (s: string, p?: unknown[]) => Promise<{ rows: unknown[] }> }): Sporring => ({
    q: async <T,>(s: string, p?: unknown[]) => (await c.query(s, p)).rows as T[],
    en: async <T,>(s: string, p?: unknown[]) => ((await c.query(s, p)).rows[0] as T) ?? null,
  });
  return {
    modus: 'postgres',
    ...lag(pool),
    async tx(fn) {
      const c = await pool.connect();
      try {
        await c.query('begin');
        const r = await fn(lag(c));
        await c.query('commit');
        return r;
      } catch (e) {
        await c.query('rollback').catch(() => {});
        throw e;
      } finally {
        c.release();
      }
    },
  };
}

async function lagPglite(dir?: string): Promise<Db> {
  const { PGlite, types } = await import('@electric-sql/pglite');
  const db = new PGlite(dir, {
    parsers: { [types.INT8]: (v: string) => Number(v), [types.NUMERIC]: (v: string) => Number(v), [types.DATE]: (v: string) => v },
  });
  const lag = (c: { query: <T>(s: string, p?: unknown[]) => Promise<{ rows: T[] }> }): Sporring => ({
    q: async <T,>(s: string, p?: unknown[]) => (await c.query<T>(s, p)).rows,
    en: async <T,>(s: string, p?: unknown[]) => (await c.query<T>(s, p)).rows[0] ?? null,
  });
  // PGlite håndterer én forespørsel om gangen. Kø sørger for at transaksjoner ikke blandes.
  let ko: Promise<unknown> = Promise.resolve();
  const iKo = <T,>(f: () => Promise<T>): Promise<T> => { const p = ko.then(f, f); ko = p.catch(() => {}); return p; };
  return {
    modus: 'testmodus',
    q: (s, p) => iKo(() => lag(db).q(s, p)),
    en: (s, p) => iKo(() => lag(db).en(s, p)),
    tx: fn => iKo(() => db.transaction(async t => fn(lag(t)))),
  };
}

async function migrer(db: Db): Promise<void> {
  const finnes = await db.en<{ n: number }>(`select count(*)::int as n from information_schema.tables where table_name = 'skjema_versjon'`);
  if (finnes && finnes.n > 0) {
    const v = await db.en<{ v: number }>('select max(versjon) as v from skjema_versjon');
    if (v && v.v >= SKJEMA_VERSJON) return;
  }
  await db.tx(async t => {
    // Flere serverinstanser kan starte samtidig. Låsen gjør at bare én oppdaterer skjemaet om gangen.
    if (db.modus === 'postgres') await t.q('select pg_advisory_xact_lock(7340211)');
    for (const setning of delSql(SKJEMA)) await t.q(setning);
    await t.q('insert into skjema_versjon (versjon) values ($1) on conflict do nothing', [SKJEMA_VERSJON]);
  });
}

/** Deler SQL-skriptet i setninger, men holder $$-blokker samlet. */
export function delSql(sql: string): string[] {
  const ut: string[] = [];
  let buf = '', iDollar = false;
  for (const linje of sql.split('\n')) {
    const t = linje.trim();
    if (t.startsWith('--') && !iDollar) continue;
    buf += linje + '\n';
    const n = (linje.match(/\$\$/g) || []).length;
    if (n % 2 === 1) iDollar = !iDollar;
    if (!iDollar && t.endsWith(';')) { if (buf.trim()) ut.push(buf.trim()); buf = ''; }
  }
  if (buf.trim()) ut.push(buf.trim());
  return ut;
}

export function getDb(): Promise<Db> {
  const g = globalThis as Glob;
  if (!g.__rfDb) {
    g.__rfDb = (async () => {
      const url = dbUrl();
      const db = url ? await lagPostgres(url) : await lagPglite(process.env.RETTFORT_LOKAL_DB || undefined);
      await migrer(db);
      if (db.modus === 'testmodus') {
        const { seedDemo } = await import('./demo');
        await seedDemo(db);
      }
      return db;
    })();
    g.__rfDb.catch(() => { g.__rfDb = undefined; });
  }
  return g.__rfDb;
}

/** Ny, tom database for tester. */
export async function nyTestDb(): Promise<Db> {
  const db = await lagPglite();
  await migrer(db);
  return db;
}
