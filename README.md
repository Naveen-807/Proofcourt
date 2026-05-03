# ProofCourt

ProofCourt is a full-stack protocol for verifiable agent work and settlement. It combines a Vite + React frontend, an Express API, a Solidity contract suite, sponsor adapters for AXL, KeeperHub, and 0G, plus a TypeScript SDK, CLI, and MCP server.

The core idea is simple: a user submits intent, ProofCourt turns it into a mandate and SLA, a worker executes only after permit issuance, and settlement happens only after evidence and verifier quorum are recorded.

## What lives in this repo

- `src/` - frontend app, UI components, domain models, and wallet wiring
- `server/` - API server, sponsor adapters, state-machine services, and persistence
- `contracts/` - Solidity contract suite deployed on 0G Galileo testnet
- `packages/sdk/` - `@proofcourt/sdk` client for programmatic case handling
- `packages/cli/` - `proofcourt` CLI wrapper around the SDK
- `packages/mcp-server/` - MCP server exposing ProofCourt tools to agent clients
- `scripts/` - local dev orchestration, deployment, demo, and AXL helpers
- `examples/` - minimal SDK examples and demo worker scripts
- `docs/` - architecture, quickstart, and sponsor integration notes

## Runtime model

ProofCourt runs as a deterministic case lifecycle. The main states are:

`workflow_generated -> agents_selected -> prepare_running -> permit_issued -> payout_locked -> commit_running -> execution_complete -> evidence_stored -> proof_verified -> payout_released -> reputation_updated`

If tampering is detected, the flow branches to `tamper_detected -> payout_blocked`.

The key on-chain and off-chain artifacts are:

- Mandate and SLA text derived from the user intent
- AXL transcript hashes for agent communication
- KeeperHub execution receipts for work completion
- 0G evidence roots for replayable case history
- Verification receipts and reputation updates for final settlement

## Main user flows

1. The UI generates a workflow from free-form intent.
2. The API builds the case, bootstraps AgentDNS and AgentSLA, and persists the run.
3. A browser wallet funds escrow on 0G Galileo through `ProofCourtEscrow`.
4. AXL messages capture permit and coordination traffic.
5. KeeperHub executes the permitted work.
6. 0G Storage anchors evidence and replay data.
7. 0G Compute produces verifier judgments and quorum is recorded.
8. The coordinator commits or aborts settlement and updates reputation.

## Requirements

- Node.js 22 or newer
- A browser wallet connected to 0G Galileo testnet for escrow funding
- Deployed contract addresses and sponsor credentials in `.env.local`
- Optional: live AXL mesh, KeeperHub workflows, and 0G Storage / Compute endpoints

## Quick start

```bash
npm install
cp .env.example .env.local
npm run contracts:compile
npm run contracts:deploy
npm run dev:full
```

Open the UI at http://localhost:3000.

`npm run dev:full` starts the API, frontend, and MCP server together. If you want the local AXL mesh as well, run `npm run axl:local` in a separate terminal.

Docker-based startup is also available:

```bash
docker compose up --build
```

## Useful commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start the frontend only on port 3000 |
| `npm run api` | Start the API on port 8787 |
| `npm run dev:full` | Start frontend, API, and MCP server together |
| `npm run axl:local` | Start the local AXL node cluster |
| `npm run setup:axl` | Run the AXL setup helper script |
| `npm run contracts:compile` | Compile Solidity contracts and emit artifacts |
| `npm run contracts:deploy` | Deploy contracts to 0G Galileo |
| `npm run build` | Build the frontend for production |
| `npm run preview` | Preview the production build |
| `npm run lint` | Type-check the repository |
| `npm run mcp:server` | Start the MCP server over stdio |
| `npm run mcp:http` | Start the MCP server over HTTP on port 8788 |
| `npm run proofcourt` | Use the ProofCourt CLI |
| `npm run demo:run` | Run the scripted honest/fraud demo sequence |
| `npm run demo:cheat` | Run the adversarial worker demo |
| `npm run demo:honest` | Run the honest worker demo |

