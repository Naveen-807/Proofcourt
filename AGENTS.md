# Agent Instructions (Proofcourt)

## Package Manager
- Use **npm**: `npm install`

## Dev Commands
- **Full stack**: `npm run dev:full` (UI `:3000`, API `:8787`)
- **UI only**: `npm run dev`
- **API only**: `npm run api`
- **Typecheck**: `npm run lint`

## Contracts
- **Compile**: `npm run contracts:compile`
- **Deploy**: `RPC_URL="..." PRIVATE_KEY="..." JUDGE_ADDRESS="..." npm run contracts:deploy`
- Sources: `Proofcourt/contracts/` (`ProofCourtEscrow.sol`, `WorkRegistry.sol`, `EvidenceRegistry.sol`, `AgentReputation.sol`, `ProofCourtCoordinator.sol`, `ProofCourtAccess.sol`)

## Integrations (3 sponsors only)
- **AXL (Gensyn)**: `Proofcourt/server/adapters/axlAdapter.ts`
- **KeeperHub**: `Proofcourt/server/adapters/keeperHubAdapter.ts`
- **0G Storage/Chain**: `Proofcourt/server/adapters/zeroGAdapter.ts`

## Real-Only Runtime
- `.env.local` controls runtime; base template is `.env.example`.
- Missing sponsor rails fail the run instead of fabricating receipts.
- Configure:
  - **AXL**: `AXL_OWNER_NODE_URL`, `AXL_SPECIALIST_NODE_URL`, `AXL_EXECUTOR_NODE_URL`, `AXL_JUDGE_NODE_URL` (or `AXL_NODE_URL` single-node)
  - **KeeperHub**: `KEEPERHUB_API_URL`, `KEEPERHUB_API_KEY`, `KEEPERHUB_TRIAL_WORKFLOW_ID`, `KEEPERHUB_EXECUTE_WORKFLOW_ID`, `KEEPERHUB_SETTLEMENT_WORKFLOW_ID`
  - **0G**: `ZERO_G_PRIVATE_KEY`, `ZERO_G_INDEXER_RPC`, `ZERO_G_RPC_URL`
  - **Deployed addresses**: `PROOFCOURT_ESCROW_ADDRESS`, `WORK_REGISTRY_ADDRESS`, `EVIDENCE_REGISTRY_ADDRESS`, `AGENT_REPUTATION_ADDRESS`, `PROOFCOURT_COORDINATOR_ADDRESS`

## Where to Change Things
- **State machine + API routes**: `Proofcourt/server/index.ts` (see endpoints list in `Proofcourt/README.md`)
- **Sponsor proof UI**: `Proofcourt/src/components/SponsorProofPanels.tsx`
- **Run timeline UI**: `Proofcourt/src/components/CommitTimeline.tsx`, `FinalProofSummary.tsx`

## Constraints (hackathon-critical)
- Keep scope aligned to **AXL + KeeperHub + 0G**. Do not add other sponsor integrations.
- Do not add simulated sponsor fallbacks. Missing live config should fail closed.
- Avoid committing secrets (keys in `.env*`).

## Commit Attribution
- If you create commits, include:
  - `Co-Authored-By: GPT-5.2 <noreply@openai.com>`
