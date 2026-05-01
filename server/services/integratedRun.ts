import {
  advanceRun,
  markTampered,
  restoreRun,
  type AxlMessage,
  type ProofCourtRun,
  type VerificationReceipt,
} from '../../src/domain/proofcourt.ts';
import { sendAxlMessage } from '../adapters/axlAdapter.ts';
import { executeKeeperHubWorkflow } from '../adapters/keeperHubAdapter.ts';
import { stableHash } from '../adapters/hash.ts';
import { getEvidenceFromZeroG, listStoredEvidence, storeEvidenceOnZeroG } from '../adapters/zeroGAdapter.ts';
import { recordZeroGComputeVerdict, runZeroGComputeVerdict } from '../adapters/zeroGComputeAdapter.ts';
import { abortSettlement, commitSettlement, prepareSettlement } from './settlementService.ts';
import { applyTrustUpdate, buildVerificationReceipt, calculateAgentTrust, getExecutorAgent } from './trustScore.ts';

const verificationHistoryByAgent = new Map<string, VerificationReceipt[]>();

export async function advanceRunWithIntegrations(run: ProofCourtRun): Promise<ProofCourtRun> {
  const nextRun = advanceRun(run);

  if (nextRun.state === 'permit_issued') {
    return attachAxlPrepareMessages(nextRun);
  }

  if (nextRun.state === 'execution_complete') {
    return attachKeeperHubReceipt(nextRun);
  }

  if (nextRun.state === 'payout_locked') {
    return attachPrepareSettlement(nextRun);
  }

  if (nextRun.state === 'evidence_stored') {
    return attachZeroGEvidence(nextRun);
  }

  if (nextRun.state === 'proof_verified') {
    return attachVerificationReceipt(nextRun);
  }

  if (nextRun.state === 'reputation_updated') {
    return finalizeTrustUpdate(nextRun);
  }

  return nextRun;
}

export async function tamperRunWithIntegrations(run: ProofCourtRun): Promise<ProofCourtRun> {
  const tamperedRun = markTampered(run);
  const settlementReceipt = await abortSettlement(tamperedRun);
  const history = getAgentHistory(getExecutorAgent(tamperedRun).id);
  const verificationReceipt = buildVerificationReceipt(
    {
      ...tamperedRun,
      settlementReceipt,
    },
    history,
    false,
    true,
    'LIVE_RUN',
  );
  const updatedRun = applyTrustUpdate(
    {
      ...tamperedRun,
      settlementReceipt,
      evidence: {
        ...tamperedRun.evidence,
        verificationHash: verificationReceipt.verificationHash,
      },
      events: [
        ...tamperedRun.events,
        `${settlementReceipt.mode === 'live' ? 'Onchain' : 'Demo'} abort recorded: ${settlementReceipt.abortTxHash ?? 'pending'}`,
      ],
    },
    verificationReceipt,
  );

  recordReceipt(verificationReceipt);
  return updatedRun;
}

export async function restoreRunWithIntegrations(run: ProofCourtRun): Promise<ProofCourtRun> {
  const restoredRun = restoreRun(run);
  const replayed = await replayRunFromZeroG(restoredRun.id, restoredRun);
  return {
    ...replayed,
    isTampered: false,
    replayedFromZeroG: true,
    events: [...replayed.events, 'Case replayed from 0G evidence memory'],
  };
}

export async function replayRunFromZeroG(caseId: string, fallbackRun?: ProofCourtRun): Promise<ProofCourtRun> {
  const result = await getEvidenceFromZeroG(caseId);
  const evidenceRecord = result.data;

  if (!evidenceRecord || !fallbackRun) {
    if (fallbackRun) {
      return {
        ...fallbackRun,
        replayedFromZeroG: false,
        events: [...fallbackRun.events, '0G replay requested, but no case evidence was found'],
      };
    }
    throw new Error('case_evidence_not_found');
  }

  const storedRun = evidenceRecord.evidence.runSnapshot as Partial<ProofCourtRun> | undefined;
  return {
    ...fallbackRun,
    ...storedRun,
    evidence: {
      ...fallbackRun.evidence,
      ...storedRun?.evidence,
      root: evidenceRecord.root,
      storageMode: evidenceRecord.storageMode,
      bundleHash: evidenceRecord.bundleHash,
      byteSize: evidenceRecord.byteSize,
      txHash: evidenceRecord.txHash,
      source: evidenceRecord.source,
      verificationHash: evidenceRecord.verificationHash,
    },
    replayedFromZeroG: true,
  };
}

