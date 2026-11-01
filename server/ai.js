// Shared AI logic used by both the local Express server and the Vercel function (api/ai.js).
// The AI can only return text and an optional *proposal*. It has no access to wallets, keys or policies.
const BASE = () => process.env.NEARAI_BASE_URL || 'https://cloud-api.near.ai/v1';
const MODEL = () => process.env.NEARAI_MODEL || 'z-ai/glm-5.2';

const SYSTEM = `You are VaultMind's portfolio analyst for a NEAR Testnet account.
Rules:
- You cannot move funds, sign, or change the user's policies. You only advise and propose.
- You do not have live market data. Any APY you mention is YOUR ESTIMATE and must be described as unverified.
- Protocols to consider: Meta Pool, Ref Finance, Burrow. Do not invent others.
- Respect the user's stated limits in the message and in the policy summary.
Reply with ONLY a JSON object, no markdown:
{"reply": string (plain language, explain risks and that figures are unverified estimates),
 "proposal": null or {"title": string, "protocol": string, "pct": number (percent of available assets), "apy": number (your estimate)}}`;

export async function runAI(body) {
  const { message, context } = body || {};
  if (typeof message !== 'string' || !message.trim() || message.length > 1000)
    return { status: 400, body: { error: 'Message must be 1 to 1000 characters.' } };
  const key = process.env.NEARAI_API_KEY;
  if (!key) return { status: 503, body: { error: 'AI is not configured. Set NEARAI_API_KEY on the server.' } };
  const ctx = `Balance: ${Number(context?.balance) || 0} NEAR. Policy summary (read only): ${JSON.stringify(context?.policy || {}).slice(0, 1500)}`;
  try {
    const r = await fetch(`${BASE()}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: MODEL(), temperature: 0.2,
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: `${ctx}\n\nUser: ${message}` }] })
    });
    if (!r.ok) return { status: 502, body: { error: `NEAR AI Cloud returned ${r.status}. Check your API key and model name.` } };
    const txt = (await r.json()).choices?.[0]?.message?.content || '';
    let out;
    try { out = JSON.parse(txt.replace(/^```(?:json)?|```$/g, '').trim()); } catch { out = { reply: txt, proposal: null }; }
    const p = out.proposal, pct = Number(p?.pct), apy = Number(p?.apy);
    return { status: 200, body: {
      reply: String(out.reply || '').slice(0, 1500),
      proposal: p && Number.isFinite(pct) && pct > 0 && pct <= 100 && typeof p.protocol === 'string'
        ? { title: String(p.title || 'Yield option').slice(0, 60), protocol: p.protocol.slice(0, 40), pct, apy: Number.isFinite(apy) ? apy : null }
        : null
    } };
  } catch { return { status: 502, body: { error: 'Could not reach NEAR AI Cloud.' } }; }
}