## Environment variables

Put runtime values in `.env.local`. The most important groups are below.

### Contracts and chain

- `RPC_URL`
- `PRIVATE_KEY`
- `EXECUTOR_PRIVATE_KEY` or `EXECUTOR_ADDRESS`
- `JUDGE_ADDRESS`
- `PROOFCOURT_ESCROW_ADDRESS`
- `WORK_REGISTRY_ADDRESS`
- `EVIDENCE_REGISTRY_ADDRESS`
- `AGENT_REPUTATION_ADDRESS`
- `AGENT_INFT_ADDRESS`
- `PROOFCOURT_COORDINATOR_ADDRESS`

### AXL

- `AXL_NODE_URL` or per-role URLs:
  - `AXL_REQUESTER_NODE_URL`
  - `AXL_WORKER_NODE_URL`
  - `AXL_VERIFIER_1_NODE_URL`
  - `AXL_VERIFIER_2_NODE_URL`
  - `AXL_VERIFIER_3_NODE_URL`
- Alternate role aliases are also supported by the adapters, such as `AXL_OWNER_NODE_URL`, `AXL_EXECUTOR_NODE_URL`, `AXL_SPECIALIST_NODE_URL`, and `AXL_JUDGE_NODE_URL`
- `AXL_ENABLE_PROTOCOL_ROUTES=true` enables direct protocol routes when the local AXL mesh supports them

### KeeperHub

- `KEEPERHUB_API_URL`
- `KEEPERHUB_API_KEY`
- `KEEPERHUB_TRIAL_KEY`
- `KEEPERHUB_EXECUTE_KEY`
- `KEEPERHUB_SETTLE_KEY`
- `KEEPERHUB_TRIAL_WORKFLOW_ID`
- `KEEPERHUB_EXECUTE_WORKFLOW_ID`
- `KEEPERHUB_SETTLEMENT_WORKFLOW_ID`

### 0G Storage and compute

- `ZERO_G_RPC_URL`
- `ZERO_G_INDEXER_RPC`
- `ZERO_G_PRIVATE_KEY`
- `ZERO_G_STORAGE_URL`
- `ZERO_G_API_KEY`
- `ZERO_G_PROVIDER_ADDRESS`
- `ZERO_G_PROVIDER_ENDPOINT`
- `ZERO_G_PROVIDER_API_KEY`
- `ZERO_G_PROVIDER_MODEL`
- `ZERO_G_CONTRACT_ADDRESS`
- `ZERO_G_KV_NODE_URL`
- `ZERO_G_KV_STREAM`

### Frontend

- `VITE_PROOFCOURT_API_URL`
- `VITE_AGENT_INFT_ADDRESS`

## API surface

The API is served from `server/index.ts`. The most important endpoints are:

- `GET /api/health`
- `GET /api/integrations/status`
- `GET /api/axl/transcript/:workflowId`
- `POST /api/workflows/generate`
- `POST /api/runs`
- `GET /api/runs/:id`
- `POST /api/runs/:id/advance`
- `POST /api/runs/:id/tamper`
- `POST /api/runs/:id/restore`
- `GET /api/runs/:id/replay`
- `POST /api/runs/:id/bootstrap/retry`
- `GET /api/runs/:id/escrow-intent`
- `POST /api/runs/:id/escrow`
- `GET /api/agents/:id/trust`

## SDK

`packages/sdk` exports `ProofCourt`, a small client for creating cases, submitting work, replaying evidence, querying reputation, and settling cases.

Example:

```ts
import { ProofCourt } from '@proofcourt/sdk';

const court = new ProofCourt({ apiUrl: 'http://localhost:8787' });
const { caseId } = await court.createCase({
  title: 'Audit this smart contract',
  sla: 3600,
});

await court.submitWork(caseId, {
  outputHash: '0xabc...',
  summary: 'No reentrancy found',
});

const verdict = await court.awaitVerdict(caseId);
console.log(verdict.quorum);
```