export function getTrustSummary(agentId: string, baselineScore: number) {
  const history = getAgentHistory(agentId);
  return {
    agentId,
    score: calculateAgentTrust(agentId, history, baselineScore),
    totalCases: history.length,
    passed: history.filter((receipt) => receipt.proofPassed).length,
    blocked: history.filter((receipt) => !receipt.proofPassed).length,
    latestEvidenceRoot: history.at(-1)?.evidenceRoot ?? null,
    receipts: history,
    storedCaseCount: listStoredEvidence().length,
  };
}

async function attachAxlPrepareMessages(run: ProofCourtRun): Promise<ProofCourtRun> {
  const permitHash = stableHash({
    permit: 'ProofCourtPermit',
    caseId: run.id,
    mandateId: run.mandate.id,
    executor: 'Executor Agent Prime',
    minTrustScore: run.mandate.minAgentTrustScore,
  });
  const messagesToSend = [
    {
      from: 'Owner Agent Command',
      to: 'Specialist Agent Sigma',
      type: 'WORK_REQUESTED',
      payload: { mandateId: run.mandate.id, amount: run.mandate.amount, destination: run.mandate.destination },
    },
    {
      from: 'Specialist Agent Sigma',
      to: 'Proof Judge Core',
      type: 'MANDATE_ANALYZED',
      payload: { mandateId: run.mandate.id, recommendedExecutor: 'Executor Agent Prime', risk: 'low' },
    },
    {
      from: 'Proof Judge Core',
      to: 'Owner Agent Command',
      type: 'PERMIT_REQUIRED',
      payload: { caseId: run.id, requiredProof: run.mandate.requiredProof },
    },
    {
      from: 'Proof Judge Core',
      to: 'Executor Agent Prime',
      type: 'PERMIT_APPROVED',
      payload: { permitHash, minTrustScore: run.mandate.minAgentTrustScore },
    },
  ];

  const axlMessages = await sendAxlProtocolMessages(run, messagesToSend, []);

  return {
    ...run,
    axlMessages,
    evidence: {
      ...run.evidence,
      permitHash,
      axlTranscriptHash: stableHash(axlMessages),
    },
    events: [...run.events, 'AXL Strategy/Judge/Executor permit protocol recorded'],
  };
}

async function attachPrepareSettlement(run: ProofCourtRun): Promise<ProofCourtRun> {
  const settlementReceipt = await prepareSettlement(run);
  const trialResult = await executeKeeperHubWorkflow({
    workflowId: run.id,
    phase: 'proof-trial',
    action: 'proofTrialTransfer(0.00001 0G)',
    executor: 'Executor Agent Prime',
    payload: {
      caseId: run.id,
      mandateId: run.mandate.id,
      amountWei: '10000000000000',
      chainId: 16602,
      permitHash: run.evidence.permitHash,
      settlementCaseId: settlementReceipt.contractCaseId,
    },
  });

  return {
    ...run,
    settlementReceipt,
    proofTrialReceipt: trialResult.data,
    events: [
      ...run.events,
      `${settlementReceipt.mode === 'live' ? 'Onchain' : 'Demo'} prepare recorded: ${settlementReceipt.prepareTxHash ?? 'pending'}`,
      `KeeperHub ${trialResult.mode} proof trial ${trialResult.data.executionId} captured`,
    ],
  };
}

async function attachKeeperHubReceipt(run: ProofCourtRun): Promise<ProofCourtRun> {
  const readyMessages = await sendAxlProtocolMessages(run, [
    {
      from: 'Executor Agent Prime',
      to: 'Specialist Agent Sigma',
      type: 'READY_TO_EXECUTE',
      payload: { permitHash: run.evidence.permitHash, action: run.keeperHubReceipt.action },
    },
  ]);

  const result = await executeKeeperHubWorkflow({
    workflowId: run.id,
    phase: 'execute-mandate',
    action: run.keeperHubReceipt.action,
    executor: 'Executor Agent Prime',
    payload: {
      mandateId: run.mandate.id,
      amount: run.mandate.amount,
      destination: run.mandate.destination,
      permitHash: run.evidence.permitHash,
    },
  });

  const receiptMessages = await sendAxlProtocolMessages(
    {
      ...run,
      axlMessages: readyMessages,
    },
    [
      {
        from: 'Executor Agent Prime',
        to: 'Proof Judge Core',
        type: 'EXECUTION_RECEIPT_SUBMITTED',
        payload: {
          executionId: result.data.executionId,
          txHash: result.data.txHash,
          logHash: result.data.logHash,
        },
      },
    ],
  );

  return {
    ...run,
    axlMessages: receiptMessages,
    keeperHubReceipt: result.data,
    evidence: {
      ...run.evidence,
      axlTranscriptHash: stableHash(receiptMessages),
      keeperHubReceiptHash: stableHash(result.data),
    },
    events: [...run.events, `KeeperHub ${result.mode} execution ${result.data.executionId} captured`],
  };
}

