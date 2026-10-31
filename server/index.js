// Thin proxy to NEAR AI Cloud. The API key stays here, never in the browser.
// The AI can only return text and a *proposal*. It has no access to wallets, keys or policies.
import express from 'express';
const BASE = process.env.NEARAI_BASE_URL || 'https://cloud-api.near.ai/v1';
const MODEL = process.env.NEARAI_MODEL || 'z-ai/glm-5.2';
const KEY = process.env.NEARAI_API_KEY;
const app = express();
app.use(express.json({ limit: '8kb' }));

const hits = new Map();
app.use('/api', (req, res, next) => {
  const k = req.ip, now = Date.now(), a = (hits.get(k) || []).filter(t => now - t < 60000);
  if (a.length >= 20) return res.status(429).json({ error: 'Too many requests. Wait a minute.' });
  a.push(now); hits.set(k, a); next();
});

const SYSTEM = `You are VaultMind's portfolio analyst for a NEAR Testnet account.
Rules:
- You cannot move funds, sign, or change the user's policies. You only advise and propose.
- You do not have live market data. Any APY you mention is YOUR ESTIMATE and must be described as unverified.
- Protocols to consider: Meta Pool, Ref Finance, Burrow. Do not invent others.
- Respect the user's stated limits in the message and in the policy summary.
Reply with ONLY a JSON object, no markdown:
{"reply": string (plain language, explain risks and that figures are unverified estimates),
 "proposal": null or {"title": string, "protocol": string, "pct": number (percent of available assets), "apy": number (your estimate)}}`;

app.post('/api/ai', async (req, res) => {
  const { message, context } = req.body || {};
  if (typeof message !== 'string' || !message.trim() || message.length > 1000)
    return res.status(400).json({ error: 'Message must be 1 to 1000 characters.' });
  if (!KEY) return res.status(503).json({ error: 'AI is not configured. Set NEARAI_API_KEY in .env.' });
  const ctx = `Balance: ${Number(context?.balance) || 0} NEAR. Policy summary (read only): ${JSON.stringify(context?.policy || {})}`;
  try {
    const r = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ model: MODEL, temperature: 0.2,
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: `${ctx}\n\nUser: ${message}` }] })
    });
    if (!r.ok) return res.status(502).json({ error: `NEAR AI Cloud returned ${r.status}.` });
    const txt = (await r.json()).choices?.[0]?.message?.content || '';
    let out;
    try { out = JSON.parse(txt.replace(/^```(?:json)?|```$/g, '').trim()); } catch { out = { reply: txt, proposal: null }; }
    const p = out.proposal, pct = Number(p?.pct), apy = Number(p?.apy);
    res.json({
      reply: String(out.reply || '').slice(0, 1500),
      proposal: p && Number.isFinite(pct) && pct > 0 && pct <= 100 && typeof p.protocol === 'string'
        ? { title: String(p.title || 'Yield option').slice(0, 60), protocol: p.protocol.slice(0, 40), pct, apy: Number.isFinite(apy) ? apy : null }
        : null
    });
  } catch { res.status(502).json({ error: 'Could not reach NEAR AI Cloud.' }); }
});
app.listen(process.env.PORT || 8787, () => console.log('VaultMind AI server ready'));
