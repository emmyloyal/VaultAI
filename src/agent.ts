// The agent can only turn intent into a Proposal. It has no access to wallet, policy storage or signing.
// v0.1 is a deterministic parser. To use an LLM, replace parseIntent with a call that returns the same
// Proposal shape (keep the API key server-side); the Policy Engine still decides everything.
import type { Proposal } from "./policy";
export function parseIntent(text: string): Proposal | null {
  const t = text.trim();
  const bw = t.match(/borrow\s+([\d.]+)\s+([a-z0-9._-]+\.[a-z0-9._-]+)/i);
  if (bw) return { type: "borrow", tokenAmount: parseFloat(bw[1]), token: bw[2].toLowerCase(), label: `Borrow ${bw[1]} ${bw[2].toLowerCase()} from Burrow` };
  const sp = t.match(/(?:supply|deposit|lend)\s+([\d.]+)\s*near\s+(?:to|into|on)\s+burrow/i);
  if (sp) return { type: "supply", amountNear: parseFloat(sp[1]), label: `Supply ${sp[1]} NEAR to Burrow as collateral (wrapped as wNEAR)` };
  const m = t.match(/(?:send|transfer|pay)\s+([\d.]+)\s*near\s+to\s+([a-z0-9._-]+)/i);
  if (m) return { type: "transfer", amountNear: parseFloat(m[1]), receiver: m[2].toLowerCase(), label: `Send ${m[1]} NEAR to ${m[2].toLowerCase()}` };
  if (/(change|raise|increase|edit|disable|remove).*(limit|policy|cap|rule|kill)/i.test(t))
    return { type: "policy_change", label: t };
  return null;
}