async function attachZeroGEvidence(run: ProofCourtRun): Promise<ProofCourtRun> {
  const keeperHubReceiptHash = stableHash(run.keeperHubReceipt);
  const trialReceiptHash = run.proofTrialReceipt ? stableHash(run.proofTrialReceipt) : undefined;
  const proofMessages = await sendAxlProtocolMessages(run, [
    {
      from: 'Proof Judge Core',
      to: 'Owner Agent Command',
      type: 'PROOF_VERIFIED',
      payload: {
        keeperHubReceiptHash,
        proofPassed: verifyRunArtifacts({
          ...run,
          evidence: {
            ...run.evidence,
            keeperHubReceiptHash,
          },
        }, { requireZeroGRoot: false, requireComputeVerdict: false }).passed,
      },
    },
  ]);
  const axlTranscriptHash = stableHash(proofMessages);
  const mandateHash = stableHash(run.mandate);
  const baseCaseFile = {
    version: 'proofcourt.evidence.v1',
    caseId: run.id,
    mandateHash,
    axlTranscriptHash,
    trial: run.proofTrialReceipt
      ? {
        workflowId: run.proofTrialReceipt.workflowId,
        executionId: run.proofTrialReceipt.executionId,
        txHash: run.proofTrialReceipt.txHash,
        blockNumber: null,
        amountWei: '10000000000000',
        logHash: run.proofTrialReceipt.logHash,
        receiptHash: trialReceiptHash,
      }
      : null,
    execution: {
      workflowId: run.keeperHubReceipt.workflowId,
      executionId: run.keeperHubReceipt.executionId,
      txHash: run.keeperHubReceipt.txHash,
      blockNumber: null,
      amountWei: run.mandate.amount,
      logHash: run.keeperHubReceipt.logHash,
      receiptHash: keeperHubReceiptHash,
      logs: run.keeperHubReceipt.logs ?? [],
    },
    verdict: null,
    settlement: {
      status: run.payout.status,
      prepareTxHash: run.settlementReceipt?.prepareTxHash,
      commitTxHash: run.settlementReceipt?.commitTxHash,
      abortTxHash: run.settlementReceipt?.abortTxHash,
      agents: run.agents
        .filter((agent) => agent.inft)
        .map((agent) => ({
          id: agent.id,
          name: agent.name,
          tokenId: agent.inft?.tokenId,
          share: agent.inft?.royaltyBps,
        })),
    },
    mandate: run.mandate,
    permit: {
      permitHash: run.evidence.permitHash,
      minTrustScore: run.mandate.minAgentTrustScore,
      executor: 'Executor Agent Prime',
    },
    axlTranscript: proofMessages,
    keeperHubReceipt: run.keeperHubReceipt,
    proofTrialReceipt: run.proofTrialReceipt,
    keeperHubLogs: run.keeperHubReceipt.logs ?? [],
    txHash: run.keeperHubReceipt.txHash,
    settlementReceipt: run.settlementReceipt,
    permitHash: run.evidence.permitHash,
    trialReceiptHash,
    keeperHubReceiptHash,
    verifierResult: verifyRunArtifacts({
      ...run,
      axlMessages: proofMessages,
      evidence: {
        ...run.evidence,
        axlTranscriptHash,
        keeperHubReceiptHash,
      },
    }, { requireZeroGRoot: false, requireComputeVerdict: false }),
    receiptSummary: {
      finalState: 'PENDING_SETTLEMENT',
      payoutStatus: run.payout.status,
    },
    runSnapshot: {
      ...run,
      axlMessages: proofMessages,
      evidence: {
        ...run.evidence,
        axlTranscriptHash,
        keeperHubReceiptHash,
      },
      events: [...run.events],
    },
  };

  const baseCaseFileHash = stableHash(baseCaseFile);
  const computeResult = await runZeroGComputeVerdict({
    caseId: run.id,
    evidenceRoot: baseCaseFileHash,
    mandateHash,
    permitHash: run.evidence.permitHash,
    axlTranscriptHash,
    keeperHubReceiptHash,
    caseFileHash: baseCaseFileHash,
  });
  const finalCaseFile = {
    ...baseCaseFile,
    verdict: {
      compliant: computeResult.data.compliant,
      reason: computeResult.data.reason,
      confidence: computeResult.data.confidence,
      model: computeResult.data.model,
      source: computeResult.data.source,
      verdictHash: computeResult.data.verdictHash,
      computeAttestation: computeResult.data.attestationHash,
      inputCaseFileHash: baseCaseFileHash,
    },
  };
  const result = await storeEvidenceOnZeroG({
    caseId: run.id,
    evidence: finalCaseFile,
  });

  return {
    ...run,
    axlMessages: proofMessages,
    evidence: {
      ...run.evidence,
      axlTranscriptHash,
      keeperHubReceiptHash,
      root: result.data.root,
      storageMode: result.data.storageMode,
      bundleHash: result.data.bundleHash,
      byteSize: result.data.byteSize,
      txHash: result.data.txHash,
      source: result.data.source,
      verdictHash: computeResult.data.verdictHash,
      verdictCompliant: computeResult.data.compliant,
      verdictReason: computeResult.data.reason,
      verdictConfidence: computeResult.data.confidence,
      verdictModel: computeResult.data.model,
      verdictSource: computeResult.data.source,
      verdictAttestationHash: computeResult.data.attestationHash,
      verificationHash: result.data.verificationHash,
      verificationResult: 'PASS',
    },
    events: [
      ...run.events,
      `0G ${result.mode} evidence root stored`,
      `0G Compute ${computeResult.mode} verdict ${computeResult.data.verdictHash} generated`,
    ],
  };
}

