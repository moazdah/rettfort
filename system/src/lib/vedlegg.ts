// Lagring av kvitteringer og andre vedlegg. Bruker Vercel Blob når BLOB_READ_WRITE_TOKEN finnes,
// ellers lagres filen i databasen. Oppbevaringsplikt: 5 år (bokføringsloven § 13).

import type { Sporring } from './db';

async function tilBlob(sti: string, mime: string, data: Uint8Array): Promise<string | null> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return null;
  const r = await fetch(`https://blob.vercel-storage.com/${sti}`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}`, 'x-content-type': mime, 'x-api-version': '11', 'x-add-random-suffix': '1', 'x-vercel-blob-access': 'private' },
    body: data as unknown as BodyInit,
  });
  if (!r.ok) { console.error('Blob-opplasting feilet', r.status, await r.text().catch(() => '')); return null; }
  const j = await r.json() as { url: string };
  return j.url;
}

export async function lagreVedlegg(t: Sporring, orgId: string, filnavn: string, mime: string, data: Uint8Array): Promise<string> {
  const trygtNavn = filnavn.replace(/[^\w.\-æøåÆØÅ ]+/g, '_').slice(0, 120) || 'vedlegg';
  const url = await tilBlob(`bilag/${orgId}/${Date.now()}-${trygtNavn}`, mime, data);
  const r = await t.en<{ id: string }>('insert into vedlegg (organisasjon_id, filnavn, mime, storrelse, lagring, data) values ($1,$2,$3,$4,$5,$6) returning id',
    [orgId, trygtNavn, mime, data.byteLength, url ? `blob:${url}` : 'db', url ? null : Buffer.from(data)]);
  return r!.id;
}

export async function hentVedlegg(t: Sporring, orgId: string, id: string): Promise<{ filnavn: string; mime: string; data: Uint8Array } | null> {
  const v = await t.en<{ filnavn: string; mime: string; lagring: string; data: Uint8Array | null }>('select filnavn, mime, lagring, data from vedlegg where id = $1 and organisasjon_id = $2', [id, orgId]);
  if (!v) return null;
  if (v.lagring.startsWith('blob:')) {
    const r = await fetch(v.lagring.slice(5), { headers: { authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN ?? ''}` } });
    if (!r.ok) return null;
    return { filnavn: v.filnavn, mime: v.mime, data: new Uint8Array(await r.arrayBuffer()) };
  }
  return v.data ? { filnavn: v.filnavn, mime: v.mime, data: new Uint8Array(v.data) } : null;
}
