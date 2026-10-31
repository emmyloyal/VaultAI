// Deterministic Policy Engine. Pure functions: no network, no AI, no DOM.
// Every proposal passes through evaluate() before a wallet is ever asked to sign.
export const DEFAULT_POLICY = {
  maxAlloc: 30,      // % of assets per yield opportunity
  minReserve: 20,    // % of assets that must stay unallocated
  maxTx: 100,        // NEAR per transaction
  daily: 200,        // NEAR per day
  approveAbove: 50,  // NEAR above which the user must approve explicitly
  protocols: ['Meta Pool', 'Ref Finance'],
  types: ['transfer', 'yield']
};

export const LABELS = {
  maxAlloc: 'Max per opportunity', minReserve: 'Minimum unallocated',
  maxTx: 'Max per transaction', daily: 'Daily limit', approveAbove: 'Ask me above',
  protocols: 'Approved protocols', types: 'Allowed transaction types'
};

// A change is "looser" if it gives more room to move money.
export function isLooser(key, from, to) {
  if (Array.isArray(from)) return to.length > from.length;
  if (key === 'minReserve') return to < from;
  return to > from;
}

const n = x => Number(x.toFixed(2));

export function evaluate(policy, ctx, p) {
  const bal = ctx.balance;
  const amount = p.type === 'yield' ? n(bal * p.pct / 100) : n(p.amount);
  const checks = [];
  const add = (ok, text) => checks.push({ ok, text });
  const valid = Number.isFinite(amount) && amount > 0 && bal > 0;
  add(valid, valid ? `Amount is ${amount} NEAR` : 'Amount must be above 0 and your balance must be known');
  add(policy.types.includes(p.type), `${p.type === 'yield' ? 'Yield' : 'Transfer'} transactions ${policy.types.includes(p.type) ? 'are' : 'are not'} allowed`);
  if (valid) {
    const left = (bal - amount) / bal * 100;
    if (p.type === 'yield') {
      add(p.pct <= policy.maxAlloc, `Allocation ${p.pct}% (limit ${policy.maxAlloc}% per opportunity)`);
      add(policy.protocols.includes(p.protocol), `${p.protocol} ${policy.protocols.includes(p.protocol) ? 'is' : 'is not'} on your approved list`);
    }
    add(left >= policy.minReserve, `Unallocated after: ${left.toFixed(0)}% (minimum ${policy.minReserve}%)`);
    add(amount <= policy.maxTx, `Amount ${amount} NEAR (max per transaction ${policy.maxTx})`);
    add(ctx.spentToday + amount <= policy.daily, `Daily total ${n(ctx.spentToday + amount)} NEAR (limit ${policy.daily})`);
  }
  const failed = checks.find(c => !c.ok);
  const verdict = failed ? 'rejected' : amount > policy.approveAbove ? 'approval' : 'approved';
  const why = failed ? failed.text
    : verdict === 'approval' ? `Amount is above ${policy.approveAbove} NEAR, so you confirm it yourself.` : 'Within all your limits.';
  return { amount, checks, verdict, why };
}