See [`examples/01-five-line-integration/`](examples/01-five-line-integration/) for the full script.

## CLI

The CLI wraps the SDK and exposes the same core actions:

```bash
npm run proofcourt -- create --title "Audit this contract"
npm run proofcourt -- submit --case-id run_... --output-hash 0x...
npm run proofcourt -- watch --case-id run_...
npm run proofcourt -- replay --case-id run_...
npm run proofcourt -- reputation --agent-id worker
npm run proofcourt -- demo-cheat
```

## MCP server

The MCP server in `packages/mcp-server/` exposes these tools:

- `proofcourt.createCase`
- `proofcourt.submitWork`
- `proofcourt.getCase`
- `proofcourt.getReputation`
- `proofcourt.replayCase`
- `proofcourt.settleCase`

Run it with `npm run mcp:server` or `npm run mcp:http`.

## Contracts

The Solidity suite targets 0G Galileo testnet chain ID `16602`.

- `ProofCourtCoordinator` orchestrates prepare, commit, and abort.
- `ProofCourtEscrow` locks, releases, and refunds native token escrow.
- `WorkRegistry` stores permits and validates execution payloads.
- `EvidenceRegistry` anchors AXL, KeeperHub, and 0G proof material.
- `AgentReputation` tracks address-based reputation.
- `AgentINFT` stores mutable iNFT reputation and metadata.
- `ProofCourtAccess` provides owner and judge access control.

After deployment, the coordinator is set as judge for the child contracts so only the orchestrator can finalize settlement steps.

Deployment writes the resulting addresses to `deployments/<chainId>.json`, and the UI reads them from environment variables for status and settlement.

## Sponsor integrations

ProofCourt integrates three live sponsor rails:

- AXL for agent-to-agent messaging and transcript hashing
- KeeperHub for workflow execution and settlement receipts
- 0G for storage, compute, chain anchoring, and reputation streams

The adapters in `server/adapters/` do not fabricate real sponsor receipts. If required configuration is missing, the related path reports a non-configured state or throws instead of pretending the integration succeeded.

## Demo flows

- Honest worker path: valid work passes quorum, releases escrow, and updates reputation
- Fraud path: invalid output is detected, escrow is blocked or refunded, and reputation is penalized
- Resilience path: quorum still resolves when one verifier is unavailable
- SDK path: a minimal script creates a case, submits work, and waits for verdict

## Further reading

- [`docs/quickstart.md`](docs/quickstart.md)
- [`docs/architecture.md`](docs/architecture.md)
- [`docs/sponsor-integrations.md`](docs/sponsor-integrations.md)
- [`examples/`](examples/)

```bash
# Run honest worker demo
npm run demo:honest

# Run fraud worker demo
npm run demo:cheat

# Run full interactive demo
npm run demo:run
```

---

## Quick Start

### Prerequisites

