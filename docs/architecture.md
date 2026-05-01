# ProofCourt — Architecture

## Overview

ProofCourt is a **trust layer** — middleware that sits between task requester agents and task worker agents. It enforces the contract: *no payout without verified proof*.

## System Diagram

```
Requester Agent                    Worker Agent
     │                                  │
     │  POST /api/workflows/generate    │
     │  POST /api/runs                  │
     │                                  │
     ▼                                  │
[Permit Issued] ──AXL A2A──────────────▶ [Execution]
     │                                  │
     │                    POST /api/runs/:id/work
     │                                  │
     ▼                                  ▼
[Evidence anchored → 0G Storage Log]
     │
     ├──▶ Verifier-1 (AXL :9022) → 0G Compute TEE → PASS/FAIL
     ├──▶ Verifier-2 (AXL :9032) → 0G Compute TEE → PASS/FAIL
     └──▶ Verifier-3 (AXL :9042) → 0G Compute TEE → PASS/FAIL
                    │
                    ▼
              Quorum (2/3)?
            ┌──────┴──────┐
            │ YES          │ NO
            ▼             ▼
      [KeeperHub]    [KeeperHub]
      Pay Worker     Refund Requester
            │             │
            └──────┬──────┘
                   ▼
         [0G Chain: ERC-7857 iNFT reputation update]
         [0G Storage: immutable event log]
```

## State Machine

```
idle
  → workflow_generated
  → agents_selected
  → prepare_running       (AXL permit negotiation)
  → permit_issued
  → payout_locked         (KeeperHub escrow)
  → commit_running        (Worker execution)
  → execution_complete
  → evidence_stored       (0G Storage anchoring)
  → proof_verified        (3-verifier quorum)
  → payout_released       (KeeperHub settlement — PASS path)
  → reputation_updated    (ERC-7857 iNFT update)
     OR
  → payout_blocked        (KeeperHub refund — FAIL path)
     OR
  → tamper_detected       (evidence integrity check failed)
```

## Gensyn AXL Integration

### Binary

The real `gensyn-ai/axl` Go binary is built at `bin/axl`. Each agent role runs its own node:

| Role | Port | Purpose |
|------|------|---------|
| requester | 9002 | Permit issuance, case filing |
| worker | 9012 | Work submission |
| verifier-1 | 9022 | Jury vote 1 |
| verifier-2 | 9032 | Jury vote 2 |
| verifier-3 | 9042 | Jury vote 3 |

### Message routing

- `POST /a2a/{peer_id}` — A2A messages (permit, verdict)
- `POST /mcp/{peer_id}/{service}` — MCP tool calls (e.g. `verifyWork`)
- `GET /topology` — Peer discovery (hex-encoded Ed25519 public key)

### Keypairs

Each node has a unique Ed25519 keypair in `axl-data/{role}/private.pem`.

## 0G Integration

### Storage Log
Evidence capsules (case files, AXL transcripts, work hashes) are anchored immutably via the 0G Storage Log. The root hash is stored on-chain and exposed via the `GET /api/cases` gallery endpoint.

### Compute (TEE)
Verifiers call `@0glabs/0g-serving-broker` to run `qwen-2.5-7b-instruct` in a TEE environment. The broker returns a `chatID` (attestation handle) and signature validity boolean.

> **Note**: SDK v0.4.x returns validity boolean, not raw TEE quote. `chatID` is used as the attestation handle. Full quote extraction is an upcoming SDK feature.

### Chain (Galileo)
Five ERC-7857 iNFTs are minted at deploy time (one per role). Each case's event hashes are anchored via the `verifyAndAnchor` contract call. iNFT metadata is updated after each case.

## KeeperHub Integration

### Pre-built Workflows
Three workflows are pre-configured:
- `proofcourt-trial` — validates the case mandate
- `proofcourt-execute-mandate` — triggers execution window
- `proofcourt-settle` — atomic USDC settlement (pay worker OR refund requester)

### Runtime Workflow Creation
The `keeperHubMcpClient.ts` uses KeeperHub's Streamable HTTP MCP endpoint to create settlement workflows dynamically at runtime via the `create_workflow` MCP tool.

### x402 Payments
`@keeperhub/wallet`'s `paymentSigner.fetch` is used for autonomous x402 USDC payments when executing workflows.

## SDK

`packages/sdk/` provides a typed TypeScript client:

```ts
const court = new ProofCourt({ apiUrl: '...' });
court.createCase()      // POST /api/workflows/generate + /api/runs
court.submitWork()      // POST /api/runs/:id/work
court.awaitVerdict()    // GET /api/runs/:id (polls until terminal state)
court.getAgentReputation() // GET /api/agents/:id/trust
court.replayCase()      // GET /api/runs/:id/replay
court.settleCase()      // POST /api/runs/:id/advance (until settled)
```

## MCP Server

`packages/mcp-server/` exposes the same 6 operations as MCP tools via `@modelcontextprotocol/sdk`. Claude and other MCP-compatible agents can call ProofCourt without any code:

```
User: "Create a case for auditing this smart contract"
Claude → proofcourt.createCase { title: "Audit..." }
→ { caseId: "run_1234" }
```
