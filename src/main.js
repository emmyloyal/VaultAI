import './style.css';
import { DEFAULT_POLICY, LABELS, evaluate, isLooser } from './policy.js';
import * as near from './near.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const f = n => Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const I = { home: '<path d="M4 11l8-7 8 7v9H4z"/>', assets: '<path d="M5 8h14v11H5zM8 8V5h8v3"/>', pol: '<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/>', act: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>', back: '<path d="M15 5l-7 7 7 7"/>', srch: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>' };
const ic = n => `<svg viewBox="0 0 24 24">${I[n]}</svg>`;
const S = { tab: 'home', open: null, acct: null, bal: null, pol: structuredClone(DEFAULT_POLICY), log: [], sent: [], chat: [], props: [], pending: null, txs: [], err: '', busy: false };

// ---- storage (per account, this browser only) ----
const key = () => 'vm:' + (S.acct || 'guest');
const save = () => { try { localStorage.setItem(key(), JSON.stringify({ pol: S.pol, log: S.log, sent: S.sent })); } catch {} };
function load() {
  try { const d = JSON.parse(localStorage.getItem(key()) || 'null');
    if (d) { S.pol = { ...DEFAULT_POLICY, ...d.pol }; S.log = d.log || []; S.sent = d.sent || []; } else { S.pol = structuredClone(DEFAULT_POLICY); S.log = []; S.sent = []; } } catch {}
}
const logEv = (t, d) => { S.log.unshift({ t, d, ts: Date.now() }); S.log = S.log.slice(0, 200); save(); };
const spentToday = () => S.sent.filter(x => new Date(x.ts).toDateString() === new Date().toDateString()).reduce((a, x) => a + x.amount, 0);
const ctx = () => ({ balance: S.bal ?? 0, spentToday: spentToday() });
const run = p => evaluate(S.pol, ctx(), p);
const when = ts => new Date(ts).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' });

function toast(t) { const e = $('#toast'); e.textContent = t; e.classList.add('on'); clearTimeout(e._t); e._t = setTimeout(() => e.classList.remove('on'), 3200); }
const vChip = v => v === 'approved' ? '<span class="chip">Approved</span>' : v === 'approval' ? '<span class="chip warn">Needs your approval</span>' : '<span class="chip bad">Rejected</span>';

async function refresh() {
  if (!S.acct) { S.bal = null; S.txs = []; return draw(); }
  S.err = '';
  try { S.bal = await near.getBalance(S.acct); } catch (e) { S.err = 'Could not load your balance. ' + e.message; }
  try { S.txs = await near.history(S.acct); } catch { S.txs = []; }
  draw();
}

function propCard(p) {
  const r = run(p), sub = p.type === 'yield' ? `${p.pct}% of assets (${f(r.amount)} NEAR) · AI estimate ${p.apy ?? '?'}% APY, unverified` : `Send ${f(r.amount)} NEAR to ${esc(p.to)}`;
  return `<div class="card" tabindex="0" role="button" data-open="${p.id}" style="cursor:pointer"><div class="row"><b>${esc(p.title)}${p.protocol ? ' · ' + esc(p.protocol) : ''}</b>${vChip(r.verdict)}</div><p class="mut" style="margin-top:8px">${sub}</p><p class="mut" style="margin-top:4px">${esc(r.why)}</p></div>`;
}
const allProps = () => S.props;

