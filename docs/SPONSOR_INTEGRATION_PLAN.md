# ProofCourt Sponsor Integration Plan

This is the active integration contract for the three-sponsor ProofCourt build: Gensyn AXL, KeeperHub, and 0G.

## Gensyn AXL

Purpose: separate-node agent communication and audit transcript.

Backend adapter:

- `server/adapters/axlAdapter.ts`
- Env: `AXL_OWNER_NODE_URL`, `AXL_SPECIALIST_NODE_URL`, `AXL_EXECUTOR_NODE_URL`, `AXL_JUDGE_NODE_URL`
- Status: `GET /api/integrations/status`

ProofCourt usage:

1. Owner sends the mandate to the specialist over MCP.
2. Specialist returns analysis over A2A.
3. Judge issues permit and proof requirements over MCP.
4. Executor submits readiness and execution receipt over A2A.
5. Backend hashes the exact transcript shown in UI and includes it in the 0G Case File.

Demo proof:

- Show four node IDs, peer counts, envelope types, message IDs, payload hashes, and transcript hash.
- Local harness: `npm run axl:local` starts roles on ports `3001`-`3004`.

## KeeperHub

Purpose: approved execution rail and workflow receipts.

Backend adapter:

- `server/adapters/keeperHubAdapter.ts`
- Env: `KEEPERHUB_API_URL`, `KEEPERHUB_API_KEY`
- Phase workflow IDs: `KEEPERHUB_TRIAL_WORKFLOW_ID`, `KEEPERHUB_EXECUTE_WORKFLOW_ID`, `KEEPERHUB_SETTLEMENT_WORKFLOW_ID`
- Fallback workflow ID: `KEEPERHUB_WORKFLOW_ID`
- Status: `GET /api/integrations/status`

ProofCourt usage:

1. Proof trial runs a tiny pre-execution workflow after the permit and escrow prepare phase.
2. Execute mandate runs the approved user action only after permit gating.
3. Atomic settlement records the settlement workflow after verification passes.
4. Each receipt is normalized into execution ID, tx hash, logs, log hash, retry count, and status.
5. `VerificationReceipt` uses the execute-mandate receipt as the core execution proof.

Demo proof:

- Show phase receipts for proof trial, execute mandate, and atomic settlement.
- Show `keeperHubReceiptHash` and phase log hashes inside the 0G evidence panel.
- Keep `FEEDBACK.md` focused only on KeeperHub DX friction.

## 0G

Purpose: replayable evidence, compute verdicts, onchain reputation, and iNFT metadata.

Backend adapters:

- Storage: `server/adapters/zeroGAdapter.ts`
- Compute: `server/adapters/zeroGComputeAdapter.ts`
- Env: `ZERO_G_INDEXER_RPC`, `ZERO_G_RPC_URL`, `ZERO_G_PRIVATE_KEY`, optional `ZERO_G_COMPUTE_URL`
- Status: `GET /api/integrations/status`

ProofCourt usage:

1. Canonical Case File includes `caseId`, `mandateHash`, `axlTranscriptHash`, `trial`, `execution`, `verdict`, and `settlement`.
2. 0G Compute produces compliant/reason/confidence/model/verdict hash/attestation metadata.
3. Evidence root and verdict hash are committed on 0G Chain when live env is configured.
4. Agent iNFTs expose metadata and intelligence pointers that resolve to 0G resources.
5. Replay reconstructs trust score from stored evidence history.

Demo proof:

- Show 0G evidence root, bundle hash, storage tx, compute verdict, attestation hash, and verdict tx.
- Run tamper test: modified evidence fails verification and payout is blocked.
- Click replay from 0G: the UI reconstructs the case and proves reputation is receipt-backed.

## Onchain Mapping

- `ProofCourtEscrow`: payout locked before execution and released only after proof.
- `WorkRegistry`: permit and protected action validation.
- `EvidenceRegistry`: AXL, KeeperHub, 0G proof hashes, and compute verdict hash.
- `AgentReputation`: trust score backed by latest evidence root.
- `AgentINFT`: agent metadata and intelligence pointers.
- `ProofCourtCoordinator`: prepare/commit/abort flow for the judge agent.

## Trust Score Formula

- Passed proof: `+3`, minus one point per KeeperHub retry up to 3.
- Failed or tampered proof: `-10`.
- Severe failure with blocked payout: `-20`.
- Score is clamped between `0` and `100`.

The AI layer may parse intent, but verification and reputation are computed from transcript, workflow, storage, compute, and chain receipts.
