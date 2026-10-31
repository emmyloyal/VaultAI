# VaultMind AI (NEAR Testnet)

## How to test

**You need:** Node 20.6 or newer, a NEAR **testnet** account with some testnet NEAR (a MyNearWallet testnet account works), and a second testnet account to send to. The AI steps also need a NEAR AI Cloud key in `.env`; everything else works without one.

**1. Automated check (30 seconds)**

    npm install
    npm test

Expect 9 passing tests. These cover the Policy Engine rules on their own, with no wallet or AI involved.

**2. Start the app**

    cp .env.example .env     # add NEARAI_API_KEY if you have one
    npm run dev

Open http://localhost:5173 on a phone-sized window (or your browser's mobile view).

**3. Manual checklist**

| # | Do this | You should see |
|---|---------|----------------|
| 1 | Home → **Connect wallet**, pick a wallet, approve | Your account ID and live testnet balance on the wallet card |
| 2 | Assets → send more than your **Max per transaction** (default 100) to your second account → **Review** | Verdict **Rejected**, the failed check explained, **Sign** button disabled |
| 3 | Send an amount that leaves less than 20% of your balance | **Rejected** (minimum unallocated) |
| 4 | Send an amount above 50 but within all limits (needs a balance of roughly 125+ NEAR) | **Your approval needed**; button reads "Approve and sign with wallet" |
| 5 | Send 1 NEAR to your second account → **Sign** → approve in the wallet | Wallet prompt, then "Transfer sent"; balance drops; entry in Activity. The on-chain list can lag a minute |
| 6 | Start a send, then cancel in the wallet | "Signature cancelled or failed" in the log; your daily total does **not** increase |
| 7 | Policies → lower **Daily limit** to 1, send another 1 NEAR | **Rejected** (daily total) |
| 8 | Policies → raise any limit (+) | A **Confirm a looser rule?** banner. Cancel leaves it unchanged; Confirm applies it and logs it |
| 9 | Policies → lower any limit (−) | Applies immediately and is logged as "Policy tightened" |
| 10 | Policies → tap **yield** to turn it off, then ask the AI for a yield option | The proposal shows **Rejected** (yield not allowed) |
| 11 | AI tab → "Recommend a yield option, no more than 20% of my assets" | A proposal card with a verdict. APY is labelled **AI estimate, unverified**. The detail screen has **no sign button** (recommendation only) |
| 12 | Policies → remove **Meta Pool**, ask the AI for a Meta Pool option | **Rejected** (not on your approved list) |
| 13 | Reload the page | Policies and the audit log are still there. A different account starts with its own defaults |
| 14 | Remove `NEARAI_API_KEY`, restart, ask the AI anything | A clear "AI is not configured" message in the chat, and the rest of the app still works |

**If something fails**
- *Balance won't load:* the default RPC may be down. Set `VITE_NEAR_RPC` in `.env` to another testnet RPC and restart.
- *Wallet popup or redirect problems:* try Meteor or HERE instead of MyNearWallet, and check the wallet is on testnet.
- *Activity shows no on-chain transactions:* the public indexer is best-effort and can be rate limited. The audit log still records everything.
- *AI errors:* check the key and `NEARAI_MODEL` against your NEAR AI Cloud dashboard.

---


Your assets. Your rules. Your AI. The AI only recommends. A deterministic Policy Engine checks every proposal before your own wallet is asked to sign.

## Run
    npm install
    cp .env.example .env     # add your NEAR AI Cloud key (cloud.near.ai)
    npm run dev              # app on :5173, AI proxy on :8787
    npm test                 # policy engine tests

## How it fits together
- `src/policy.js` pure rules, no AI or network. Tested in `test/`.
- `src/near.js` wallet selector, testnet balance (RPC), history (nearblocks testnet), transfers.
- `server/index.js` NEAR AI Cloud proxy. The API key never reaches the browser. The AI returns text plus an optional proposal, nothing else.
- `src/main.js` UI. Transfers are re-checked at the moment of signing.

## Honest limits
- Policies live in this browser (localStorage) and are enforced by app code before the wallet prompt. That is not cryptographic protection. Autonomous execution would need on-chain permissions.
- Yield is recommendation-only. APYs come from the model, are labelled unverified, and no yield transaction is ever sent.
- Token balances are not shown; only NEAR.
- If install or wallet setup fails, check current @near-wallet-selector versions and the RPC URL (set VITE_NEAR_RPC).

## Deploying
- Build with `npm run build` and host the `dist/` folder on any static host (Netlify, Vercel, Cloudflare Pages).
- If the site lives in a sub-folder (for example GitHub Pages at /repo-name/), set `base: '/repo-name/'` in `vite.config.js`, or the page loads blank.
- A static host has no `/api/ai`. Run `server/index.js` on a Node host (Render, Railway, Fly) with `NEARAI_API_KEY` set, and make `/api/*` reach it (a rewrite or proxy rule). Without it everything works except the AI chat, which shows a clear error.
- The `vite-plugin-node-polyfills` setting in `vite.config.js` is required. Without it the wallet libraries crash on load and the page is blank.