- **Node.js 22+**
- **Go 1.21+** (for AXL binary build — pre-built binary included in `bin/`)
- 0G Galileo testnet OG tokens ([faucet](https://faucet.0g.ai))

### 1. Install & Configure

```bash
# Clone and install
git clone https://github.com/your-org/proofcourt.git
cd proofcourt
npm install

# Configure environment
cp .env.example .env
# Edit .env with your keys (see Configuration section below)
```

### 2. Deploy Contracts

```bash
# Compile Solidity contracts (uses solc 0.8.34)
npm run contracts:compile

# Deploy to 0G Galileo testnet
npm run contracts:deploy
# → Prints contract addresses — copy them to .env
```

### 3. Start All Services

```bash
# Start everything in one terminal
npm run dev:full
# Opens:
#   API server    → http://localhost:8787
#   Frontend      → http://localhost:3000
#   MCP server    → http://localhost:8788/mcp

# (Optional) Start AXL mesh in a separate terminal
npm run axl:local
# Starts 5 nodes: :9002 :9012 :9022 :9032 :9042
```

### 4. Run a Demo

Open http://localhost:3000, enter a mandate like `"Send 0.01 OG to vault"`, and watch the two-phase protocol execute live.

### Docker

```bash
docker compose up --build
```

Starts AXL cluster, API, Vite UI, and MCP transport. Settlement still requires 0G Galileo contract addresses and signer env.

---

## Configuration

### Required Environment Variables

```env
# ═══════════════════════════════════════════
# 0G CHAIN (Galileo Testnet)
# ═══════════════════════════════════════════
RPC_URL="https://evmrpc-testnet.0g.ai"
ZERO_G_RPC_URL="https://evmrpc-testnet.0g.ai"
ZERO_G_PRIVATE_KEY="0x..."                    # Storage/compute signer
PRIVATE_KEY=""                                 # Falls back to ZERO_G_PRIVATE_KEY

# Worker key (separate from deployer for payout security)
EXECUTOR_PRIVATE_KEY="0x..."
EXECUTOR_ADDRESS="0x..."

# Contract addresses (printed by npm run contracts:deploy)
PROOFCOURT_ESCROW_ADDRESS="0x..."
WORK_REGISTRY_ADDRESS="0x..."
EVIDENCE_REGISTRY_ADDRESS="0x..."
AGENT_REPUTATION_ADDRESS="0x..."
AGENT_INFT_ADDRESS="0x..."
PROOFCOURT_COORDINATOR_ADDRESS="0x..."

# AgentDNS token IDs (REQUIRED — set to minted iNFT IDs after deploy)
AGENT_DNS_TOKEN_IDS="1,2,3,4,5"
AGENT_DNS_ROLES="Requester,Worker,Verifier,Verifier,Verifier"

# ═══════════════════════════════════════════
# 0G COMPUTE (Verifier Inference)
# ═══════════════════════════════════════════
ZERO_G_PROVIDER_ADDRESS="0x..."               # Provider from 0G Compute marketplace
ZERO_G_PROVIDER_MODEL="qwen/qwen-2.5-7b-instruct"

# ═══════════════════════════════════════════
# KEEPERHUB (Workflow Execution)
# ═══════════════════════════════════════════
KEEPERHUB_API_KEY="kh_..."                    # Org-scoped key for status polling
KEEPERHUB_TRIAL_KEY="wfb_..."                 # Webhook key: proof-trial workflow
KEEPERHUB_EXECUTE_KEY="wfb_..."               # Webhook key: execute-mandate workflow
KEEPERHUB_SETTLE_KEY="wfb_..."                # Webhook key: settlement workflow
KEEPERHUB_TRIAL_WORKFLOW_ID="..."
KEEPERHUB_EXECUTE_WORKFLOW_ID="..."
KEEPERHUB_SETTLEMENT_WORKFLOW_ID="..."

# ═══════════════════════════════════════════
# GENSYN AXL (Agent Mesh)
# ═══════════════════════════════════════════
AXL_REQUESTER_NODE_URL="http://127.0.0.1:9002"
AXL_WORKER_NODE_URL="http://127.0.0.1:9012"
AXL_VERIFIER_1_NODE_URL="http://127.0.0.1:9022"
AXL_VERIFIER_2_NODE_URL="http://127.0.0.1:9032"
AXL_VERIFIER_3_NODE_URL="http://127.0.0.1:9042"
```

> **⚠️ Critical:** `AGENT_DNS_TOKEN_IDS` **must** be set after contract deployment. Without it, Phase 1 bootstrap fails immediately.

---

## MCP Integration

ProofCourt exposes an MCP server for Claude, GPT-4, or any MCP-compatible agent:

### HTTP Transport

```bash
claude mcp add --transport http proofcourt http://localhost:8788/mcp
```

### Stdio Transport

```json
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

### Available Tools

| Tool | Description |
|------|-------------|
| `proofcourt.createCase` | Create a new case from a mandate |
| `proofcourt.submitWork` | Submit work output for verification |
| `proofcourt.getCase` | Get full case state and evidence |
| `proofcourt.getReputation` | Query agent trust score and history |
| `proofcourt.replayCase` | Replay a case from 0G evidence roots |
| `proofcourt.settleCase` | Manually trigger settlement |

---

## CLI

```bash
# Create a new case
npm run proofcourt -- create --title "Audit this contract"

# Submit work
npm run proofcourt -- submit --case-id run_... --output-hash 0x...

# Watch case progress
npm run proofcourt -- watch --case-id run_...
```

`packages/adapters` provides thin SDK wrappers for LangChain tools, Eliza actions, and OpenClaw tool registration.

---

## Repository Structure

```
ProofCourt/
├── contracts/                     # 7 Solidity contracts (0G Galileo)
│   ├── ProofCourtCoordinator.sol  # Central orchestrator (prepare/commit/abort)
│   ├── ProofCourtEscrow.sol       # Reentrancy-safe native token escrow
│   ├── WorkRegistry.sol           # Permit-gated action validation
│   ├── EvidenceRegistry.sol       # On-chain evidence anchoring
│   ├── AgentReputation.sol        # Address-based trust scoring
│   ├── AgentINFT.sol              # ERC-7857 iNFT agents with mutable reputation
│   └── ProofCourtAccess.sol       # Base access control (owner + judge)
│
├── server/                        # Express API server (:8787)
│   ├── index.ts                   # API routes + bootstrap logic
│   ├── adapters/
│   │   ├── axlAdapter.ts          # Gensyn AXL P2P mesh integration
│   │   ├── keeperHubAdapter.ts    # KeeperHub webhook + x402 payment
│   │   ├── zeroGAdapter.ts        # 0G Storage SDK integration
│   │   ├── zeroGComputeAdapter.ts # 0G Compute verifier inference
│   │   ├── zeroGKvAdapter.ts      # 0G KV reputation stream
│   │   ├── contractRegistry.ts    # On-chain contract helpers
│   │   └── hash.ts                # Deterministic hashing
│   └── services/
│       ├── integratedRun.ts       # Core state machine + integrations
│       ├── phaseOneProtocol.ts    # AgentDNS + AgentSLA + 0G upload
│       ├── settlementService.ts   # On-chain prepare/commit/abort
│       ├── trustScore.ts          # Trust score calculation
│       └── keeperHubMcpClient.ts  # Runtime KeeperHub MCP workflows
│
├── src/                           # React 19 frontend (Vite)
│   ├── components/
│   │   ├── IntentInput.tsx        # Mandate input with NLP parsing
│   │   ├── AgentRegistry.tsx      # iNFT agent cards with reputation
│   │   ├── WorkflowCanvas.tsx     # Visual protocol pipeline
│   │   ├── CommitTimeline.tsx     # Step-by-step execution timeline
│   │   ├── SponsorProofPanels.tsx # AXL / 0G / KeeperHub evidence panels
│   │   ├── PayoutStatusCard.tsx   # Escrow status and settlement
│   │   ├── FinalProofSummary.tsx  # Verification receipt display
│   │   ├── TamperTestPanel.tsx    # Tamper simulation controls
│   │   ├── CourthouseGallery.tsx   # Public case gallery
│   │   └── WalletPanel.tsx        # MetaMask/WalletConnect integration
│   ├── domain/proofcourt.ts       # Domain types + state machine
│   ├── api/proofcourtClient.ts    # Frontend API client
│   └── web3/                      # wagmi/RainbowKit config
│
├── packages/
│   ├── sdk/                       # @proofcourt/sdk (5-line integration)
│   ├── mcp-server/                # MCP server (stdio + HTTP transport)
│   ├── cli/                       # CLI tool
│   ├── adapters/                  # LangChain / Eliza / OpenClaw wrappers
│   └── agents/                    # Demo worker agents (honest + cheat)
│
├── scripts/
│   ├── compile-contracts.mjs      # Compile with solc 0.8.34
│   ├── deploy-contracts.mjs       # Deploy + mint 5 iNFTs + wire contracts
│   ├── setup-axl.sh               # Build AXL binary + generate keypairs
│   ├── axl-local-cluster.mjs      # Start 5 AXL nodes
│   ├── dev-full.mjs               # Orchestrate all services
│   └── demo-run.mjs               # Automated demo script
│
├── examples/
│   ├── 01-five-line-integration/  # Minimal SDK example
│   └── 02-cheat-mode-worker/      # Adversarial worker demo
│
├── axl-data/                      # Per-role AXL configs + Ed25519 keys
├── bin/axl                        # Pre-built AXL binary
├── deployments/16602.json         # Deployed contract addresses
├── docs/                          # Architecture + sponsor docs
└── docker-compose.yml             # Full-stack Docker setup
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Chain** | 0G Galileo (EVM, chain 16602) |
| **Smart Contracts** | Solidity ^0.8.24 (solc 0.8.34 with viaIR) |
| **Token Standard** | ERC-7857 (Intelligent NFT) + EIP-2981 royalties |
| **Agent Mesh** | Gensyn AXL (Go binary, Ed25519, A2A/MCP envelopes) |
| **Storage** | 0G Storage SDK (`@0gfoundation/0g-ts-sdk`) |
| **Compute** | 0G Compute (`@0gfoundation/0g-compute-ts-sdk`) |
| **Execution** | KeeperHub (webhook + x402 + MCP runtime workflows) |
| **Backend** | Express 4 + TypeScript (Node.js 22) |
| **Frontend** | React 19 + Vite 6 + Tailwind CSS 4 + Framer Motion |
| **Wallet** | RainbowKit 2 + wagmi 2 + viem 2 |
| **MCP** | `@modelcontextprotocol/sdk` (stdio + HTTP transport) |

---

## Why ProofCourt Wins

| # | Reason |
|---|--------|
| 1 | **Real infrastructure** — browser-funded 0G Galileo escrow, real AXL binary, real 0G SDK, real KeeperHub webhooks. Nothing simulated. |
| 2 | **5-line integration** — any OpenAgents project can fork this in minutes with the SDK. |
| 3 | **Judge-readable** — one sentence pitch + live demo that runs on a laptop. |
| 4 | **Byzantine tolerance** — 3-verifier quorum survives a downed node (2/3 threshold). |
| 5 | **Immutable audit trail** — replay any case from 0G evidence roots, forever. |
| 6 | **All 3 sponsor stacks** — native integration, not shallow API wrappers. |
| 7 | **Security-first** — reentrancy guards, CEI pattern, dual reputation sync, fail-closed design. |

---

## Known Limitations

| Limitation | Detail |
|-----------|--------|
| **LLM-TEE** | `@0glabs/0g-serving-broker` returns validity boolean, not raw TEE enclave quote. `chatID` serves as attestation handle. Documented as upcoming SDK feature. |
| **In-Memory State** | Runs stored in Node.js `Map`. Persisted to `.proofcourt/` directory on disk, but a server crash during write could lose a single run. |
| **Testnet Only** | All contracts deployed on 0G Galileo testnet. Mainnet deployment requires security audit. |

---

## Contributing

```bash
# Run type checks
npm run lint

# Compile contracts after edits
npm run contracts:compile

# Start development
npm run dev:full
```

---

## License

MIT — fork freely.

---

<p align="center">
  <strong>Built for ETHGlobal OpenAgents 2026</strong><br/>
  Tracks: Gensyn AXL · 0G · KeeperHub
</p>
