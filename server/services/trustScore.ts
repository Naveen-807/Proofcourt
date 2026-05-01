import type { Agent, ProofCourtRun, VerificationCriterion, VerificationReceipt } from '../../src/domain/proofcourt.ts';
import { stableHash } from '../adapters/hash.ts';

const EXECUTOR_AGENT_ID = 'prime';
const EXECUTOR_AGENT_NAME = 'Executor Agent Prime';

export function getExecutorAgent(run: ProofCourtRun): Agent {
  return run.agents.find((agent) => agent.id === EXECUTOR_AGENT_ID) ?? run.agents[0];
}

export function buildVerificationReceipt(
  run: ProofCourtRun,
  history: VerificationReceipt[],
  proofPassed: boolean,
  severe = false,
  source: VerificationReceipt['source'] = 'LIVE_RUN',
): VerificationReceipt {
  const executor = getExecutorAgent(run);
  const criteria = buildCriteria(run, proofPassed);
  const evidenceRoot = run.evidence.root || '0g-root-pending';
  const verificationHash = stableHash({
    caseId: run.id,
    criteria,
    evidenceRoot,
    keeperHubReceiptHash: run.evidence.keeperHubReceiptHash,
    verdictHash: run.evidence.verdictHash,
    axlTranscriptHash: run.evidence.axlTranscriptHash,
    proofPassed,
    severe,
    issuedAgainstHistory: history.map((receipt) => receipt.id),
  });
  const trustScoreBefore = executor.score;
  const scoreDelta = calculateReceiptDelta(proofPassed, severe, run.keeperHubReceipt.retryCount);
  const trustScoreAfter = clampScore(trustScoreBefore + scoreDelta);

  return {
    id: `vr_${stableHash({ caseId: run.id, verificationHash }, '').slice(0, 10)}`,
    caseId: run.id,
    executorAgentId: executor.id,
    executorName: executor.name || EXECUTOR_AGENT_NAME,
    proofPassed,
    severe,
    finalState: proofPassed ? 'PAID' : 'BLOCKED',
    criteria,
    evidenceRoot,
    verificationHash,
    keeperHubRetryCount: run.keeperHubReceipt.retryCount,
    axlMessageCount: run.axlMessages.length,
    trustScoreBefore,
    trustScoreAfter,
    scoreDelta,
    issuedAt: new Date().toISOString(),
    source,
  };
}

function calculateReceiptDelta(proofPassed: boolean, severe: boolean, retryCount: number): number {
  if (proofPassed) {
    return 3 - Math.min(retryCount, 3);
  }

  return severe ? -20 : -10;
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function calculateAgentTrust(
  agentId: string,
  history: VerificationReceipt[],
  baselineScore: number,
): number {
  const relevantReceipts = history.filter((receipt) => receipt.executorAgentId === agentId);
  const score = relevantReceipts.reduce((currentScore, receipt) => {
    if (receipt.proofPassed) {
      const retryPenalty = Math.min(receipt.keeperHubRetryCount, 3);
      return Math.min(100, currentScore + 3 - retryPenalty);
    }

    const penalty = receipt.severe ? 20 : 10;
    return Math.max(0, currentScore - penalty);
  }, baselineScore);

  return Math.round(score);
}

export function applyTrustUpdate(run: ProofCourtRun, receipt: VerificationReceipt): ProofCourtRun {
  return {
    ...run,
    agents: run.agents.map((agent) =>
      agent.id === receipt.executorAgentId
        ? {
          ...agent,
          score: receipt.trustScoreAfter,
          executions: agent.executions + 1,
          blocks: receipt.proofPassed ? agent.blocks : agent.blocks + 1,
          status: receipt.trustScoreAfter >= 80 ? 'Trusted' : receipt.trustScoreAfter >= 60 ? 'Caution' : 'Suspended',
        }
        : agent,
    ),
    trustScore: receipt.trustScoreAfter,
    verificationReceipt: receipt,
  };
}

function buildCriteria(run: ProofCourtRun, proofPassed: boolean): VerificationCriterion[] {
  const axlTranscriptMatches = Boolean(run.evidence.axlTranscriptHash) &&
    stableHash(run.axlMessages) === run.evidence.axlTranscriptHash;
  const keeperLogMatches = Boolean(run.keeperHubReceipt.logHash) &&
    stableHash(run.keeperHubReceipt.logs ?? []) === run.keeperHubReceipt.logHash;
  const keeperReceiptMatches = Boolean(run.evidence.keeperHubReceiptHash) &&
    stableHash(run.keeperHubReceipt) === run.evidence.keeperHubReceiptHash;

  const baseCriteria: VerificationCriterion[] = [
    {
      id: 'axl_transcript',
      label: 'AXL separate-node transcript hash matches message stream',
      passed: run.axlMessages.length >= 6 && axlTranscriptMatches,
    },
    {
      id: 'keeperhub_receipt',
      label: 'KeeperHub execution ID, logs, and tx hash match receipt hash',
      passed: run.keeperHubReceipt.status === 'Completed' &&
        Boolean(run.keeperHubReceipt.executionId) &&
        Boolean(run.keeperHubReceipt.txHash) &&
        keeperLogMatches &&
        keeperReceiptMatches,
    },
    {
      id: '0g_evidence_root',
      label: '0G evidence root and bundle hash are anchored for replay',
      passed: Boolean(run.evidence.root) && Boolean(run.evidence.bundleHash) && !run.evidence.tampered,
    },
    {
      id: '0g_compute_verdict',
      label: '0G Compute verdict hash is linked to the case file',
      passed: Boolean(run.evidence.verdictHash) && (run.evidence.verdictConfidence ?? 0) >= 0.75,
    },
    {
      id: 'payout_gate',
      label: 'Payout decision follows verification result',
      passed: proofPassed,
    },
  ];

  return proofPassed ? baseCriteria : baseCriteria.map((criterion) =>
    criterion.id === '0g_evidence_root' || criterion.id === '0g_compute_verdict' || criterion.id === 'payout_gate'
      ? { ...criterion, passed: false }
      : criterion,
  );
}
