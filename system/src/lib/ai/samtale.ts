// Tidligere samtaler med assistenten. Lagres per bruker og foretak, så de følger brukeren mellom enheter.

import type { Db } from '../db';
import type { Kort } from './verktoy';

export type SamtaleMelding =
  | { fra: 'bruker'; tekst: string; tid: string }
  | { fra: 'assistent'; tekst: string; tid: string; kort: Kort[]; kilder?: { tekst: string; href: string }[] }
  | { fra: 'notat'; tekst: string; tid: string }
  | { fra: 'feil'; tekst: string; tid: string };

export interface SamtaleListe { id: string; tittel: string; siste: string; sisteFraBruker: boolean; oppdatert: string }

const MAKS = 200;

const tolk = (m: unknown): SamtaleMelding[] => (typeof m === 'string' ? JSON.parse(m) : m) as SamtaleMelding[];

export async function listSamtaler(db: Db, orgId: string, brukerId: string, sok = ''): Promise<SamtaleListe[]> {
  const q = sok.trim().slice(0, 100);
  const rader = await db.q<{ id: string; tittel: string; meldinger: unknown; oppdatert: string }>(
    `select id, tittel, meldinger, oppdatert::text as oppdatert from ai_samtale where organisasjon_id = $1 and bruker_id = $2
     ${q ? `and (tittel ilike $3 or meldinger::text ilike $3)` : ''} order by oppdatert desc limit 60`,
    q ? [orgId, brukerId, `%${q.replace(/[%_\\]/g, x => '\\' + x)}%`] : [orgId, brukerId]);
  return rader.map(r => {
    const m = tolk(r.meldinger).filter(x => (x.fra === 'bruker' || x.fra === 'assistent') && x.tekst);
    const siste = m[m.length - 1];
    return { id: r.id, tittel: r.tittel, siste: siste?.tekst.slice(0, 140) ?? '', sisteFraBruker: siste?.fra === 'bruker', oppdatert: new Date(r.oppdatert).toISOString() };
  });
}

/** Henter en samtale og oppdaterer statusen på forslagene, i tilfelle de er sendt eller avbrutt et annet sted. */
export async function hentSamtale(db: Db, orgId: string, brukerId: string, id: string): Promise<{ id: string; tittel: string; meldinger: SamtaleMelding[] } | null> {
  const r = await db.en<{ id: string; tittel: string; meldinger: unknown }>('select id, tittel, meldinger from ai_samtale where id = $1 and organisasjon_id = $2 and bruker_id = $3', [id, orgId, brukerId]);
  if (!r) return null;
  const meldinger = tolk(r.meldinger);
  const ider = meldinger.flatMap(m => m.fra === 'assistent' ? m.kort.flatMap(k => k.type === 'forslag' ? [k.id] : []) : []);
  if (ider.length) {
    const st = new Map((await db.q<{ id: string; status: string }>('select id, status from ai_forslag where organisasjon_id = $1 and id = any($2::uuid[])', [orgId, ider])).map(x => [x.id, x.status]));
    for (const m of meldinger) if (m.fra === 'assistent') for (const k of m.kort) if (k.type === 'forslag' && st.has(k.id)) k.status = st.get(k.id)!;
  }
  return { id: r.id, tittel: r.tittel, meldinger };
}

export async function lagreSamtale(db: Db, orgId: string, brukerId: string, id: string | null, tittel: string, meldinger: SamtaleMelding[]): Promise<string> {
  const data = JSON.stringify(meldinger.slice(-MAKS));
  const t = tittel.trim().slice(0, 80) || 'Samtale';
  if (id) {
    const r = await db.en<{ id: string }>('update ai_samtale set meldinger = $4, oppdatert = now() where id = $1 and organisasjon_id = $2 and bruker_id = $3 returning id', [id, orgId, brukerId, data]);
    if (r) return r.id;
  }
  const r = await db.en<{ id: string }>('insert into ai_samtale (organisasjon_id, bruker_id, tittel, meldinger) values ($1,$2,$3,$4) returning id', [orgId, brukerId, t, data]);
  return r!.id;
}

export async function slettSamtale(db: Db, orgId: string, brukerId: string, id: string) {
  await db.q('delete from ai_samtale where id = $1 and organisasjon_id = $2 and bruker_id = $3', [id, orgId, brukerId]);
}
