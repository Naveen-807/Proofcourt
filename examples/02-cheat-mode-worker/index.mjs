/**
 * ProofCourt — Cheat-Mode Worker (Fraud Detection Demo)
 *
 * This script simulates a FRAUDULENT worker that submits a fake output hash
 * (not matching the actual work). The 3-verifier jury detects the mismatch
 * and returns FAIL. The escrow is refunded to the requester.
 *
 * This is one of the 4 core demo scenarios for ETHGlobal:
 *   1. Honest worker → PASS → escrow released
 *   2. Fraud worker  → FAIL → escrow refunded  ← THIS SCRIPT
 *   3. One verifier down → quorum still reached (resilience)
 *   4. Fork with SDK in 5 lines (see 01-five-line-integration)
 *
 * Run:
 *   node examples/02-cheat-mode-worker/index.mjs
 */

import { ProofCourt } from '../../packages/sdk/src/index.ts';

const court = new ProofCourt({ apiUrl: 'http://localhost:8787' });

console.log('\n🔴 CHEAT MODE WORKER — Fraud Detection Demo');
console.log('================================================');
console.log('A dishonest worker will submit a FAKE output hash.');
console.log('Watch the 3-verifier jury detect the fraud.\n');

// Step 1: Requester opens a case
console.log('📋 Opening case...');
const { caseId } = await court.createCase({
  title: 'Audit smart contract for reentrancy vulnerabilities',
  description: 'Full audit of 5 Solidity files, produce a report with all findings',
  sla: 3600,
  escrowAmount: '0.05',
});
console.log(`   Case ID: ${caseId}`);

// Step 2: FRAUDULENT worker submits garbage hash
// (real work would be a hash of the actual audit report)
const FAKE_HASH = '0x' + 'dead'.repeat(16); // clearly bogus
console.log(`\n🎭 Fraudulent worker submitting FAKE hash: ${FAKE_HASH.slice(0, 20)}...`);
await court.submitWork(caseId, {
  outputHash: FAKE_HASH,
  summary: 'No issues found', // lies
  workerAddress: '0x1234567890123456789012345678901234567890',
});
console.log('   Work submitted. Jury will now evaluate...\n');

// Step 3: Wait for the jury verdict
console.log('⚖️  3-Verifier Jury deliberating (AXL P2P + 0G Compute TEE)...');
const verdict = await court.awaitVerdict(caseId, { timeoutMs: 180_000, pollIntervalMs: 3_000 });

// Step 4: Show results
console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log('║              🔴 FRAUD DETECTED — Jury Verdict            ║');
console.log('╠══════════════════════════════════════════════════════════╣');
console.log(`║  Case ID  : ${caseId.slice(0, 45).padEnd(45)}║`);
console.log(`║  Result   : ${(verdict.passed ? '✅ PASS (unexpected!)' : '❌ FAIL — escrow refunded to requester').padEnd(45)}║`);
console.log(`║  State    : ${verdict.state.padEnd(45)}║`);
if (verdict.quorum) {
  console.log(`║  Quorum   : ${`${verdict.quorum.passed}/3 PASS, ${verdict.quorum.failed}/3 FAIL — reached: ${verdict.quorum.reached}`.padEnd(45)}║`);
}
console.log('╚══════════════════════════════════════════════════════════╝');
console.log('');

if (verdict.verdicts.length > 0) {
  console.log('Individual Verifier Verdicts:');
  for (const v of verdict.verdicts) {
    const icon = v.decision === 'PASS' ? '✅' : '❌';
    const attest = v.attestationHash ? ` [0G attested: ${v.attestationHash.slice(0, 12)}…]` : '';
    console.log(`  ${icon} ${v.verifierId.padEnd(12)} ${v.decision}${attest}`);
  }
}

console.log('\n✅ Fraud prevention successful. Worker cannot steal escrow.');
console.log(`   0G Storage root: ${verdict.zeroGRoot ?? '(pending on-chain anchor)'}`);
console.log('   Immutable evidence preserved for dispute resolution.\n');
