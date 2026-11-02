// All chain access is NEAR TESTNET only. There is no mainnet code path.
export const NETWORK = "testnet" as const;
export const EXPLORER = "https://testnet.nearblocks.io";
const RPCS = (import.meta.env.VITE_RPC_URLS as string | undefined)?.split(",").map(s => s.trim()) ??
  ["https://test.rpc.fastnear.com", "https://rpc.testnet.near.org"];

async function rpc(method: string, params: unknown): Promise<any> {
  let last: unknown;
  for (const url of RPCS) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "vm", method, params }) });
      const j = await r.json();
      if (j.error) throw new Error(JSON.stringify(j.error.data ?? j.error));
      return j.result;
    } catch (e) { last = e; }
  }
  throw last;
}
const nearFromYocto = (y: string, dec = 24) => Number(BigInt(y) / 10n ** BigInt(dec - 4)) / 1e4;

export async function getNearBalance(id: string) {
  const r = await rpc("query", { request_type: "view_account", finality: "final", account_id: id });
  return nearFromYocto(r.amount);
}
export async function getFtBalance(contract: string, id: string, decimals: number) {
  const r = await rpc("query", { request_type: "call_function", finality: "final", account_id: contract,
    method_name: "ft_balance_of", args_base64: btoa(JSON.stringify({ account_id: id })) });
  return nearFromYocto(JSON.parse(new TextDecoder().decode(new Uint8Array(r.result))), decimals);
}
export function toYocto(s: string) {
  const [i, f = ""] = s.split(".");
  return (BigInt(i || "0") * 10n ** 24n + BigInt((f + "0".repeat(24)).slice(0, 24))).toString();
}
export interface Tx { hash: string; from: string; to: string; time: string; kind: string }
export async function getHistory(id: string): Promise<Tx[]> {
  const r = await fetch(`https://api-testnet.nearblocks.io/v1/account/${id}/txns?per_page=10`);
  if (!r.ok) throw new Error("NearBlocks " + r.status);
  const j = await r.json();
  return (j.txns ?? []).map((t: any) => ({ hash: t.transaction_hash, from: t.predecessor_account_id, to: t.receiver_account_id,
    time: new Date(Number(BigInt(t.block_timestamp) / 1000000n)).toLocaleString(), kind: t.actions?.[0]?.action ?? "" }));
}
// Estimate only: testnet tokens have no market value. Uses public NEAR/USD price.
export async function getNearUsd(): Promise<number | null> {
  try { const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=near&vs_currencies=usd");
    return (await r.json()).near.usd; } catch { return null; }
}

// Burrow lending on testnet (contract seen receiving calls from wrap.testnet on NearBlocks testnet).
export const BURROW = "contract.1638481328.burrow.testnet";
export interface BurrowPos { supplied: { token_id: string; balance: string }[]; collateral: { token_id: string; balance: string }[]; borrowed: { token_id: string; balance: string }[] }
// Read-only view call: get_account. Returns null if the account has no Burrow position.
export async function getBurrowPosition(id: string): Promise<BurrowPos | null> {
  const r = await rpc("query", { request_type: "call_function", finality: "final", account_id: BURROW,
    method_name: "get_account", args_base64: btoa(JSON.stringify({ account_id: id })) });
  return JSON.parse(new TextDecoder().decode(new Uint8Array(r.result)));
}

// ---- Supply wNEAR to Burrow (testnet) ----
const WNEAR_ID = "wrap.testnet";
async function view(contract: string, method: string, args: object): Promise<any> {
  const r = await rpc("query", { request_type: "call_function", finality: "final", account_id: contract,
    method_name: method, args_base64: btoa(JSON.stringify(args)) });
  return JSON.parse(new TextDecoder().decode(new Uint8Array(r.result)));
}
const fc = (methodName: string, args: object, gas: string, deposit: string) =>
  ({ type: "FunctionCall" as const, params: { methodName, args, gas, deposit } });
