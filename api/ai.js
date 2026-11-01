// Vercel serverless function: POST /api/ai. Set NEARAI_API_KEY (and optionally NEARAI_MODEL)
// in your Vercel project's Environment Variables. Do NOT prefix them with VITE_.
import { runAI } from '../server/ai.js';
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  const { status, body } = await runAI(req.body);
  res.status(status).json(body);
}
