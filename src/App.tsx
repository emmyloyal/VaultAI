import { useEffect, useState, useCallback } from "react";
import { setupWalletSelector, type WalletSelector } from "@near-wallet-selector/core";
import { setupModal, type WalletSelectorModal } from "@near-wallet-selector/modal-ui";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { NETWORK, EXPLORER, getNearBalance, getFtBalance, getHistory, getNearUsd, toYocto, getBurrowPosition, supplyPlan, borrowPlan, BURROW, type Tx, type BurrowPos } from "./near";
import { evaluate, loadPolicy, savePolicy, loadSpent, addSpent, type Policy, type Proposal, type Decision } from "./policy";
import { parseIntent } from "./agent";
import { LiquidTabs, BalanceCard, Chips, LampSwitch, TaskCard, PromptComposer, Meter } from "./components/ui";

const WNEAR = "wrap.testnet";
interface Item { p: Proposal; d: Decision; state: "pending" | "sent" | "rejected" | "failed"; hash?: string }

export default function App() {
  const [sel, setSel] = useState<WalletSelector | null>(null);
  const [modal, setModal] = useState<WalletSelectorModal | null>(null);
  const [acct, setAcct] = useState<string | null>(null);
  const [near, setNear] = useState<number | null>(null);
  const [wnear, setWnear] = useState<number | null>(null);
  const [usd, setUsd] = useState<number | null>(null);
  const [hist, setHist] = useState<Tx[] | null>(null);
  const [bur, setBur] = useState<BurrowPos | null | "na">("na");
  const [err, setErr] = useState<string[]>([]);
  const [policy, setPolicy] = useState<Policy>(loadPolicy());
  const [spent, setSpent] = useState(loadSpent());
  const [items, setItems] = useState<Item[]>([]);
  const [text, setText] = useState("");
  const [to, setTo] = useState(""); const [amt, setAmt] = useState("");
  const [note, setNote] = useState("");
  const [tab, setTab] = useState<"overview" | "agent" | "policy" | "lending" | "history">("overview");

  useEffect(() => {
    // If a wallet redirect returned with a tx hash, record the pending spend.
    const h = new URLSearchParams(location.search).get("transactionHashes");
    if (h) {
      const pend = JSON.parse(localStorage.getItem("vm.pending") ?? "null");
      if (pend) { addSpent(pend.amount); setSpent(loadSpent()); localStorage.removeItem("vm.pending"); }
      setNote(`Transaction submitted on NEAR Testnet: ${h}`);
      history.replaceState({}, "", location.pathname);
    }
    (async () => {
      const s = await setupWalletSelector({ network: NETWORK, modules: [setupMyNearWallet()] });
      setSel(s); setModal(setupModal(s, { contractId: WNEAR }));
      const upd = (st: typeof s.store extends { getState(): infer T } ? T : never) =>
        setAcct((st as any).accounts.find((a: any) => a.active)?.accountId ?? null);
      upd(s.store.getState()); s.store.observable.subscribe(upd as any);
    })().catch(e => setErr(x => [...x, "Wallet init failed: " + e.message]));
  }, []);

  const refresh = useCallback(async () => {
    if (!acct) return; const errs: string[] = [];
    await Promise.all([
      getNearBalance(acct).then(setNear).catch(e => { setNear(null); errs.push("NEAR balance unavailable: " + e.message); }),
      getFtBalance(WNEAR, acct, 24).then(setWnear).catch(() => setWnear(null)),
      getHistory(acct).then(setHist).catch(e => { setHist(null); errs.push("History unavailable: " + e.message); }),
      getBurrowPosition(acct).then(setBur).catch(() => setBur("na")),
      getNearUsd().then(setUsd)]);
    setErr(errs);
  }, [acct]);
  useEffect(() => { refresh(); }, [refresh]);

  const edit = (k: keyof Policy, v: any) => { const n = { ...policy, [k]: v }; setPolicy(n); savePolicy(n); };

  function propose(p: Proposal) {
    const d = evaluate(p, policy, spent);
    setItems(i => [{ p, d, state: d.verdict === "block" ? "rejected" : "pending" }, ...i]);
  }
  async function sign(idx: number) {
    const it = items[idx]; if (!sel || !acct) return;
    const p = it.p; const spends = p.type !== "borrow";
    if (spends && !p.amountNear) return;
    if (p.type === "borrow" && (!p.token || !p.tokenAmount)) return;
    if (p.type === "transfer" && !p.receiver) return;
    const re = evaluate(p, policy, loadSpent());   // re-check at signing time
    if (re.verdict === "block") { upd(idx, { state: "rejected", d: re }); return; }
    try {
      if (spends) localStorage.setItem("vm.pending", JSON.stringify({ amount: p.amountNear }));
      const w = await sel.wallet();
      let res: any;
      if (p.type === "supply") res = await w.signAndSendTransactions({ transactions: (await supplyPlan(acct, p.amountNear!)) as any });
      else if (p.type === "borrow") res = await w.signAndSendTransactions({ transactions: (await borrowPlan(acct, p.token!, p.tokenAmount!)) as any });
      else res = await w.signAndSendTransaction({ receiverId: p.receiver!, actions: [{ type: "Transfer", params: { deposit: toYocto(p.amountNear!.toFixed(8)) } }] });
      localStorage.removeItem("vm.pending"); if (spends) { addSpent(p.amountNear!); setSpent(loadSpent()); }
      upd(idx, { state: "sent", hash: (Array.isArray(res) ? res[res.length - 1] : res)?.transaction?.hash }); setTimeout(refresh, 4000);
    } catch (e: any) { console.error("VaultMind sign error", e); localStorage.removeItem("vm.pending"); upd(idx, { state: "failed", d: { verdict: "block", reasons: [e.message] } }); }
  }
  const upd = (i: number, patch: Partial<Item>) => setItems(a => a.map((x, j) => j === i ? { ...x, ...patch } : x));
  const ask = () => { const p = parseIntent(text); if (!p) setNote("Try: supply 1 NEAR to Burrow, borrow 5 some-token.testnet, or send 0.1 NEAR to alice.testnet"); else { setNote(""); propose(p); } setText(""); };
  const total = near != null && usd != null ? ((near + (wnear ?? 0)) * usd) : null;

  const capField = (k: "perTxNear" | "dailyNear") => <div><label className="m" style={{ display: "flex", gap: 6 }}><input type="checkbox" style={{ width: "auto" }} checked={policy[k] === null} onChange={e => edit(k, e.target.checked ? null : 1)} />Unlimited</label>{policy[k] !== null && <input type="number" min="0" step="any" defaultValue={policy[k] as number} onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= 0) edit(k, v); }} />}</div>;
  const numField = (k: "minNear" | "askAboveNear") => <input type="number" min="0" step="any" defaultValue={policy[k]} onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= 0) edit(k, v); }} />;
  return <div className="w">
    <h1>VaultMind AI</h1><div className="m">Your assets. Your rules. Your AI.</div>
    <p><span className="net">NEAR TESTNET ONLY</span> {note && <span className="m"> {note}</span>}</p>
    {!acct ? <button onClick={() => modal?.show()}>Connect NEAR Testnet wallet</button>
      : <p><b>{acct}</b> <button className="s" onClick={async () => { await (await sel!.wallet()).signOut(); setAcct(null); }}>Disconnect</button> <button className="s" onClick={refresh}>Refresh</button></p>}
    {err.map((e, i) => <div key={i} className="m" style={{ color: "var(--bad)" }}>{e}</div>)}
    {acct && <>
      <LiquidTabs value={tab} onChange={setTab} tabs={[["overview", "Overview"], ["agent", "Agent"], ["policy", "Policy"], ["lending", "Lending"], ["history", "History"]]} />
      {tab === "overview" && <div className="g">
        <div className="c"><BalanceCard label="NEAR balance (on-chain)" amount={near == null ? "unavailable" : String(near)} unit="NEAR · testnet"
          sub={<>wNEAR ({WNEAR}): {wnear ?? "unavailable"}<br />Value: {total != null ? `≈ $${total.toFixed(2)} (estimate: public NEAR price, testnet tokens have no market value)` : "unavailable"}</>}
          actions={<a href="https://near-faucet.io/" target="_blank"><button className="s">Get testnet NEAR</button></a>} /></div>
        <div className="c"><h3>Send NEAR</h3>
          <input placeholder="recipient.testnet" value={to} onChange={e => setTo(e.target.value)} />
          <input placeholder="amount in NEAR" value={amt} onChange={e => setAmt(e.target.value)} />
          <button onClick={() => { if (to && +amt > 0) { propose({ type: "transfer", receiver: to.trim().toLowerCase(), amountNear: +amt, label: `Send ${amt} NEAR to ${to}` }); setTab("agent"); } }}>Check with policy</button>
          <p className="m">Cross-chain swaps via NEAR Intents: not implemented.</p></div>
        <div className="c"><h3>Today</h3>{policy.dailyNear === null ? <p className="m">{spent} NEAR sent today. No daily cap set.</p> : <Meter value={spent} max={policy.dailyNear} label={`${spent} of ${policy.dailyNear} NEAR daily cap used`} />}</div>
      </div>}
      {tab === "agent" && <div className="g">
        <div className="c"><h3>Ask the agent</h3><PromptComposer value={text} onChange={setText} onSubmit={ask} placeholder="supply 1 NEAR to Burrow  /  borrow 5 <token>.testnet  /  send 0.1 NEAR to alice.testnet" />
          <p className="m">The agent only proposes. The Policy Engine decides, and you sign in your wallet.</p></div>
        <div className="c"><h3>Proposals</h3>{items.length === 0 && <p className="m">No proposals yet.</p>}
          {items.map((it, i) => <TaskCard key={i} title={it.p.label} reasons={it.d.reasons.join(" ")}
            tone={it.state === "sent" ? "done" : it.state === "failed" ? "block" : it.d.verdict} badge={it.state === "sent" ? "Sent" : it.state === "failed" ? "Failed" : it.d.verdict === "allow" ? "Allowed" : it.d.verdict === "ask" ? "Needs approval" : "Blocked"}>
            {it.state === "pending" && <><button onClick={() => sign(i)}>{it.d.verdict === "ask" ? "Approve and sign in wallet" : "Sign in wallet"}</button><button className="d" onClick={() => upd(i, { state: "rejected" })}>Reject</button></>}
            {it.state === "sent" && it.hash && <a href={`${EXPLORER}/txns/${it.hash}`} target="_blank">View on explorer</a>}
            {it.state === "rejected" && <span className="m">Not executed.</span>}</TaskCard>)}</div></div>}
      {tab === "policy" && <div className="c"><h3>Policy <span className="tag">owner only</span></h3>
        <div className="g"><div><label className="m">Max per transaction (NEAR)</label>{capField("perTxNear")}</div>
        <div><label className="m">Max per day (NEAR)</label>{capField("dailyNear")}</div>
        <div><label className="m">Ask me above (NEAR)</label>{numField("askAboveNear")}</div><div><label className="m">Minimum send (NEAR)</label>{numField("minNear")}</div></div>
        <label className="m">Allowed recipients (press Enter to add)</label><Chips values={policy.allowedReceivers} onChange={v => edit("allowedReceivers", v)} placeholder="alice.testnet" />
        {((policy.perTxNear !== null && policy.perTxNear <= 0) || (policy.dailyNear !== null && policy.dailyNear <= 0)) && <p style={{ color: "var(--bad)" }}>A cap is set to 0, so every send will be blocked.</p>}
        <p><LampSwitch on={policy.kill} onChange={v => edit("kill", v)} label={policy.kill ? "Kill switch ON: agent suspended" : "Kill switch off"} /></p></div>}
      {tab === "lending" && <div className="c"><h3>Burrow lending position <span className="tag">on-chain, read-only</span></h3>
        {bur === "na" ? <p className="m">Unavailable (the Burrow view call failed).</p> : bur === null ? <p className="m">No Burrow position for this account on {BURROW}.</p> :
          <table><tbody>{(["supplied", "collateral", "borrowed"] as const).map(k => <tr key={k}><td>{k}</td><td>{bur[k].length ? bur[k].map(x => `${x.token_id}: ${x.balance}`).join("; ") : "none"}</td></tr>)}</tbody></table>}
        <p className="m">Raw contract units. Ask the agent: "supply 1 NEAR to Burrow" (collateral), then "borrow 5 TOKEN_CONTRACT" using a borrowable testnet token contract id. Borrowing always asks for your approval.</p></div>}
      {tab === "history" && <div className="c"><h3>Transaction history <span className="tag">NearBlocks testnet</span></h3>
        {hist == null ? <p className="m">Unavailable.</p> : <table><thead><tr><th>Time</th><th>From</th><th>To</th><th>Action</th><th>Tx</th></tr></thead><tbody>
          {hist.map(t => <tr key={t.hash}><td>{t.time}</td><td>{t.from}</td><td>{t.to}</td><td>{t.kind}</td><td><a href={`${EXPLORER}/txns/${t.hash}`} target="_blank">{t.hash.slice(0, 8)}…</a></td></tr>)}</tbody></table>}</div>}
    </>}
  </div>;
}
