// The Policy Engine. Pure and independent of the agent: the agent module never imports
// the setter functions below, and the engine only ever receives a read-only policy snapshot.
export interface Policy { minNear: number; perTxNear: number | null; dailyNear: number | null; askAboveNear: number; allowedReceivers: string[]; kill: boolean }
export type Verdict = "allow" | "ask" | "block";
export interface Proposal { type: "transfer" | "supply" | "borrow" | "policy_change"; receiver?: string; amountNear?: number; token?: string; tokenAmount?: number; label: string }
export interface Decision { verdict: Verdict; reasons: string[] }

export const DEFAULT_POLICY: Policy = { minNear: 0.001, perTxNear: null, dailyNear: null, askAboveNear: 1, allowedReceivers: [], kill: false };
const today = () => new Date().toISOString().slice(0, 10);

export function evaluate(p: Proposal, policy: Readonly<Policy>, spentToday: number): Decision {
  const reasons: string[] = []; let verdict: Verdict = "allow";
  const block = (m: string) => { verdict = "block"; reasons.push(m); };
  const ask = (m: string) => { if (verdict !== "block") verdict = "ask"; reasons.push(m); };
  if (policy.kill) block("Kill switch is on. Agent authority is suspended.");
  if (p.type === "policy_change") block("Agents cannot change their own policy. Only the owner can.");
  if (p.type === "borrow") ask("Borrowing always needs your approval, because it creates debt.");
  if (p.type === "transfer" || p.type === "supply") {
    const a = p.amountNear ?? 0;
    if (!(a > 0)) block("Amount must be greater than zero.");
    if (a < policy.minNear) block(`${a} NEAR is below your minimum send of ${policy.minNear} NEAR.`);
    if (policy.perTxNear !== null && a > policy.perTxNear) block(`${a} NEAR exceeds the per-transaction cap of ${policy.perTxNear} NEAR.`);
    if (policy.dailyNear !== null && spentToday + a > policy.dailyNear) block(`Would exceed the daily cap of ${policy.dailyNear} NEAR (spent ${spentToday}).`);
    if (p.type === "transfer" && p.receiver && !policy.allowedReceivers.includes(p.receiver)) ask(`${p.receiver} is not on your allowed list.`);
    if (a > policy.askAboveNear) ask(`Above your ${policy.askAboveNear} NEAR approval threshold.`);
  }
  if (!reasons.length) reasons.push("Within all limits.");
  return { verdict, reasons };
}
// Owner-only storage helpers (used by the owner UI, never by agent.ts)
export const loadPolicy = (): Policy => { try { return { ...DEFAULT_POLICY, ...JSON.parse(localStorage.getItem("vm.policy2") ?? "{}") }; } catch { return DEFAULT_POLICY; } };
export const savePolicy = (p: Policy) => localStorage.setItem("vm.policy2", JSON.stringify(p));
export function loadSpent(): number { try { const s = JSON.parse(localStorage.getItem("vm.spent") ?? "{}"); return s.date === today() ? s.amount : 0; } catch { return 0; } }
export function addSpent(n: number) { localStorage.setItem("vm.spent", JSON.stringify({ date: today(), amount: loadSpent() + n })); }
