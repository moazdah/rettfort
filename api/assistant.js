// Proxy for assistenten i demo.html. Nøkkelen ligger i ANTHROPIC_API_KEY
// (Vercel → Project → Settings → Environment Variables), aldri i koden.
const Anthropic = require('@anthropic-ai/sdk');

const MAX_PROMPT = 8000;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 20;

let client;

// Enkel begrensning per IP. Gjelder per instans, så den er ikke vanntett,
// men stopper åpenbar misbruk av nøkkelen.
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > MAX_PER_WINDOW;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method' });
  }
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'not_configured' });

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'ukjent';
  if (limited(ip)) return res.status(429).json({ error: 'rate_limited' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const prompt = body && body.prompt;
  if (typeof prompt !== 'string' || !prompt.trim()) return res.status(400).json({ error: 'prompt' });
  if (prompt.length > MAX_PROMPT) return res.status(413).json({ error: 'too_long' });

  try {
    client = client || new Anthropic();
    const msg = await client.beta.messages.create({
      model: 'claude-opus-5',
      max_tokens: 4000,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: 'Du er assistenten i Rettført-demoen, et verktøy for regnskapskontroll. Svar på norsk bokmål, nøkternt og kort. Bruk bare opplysningene du får, og ikke finn på tall.',
      messages: [{ role: 'user', content: prompt }],
    });
    if (msg.stop_reason === 'refusal') return res.status(422).json({ error: 'refusal' });
    const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
    if (!text) return res.status(502).json({ error: 'empty' });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ text });
  } catch (err) {
    console.error('assistant', err && err.status, err && err.message);
    return res.status(502).json({ error: 'upstream' });
  }
};
