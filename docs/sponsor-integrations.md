# ProofCourt — Sponsor Integration Details

## Gensyn AXL

### What we use
- **Real binary** (`bin/axl`) compiled from [gensyn-ai/axl](https://github.com/gensyn-ai/axl) Go source
- **5 distinct nodes** (one per agent role), each with unique Ed25519 keypair
- **A2A messaging** via `POST /a2a/{peer_id}` — JSON-RPC body, hex-encoded peer ID
- **MCP tool calls** via `POST /mcp/{peer_id}/{service}`
- **Peer discovery** via `GET /topology`

### Key files
- `scripts/setup-axl.sh` — clones, builds, generates 5 keypairs + node configs
- `scripts/axl-local-cluster.mjs` — spawns all 5 nodes
- `server/adapters/axlAdapter.ts` — routes messages by role
- `axl-data/{role}/node-config.json` — per-role config
- `axl-data/{role}/private.pem` — Ed25519 private key

### Judge validation
```bash
npm run axl:local
curl http://localhost:9002/topology  # requester peer ID
curl http://localhost:9022/topology  # verifier-1 peer ID
```

---

## 0G

### 0G Storage Log
Evidence capsules (JSON: case ID, AXL transcript hash, permit hash, work hash) are uploaded to the 0G Storage Log. The returned root hash is stored in `ProofCourtRun.zeroGStorageRoot`.

**Key file:** `server/adapters/zeroGAdapter.ts`

### 0G Compute
Three verifiers call `@0glabs/0g-serving-broker` to run `qwen-2.5-7b-instruct` in a TEE environment. Each verifier receives an attestation handle (`chatID`) from the broker.

**Key file:** `server/adapters/zeroGComputeAdapter.ts`

**Limitation (documented):** SDK v0.4.x returns `signatureValid: boolean` rather than a raw TEE quote. The `chatID` is used as the attestation handle. Full enclave quote extraction is an upcoming feature in the 0G serving broker.

### 0G Chain (Galileo)
- Five ERC-7857 iNFTs minted at deploy time (requester, worker, verifier-1/2/3)
- Case event hashes anchored via `verifyAndAnchor()` contract call
- Block explorer: https://chainscan-galileo.0g.ai

**Key file:** `scripts/deploy-contracts.mjs`

### Judge validation
```bash
# Deploy (requires ZERO_G_RPC_URL + ZERO_G_PRIVATE_KEY in .env.local)
npm run contracts:deploy

# Integration status
curl http://localhost:8787/api/integrations/status
```

---

## KeeperHub

### Pre-built workflows
Three workflows are configured in `.env.local`:
- `KEEPERHUB_TRIAL_WORKFLOW_ID` + `KEEPERHUB_TRIAL_KEY` (wfb_...)
- `KEEPERHUB_EXECUTE_WORKFLOW_ID` + `KEEPERHUB_EXECUTE_KEY` (wfb_...)
- `KEEPERHUB_SETTLE_WORKFLOW_ID` + `KEEPERHUB_SETTLE_KEY` (wfb_...)

Execution via `POST /api/workflows/{id}/webhook` with phase-specific `wfb_` keys.

### Runtime workflow creation (MCP)
`server/services/keeperHubMcpClient.ts` uses KeeperHub's Streamable HTTP MCP endpoint to **create settlement workflows at runtime** — no pre-configuration needed.

```ts
const wf = await buildProofCourtSettlementWorkflow(caseId);
// Returns { workflowId, webhookKey } — immediately executable
```

### x402 Payments
`@keeperhub/wallet`'s `paymentSigner.fetch` wraps every workflow execution call, automatically handling x402 USDC payment challenges.

**Key files:**
- `server/adapters/keeperHubAdapter.ts` — webhook execution
- `server/services/keeperHubMcpClient.ts` — MCP workflow creation

### Judge validation
```bash
curl -X POST http://localhost:8787/api/runs/{id}/advance
# Watch keeperHubReceipt populate in the response
```

### Friction feedback (FEEDBACK.md)
See [`FEEDBACK.md`](../FEEDBACK.md) for substantive integration feedback.

---

## Integration Status API

All sponsor integration statuses are exposed at runtime:

```bash
curl http://localhost:8787/api/integrations/status
```

Returns:
```json
{
  "axl": { "online": true, "mode": "live", "nodes": 5 },
  "zeroG": { "online": true, "mode": "mock" },
  "zeroGCompute": { "online": true, "mode": "live" },
  "keeperHub": { "online": false, "mode": "mock" }
}
```

`"mode": "mock"` when credentials are not configured. All flows still work end-to-end.
