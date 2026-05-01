# Proofcourt — AGENT.md

## 1) Project Overview
- **What it does**: Proofcourt is a **permit-and-proof control plane** for autonomous onchain agents. A user intent becomes a multi-agent workflow. **No action executes without a permit**, and **no payout happens without verifiable receipts**.
- **Who it’s for**: builders + users who want delegated onchain execution (subscriptions, rebalancing, monitoring) without trusting a single black-box bot.
- **Problem it solves**: autonomous agents can execute funds, but **trust is weak** (screenshots, unverifiable logs, “trust me bro”). Proofcourt makes trust **deterministic and replayable** from evidence.
- **Why it matters (Web3 + agents)**: it’s a **verifiable settlement court** for agents: permit gating, evidence anchoring, and **receipt-backed reputation** instead of LLM opinions.

## 2) Core Product Flow (end-to-end)
1. **User enters goal** (UI): e.g. “Send 1 ETH monthly into my vault.”
2. **Backend generates a workflow**: mandate payload + steps + agent roles.
3. **Agents are selected by trust score**: low-score agents can be rejected deterministically.
4. **Permit/approval enforced**:
   - Judge/permit policy validates mandate and required preconditions.
   - Work is only executable if it matches the approved payload hash.
5. **Execution happens (permit-gated)**:
   - KeeperHub runs real proof-trial, execute-mandate, and atomic-settlement workflows.
6. **Proof/evidence generated**:
   - AXL transcript hash (agent messages)
   - KeeperHub execution logs hash + tx hash (execution rail)
   - 0G evidence root (case file)
7. **Trust score / reputation updated**:
   - VerificationReceipt passes → trust increases.
   - Tamper/fail → payout blocked/refunded + trust slashed.
8. **Replay**:
   - “Replay Score From 0G” reconstructs the case from stored evidence to prove determinism.

## 3) Repository Structure (actual)
- `Proofcourt/src/`: React UI (Vite) + sponsor proof panels and demo UX.
  - Key UI: `src/components/SponsorProofPanels.tsx`, `CommitTimeline.tsx`, `FinalProofSummary.tsx`, `TamperTestPanel.tsx`
- `Proofcourt/server/`: Node backend API (Express) and integrations.
  - Key adapters: `server/adapters/axlAdapter.ts`, `keeperHubAdapter.ts`, `zeroGAdapter.ts`
- `Proofcourt/contracts/`: Solidity contracts (proof gating, escrow, evidence, reputation).
- `Proofcourt/scripts/`: local dev orchestration + contract compile/deploy.
  - `scripts/dev-full.mjs`, `compile-contracts.mjs`, `deploy-contracts.mjs`
- `Proofcourt/research/`: decision logs / hackathon framing.
- `Proofcourt/docs/`: misc docs (if present).
- `Proofcourt/artifacts/`: build artifacts / generated outputs (if present).

## 4) Agent Responsibilities (system roles)
These are **product roles**. The codebase may run them as a single “orchestrator” process, but the responsibilities must remain separable and auditable.

### PlannerAgent
- **Purpose**: translate user intent into a structured mandate + workflow steps.
- **Inputs**: user intent text; available templates; current trust scores.
- **Outputs**: `mandate`, step list, required proofs, expected onchain calls (plan only).
- **Tools used**: local workflow generator endpoints; AXL (to request specialist plans).
- **Safety limits**:
  - Must not execute transactions.
  - Must not fabricate “checks passed”.
- **Must never do**:
  - Create a mandate that bypasses permit checks.

### RiskComplianceAgent
- **Purpose**: preflight risk checks (value limits, token allowlists, replay safety).
- **Inputs**: mandate + chain + contract addresses + estimated value.
- **Outputs**: allow/deny + risk report + required user approvals.
- **Tools used**: chain RPC reads; contract ABIs; simulation.
- **Safety limits**: deny by default when chain/contract/method is unknown.
- **Must never do**: approve spending without a visible permit requirement.

### ExecutorAgent
- **Purpose**: execute only **permit-approved** work on the execution rail.
- **Inputs**: signed permit; payload hash; chain/contract/method/value; gas constraints.
- **Outputs**: tx hash + execution receipt reference.
- **Tools used**: KeeperHub workflow execution; RPC writes (only via approved rail).
- **Safety limits**:
  - Must verify permit matches payload hash.
  - Must simulate/estimate gas before sending.
- **Must never do**:
  - Spend funds when the permit is missing, expired, or mismatched.

