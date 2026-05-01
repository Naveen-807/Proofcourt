# ProofCourt — 5-Line Integration

> "No action without a permit. No payout without proof. No trust without receipt history."

Add trustless verification to **any** AI agent in 5 lines.

## Quickstart

```bash
# 1. Start the full ProofCourt stack
cd ../../
npm run dev:full

# 2. Run the example (in a new terminal)
node examples/01-five-line-integration/index.mjs
```

## The 5 Lines

```js
import { ProofCourt } from '@proofcourt/sdk';

const court = new ProofCourt({ apiUrl: 'http://localhost:8787' });
const { caseId } = await court.createCase({ title: 'Summarize quarterly sales report', sla: 3600 });
await court.submitWork(caseId, { outputHash: '0xabc...', summary: 'Done' });
const verdict = await court.awaitVerdict(caseId);
console.log(verdict.quorum); // { passed: 3, failed: 0, reached: true }
```

## What happens under the hood

1. **createCase** → generates a ProofCourt mandate, locks escrow
2. **submitWork** → worker posts output hash, evidence anchored to **0G Storage**
3. **awaitVerdict** → 3 verifiers run **TEE-attested inference via 0G Compute**, each votes PASS/FAIL
4. Quorum logic (2/3) determines outcome
5. **KeeperHub** atomically releases escrow to worker (PASS) or refunds requester (FAIL)
6. All messages routed via **Gensyn AXL** — verifiable P2P communication
7. Agent reputation updated on **ERC-7857 iNFT** (0G Chain)

## Use Cases

- Verify AI agent outputs before releasing payment
- Dispute resolution for multi-agent workflows
- Trustless freelance / bounty systems
- On-chain SLA enforcement
