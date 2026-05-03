#!/usr/bin/env node

import { ProofCourt } from '../../../packages/sdk/src/index.ts';

const args = new Set(process.argv.slice(2));
const mode = args.has('--honest') ? 'honest' : 'cheat';
const apiUrl = process.env.PROOFCOURT_API_URL ?? 'http://127.0.0.1:8787';
const court = new ProofCourt({ apiUrl });

const invalidHash = `0x${'dead'.repeat(16)}`;
const honestHash = `0x${'c0ffee'.repeat(10)}c0ff`;
const outputHash = mode === 'honest' ? honestHash : invalidHash;

console.log(`\nProofCourt Worker Agent (${mode.toUpperCase()} MODE)`);
console.log('================================================');
console.log(`API: ${apiUrl}`);

const before = await safeReputation('worker');
console.log(`Worker reputation before: ${before?.score ?? 'unknown'}`);

console.log('\nOpening case...');
const { caseId } = await court.createCase({
  title: mode === 'honest'
    ? 'Verify dependency update and produce release notes'
    : 'Audit smart contract for reentrancy vulnerabilities',
  description: 'Worker must submit a verifiable output hash and summary for 3-verifier jury review.',
  sla: 3600,
  escrowAmount: '0.05',
});
console.log(`Case ID: ${caseId}`);

console.log(`\nWorker submitted ${mode === 'honest' ? 'real' : 'invalid'} output: ${outputHash}`);
await court.submitWork(caseId, {
  outputHash,
  summary: mode === 'honest'
    ? 'Dependency update verified, tests passed, release notes prepared.'
    : 'No issues found.',
  workerAddress: process.env.WORKER_ADDRESS ?? '0x1234567890123456789012345678901234567890',
});

console.log(`Worker submitted ${mode === 'honest' ? 'real' : 'invalid'} output -> Jury evaluating`);
const verdict = await court.awaitVerdict(caseId, { timeoutMs: 180_000, pollIntervalMs: 2_000 });
await court.settleCase(caseId, { timeoutMs: 120_000 }).catch(() => null);
const finalRun = await fetch(`${apiUrl}/api/runs/${caseId}`).then((res) => res.json());
const after = await safeReputation('worker');

const failed = !verdict.passed;
console.log(`${failed ? 'FAIL detected' : 'PASS confirmed'} -> Reputation ${before?.score ?? '?'} to ${after?.score ?? finalRun.trustScore ?? '?'}`);
console.log(`${failed ? 'Refund tx' : 'Settlement tx'}: ${finalRun.settlementReceipt?.abortTxHash ?? finalRun.settlementReceipt?.commitTxHash ?? finalRun.txHash ?? '(pending)'}`);
console.log(`0G root: ${finalRun.zeroGStorageRoot ?? finalRun.evidence?.root ?? '(pending)'}`);
console.log(`iNFT reputation tx: ${finalRun.reputationTxHash ?? finalRun.reputationUpdateMode ?? '(not configured)'}`);

if (Array.isArray(finalRun.verdicts)) {
  console.log('\nJury verdicts:');
  for (const item of finalRun.verdicts) {
    console.log(`- ${item.verifierId}: ${item.decision} reasoning=${String(item.reasoningHash).slice(0, 14)} attestation=${String(item.attestationHash ?? 'none').slice(0, 14)}`);
  }
}

console.log('\nDemo complete.');

async function safeReputation(agentId) {
  try {
    return await court.getAgentReputation(agentId);
  } catch {
    return null;
  }
}