### ProofVerifierAgent
- **Purpose**: verify evidence bundle integrity and block settlement on mismatch.
- **Inputs**: AXL transcript hash; KeeperHub log hash; 0G root; onchain events.
- **Outputs**: `VerificationReceipt` (pass/fail) + reason + hashes.
- **Tools used**: `EvidenceRegistry` reads/writes; 0G retrieval; local hashing.
- **Safety limits**: fail closed if any component is missing.
- **Must never do**: accept unverifiable proofs or “best guess” verdicts as truth.

### ReputationAgent
- **Purpose**: update trust deterministically from receipts and case outcomes.
- **Inputs**: verified receipt + case outcome.
- **Outputs**: updated trust score; explanation; replay pointer (0G root).
- **Tools used**: `AgentReputation` contract; backend run state machine.
- **Safety limits**: ensure score updates are tied to evidence root.
- **Must never do**: modify trust without an evidence-backed receipt.

### SettlementPaymentAgent
- **Purpose**: coordinate escrow lock/release/refund via coordinator rules.
- **Inputs**: verification result; escrow state; payout params.
- **Outputs**: settlement tx hash + payout status.
- **Tools used**: `ProofCourtEscrow` / `ProofCourtCoordinator`.
- **Safety limits**: release only on verified success.
- **Must never do**: release funds on “partial proof” or missing receipts.

## 5) Web3 Rules (strict)
- **Never send a transaction without an explicit permit**.
- **Always show before executing**:
  - chain/network, contract address, method, params summary, value, gas estimate, risk flags.
- **Always simulate/validate first** (or fail closed).
- **Always store evidence**: AXL transcript hash, KeeperHub log hash, 0G root, tx hashes.
- **Never expose private keys** (no logs, no commits, no screenshots in repo).
- **Never hardcode secrets**; use environment variables only.
- **No demo mode**: missing live configuration must fail closed instead of fabricating receipts.

## 6) Smart Contract Guidelines
- **Permissioning**: explicit role checks for judge/coordinator/executor.
- **Events**: emit events for every critical transition:
  - case created, permit issued, escrow locked, execution recorded, evidence recorded, settlement complete, reputation updated.
- **Minimal trusted assumptions**:
  - contracts must be able to reject settlement if proofs are missing/mismatched.
- **Reentrancy**: apply protections where external calls or payouts occur.
- **Determinism**: trust updates must be derived from receipts + evidence root.
- **Deployment scripts**: keep `scripts/deploy-contracts.mjs` idempotent and output addresses to env.

## 7) Sponsor Integration Guidelines (AXL, KeeperHub, 0G)

### Gensyn AXL
- **Why**: proves real **agent-to-agent** coordination with visible transcripts and hashes.
- **Where it fits**: mandate negotiation + specialist evidence + judge permit messages.
- **Files**:
  - Integration: `server/adapters/axlAdapter.ts`
  - UI proof: `src/components/SponsorProofPanels.tsx`
  - Dev: `package.json` scripts `axl:*` (local cluster)
- **Demo moment**:
  - Live transcript shows **multiple node roles** (owner/specialist/judge) and payload hashes that match the case file.

### KeeperHub
- **Why**: reliable execution rail for permit-gated onchain actions + logs/receipts.
- **Where it fits**: executes the approved action and returns execution ID/logs/tx hash.
- **Files**:
  - Integration: `server/adapters/keeperHubAdapter.ts`
  - Feedback bounty: `FEEDBACK.md`
- **Demo moment**:
  - Show KeeperHub execution ID + logs + tx hash; proof panel displays normalized log hash.

### 0G (Storage + Chain; optional Compute)
- **Why**: verifiable case files (DA) + onchain anchoring + replayable evidence pointers.
- **Where it fits**: store canonical evidence bundle → root hash; commit outcome pointers.
- **Files**:
  - Integration: `server/adapters/zeroGAdapter.ts`
  - Contracts deployed to 0G: `contracts/*.sol`, deploy via `scripts/deploy-contracts.mjs`
- **Demo moment**:
  - Show 0G evidence `root` + `txHash`, then replay the run from stored evidence.

## 8) AI Agent Safety Rules
- **No autonomous spending without permit** (hard rule).
- **No fake proof**: agents must not claim a tx/log/root exists unless the system has it.
- **No hidden execution**: every execution must have a visible receipt trail in UI/API.
- **No pretending**: integrations must not fall back to simulated mode.
- **Log every decision**: mandate → permit → execution → verification → settlement.
- **Explainability**: every verdict must include hashes/inputs that can be rechecked.