async function attachVerificationReceipt(run: ProofCourtRun): Promise<ProofCourtRun> {
  const adapterAxlMessages = run.axlMessages.filter((message) => Boolean(message.nodeId || message.mode));
  const canonicalRun = {
    ...run,
    axlMessages: adapterAxlMessages,
    evidence: {
      ...run.evidence,
      axlTranscriptHash: stableHash(adapterAxlMessages),
      keeperHubReceiptHash: stableHash(run.keeperHubReceipt),
    },
  };
  const history = getAgentHistory(getExecutorAgent(run).id);
  const proofCheck = verifyRunArtifacts(canonicalRun);
  const verificationReceipt = buildVerificationReceipt(canonicalRun, history, proofCheck.passed, !proofCheck.passed);
  const runWithVerification = {
    ...canonicalRun,
    evidence: {
      ...canonicalRun.evidence,
      verificationHash: verificationReceipt.verificationHash,
      verificationResult: proofCheck.passed ? 'PASS' as const : 'FAIL' as const,
    },
    verificationReceipt,
  };
  const settlementReceipt = proofCheck.passed
    ? await commitSettlement(runWithVerification)
    : await abortSettlement(runWithVerification);
  const settlementWorkflowResult = proofCheck.passed
    ? await executeKeeperHubWorkflow({
      workflowId: run.id,
      phase: 'atomic-settlement',
      action: 'ProofCourtEscrow.settleCase()',
      executor: 'Settlement Payment Agent',
      payload: {
        caseId: settlementReceipt.contractCaseId ?? run.id,
        localRunId: run.id,
        agents: run.agents
          .filter((agent) => agent.inft)
          .map((agent) => ({
            id: agent.id,
            tokenId: agent.inft?.tokenId,
            holder: agent.inft?.holder,
            shareBps: agent.inft?.royaltyBps,
          })),
        evidenceRoot: runWithVerification.evidence.root,
        verdictHash: runWithVerification.evidence.verdictHash,
      },
    })
    : undefined;
  let verdictTxHash: string | undefined;

  if (proofCheck.passed) {
    try {
      verdictTxHash = await recordZeroGComputeVerdict(
        settlementReceipt.contractCaseId,
        runWithVerification.evidence.verdictHash,
      );
    } catch {
      verdictTxHash = undefined;
    }
  }

  return {
    ...canonicalRun,
    state: proofCheck.passed ? run.state : 'payout_blocked',
    progress: proofCheck.passed ? run.progress : 100,
    settlementReceipt,
    settlementKeeperHubReceipt: settlementWorkflowResult?.data,
    verificationReceipt,
    evidence: {
      ...canonicalRun.evidence,
      verificationHash: verificationReceipt.verificationHash,
      verificationResult: proofCheck.passed ? 'PASS' : 'FAIL',
      verdictTxHash,
    },
    payout: proofCheck.passed ? run.payout : { ...run.payout, status: 'Blocked' },
    events: [
      ...run.events,
      `VerificationReceipt ${verificationReceipt.id} issued`,
      proofCheck.passed
        ? `${settlementReceipt.mode === 'live' ? 'Onchain' : 'Demo'} commit recorded: ${settlementReceipt.commitTxHash ?? 'pending'}`
        : `${settlementReceipt.mode === 'live' ? 'Onchain' : 'Demo'} abort recorded: ${settlementReceipt.abortTxHash ?? 'pending'}`,
      ...(settlementWorkflowResult
        ? [`KeeperHub ${settlementWorkflowResult.mode} atomic settlement ${settlementWorkflowResult.data.executionId} captured`]
        : []),
    ],
  };
}

