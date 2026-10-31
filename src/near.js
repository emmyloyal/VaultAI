import { setupWalletSelector } from '@near-wallet-selector/core';
import { setupModal } from '@near-wallet-selector/modal-ui';
import { setupMyNearWallet } from '@near-wallet-selector/my-near-wallet';
import { setupMeteorWallet } from '@near-wallet-selector/meteor-wallet';
import { setupHereWallet } from '@near-wallet-selector/here-wallet';
import '@near-wallet-selector/modal-ui/styles.css';

// Testnet only. Override the RPC with VITE_NEAR_RPC if the default is retired or rate limited.
const RPC = import.meta.env.VITE_NEAR_RPC || 'https://rpc.testnet.near.org';
const INDEXER = 'https://api-testnet.nearblocks.io/v1';
let selector, modal;

export async function init() {
  selector = await setupWalletSelector({
    network: 'testnet',
    modules: [setupMyNearWallet(), setupMeteorWallet(), setupHereWallet()]
  });
  modal = setupModal(selector, {});
  return selector;
}
export const accountId = () => selector.store.getState().accounts.find(a => a.active)?.accountId || null;
export const onChange = fn => selector.store.observable.subscribe(fn);
export const connect = () => modal.show();
export async function disconnect() { const w = await selector.wallet(); await w.signOut(); }

// Available balance in NEAR (account amount minus nothing: the RPC "amount" excludes locked stake).
export async function getBalance(id) {
  const r = await fetch(RPC, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'vm', method: 'query',
      params: { request_type: 'view_account', finality: 'final', account_id: id } })
  }).then(r => r.json());
  if (r.error || !r.result) throw new Error(r.error?.data || 'Could not read balance');
  const y = BigInt(r.result.amount);
  return Number(y / 10n ** 18n) / 1e6;
}

export function toYocto(s) {
  const [w, f = ''] = String(s).split('.');
  return (BigInt(w || '0') * 10n ** 24n + BigInt((f + '0'.repeat(24)).slice(0, 24))).toString();
}

export async function sendNear(to, amount) {
  const w = await selector.wallet();
  return w.signAndSendTransaction({
    receiverId: to,
    actions: [{ type: 'Transfer', params: { deposit: toYocto(amount) } }]
  });
}

export const validAccount = s => /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(s) && s.length >= 2 && s.length <= 64;

// Best effort: public indexer, may be rate limited.
export async function history(id) {
  const r = await fetch(`${INDEXER}/account/${id}/txns?per_page=15&order=desc`).then(r => r.json());
  return (r.txns || []).map(t => ({
    hash: t.transaction_hash, from: t.signer_account_id, to: t.receiver_account_id,
    ok: t.outcomes?.status, ts: Number(t.block_timestamp) / 1e6,
    dir: t.signer_account_id === id ? 'out' : 'in'
  }));
}