const V = {
  home() {
    const bal = S.bal == null ? null : f(S.bal).split('.');
    return `<div class="scr"><div class="pill" tabindex="0" role="button" data-go="ai">${ic('srch')}Ask VaultMind about your assets</div>
<div class="holder"><div class="silver"><b>VaultMind</b><small>${S.acct ? esc(S.acct) : 'Not connected'} · NEAR Testnet</small></div><div class="flap"></div>
<div class="bal"><div class="m">${S.acct ? `<span>Available</span><p>${bal ? bal[0] + '<small>.' + bal[1] + ' NEAR</small>' : '…'}</p>` : `<span>Wallet</span><p style="font-size:20px"><button class="btn" style="padding:10px 16px;font-size:15px;width:auto" data-act="connect">Connect wallet</button></p>`}</div></div></div>
${S.err ? `<p class="err">${esc(S.err)}</p>` : ''}
<h1 style="font-size:20px">Proposals</h1>${allProps().length ? allProps().map(propCard).join('') : '<div class="card"><p class="mut">Nothing yet. Ask the AI for a yield option, or review a transfer from Assets.</p></div>'}
<p class="mut" style="padding:4px 6px">VaultMind never holds your funds or keys. Every transaction is signed in your own wallet.</p></div>`;
  },
  assets() {
    return `<div class="scr"><h1>Assets</h1>
<div class="card"><div class="row"><b>NEAR</b><b>${S.bal == null ? '—' : f(S.bal)}</b></div><p class="mut" style="margin-top:6px">Live testnet balance from the NEAR RPC. Token balances are not shown in this version.</p></div>
${S.acct ? `<div class="card"><b>Send NEAR</b><input class="field" id="to" placeholder="recipient.testnet" autocapitalize="off" aria-label="Recipient account"><input class="field" id="amt" inputmode="decimal" placeholder="Amount in NEAR" aria-label="Amount in NEAR"><p class="err" id="sendErr"></p><button class="btn" style="margin-top:6px" data-act="review">Review against my policies</button></div>
<button class="btn" style="background:#8a9a9a" data-act="out">Disconnect ${esc(S.acct)}</button>` : `<button class="btn" data-act="connect">Connect NEAR wallet</button>`}</div>`;
  },
  pol() {
    const P = S.pol, r = (k, u, st) => `<div class="card"><div class="row"><div><b>${LABELS[k]}</b><p class="mut">${u}</p></div><div class="step"><button aria-label="Decrease ${LABELS[k]}" data-p="${k}" data-d="-${st}">−</button><b>${P[k]}</b><button aria-label="Increase ${LABELS[k]}" data-p="${k}" data-d="${st}">+</button></div></div></div>`;
    const pe = S.pending;
    return `<div class="scr"><h1>Policies</h1><p class="mut" style="margin:-6px 0 14px">The AI cannot change these. Only you can, and looser limits need your confirmation.</p>
${pe ? `<div class="ban"><h3>Confirm a looser rule?</h3><p>${LABELS[pe.k]}: ${esc([].concat(pe.from).join(', '))} → ${esc([].concat(pe.to).join(', '))}</p><div class="row" style="margin-top:14px"><button class="btn" style="padding:12px" data-act="yes">Confirm</button><button class="btn" style="padding:12px;background:#8a9a9a" data-act="no">Cancel</button></div></div>` : ''}
${r('maxAlloc', '% of assets', 5)}${r('minReserve', '% of assets', 5)}${r('maxTx', 'NEAR', 10)}${r('daily', 'NEAR', 25)}${r('approveAbove', 'NEAR', 10)}
<div class="card"><b>${LABELS.types}</b><p style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">${['transfer', 'yield'].map(t => `<button class="chip ${P.types.includes(t) ? '' : 'off'}" data-type="${t}" aria-pressed="${P.types.includes(t)}">${t}</button>`).join('')}</p></div>
<div class="card"><b>${LABELS.protocols}</b><p style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">${P.protocols.map(x => `<span class="chip">${esc(x)}<button aria-label="Remove ${esc(x)}" data-rm="${esc(x)}">×</button></span>`).join('')}</p><div class="row"><input class="field" id="np" placeholder="Add a protocol" aria-label="Add a protocol"><button class="chip" style="margin-top:10px" data-act="addp">Add</button></div></div></div>`;
  },
  act() {
    return `<div class="scr"><h1>Activity</h1><h2 style="font-size:18px;margin:4px 0 10px">Policy decisions and changes</h2>
${S.log.length ? S.log.map(l => `<div class="card"><b>${esc(l.t)}</b><p class="mut" style="margin-top:4px">${esc(l.d)}</p><p class="mut" style="margin-top:4px;font-size:12px">${when(l.ts)}</p></div>`).join('') : '<div class="card"><p class="mut">No decisions recorded yet.</p></div>'}
<h2 style="font-size:18px;margin:18px 0 10px">On-chain transactions</h2>
${S.txs.length ? S.txs.map(t => `<div class="card"><div class="row"><b>${t.dir === 'out' ? 'Sent to ' + esc(t.to) : 'From ' + esc(t.from)}</b><span class="chip ${t.ok === false ? 'bad' : ''}">${t.ok === false ? 'Failed' : t.dir === 'out' ? 'Outgoing' : 'Incoming'}</span></div><p class="mut" style="margin-top:4px;font-size:12px">${when(t.ts)}</p></div>`).join('') : `<div class="card"><p class="mut">${S.acct ? 'No transactions found, or the public indexer is unavailable.' : 'Connect a wallet to see transactions.'}</p></div>`}</div>`;
  },
  ai() {
    return `<div class="scr" style="padding-bottom:190px"><h1>VaultMind AI</h1><div class="msg a">Ask me to analyse your portfolio or suggest a yield option, for example “Recommend a yield option, no more than 20% of my assets.” I recommend only. Any APY I mention is my estimate and is not verified.</div>
${S.chat.map(m => `<div class="msg ${m.r}">${esc(m.t)}</div>${m.p ? propCard(m.p) : ''}`).join('')}${S.busy ? '<div class="msg a">Thinking…</div>' : ''}</div>
<form class="chat" id="cf"><input id="ci" aria-label="Message" placeholder="Message VaultMind"><button>Send</button></form>`;
  },
  detail() {
    const p = S.open, r = run(p), yld = p.type === 'yield', ok = r.verdict !== 'rejected';
    return `<div class="scr"><button class="back" aria-label="Back" data-go="home">${ic('back')}</button>
<div class="hero"><b style="font-size:17px">${yld ? esc(p.protocol) : 'NEAR transfer'}</b><div><p style="font-size:13px;opacity:.8">${esc(p.title)}</p><b style="font-size:24px">${f(r.amount)} NEAR</b></div></div>
<p style="text-align:center"><span class="chip warn">${yld ? `AI estimate ${p.apy ?? '?'}% APY · unverified` : 'Testnet'}</span></p>
<div class="card" style="margin-top:16px"><p class="mut">${yld ? 'ALLOCATE FROM' : 'SEND TO'}</p><b style="font-size:19px">${yld ? 'Main' : esc(p.to)}</b> <span class="mut" style="font-size:16px">${yld ? `(${f(S.bal ?? 0)} NEAR)` : ''}</span></div>
<div class="ban ${r.verdict === 'approved' ? 'ok' : ''}"><h3>${{ rejected: 'Policy engine: rejected', approval: 'Policy engine: your approval needed', approved: 'Policy engine: approved' }[r.verdict]}</h3><p>${esc(r.why)}</p></div>
<h1 style="font-size:20px">Checks</h1>${r.checks.map(x => `<div class="chk"><span>${x.ok ? '✓' : '✕'}</span><span>${esc(x.text)}</span></div>`).join('')}
<div style="margin-top:22px">${yld ? '<p class="mut" style="margin-bottom:12px">Recommendation only. VaultMind does not execute yield actions in this version.</p><button class="btn" style="background:#8a9a9a" data-go="home">Done</button>'
        : `<button class="btn" ${ok ? '' : 'disabled'} data-act="sign">${!ok ? 'Blocked by your policy' : r.verdict === 'approval' ? 'Approve and sign with wallet' : 'Sign with wallet'}</button>`}</div></div>`;
  }
};