## 9) Development Commands (repo-canonical)

```bash
# install
npm install

# env
cp .env.example .env.local

# run full stack (UI + API)
npm run dev:full

# UI only / API only
npm run dev
npm run api

# typecheck
npm run lint

# contracts
npm run contracts:compile
RPC_URL="..." PRIVATE_KEY="..." JUDGE_ADDRESS="..." npm run contracts:deploy

# local AXL cluster (optional)
npm run axl:local
```

## 10) Environment Variables (expected; no real secrets)
Use `.env.example` as the template. Common keys:
- **App**: `VITE_PROOFCOURT_API_URL`, `PROOFCOURT_API_HOST`, `PROOFCOURT_API_PORT`
- **AXL**: `AXL_NODE_URL`, `AXL_OWNER_NODE_URL`, `AXL_SPECIALIST_NODE_URL`, `AXL_EXECUTOR_NODE_URL`, `AXL_JUDGE_NODE_URL`
- **KeeperHub**: `KEEPERHUB_API_URL`, `KEEPERHUB_API_KEY`, `KEEPERHUB_TRIAL_WORKFLOW_ID`, `KEEPERHUB_EXECUTE_WORKFLOW_ID`, `KEEPERHUB_SETTLEMENT_WORKFLOW_ID`
- **0G**: `ZERO_G_INDEXER_RPC`, `ZERO_G_RPC_URL`, `ZERO_G_PRIVATE_KEY`, `ZERO_G_API_KEY`, `ZERO_G_STORAGE_URL`
- **Deploy**: `RPC_URL`, `PRIVATE_KEY`, `EXECUTOR_PRIVATE_KEY`, `EXECUTOR_ADDRESS`, `JUDGE_ADDRESS`
- **Contracts**: `PROOFCOURT_ESCROW_ADDRESS`, `WORK_REGISTRY_ADDRESS`, `EVIDENCE_REGISTRY_ADDRESS`, `AGENT_REPUTATION_ADDRESS`, `PROOFCOURT_COORDINATOR_ADDRESS`

## 11) Testing Strategy (what to add / maintain)
- **Smart contracts**:
  - Permit mismatch → execution rejected
  - Payout locked/released/refunded correctness
  - Evidence recording + replay pointers
  - Reputation update only on verified receipt
- **Backend APIs**:
  - Run state machine transitions
  - Missing adapter configuration fails closed with actionable errors
  - Evidence bundle hashing stable across runs
- **Agent logic**:
  - Planner outputs deterministic mandate schema
  - Risk agent denies unknown chain/contract/method
- **Workflow execution**:
  - KeeperHub execution result normalization stable
- **Permission system**:
  - Judge-only actions protected (coordinator/escrow)
- **Proof verification**:
  - Tamper test forces fail-closed behavior
- **Sponsor integrations**:
  - AXL transcript retrieval and hashing
  - KeeperHub logs and tx hash extraction
  - 0G SDK upload returns root/txHash (when configured)

## 12) Demo Requirements (hackathon checklist)
- One clear user goal entered in UI.
- Visual workflow timeline of states:
  `agents_selected → prepare_running → permit_issued → payout_locked → commit_running → execution_complete → evidence_stored → proof_verified → payout_released → reputation_updated`
- Visible agent-to-agent coordination (AXL transcript panel).
- Explicit permit approval moment (judge permit issuance).
- Real onchain execution through KeeperHub receipt + tx hash.
- Proof generated and displayed (hashes + logs + 0G root).
- Evidence stored (0G root + tx hash) and replay works.
- Trust score updates on success; tamper test slashes score and blocks payout.

## 13) Coding Style
- Prefer simple, readable code and small functions.
- Name things after the protocol (permit, receipt, evidence root, transcript hash).
- Comments only for non-obvious constraints (e.g., “fail closed if missing proof”).
- Avoid over-engineered abstractions; prioritize demo reliability.

## 14) Forbidden Actions
- Do not add fake integrations or “API calls for decoration.”
- Do not bypass permit checks in contracts or adapters.
- Do not commit secrets (`.env*`, keys, tokens).
- Do not claim evidence exists if it is missing.
- Do not expand sponsor scope beyond **AXL + KeeperHub + 0G**.
- Do not add demo-mode fallback paths.

## 15) Final Goal
This repo must feel like a **real trust and settlement layer for autonomous Web3 agents**—not a chatbot with a wallet.
