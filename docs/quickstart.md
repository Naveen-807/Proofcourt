# ProofCourt — 5-Minute Quickstart

## What you need

- Node.js 22+
- A terminal

## Step 1: Clone and install

```bash
git clone https://github.com/YOUR_HANDLE/proofcourt
cd ProofCourt
npm install
cp .env.example .env.local
```

## Step 2: Start the stack

```bash
# Terminal 1: API + frontend + MCP server
npm run dev:full

# Terminal 2: AXL mesh (5 nodes, local)
npm run axl:local
```

Open http://localhost:3000

## Step 3: Run your first case

Type a mandate like: `"Audit this Solidity contract for reentrancy vulnerabilities"`

Hit **Generate Workflow**, then **Start Run**. Watch the 3-verifier jury deliberate in real-time.

## Step 4: Try the fraud demo

```bash
node examples/02-cheat-mode-worker/index.mjs
```

A fake worker submits a garbage hash. All 3 verifiers return FAIL. Escrow refunded.

## Step 5: Use the SDK

```bash
node examples/01-five-line-integration/index.mjs
```

5 lines. One verdict. No trust required.

## Environment Variables (full list)

See [`.env.example`](../.env.example) for the complete list.

Key variables:
- `ZERO_G_RPC_URL` — 0G chain RPC (testnet: `https://evmrpc-testnet.0g.ai`)
- `ZERO_G_PRIVATE_KEY` — wallet for 0G compute billing
- `ZERO_G_PROVIDER_ADDRESS` — 0G inference provider address
- `KEEPERHUB_API_KEY` — org key (`kh_...`)
- `KEEPERHUB_TRIAL_KEY` / `KEEPERHUB_EXECUTE_KEY` / `KEEPERHUB_SETTLE_KEY` — webhook keys (`wfb_...`)

Without these set, all integrations use graceful mocks. The UI is fully functional.

## Running without sponsor credentials

All three sponsor integrations (AXL, 0G, KeeperHub) have mock fallbacks. You can demo the full flow without any API keys:

```bash
# No .env.local changes needed — just start
npm run dev:full
```

Integration status badges in the UI show `mock` vs `live`.