function draw() {
  const k = S.open ? 'detail' : S.tab;
  $('#view').innerHTML = V[k]();
  $('#tabs').innerHTML = `<div class="nav">${[['home', 'Home'], ['assets', 'Assets'], ['pol', 'Policies'], ['act', 'Activity']].map(([k, l]) => `<button class="${S.tab === k && !S.open ? 'on' : ''}" data-go="${k}">${ic(k)}${l}</button>`).join('')}</div><button class="ai" aria-label="Open AI assistant" data-go="ai">✦</button>`;
  const cf = $('#cf'); if (cf) cf.onsubmit = askAI;
}

async function askAI(e) {
  e.preventDefault();
  const t = $('#ci').value.trim(); if (!t || S.busy) return;
  S.chat.push({ r: 'u', t }); S.busy = true; draw();
  try {
    const res = await fetch('/api/ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: t, context: { balance: S.bal ?? 0, policy: S.pol } }) });
    const raw = await res.text(); let d;
    try { d = JSON.parse(raw); } catch { throw new Error('The AI service is not available at /api/ai on this site. Deploy the AI function or server (see the README), then try again.'); }
    if (!res.ok) throw new Error(d.error || 'AI request failed');
    let p = null;
    if (d.proposal) {
      p = { id: Date.now(), type: 'yield', ...d.proposal }; S.props.unshift(p);
      const r = run(p); logEv('AI proposal checked', `${p.protocol} ${p.pct}% → ${r.verdict}. ${r.why}`);
    }
    S.chat.push({ r: 'a', t: d.reply || 'No response.', p });
  } catch (err) { S.chat.push({ r: 'a', t: err.message }); }
  S.busy = false; draw();
}

function commit(p, amount) {
  S.sent.push({ ts: Date.now(), amount, to: p.to }); logEv('Transfer sent', `${f(amount)} NEAR to ${p.to}`);
  localStorage.removeItem('vm:pending'); toast('Transfer sent'); refresh();
}

async function sign() {
  const p = S.open, r = run(p);                  // re-check at the moment of signing
  if (p.type !== 'transfer' || r.verdict === 'rejected') return toast('Your policies no longer allow this.');
  localStorage.setItem('vm:pending', JSON.stringify({ acct: S.acct, amount: r.amount, to: p.to }));
  logEv('Sent to wallet for signature', `${f(r.amount)} NEAR to ${p.to} · ${r.verdict === 'approval' ? 'you approved' : 'within limits'}`);
  try {
    const res = await near.sendNear(p.to, String(r.amount));
    if (res !== undefined) { S.open = null; S.tab = 'act'; commit(p, r.amount); }   // popup wallets resolve here; redirect wallets reload
  } catch { localStorage.removeItem('vm:pending'); logEv('Signature cancelled or failed', `${f(r.amount)} NEAR to ${p.to}`); toast('Signature cancelled or failed'); draw(); }
}

function review() {
  const to = $('#to').value.trim().toLowerCase(), amt = Number($('#amt').value), e = $('#sendErr');
  if (!near.validAccount(to) || !to.endsWith('.testnet') && !/^[a-f0-9]{64}$/.test(to)) return e.textContent = 'Enter a valid testnet account, like name.testnet.';
  if (!(amt > 0)) return e.textContent = 'Enter an amount above 0.';
  const p = { id: Date.now(), type: 'transfer', title: 'Send NEAR', to, amount: amt }; S.props.unshift(p);
  const r = run(p); logEv('Transfer reviewed', `${f(amt)} NEAR to ${to} → ${r.verdict}. ${r.why}`);
  S.open = p; draw();
}

function setPolicy(k, to) {
  const from = S.pol[k];
  if (isLooser(k, from, to)) { S.pending = { k, from, to }; return; }
  S.pol[k] = to; logEv('Policy tightened', `${LABELS[k]}: ${[].concat(from).join(', ')} → ${[].concat(to).join(', ')}`);
}

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-go],[data-open],[data-act],[data-p],[data-type],[data-rm]'); if (!el) return; const d = el.dataset;
  if (d.go) { S.open = null; S.tab = d.go; }
  else if (d.open) S.open = S.props.find(x => String(x.id) === d.open);
  else if (d.p) { const n = S.pol[d.p] + Number(d.d); if (n >= 0 && !(d.p !== 'minReserve' && d.p !== 'approveAbove' && n === 0) && n <= (/Alloc|Reserve/.test(d.p) ? 100 : 1e6)) setPolicy(d.p, n); }
  else if (d.type) { const t = S.pol.types, n = t.includes(d.type) ? t.filter(x => x !== d.type) : [...t, d.type]; setPolicy('types', n); }
  else if (d.rm) setPolicy('protocols', S.pol.protocols.filter(x => x !== d.rm));
  else if (d.act === 'addp') { const v = $('#np').value.trim().slice(0, 40); if (v && !S.pol.protocols.includes(v)) setPolicy('protocols', [...S.pol.protocols, v]); }
  else if (d.act === 'yes') { const q = S.pending; S.pol[q.k] = q.to; logEv('Policy loosened (you confirmed)', `${LABELS[q.k]}: ${[].concat(q.from).join(', ')} → ${[].concat(q.to).join(', ')}`); S.pending = null; }
  else if (d.act === 'no') S.pending = null;
  else if (d.act === 'connect') return near.connect();
  else if (d.act === 'out') { await near.disconnect(); return; }
  else if (d.act === 'review') return review();
  else if (d.act === 'sign') return sign();
  save(); draw();
});

(async function boot() {
  draw();
  try {
    await near.init();
    S.acct = near.accountId(); load();
    // Returning from a redirect wallet (MyNearWallet) after signing:
    const q = new URLSearchParams(location.search);
    if (q.has('transactionHashes') || q.has('errorCode')) {
      try { const pd = JSON.parse(localStorage.getItem('vm:pending') || 'null');
        if (pd && q.has('transactionHashes') && pd.acct === S.acct) commit({ to: pd.to }, pd.amount);
        else if (pd) { logEv('Signature cancelled or failed', `${f(pd.amount)} NEAR to ${pd.to}`); localStorage.removeItem('vm:pending'); } } catch {}
      history.replaceState({}, '', location.pathname);
    } else localStorage.removeItem('vm:pending');
    near.onChange(() => { const a = near.accountId(); if (a !== S.acct) { S.acct = a; load(); refresh(); } });
    refresh();
  } catch (e) { S.err = 'Wallet failed to start: ' + e.message; draw(); }
})();
