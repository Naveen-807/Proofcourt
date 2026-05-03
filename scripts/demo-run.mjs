#!/usr/bin/env node

import { ProofCourt } from '../packages/sdk/src/index.ts';

const apiUrl = process.env.PROOFCOURT_API_URL ?? 'http://127.0.0.1:8787';
const court = new ProofCourt({ apiUrl });

console.log('\nProofCourt 2-minute demo run');
console.log('============================');
console.log(`API: ${apiUrl}`);

const honest = await runScenario({
  label: 'Honest worker',
  title: 'Verify release candidate and produce deployment notes',
  outputHash: `0x${'c0ffee'.repeat(10)}c0ff`,
  summary: 'Release candidate verified and deployment notes produced.',
});

const cheat = await runScenario({
  label: 'Cheat worker',
  title: 'Audit Solidity escrow for reentrancy',
  outputHash: `0x${'dead'.repeat(16)}`,
  summary: 'No issues found.',
});

console.log('\nProof artifacts');
console.log('===============');
for (const item of [honest, cheat]) {
  console.log(`\n${item.label}`);
  console.log(`Case: ${item.run.id}`);
  console.log(`State: ${item.run.state}`);
  console.log(`Quorum: ${item.run.quorum ? `${item.run.quorum.passed}/3 PASS, ${item.run.quorum.failed}/3 FAIL` : 'pending'}`);
  console.log(`0G root: ${item.run.zeroGStorageRoot ?? item.run.evidence?.root ?? '(pending)'}`);
  console.log(`Settlement tx: ${item.run.settlementReceipt?.commitTxHash ?? item.run.settlementReceipt?.abortTxHash ?? '(pending)'}`);
  console.log(`KeeperHub execution: ${item.run.settlementKeeperHubReceipt?.executionId ?? item.run.keeperHubReceipt?.executionId ?? '(pending)'}`);
  console.log(`iNFT reputation tx: ${item.run.reputationTxHash ?? item.run.reputationUpdateMode ?? '(not configured)'}`);
  const inftAddress = item.run.agents?.find((agent) => agent.id === 'worker')?.inft
    ? process.env.AGENT_INFT_ADDRESS
    : null;
  if (inftAddress) {
    console.log(`Worker iNFT: https://chainscan-galileo.0g.ai/address/${inftAddress}`);
  }
}

async function runScenario({ label, title, outputHash, summary }) {
  console.log(`\n${label}`);
  console.log('-'.repeat(label.length));
  const { caseId } = await court.createCase({ title, description: summary, sla: 3600, escrowAmount: '0.05' });
  console.log(`Opened ${caseId}`);
  await court.submitWork(caseId, {
    outputHash,
    summary,
    workerAddress: process.env.WORKER_ADDRESS ?? '0x1234567890123456789012345678901234567890',
  });
  console.log(`Submitted output ${outputHash.slice(0, 18)}...`);
  const verdict = await court.awaitVerdict(caseId, { timeoutMs: 180_000, pollIntervalMs: 2_000 });
  console.log(`Verdict: ${verdict.passed ? 'PASS' : 'FAIL'} (${verdict.quorum?.passed ?? 0}/3 PASS)`);
  await court.settleCase(caseId, { timeoutMs: 120_000 }).catch(() => null);
  const run = await fetch(`${apiUrl}/api/runs/${caseId}`).then((res) => res.json());
  return { label, run };
}
