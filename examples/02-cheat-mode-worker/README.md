# ProofCourt — Cheat-Mode Worker (Fraud Detection)

## Demo Scenario 2: Fraud Detection

A malicious worker submits a **fake output hash**, hoping to claim escrow without doing real work.

ProofCourt's 3-verifier jury (powered by **0G Compute TEE attestation**) detects the mismatch and:
1. Returns FAIL verdict from all 3 verifiers
2. Quorum 0/3 → refund triggered
3. **KeeperHub** atomically refunds escrow to requester
4. Fraud attempt recorded in **0G Storage** (immutable)
5. Worker's **ERC-7857 iNFT reputation** decremented

## Run

```bash
# Start the stack first
npm run dev:full

# In a new terminal:
node examples/02-cheat-mode-worker/index.mjs
```

## Expected Output

```
🔴 CHEAT MODE WORKER — Fraud Detection Demo
================================================
A dishonest worker will submit a FAKE output hash.
Watch the 3-verifier jury detect the fraud.

📋 Opening case...
   Case ID: run_1234567890

🎭 Fraudulent worker submitting FAKE hash: 0xdeaddeaddeaddead...
   Work submitted. Jury will now evaluate...

⚖️  3-Verifier Jury deliberating (AXL P2P + 0G Compute TEE)...

╔══════════════════════════════════════════════════════════╗
║              🔴 FRAUD DETECTED — Jury Verdict            ║
╠══════════════════════════════════════════════════════════╣
║  Result   : ❌ FAIL — escrow refunded to requester      ║
║  Quorum   : 0/3 PASS, 3/3 FAIL — reached: true         ║
╚══════════════════════════════════════════════════════════╝

Individual Verifier Verdicts:
  ❌ verifier-1   FAIL [0G attested: 0xabc123...]
  ❌ verifier-2   FAIL [0G attested: 0xdef456...]
  ❌ verifier-3   FAIL [0G attested: 0x789ghi...]
```
