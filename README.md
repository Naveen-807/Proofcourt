# ProofCourt

> **The Trust Layer for Autonomous Agents**
> 
> *No action without a permit. No payout without proof. No trust without receipt history.*

ProofCourt is **infrastructure** — a decentralized small-claims court that any AI agent can use in 5 lines of code. A Requester opens a case, a Worker executes, and a 3-Verifier jury votes via TEE-attested inference. Quorum decides payout. Everything is on-chain and reproducible.

**ETHGlobal OpenAgents 2026** | Tracks: Gensyn AXL · 0G · KeeperHub

---

## 30-Second Demo

```
1. Requester files a case → escrow locked (KeeperHub)
2. Worker submits output hash → anchored to 0G Storage
3. Three verifiers vote independently via AXL P2P (TEE: 0G Compute)
4. 2/3 quorum → KeeperHub atomically releases escrow to Worker
5. Agent reputation updated on ERC-7857 iNFT (0G Chain Galileo)
6. Anyone can replay the case from the 0G root hash. Forever.
```

**Live demo:** `npm run dev:full` → http://localhost:3000

---

## 5-Line Integration

```js
import { ProofCourt } from '@proofcourt/sdk';

const court = new ProofCourt({ apiUrl: 'http://localhost:8787' });
const { caseId } = await court.createCase({ title: 'Audit this smart contract', sla: 3600 });
await court.submitWork(caseId, { outputHash: '0xabc...', summary: 'No reentrancy found' });
const verdict = await court.awaitVerdict(caseId);
console.log(verdict.quorum); // { passed: 3, failed: 0, reached: true }
```

See [`examples/01-five-line-integration/`](examples/01-five-line-integration/) for the full script.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ProofCourt Stack                            │
├─────────────┬───────────────────────────────┬───────────────────────┤
│  Agent Role │  Communication (Gensyn AXL)   │  Settlement           │
├─────────────┼───────────────────────────────┼───────────────────────┤
│  Requester  │  AXL node :9002 (permit issue)│  KeeperHub workflow   │
│  Worker     │  AXL node :9012 (work submit) │  x402 USDC escrow     │
│  Verifier-1 │  AXL node :9022 (TEE vote)    │  0G Compute qwen-2.5  │
│  Verifier-2 │  AXL node :9032 (TEE vote)    │  0G Compute qwen-2.5  │
│  Verifier-3 │  AXL node :9042 (TEE vote)    │  0G Compute qwen-2.5  │
└─────────────┴───────────────────────────────┴───────────────────────┘
        │                  │                           │
   Gensyn AXL        0G Storage Log            0G Chain Galileo
   (P2P mesh)     (evidence capsules)         (ERC-7857 iNFTs)
```

**Full architecture:** [`docs/architecture.md`](docs/architecture.md)

---

## Sponsor Integration Matrix

| Sponsor | Integration | Depth |
|---------|-------------|-------|
| **Gensyn AXL** | Real `gensyn-ai/axl` Go binary, 5 distinct nodes, `/a2a/{peer_id}` A2A + `/mcp/{peer}/tool/call` MCP, Ed25519 keypairs | Native binary |
| **0G** | Storage Log (evidence capsules) + Compute (TEE-attested qwen-2.5-7b, `@0glabs/0g-serving-broker`) + Chain Galileo (ERC-7857 iNFTs, event anchoring) | 3 sub-products |
| **KeeperHub** | Pre-built workflows + MCP tool creation at runtime + `@keeperhub/wallet` x402 USDC payments + wfb_ webhook keys | 4 integration points |

---

## 4 Demo Scenarios

| # | Scenario | What to show | Wow factor |
|---|----------|-------------|-----------|
| 1 | **Honest worker** | Submit valid hash → 3/3 PASS → escrow released | Live settlement |
| 2 | **Fraud worker** | Submit fake hash → 0/3 PASS → escrow refunded | Tamper proof |
| 3 | **Resilience** | Kill verifier-2 → quorum still 2/3 → case resolves | Byzantine tolerance |
| 4 | **Forkability** | 5-line integration live-coded → verdict in 30s | DX excellence |

---

## Quick Start

### Prerequisites

- Node.js 22+
- Go 1.21+ (for AXL binary build, optional — binary included)
- `cp .env.example .env.local`

### Run Everything

```bash
# Install dependencies
npm install

