// Local / Node-host server. On Vercel the same logic runs from api/ai.js instead.
import express from 'express';
import { runAI } from './ai.js';
const app = express();
app.use(express.json({ limit: '8kb' }));

const hits = new Map();
app.post('/api/ai', async (req, res) => {
  const k = req.ip, now = Date.now(), a = (hits.get(k) || []).filter(t => now - t < 60000);
  if (a.length >= 20) return res.status(429).json({ error: 'Too many requests. Wait a minute.' });
  a.push(now); hits.set(k, a);
  const { status, body } = await runAI(req.body);
  res.status(status).json(body);
});
app.listen(process.env.PORT || 8787, () => console.log('VaultMind AI server ready'));
