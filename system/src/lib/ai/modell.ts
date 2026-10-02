// Språkmodellen bak assistenten. Snakker det vanlige chat-API-formatet (meldinger + verktøy), så leverandøren
// kan byttes uten å endre resten. Hvilken som brukes, velges i en innstilling bare administrator ser.
// Navnet på leverandøren vises aldri for kundene.

import type { Sporring } from '../db';
import { RegnskapsFeil } from '../hovedbok';

export type Leverandor = 'kina' | 'eu';

export interface Melding {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

export interface Verktoy { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }

function oppsett(l: Leverandor): { url: string; nokkel: string | undefined; modell: string } {
  if (l === 'eu') return { url: process.env.AI_EU_URL ?? '', nokkel: process.env.AI_EU_KEY, modell: process.env.AI_EU_MODELL ?? 'deepseek-chat' };
  return { url: 'https://api.deepseek.com/chat/completions', nokkel: process.env.DEEPSEEK_API_KEY, modell: 'deepseek-chat' };
}

export async function valgtLeverandor(t: Sporring): Promise<Leverandor> {
  const r = await t.en<{ verdi: string }>(`select verdi from systeminnstilling where nokkel = 'ai_leverandor'`).catch(() => null);
  return r?.verdi === 'eu' ? 'eu' : 'kina';
}

export async function settLeverandor(t: Sporring, l: Leverandor) {
  await t.q(`insert into systeminnstilling (nokkel, verdi) values ('ai_leverandor', $1) on conflict (nokkel) do update set verdi = excluded.verdi`, [l]);
}

export const leverandorKlar = (l: Leverandor) => { const o = oppsett(l); return !!(o.nokkel && o.url); };

export async function spor(l: Leverandor, meldinger: Melding[], verktoy: Verktoy[]): Promise<Melding> {
  const o = oppsett(l);
  if (!o.nokkel || !o.url) throw new RegnskapsFeil('Assistenten er ikke satt opp ennå.');
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 45000);
  try {
    const r = await fetch(o.url, {
      method: 'POST', signal: ctrl.signal,
      headers: { authorization: `Bearer ${o.nokkel}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: o.modell, messages: meldinger, tools: verktoy, tool_choice: 'auto', temperature: 0.2, max_tokens: 1200 }),
    });
    if (!r.ok) { console.error('Assistent:', r.status, (await r.text().catch(() => '')).slice(0, 300)); throw new RegnskapsFeil('Assistenten svarer ikke akkurat nå. Prøv igjen om litt.'); }
    const j = await r.json() as { choices: { message: Melding }[] };
    return j.choices[0].message;
  } catch (e) {
    if (e instanceof RegnskapsFeil) throw e;
    throw new RegnskapsFeil('Assistenten brukte for lang tid. Prøv igjen.');
  } finally { clearTimeout(tid); }
}
