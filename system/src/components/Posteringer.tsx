import type { Sporring } from '@/lib/db';
import { kontoNavn } from '@/lib/kontoplan';
import { kr, nd } from '@/lib/vis';

/** Viser hvordan et bilag er ført, pluss eventuelle korrigeringer. For den som vil se «under panseret». */
export async function Posteringer({ d, orgId, bilagId }: { d: Sporring; orgId: string; bilagId: string | null }) {
  if (!bilagId) return null;
  const bilag = await d.q<{ id: string; nr: number; dato: string; beskrivelse: string | null; korrigerer_id: string | null }>(
    `select id, nr, dato::text as dato, beskrivelse, korrigerer_id from bilag where organisasjon_id = $1 and (id = $2 or korrigerer_id = $2) order by nr`, [orgId, bilagId]);
  const post = await d.q<{ bilag_id: string; konto: number; debet: number; kredit: number; mva_kode: string | null }>(
    `select bilag_id, konto, debet, kredit, mva_kode from postering where bilag_id = any($1::uuid[]) order by linje`, [bilag.map(b => b.id)]);
  return (
    <details className="kort">
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Slik er det ført</summary>
      {bilag.map(b => (
        <div key={b.id} style={{ marginTop: 14 }}>
          <div className="mut liten">Bilag {b.nr} · {nd(b.dato)}{b.korrigerer_id ? ' · korrigering' : ''}{b.beskrivelse ? ` · ${b.beskrivelse}` : ''}</div>
          <table className="tabell" style={{ marginTop: 6 }}>
            <thead><tr><th>Konto</th><th className="h">Debet</th><th className="h">Kredit</th></tr></thead>
            <tbody>
              {post.filter(p => p.bilag_id === b.id).map((p, i) => (
                <tr key={i}><td><span className="mono faint">{p.konto}</span> {kontoNavn(p.konto)}{p.mva_kode ? <span className="faint liten"> · MVA-kode {p.mva_kode}</span> : null}</td><td className="h belop">{p.debet ? kr(p.debet) : ''}</td><td className="h belop">{p.kredit ? kr(p.kredit) : ''}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </details>
  );
}