async function sendAxlProtocolMessages(
  run: ProofCourtRun,
  messagesToSend: Array<{ from: string; to: string; type: string; payload: Record<string, unknown>; envelope?: 'mcp' | 'a2a' }>,
  baseMessages: AxlMessage[] = run.axlMessages.filter((message) => Boolean(message.nodeId || message.mode)),
): Promise<AxlMessage[]> {
  const sent: AxlMessage[] = [];

  for (const message of messagesToSend) {
    const result = await sendAxlMessage({
      workflowId: run.id,
      envelope: message.envelope ?? inferAxlEnvelope(message.type),
      ...message,
    });

    sent.push({
      id: result.data.id,
      nodeId: result.data.nodeId,
      messageId: result.data.messageId,
      envelope: result.data.envelope,
      timestamp: result.data.timestamp,
      from: message.from,
      to: message.to,
      type: message.type,
      payloadHash: result.data.payloadHash,
      hash: result.data.hash,
      mode: result.mode,
    });
  }

  return [...baseMessages, ...sent];
}

function inferAxlEnvelope(type: string): 'mcp' | 'a2a' {
  const normalized = type.toLowerCase();
  if (normalized.includes('evidence') || normalized.includes('receipt') || normalized.includes('verified') || normalized.includes('analyzed')) {
    return 'a2a';
  }
  return 'mcp';
}

function verifyRunArtifacts(
  run: ProofCourtRun,
  options: { requireZeroGRoot?: boolean; requireComputeVerdict?: boolean } = {},
): { passed: boolean; checks: Record<string, boolean> } {
  const requireZeroGRoot = options.requireZeroGRoot ?? true;
  const requireComputeVerdict = options.requireComputeVerdict ?? true;
  const checks = {
    permitHash: Boolean(run.evidence.permitHash),
    axlTranscriptHash: stableHash(run.axlMessages) === run.evidence.axlTranscriptHash,
    keeperHubStatus: run.keeperHubReceipt.status === 'Completed',
    keeperHubLogHash: stableHash(run.keeperHubReceipt.logs ?? []) === run.keeperHubReceipt.logHash,
    keeperHubReceiptHash: stableHash(run.keeperHubReceipt) === run.evidence.keeperHubReceiptHash,
    zeroGRoot: requireZeroGRoot
      ? Boolean(run.evidence.root) && Boolean(run.evidence.bundleHash) && !run.evidence.tampered
      : !run.evidence.tampered,
    zeroGComputeVerdict: requireComputeVerdict
      ? Boolean(run.evidence.verdictHash) && (run.evidence.verdictConfidence ?? 0) >= 0.75
      : true,
  };

  return {
    passed: Object.values(checks).every(Boolean),
    checks,
  };
}

function finalizeTrustUpdate(run: ProofCourtRun): ProofCourtRun {
  const receipt = run.verificationReceipt;

  if (!receipt) {
    return run;
  }

  const updatedRun = applyTrustUpdate(run, receipt);
  recordReceipt(receipt);

  return {
    ...updatedRun,
    events: [
      ...run.events,
      `${receipt.executorName} trust score ${receipt.trustScoreBefore} -> ${receipt.trustScoreAfter} from receipt history`,
    ],
  };
}

function getAgentHistory(agentId: string): VerificationReceipt[] {
  return verificationHistoryByAgent.get(agentId) ?? [];
}

function recordReceipt(receipt: VerificationReceipt) {
  const existing = getAgentHistory(receipt.executorAgentId);
  if (existing.some((item) => item.id === receipt.id)) {
    return;
  }

  verificationHistoryByAgent.set(receipt.executorAgentId, [...existing, receipt]);
}