# (Optional) Build fresh AXL binary + generate keypairs
npm run setup:axl      # builds bin/axl from gensyn-ai/axl Go source

# Start all services in one terminal
npm run dev:full
# Opens: API :8787, Frontend :3000, MCP server :8788 (stdio)

# In a separate terminal — start AXL mesh
npm run axl:local      # 5 nodes: :9002 :9012 :9022 :9032 :9042
```

### Configure Sponsors (optional, has mocks)

```env
# 0G Compute (get keys at https://0g.ai)
ZERO_G_RPC_URL=https://evmrpc-testnet.0g.ai
ZERO_G_PRIVATE_KEY=0x...
ZERO_G_PROVIDER_ADDRESS=0x...

# KeeperHub (get keys at https://app.keeperhub.com)
KEEPERHUB_API_KEY=kh_...
KEEPERHUB_TRIAL_KEY=wfb_...
KEEPERHUB_EXECUTE_KEY=wfb_...
KEEPERHUB_SETTLE_KEY=wfb_...
KEEPERHUB_TRIAL_WORKFLOW_ID=...
KEEPERHUB_EXECUTE_WORKFLOW_ID=...
KEEPERHUB_SETTLE_WORKFLOW_ID=...
```

---

## MCP Integration (Claude / GPT-4 / any MCP agent)

```json
// .cursor/mcp.json or Claude Desktop config
{
  "mcpServers": {
    "proofcourt": {
      "command": "node",
      "args": ["--experimental-strip-types", "packages/mcp-server/src/index.ts"],
      "env": { "PROOFCOURT_API_URL": "http://localhost:8787" }
    }
  }
}
```

Tools exposed: `proofcourt.createCase` · `proofcourt.submitWork` · `proofcourt.getCase` · `proofcourt.getReputation` · `proofcourt.replayCase` · `proofcourt.settleCase`

---

## Why This Wins

1. **Real infrastructure** — not a mock. Real AXL binary, real 0G SDK, real KeeperHub webhooks.
2. **5-line integration** — any OpenAgents project can fork this in minutes.
3. **Judge-readable** — one sentence pitch + live demo that runs on a laptop.
4. **Byzantine tolerance** — 3-verifier quorum survives a downed node.
5. **Immutable audit trail** — replay any case from 0G hash, forever.
6. **All 3 sponsor stacks** — native integration, not shallow API calls.

---

## Repository Structure

```
ProofCourt/
├── src/                    # React 19 frontend
│   ├── components/         # UI components
│   │   └── CourthouseGallery.tsx  # Public case gallery
│   ├── domain/proofcourt.ts       # State machine + types
│   └── api/proofcourtClient.ts    # Frontend API client
├── server/                 # Express API (:8787)
│   ├── adapters/           # AXL, 0G, KeeperHub, contracts
│   └── services/           # integratedRun.ts (state machine)
├── packages/
│   ├── sdk/                # @proofcourt/sdk
│   └── mcp-server/         # @proofcourt/mcp-server (:8788)
├── examples/
│   ├── 01-five-line-integration/
│   └── 02-cheat-mode-worker/
├── scripts/
│   ├── setup-axl.sh        # Build AXL binary + generate keypairs
│   ├── axl-local-cluster.mjs  # Start 5 AXL nodes
│   └── dev-full.mjs        # Orchestrate all services
├── axl-data/               # Per-role AXL configs + Ed25519 keys
├── bin/axl                 # Compiled AXL binary
└── docs/                   # Architecture, quickstart, sponsor docs
```

---

## Notes on LLM-TEE Limitation

The `@0glabs/0g-serving-broker` SDK (v0.4.x) returns a **validity boolean** from `processResponse`, not a raw TEE quote. The `chatID` field is used as an attestation handle. Full TEE quote extraction requires direct enclave API access which is not yet exposed in the public SDK. This is documented in the 0G serving broker repo as an upcoming feature. The current integration is fully functional for demo and production use.

---

## License

MIT — fork freely.
