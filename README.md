# ProofCourt

A permit-and-proof control plane for autonomous agents.

**No action without a permit. No payout without proof. No trust without receipt history.**

ProofCourt turns a user intent into a multi-agent workflow, selects agents by trust score, runs a two-phase commit state machine, captures AXL/KeeperHub/0G proof artifacts, settles through the ProofCourt contract suite, and recalculates agent reputation from verification receipts.

The hackathon angle is simple: **ProofCourt is the credit score layer for autonomous onchain agents.** Scores are deterministic and receipt-backed, not AI opinions.

## Run Locally

Prerequisite: Node.js 22+.

```bash
npm install
cp .env.example .env.local
npm run dev:full
```

The full local command starts:

- Frontend: `http://localhost:3000`
- Backend API: `http://127.0.0.1:8787`

## Scripts

- `npm run dev` - frontend only
- `npm run api` - ProofCourt API only
- `npm run dev:full` - frontend and API together
- `npm run axl:local` - local four-node AXL harness on ports `3001`-`3004`
- `npm run contracts:compile` - compile Solidity contracts with solc
- `npm run contracts:deploy` - deploy contracts with `RPC_URL` and `PRIVATE_KEY`
- `npm run lint` - TypeScript check
- `npm run build` - production build

## Sponsor Targets

ProofCourt targets exactly three sponsors:

- **Gensyn AXL** - four separate AXL nodes coordinate mandate, specialist analysis, execution receipt, and judge permit messages.
- **KeeperHub** - three workflows run the proof trial, approved execution, and atomic settlement receipt path.
- **0G** - Storage holds replayable Case Files, Compute issues verdict metadata, Chain records evidence/reputation, and `AgentINFT` points agent identity/memory at 0G resources.

No other sponsor integration is part of the active ProofCourt submission scope.

## MVP Architecture

The UI is now backed by a local API and deterministic state machine:

1. User enters an intent, for example `Send 1 ETH every month into my vault`.
2. API generates a mandate, workflow nodes, trusted selected agents, and rejected low-score agents.
3. API creates a ProofCourt run.
4. The run advances through prepare and commit states:
   `agents_selected -> prepare_running -> permit_issued -> payout_locked -> commit_running -> execution_complete -> evidence_stored -> proof_verified -> payout_released -> reputation_updated`.
5. Sponsor proof panels read live run artifacts:
   AXL node/message IDs, payload hashes, transcript hash, KeeperHub execution ID, logs, log hash, tx hash, 0G evidence root, bundle hash, storage tx hash, contract tx hashes, payout status, and agent score updates.
6. `VerificationReceipt` drives the executor trust score. A passed receipt raises the score. A tampered or failed receipt blocks payout and applies a deterministic penalty.
7. `Replay Score From 0G` reconstructs the case from stored evidence so judges can see reputation is replayable from case history.

## API Endpoints

- `GET /api/health`
- `GET /api/integrations/status`
- `POST /api/workflows/generate`
- `POST /api/runs`
- `GET /api/runs/:id`
- `GET /api/runs/:id/replay`
- `POST /api/runs/:id/advance`
- `POST /api/runs/:id/tamper`
- `POST /api/runs/:id/restore`
- `GET /api/agents/:id/trust`

## Contracts

ProofCourt uses a small contract suite instead of one overloaded contract:

- `ProofCourtEscrow.sol` - creates cases, locks payout, releases verified payout, blocks/refunds failed cases.
- `WorkRegistry.sol` - stores permits and validates that protected work matches the approved payload.
- `EvidenceRegistry.sol` - records AXL transcript hash, KeeperHub receipt hash, 0G evidence root, and verification result.
- `AgentReputation.sol` - stores agent trust scores tied to the latest evidence root.
- `ProofCourtCoordinator.sol` - judge-controlled prepare/commit/abort entry point.
- `ProofCourtAccess.sol` - shared owner/judge access control.

Compile:

```bash
npm run contracts:compile
```

Deploy:

```bash
RPC_URL="..." PRIVATE_KEY="..." JUDGE_ADDRESS="..." npm run contracts:deploy
```

## Live Integration Checklist

