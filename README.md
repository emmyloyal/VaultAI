# VaultMind AI — NEAR Testnet

Policy-controlled AI agent over a NEAR **testnet** wallet. Testnet only: there is no mainnet code path.

## Run
```
npm install
cp .env.example .env     # optional
npm run dev              # http://localhost:5173
```
1. Click **Connect NEAR Testnet wallet** (MyNearWallet testnet). Fund it at the NEAR testnet faucet.
2. Set limits in **Policy**. Type `send 0.1 NEAR to someone.testnet` to the agent.
3. The Policy Engine returns Allowed / Needs approval / Blocked. Allowed and approved actions are signed **by you in the wallet**; the agent never holds keys.

## Architecture
- `src/policy.ts` pure Policy Engine; re-checked at signing time. Agent code cannot import its setters.
- `src/agent.ts` intent -> Proposal only (rule-based; swap in an LLM that returns the same shape, key kept server-side).
- `src/near.ts` real testnet RPC (view_account, ft_balance_of), NearBlocks testnet history.

## Real, estimated, unavailable
Real: balances, wNEAR balance, history, signed transfers. Estimated: USD value (public NEAR price; testnet tokens are worthless). Lending: read-only Burrow position. Not implemented: supply/borrow actions and NEAR Intents swaps.

## Limits to know
- Policy and daily-spend counters live in browser localStorage. A determined user can edit them; for hard enforcement, move limits on-chain (e.g. a policy-gated smart-contract account or function-call access keys scoped to a contract).
- Autonomous (no-prompt) execution would need a separate agent key with restricted access; this version always requires your wallet signature.
- Lending: add a verified testnet contract id, then add a module that calls its ft_transfer_call-based supply/borrow methods through `policy.evaluate`.

## Pin UI components
The UI slots in `src/components/ui.tsx` follow the roles of Pin UI components (Liquid Tabs, Balance Card, Chips, Lamp Switch, Task Card, Prompt Composer, Progress). They are plain-CSS stand-ins. To use the real Pin UI versions, copy a component's source from https://www.pinui.xyz/components into `src/components/pin/`, `npm i motion`, and swap the import in `App.tsx`.