const TGAS = (n: number) => String(n * 10 ** 12);
// Builds the transactions for: wrap NEAR -> (register if needed) -> deposit wNEAR into Burrow as supply.
// Preflight reads on-chain state so unsupported setups fail with a clear message before you sign anything.
export async function supplyPlan(acct: string, amountNear: number) {
  const asset = await view(BURROW, "get_asset", { token_id: WNEAR_ID });
  if (!asset) throw new Error("wrap.testnet is not a listed asset on the Burrow testnet contract, so it cannot be supplied.");
  const [bBurrow, bWnear, bounds] = await Promise.all([
    view(BURROW, "storage_balance_of", { account_id: acct }),
    view(WNEAR_ID, "storage_balance_of", { account_id: acct }),
    view(BURROW, "storage_balance_bounds", {}).catch(() => null)]);
  const yocto = toYocto(amountNear.toFixed(8));
  const txs: { receiverId: string; actions: any[] }[] = [];
  if (!bWnear) txs.push({ receiverId: WNEAR_ID, actions: [fc("storage_deposit", { account_id: acct, registration_only: true }, TGAS(10), "1250000000000000000000")] });
  txs.push({ receiverId: WNEAR_ID, actions: [fc("near_deposit", {}, TGAS(10), yocto)] });
  if (!bBurrow) txs.push({ receiverId: BURROW, actions: [fc("storage_deposit", { account_id: acct, registration_only: true }, TGAS(10), bounds?.min ?? "250000000000000000000000")] });
  txs.push({ receiverId: WNEAR_ID, actions: [fc("ft_transfer_call", { receiver_id: BURROW, amount: yocto, msg: JSON.stringify({ Execute: { actions: [{ IncreaseCollateral: { token_id: WNEAR_ID } }] } }) }, TGAS(100), "1")] });
  return txs;
}

// ---- Borrow from Burrow (testnet) ----
function toUnits(s: string, d: number) {
  const [i, f = ""] = s.split(".");
  return (BigInt(i || "0") * 10n ** BigInt(d) + BigInt((f + "0".repeat(d)).slice(0, d))).toString();
}
// Follows Burrow's documented flow: borrow goes through the price oracle (oracle_call), with prices for
// every collateral asset, every existing debt, and the new borrowed asset. Reads everything from chain first.
export async function borrowPlan(acct: string, token: string, amount: number) {
  const [asset, meta, cfg, account, tokReg] = await Promise.all([
    view(BURROW, "get_asset", { token_id: token }), view(token, "ft_metadata", {}),
    view(BURROW, "get_config", {}), view(BURROW, "get_account", { account_id: acct }),
    view(token, "storage_balance_of", { account_id: acct })]);
  if (!asset) throw new Error(`${token} is not a listed asset on the Burrow testnet contract.`);
  if (asset?.config?.can_borrow === false) throw new Error(`${token} cannot be borrowed on Burrow.`);
  const oracle = cfg?.oracle_account_id;
  if (!oracle) throw new Error("Could not read the oracle account from the Burrow config.");
  if (!account || !account.collateral?.length) throw new Error("You have no collateral on Burrow yet. Supply some first (for example: supply 1 NEAR to Burrow).");
  const ids = Array.from(new Set<string>([...account.collateral.map((c: any) => c.token_id), ...(account.borrowed ?? []).map((b: any) => b.token_id), token]));
  const raw = toUnits(amount.toFixed(8), meta.decimals);
  const msg = JSON.stringify({ Execute: { actions: [{ Borrow: { token_id: token, amount: raw } }, { Withdraw: { token_id: token, max_amount: raw } }] } });
  const txs: { receiverId: string; actions: any[] }[] = [];
  if (!tokReg) txs.push({ receiverId: token, actions: [fc("storage_deposit", { account_id: acct, registration_only: true }, TGAS(10), "1250000000000000000000")] });
  txs.push({ receiverId: oracle, actions: [fc("oracle_call", { receiver_id: BURROW, asset_ids: ids, msg }, TGAS(300), "1")] });
  return txs;
}