ProofCourt is real-only. Missing AXL, KeeperHub, 0G, or contract configuration stops the run instead of generating placeholder receipts.

1. For AXL separate-node mode, set `AXL_OWNER_NODE_URL`, `AXL_SPECIALIST_NODE_URL`, `AXL_EXECUTOR_NODE_URL`, and `AXL_JUDGE_NODE_URL`.
2. For KeeperHub, set `KEEPERHUB_API_URL`, `KEEPERHUB_API_KEY`, and the phase workflow IDs:
   `KEEPERHUB_TRIAL_WORKFLOW_ID`, `KEEPERHUB_EXECUTE_WORKFLOW_ID`, and `KEEPERHUB_SETTLEMENT_WORKFLOW_ID`.
   `KEEPERHUB_WORKFLOW_ID` is only a legacy single-workflow override. The adapter tries the current `/workflows/{id}/run` and `/executions/{id}` route family first, then legacy workflow execution routes.
3. For 0G Storage SDK uploads, set `ZERO_G_PRIVATE_KEY`, `ZERO_G_INDEXER_RPC`, and `ZERO_G_RPC_URL`. The server uploads the canonical evidence JSON with `@0gfoundation/0g-ts-sdk` `MemData`.
4. Deploy contracts with `npm run contracts:deploy`, then set the deployed contract addresses in `.env.local`. The deploy script registers the executor in `AgentReputation` before handing judge rights to `ProofCourtCoordinator`.
5. Set `EXECUTOR_PRIVATE_KEY` for executor-submitted `WorkRegistry.submitExecution`.

0G Galileo defaults:

- Chain ID: `16602`
- RPC: `https://evmrpc-testnet.0g.ai`
- Storage indexer: `https://indexer-storage-testnet-turbo.0g.ai`

## Live Proof Surfaces

### AXL Topology

The proof panel shows:

- owner, specialist, executor, and judge node endpoints;
- node IDs and peer counts from `/topology`;
- MCP/A2A envelope type, message ID, payload hash, and transcript hash.

### KeeperHub Workflow IDs

The case file and UI distinguish:

- `proof-trial`: tiny pre-execution transaction that proves the rail works;
- `execute-mandate`: approved user action;
- `atomic-settlement`: payout/reputation settlement receipt.

Each phase records execution ID, tx hash, log hash, retry count, and normalized logs.

### 0G Resources

README deployment notes should be filled before submission:

- 0G Chain ID: `16602`
- `ProofCourtEscrow`: `<fill after deploy>`
- `WorkRegistry`: `<fill after deploy>`
- `EvidenceRegistry`: `<fill after deploy>`
- `AgentReputation`: `<fill after deploy>`
- `AgentINFT`: `<fill after deploy>`
- `ProofCourtCoordinator`: `<fill after deploy>`
- Owner iNFT metadata: `0g://proofcourt/agents/owner.json`
- Specialist iNFT metadata: `0g://proofcourt/agents/specialist.json`
- Judge iNFT metadata: `0g://proofcourt/agents/judge.json`

## 90-Second Demo Script

1. Open with the executor trust score visible: "This is the credit history of an autonomous agent."
2. Start the autonomous run. AXL messages appear across owner, specialist, executor, and judge nodes.
3. Escrow moves to locked and shows the prepare tx hash.
4. KeeperHub proof trial runs first, then the real execution receipt returns run ID, tx hash, retry count, and log hash.
5. 0G stores the Case File root and 0G Compute returns a verdict hash, model/source, confidence, and attestation hash.
6. ProofCourt commits settlement, shows the commit tx hash, releases payout, and increases the executor score from the receipt.
7. Run the tamper test. The 0G root mismatch blocks payout, emits an abort tx, and drops the score.
8. Click `Replay Score From 0G`: "The score is replayed from evidence history, not trusted UI state."

## Submission Checklist

- Public repo with setup instructions and architecture.
- Demo video under three minutes.
- 0G Galileo contract addresses listed above.
- AXL topology with four node IDs visible in the UI or video.
- KeeperHub workflow IDs and execution IDs visible in the UI or video.
- 0G Storage root, 0G Compute verdict, and iNFT metadata pointers visible.
- `FEEDBACK.md` contains KeeperHub-specific builder feedback.
