import {
  advanceRun,
  markTampered,
  restoreRun,
  type AxlMessage,
  type ProofCourtRun,
  type VerificationReceipt,
  type VerifierVerdict,
} from '../../src/domain/proofcourt.ts';
import { sendAxlMessage } from '../adapters/axlAdapter.ts';
import { executeKeeperHubWorkflow } from '../adapters/keeperHubAdapter.ts';
import { updateOnChainReputation } from '../adapters/contractRegistry.ts';
import { stableHash } from '../adapters/hash.ts';
import { getEvidenceFromZeroG, listStoredEvidence, storeEvidenceOnZeroG } from '../adapters/zeroGAdapter.ts';
import { recordZeroGComputeVerdict, runZeroGComputeVerdict } from '../adapters/zeroGComputeAdapter.ts';
import { writeReputationToKV } from '../adapters/zeroGKvAdapter.ts';
import {
  buildProofCourtSettlementWorkflow,
  executeWorkflow as executeKeeperHubMcpWorkflow,
} from './keeperHubMcpClient.ts';
import { abortSettlement, commitSettlement, prepareSettlement } from './settlementService.ts';
import { applyTrustUpdate, buildVerificationReceipt, getExecutorAgent, getLatestTrustScore } from './trustScore.ts';

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
        `0G Galileo abort recorded: ${settlementReceipt.abortTxHash ?? 'pending'}`,
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
    ...storedRun,
    ...fallbackRun,
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
    score: getLatestTrustScore(agentId, history, baselineScore),
    totalCases: history.length,
    passed: history.filter((receipt) => receipt.proofPassed).length,
    blocked: history.filter((receipt) => !receipt.proofPassed).length,
    latestEvidenceRoot: history.at(-1)?.evidenceRoot ?? null,
    receipts: history,
    storedCaseCount: listStoredEvidence().length,
  };
}

async function attachAxlPrepareMessages(run: ProofCourtRun): Promise<ProofCourtRun> {
  if (!run.agentDnsResolution || !run.agentSla?.zeroGRoot) {
    throw new Error('AgentDNS resolution and 0G-stored AgentSLA are required before Phase 1 Permit Commit');
  }

  const permitHash = stableHash({
    permit: 'PermitReceipt',
    phase: 'MandatePermit',
    caseId: run.id,
    mandateId: run.mandate.id,
    mandateHash: run.agentSla.mandateHash,
    slaHash: run.agentSla.slaHash,
    zeroGSlaRoot: run.agentSla.zeroGRoot,
    agentDnsResolutionHash: run.agentDnsResolution.resolutionHash,
    executor: run.agentSla.workerAgentId,
    minTrustScore: run.mandate.minAgentTrustScore,
  });
  const messagesToSend = [
    {
      from: 'Requester Agent',
      to: 'Worker Agent',
      type: 'WORK_REQUESTED',
      payload: {
        mandateId: run.mandate.id,
        mandateHash: run.agentSla.mandateHash,
        slaHash: run.agentSla.slaHash,
        zeroGSlaRoot: run.agentSla.zeroGRoot,
        amount: run.mandate.amount,
        destination: run.mandate.destination,
      },
    },
    {
      from: 'Worker Agent',
      to: 'Verifier-1',
      type: 'AGENT_DNS_RESOLVED',
      payload: {
        mandateId: run.mandate.id,
        selectedWorker: run.agentSla.workerAgentId,
        agentDnsResolutionHash: run.agentDnsResolution.resolutionHash,
        agentInftAddress: run.agentDnsResolution.agentInftAddress,
      },
    },
    {
      from: 'Verifier-1',
      to: 'Requester Agent',
      type: 'SLA_PREPARED',
      payload: {
        caseId: run.id,
        slaHash: run.agentSla.slaHash,
        zeroGSlaRoot: run.agentSla.zeroGRoot,
        actionHash: run.agentSla.actionHash,
        requiredProof: run.mandate.requiredProof,
      },
    },
    {
      from: 'Verifier-1',
      to: 'Worker Agent',
      type: 'PERMIT_COMMITTED',
      payload: {
        permitHash,
        slaHash: run.agentSla.slaHash,
        zeroGSlaRoot: run.agentSla.zeroGRoot,
        minTrustScore: run.mandate.minAgentTrustScore,
      },
    },
    {
      from: 'Verifier-2',
      to: 'Worker Agent',
      type: 'PERMIT_COSIGNED',
      payload: { permitHash, slaHash: run.agentSla.slaHash, verifier: 'Verifier-2' },
    },
    {
      from: 'Verifier-3',
      to: 'Worker Agent',
      type: 'PERMIT_COSIGNED',
      payload: { permitHash, slaHash: run.agentSla.slaHash, verifier: 'Verifier-3' },
    },
  ];

  const axlMessages = await sendAxlProtocolMessages(run, messagesToSend, []);
  const axlTranscriptHash = stableHash(axlMessages);

  return {
    ...run,
    axlMessages,
    permitReceipt: {
      id: `permit_${run.id}`,
      caseId: run.id,
      mandateHash: run.agentSla.mandateHash,
      slaHash: run.agentSla.slaHash,
      zeroGSlaRoot: run.agentSla.zeroGRoot,
      agentDnsResolutionHash: run.agentDnsResolution.resolutionHash,
      permitHash,
      axlTranscriptHash,
      committedAt: new Date().toISOString(),
      phase: 'MandatePermit',
    },
    evidence: {
      ...run.evidence,
      permitHash,
      axlTranscriptHash,
    },
    events: [...run.events, 'Phase 1 Mandate/Permit committed over AXL with AgentDNS + AgentSLA hashes'],
  };
}

async function attachPrepareSettlement(run: ProofCourtRun): Promise<ProofCourtRun> {
  const settlementReceipt = await prepareSettlement(run);
  const requesterAddress = getAgentHolder(run, run.agentSla?.requesterAgentId, 'Requester');
  const workerAddress = getAgentHolder(run, run.agentSla?.workerAgentId, 'Worker');
  const trialResult = await executeKeeperHubWorkflow({
    workflowId: run.id,
    phase: 'proof-trial',
    action: 'proofTrialTransfer(0.00001 0G)',
    executor: 'Worker Agent',
    payload: {
      caseId: run.id,
      mandateId: run.mandate.id,
      slaHash: run.agentSla?.slaHash,
      zeroGSlaRoot: run.agentSla?.zeroGRoot,
      agentDnsResolutionHash: run.agentDnsResolution?.resolutionHash,
      taskActionType: run.agentSla?.taskActionType,
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
    agentHire: run.agentSla && run.agentDnsResolution ? {
      id: `hire_${run.id}`,
      caseId: run.id,
      eventName: 'AgentHired',
      requesterAgentId: run.agentSla.requesterAgentId,
      workerAgentId: run.agentSla.workerAgentId,
      requesterAddress,
      workerAddress,
      slaHash: run.agentSla.slaHash,
      agentDnsResolutionHash: run.agentDnsResolution.resolutionHash,
      zeroGSlaRoot: run.agentSla.zeroGRoot ?? '',
      hiredAt: new Date().toISOString(),
      prepareTxHash: settlementReceipt.prepareTxHash,
    } : undefined,
    events: [
      ...run.events,
      `0G Galileo prepare recorded: ${settlementReceipt.prepareTxHash ?? 'pending'}`,
      `AgentHired emitted for ${run.agentSla?.requesterAgentId ?? 'requester'} -> ${run.agentSla?.workerAgentId ?? 'worker'}`,
      `KeeperHub ${trialResult.mode} proof trial ${trialResult.data.executionId} captured`,
    ],
  };
}

async function attachKeeperHubReceipt(run: ProofCourtRun): Promise<ProofCourtRun> {
  const readyMessages = await sendAxlProtocolMessages(run, [
    {
      from: 'Worker Agent',
      to: 'Verifier-1',
      type: 'READY_TO_EXECUTE',
      payload: { permitHash: run.evidence.permitHash, action: run.keeperHubReceipt.action },
    },
  ]);

  const result = await executeKeeperHubWorkflow({
    workflowId: run.id,
    phase: 'execute-mandate',
    action: run.keeperHubReceipt.action,
    executor: 'Worker Agent',
    payload: {
      mandateId: run.mandate.id,
      slaHash: run.agentSla?.slaHash,
      zeroGSlaRoot: run.agentSla?.zeroGRoot,
      agentDnsResolutionHash: run.agentDnsResolution?.resolutionHash,
      taskActionType: run.agentSla?.taskActionType,
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
        from: 'Worker Agent',
        to: 'Verifier-1',
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
      executionReceipt: {
        phase: 'ProofCourtSettlement',
        actionType: run.agentSla?.taskActionType ?? 'proofOnlyTask',
        keeperHubExecutionId: result.data.executionId,
        keeperHubReceiptHash: stableHash(result.data),
        txHash: result.data.txHash,
        recordedAt: new Date().toISOString(),
      },
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
      from: 'Verifier-1',
      to: 'Requester Agent',
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
    agentDnsResolution: run.agentDnsResolution,
    agentSla: run.agentSla,
    permitReceipt: run.permitReceipt,
      executionReceipt: run.executionReceipt,
      agentHire: run.agentHire,
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
      mandateHash: run.agentSla?.mandateHash,
      slaHash: run.agentSla?.slaHash,
      zeroGSlaRoot: run.agentSla?.zeroGRoot,
      minTrustScore: run.mandate.minAgentTrustScore,
      executor: 'Worker Agent',
    },
    sharedSwarmState: {
      caseId: run.id,
      agentMemoryRoots: run.agentSla?.agentMemoryRoots,
      agentHire: run.agentHire,
      coordination: {
        requester: run.agentSla?.requesterAgentId,
        worker: run.agentSla?.workerAgentId,
        verifiers: run.agentSla?.verifierAgentIds,
      },
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
    mandateHash: run.agentSla?.mandateHash ?? mandateHash,
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
  const swarmMemoryResult = await storeEvidenceOnZeroG({
    caseId: `swarm-memory_${run.id}`,
    evidence: {
      version: 'proofcourt.swarm-memory.v1',
      caseId: run.id,
      mandate: run.mandate,
      agentDnsResolutionHash: run.agentDnsResolution?.resolutionHash,
      slaHash: run.agentSla?.slaHash,
      agentMemoryRoots: run.agentSla?.agentMemoryRoots,
      agentHire: run.agentHire,
      axlMessages: proofMessages.map((message) => ({
        from: message.from,
        to: message.to,
        type: message.type,
        hash: message.hash,
        payloadHash: message.payloadHash,
      })),
      executionReceipt: run.executionReceipt,
      evidenceRoot: result.data.root,
      storedAt: new Date().toISOString(),
    },
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
    swarmMemory: {
      caseId: run.id,
      memoryRoot: swarmMemoryResult.data.root,
      memoryTxHash: swarmMemoryResult.data.txHash,
      storedAt: new Date().toISOString(),
      sharedStateHash: stableHash({
        caseId: run.id,
        evidenceRoot: result.data.root,
        axlTranscriptHash,
        keeperHubReceiptHash,
      }),
      agentMemoryRoots: run.agentSla?.agentMemoryRoots ?? {},
    },
    zeroGStorageRoot: result.data.root,
    txHash: result.data.txHash ?? run.keeperHubReceipt.txHash,
    events: [
      ...run.events,
      `0G ${result.mode} evidence root stored`,
      `0G ${swarmMemoryResult.mode} swarm memory root stored`,
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

  // --- 3-Verifier Jury: each runs 0G Compute (distinct attestation) + AXL verdict; 5s compute timeout ---
  const verifierIds = ['verifier-1', 'verifier-2', 'verifier-3'] as const;
  const VERIFIER_TIMEOUT_MS = 5000;
  const mandateHash = stableHash(run.mandate);

  const verdictPromises = verifierIds.map(async (verifierId): Promise<VerifierVerdict> => {
    const proofCheck = verifyRunArtifacts(canonicalRun);
    const verifierLabel =
      verifierId === 'verifier-1' ? 'Verifier-1' : verifierId === 'verifier-2' ? 'Verifier-2' : 'Verifier-3';

    let computeResult: Awaited<ReturnType<typeof runZeroGComputeVerdict>>;
    try {
      computeResult = await Promise.race([
        runZeroGComputeVerdict({
          caseId: run.id,
          verifierId,
          evidenceRoot: canonicalRun.evidence.root ?? '',
          mandateHash,
          permitHash: run.evidence.permitHash,
          axlTranscriptHash: canonicalRun.evidence.axlTranscriptHash,
          keeperHubReceiptHash: canonicalRun.evidence.keeperHubReceiptHash,
          caseFileHash: stableHash({
            caseId: run.id,
            root: canonicalRun.evidence.root,
            verifierId,
            workOutputHash: run.workOutputHash,
          }),
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`${verifierId} compute timeout`)), VERIFIER_TIMEOUT_MS),
        ),
      ]);
    } catch {
      const ts = new Date().toISOString();
      return {
        verifierId,
        decision: 'OFFLINE',
        reasoningHash: stableHash({ offline: true, verifierId, caseId: run.id }),
        verdictHash: stableHash({ offline: verifierId, caseId: run.id, ts }),
        signature: stableHash({ offline: verifierId, ts }),
        timestamp: ts,
      };
    }

    const llmSaysPass = computeResult.data.compliant;
    const artifactsOk = proofCheck.passed;
    const decision: VerifierVerdict['decision'] = llmSaysPass && artifactsOk ? 'PASS' : 'FAIL';
    const reasoningHash = stableHash({
      verifier: verifierId,
      caseId: run.id,
      checks: proofCheck.checks,
      llmCompliant: llmSaysPass,
      computeVerdictHash: computeResult.data.verdictHash,
      promptHash: computeResult.data.promptHash,
      responseHash: computeResult.data.responseHash,
    });
    const verdictHash = stableHash({ verifierId, reasoningHash, decision });
    const verdict: VerifierVerdict = {
      verifierId,
      decision,
      reasoningHash,
      attestationHash: computeResult.data.attestationHash,
      promptHash: computeResult.data.promptHash,
      responseHash: computeResult.data.responseHash,
      computePromptHash: computeResult.data.promptHash,
      computeResponseHash: computeResult.data.responseHash,
      model: computeResult.data.model,
      source: computeResult.data.source,
      signatureValid: computeResult.data.signatureValid,
      computeVerdictHash: computeResult.data.verdictHash,
      verdictHash,
      signature: stableHash({ verifierId, verdictHash, ts: Date.now() }),
      timestamp: new Date().toISOString(),
    };

    try {
      await Promise.race([
        sendAxlProtocolMessages(
          canonicalRun,
          [
            {
              from: verifierLabel,
              to: 'Requester Agent',
              type: 'VERIFIER_VERDICT',
              payload: {
                verdictHash,
                decision: verdict.decision,
                reasoningHash,
                attestationHash: verdict.attestationHash,
              },
            },
          ],
          [],
        ),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`${verifierId} axl timeout`)), VERIFIER_TIMEOUT_MS),
        ),
      ]);
    } catch {
      // AXL slow — verdict still stands from compute + artifact check
    }

    return verdict;
  });

  const verdicts = await Promise.all(verdictPromises);
  const passCount = verdicts.filter((v) => v.decision === 'PASS').length;
  const failCount = verdicts.filter((v) => v.decision === 'FAIL').length;
  const responded = verdicts.filter((v) => v.decision !== 'OFFLINE').length;
  const quorumReached = responded >= 2 && (passCount >= 2 || failCount >= 2);
  const quorumPassed = passCount >= 2;

  const history = getAgentHistory(getExecutorAgent(run).id);
  const verificationReceipt = buildVerificationReceipt(
    canonicalRun,
    history,
    quorumPassed,
    !quorumPassed || (quorumReached && !quorumPassed),
  );
  const runWithVerification = {
    ...canonicalRun,
    evidence: {
      ...canonicalRun.evidence,
      verificationHash: verificationReceipt.verificationHash,
      verificationResult: quorumPassed ? 'PASS' as const : 'FAIL' as const,
    },
    verificationReceipt,
  };
  const settlementReceipt = quorumPassed
    ? await commitSettlement(runWithVerification)
    : await abortSettlement(runWithVerification);
  const settlementWorkflowResult = quorumPassed
    ? await executeSettlementWorkflow(run, settlementReceipt, runWithVerification)
    : undefined;
  let verdictTxHash: string | undefined;

  if (quorumPassed) {
    try {
      verdictTxHash = await recordZeroGComputeVerdict(
        settlementReceipt.contractCaseId,
        runWithVerification.evidence.verdictHash,
      );
    } catch {
      verdictTxHash = undefined;
    }
  }
  const finalSwarmMemory = await storeEvidenceOnZeroG({
    caseId: `swarm-memory-final_${run.id}`,
    evidence: {
      version: 'proofcourt.swarm-memory.final.v1',
      caseId: run.id,
      agentDnsResolutionHash: run.agentDnsResolution?.resolutionHash,
      slaHash: run.agentSla?.slaHash,
      agentMemoryRoots: run.agentSla?.agentMemoryRoots,
      agentHire: run.agentHire,
      verifierArtifacts: verdicts.map((verdict) => ({
        verifierId: verdict.verifierId,
        decision: verdict.decision,
        promptHash: verdict.promptHash,
        responseHash: verdict.responseHash,
        model: verdict.model,
        source: verdict.source,
        signatureValid: verdict.signatureValid,
        attestationHash: verdict.attestationHash,
        verdictHash: verdict.verdictHash,
        reasoningHash: verdict.reasoningHash,
      })),
      quorum: {
        passed: passCount,
        failed: failCount,
        reached: quorumReached,
      },
      verificationReceipt,
      settlementReceipt,
      storedAt: new Date().toISOString(),
    },
  });

  const verifiedRun: ProofCourtRun = {
    ...canonicalRun,
    state: quorumPassed ? run.state : 'payout_blocked',
    progress: quorumPassed ? run.progress : 100,
    settlementReceipt,
    settlementKeeperHubReceipt: settlementWorkflowResult?.data,
    runtimeKeeperHubWorkflow: settlementWorkflowResult?.runtimeWorkflow,
    verificationReceipt,
    verdicts,
    quorum: {
      passed: passCount,
      failed: failCount,
      reached: quorumReached,
    },
    swarmMemory: {
      caseId: run.id,
      memoryRoot: finalSwarmMemory.data.root,
      memoryTxHash: finalSwarmMemory.data.txHash,
      storedAt: new Date().toISOString(),
      sharedStateHash: stableHash({
        caseId: run.id,
        verdicts,
        settlementReceipt,
        verificationReceipt,
      }),
      agentMemoryRoots: run.agentSla?.agentMemoryRoots ?? {},
    },
    evidence: {
      ...canonicalRun.evidence,
      verificationHash: verificationReceipt.verificationHash,
      verificationResult: quorumPassed ? 'PASS' : 'FAIL',
      verdictTxHash,
    },
    payout: quorumPassed ? run.payout : { ...run.payout, status: 'Blocked' },
    txHash: settlementReceipt.commitTxHash ?? settlementReceipt.abortTxHash ?? run.txHash,
    events: [
      ...run.events,
      `3-Verifier Jury: ${passCount} PASS / ${failCount} FAIL / ${verdicts.filter((v) => v.decision === 'OFFLINE').length} OFFLINE (quorum ${quorumReached ? 'closed' : 'incomplete'})`,
      `VerificationReceipt ${verificationReceipt.id} issued`,
      quorumPassed
        ? `0G Galileo commit recorded: ${settlementReceipt.commitTxHash ?? 'pending'}`
        : `0G Galileo abort recorded: ${settlementReceipt.abortTxHash ?? 'pending'}`,
      ...(settlementWorkflowResult
        ? [
          ...(settlementWorkflowResult.runtimeWorkflow
            ? [`KeeperHub settlement workflow built at runtime via MCP: ${settlementWorkflowResult.runtimeWorkflow.workflowId}`]
            : []),
          `KeeperHub ${settlementWorkflowResult.mode} atomic settlement ${settlementWorkflowResult.data.executionId} captured`,
        ]
        : []),
      `0G ${finalSwarmMemory.mode} final swarm memory root stored`,
    ],
  };

  return quorumPassed ? verifiedRun : finalizeTrustUpdate(verifiedRun);
}

async function executeSettlementWorkflow(
  run: ProofCourtRun,
  settlementReceipt: NonNullable<ProofCourtRun['settlementReceipt']>,
  runWithVerification: ProofCourtRun,
) {
  const payload = {
    caseId: settlementReceipt.contractCaseId ?? run.id,
    localRunId: run.id,
    quorumPassed: true,
    workerAddress: run.workerAddress ?? settlementReceipt.executorAddress,
    requesterAddress: getRequesterAddress(run),
    escrowAmount: run.mandate.amount,
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
    verdict: 'PASS',
  };

  if (process.env.KEEPERHUB_BUILD_AT_RUNTIME === 'true') {
    try {
      const runtimeWorkflow = await buildProofCourtSettlementWorkflow(run.id);
      const execution = await executeKeeperHubMcpWorkflow(runtimeWorkflow.workflowId, runtimeWorkflow.webhookKey, payload);
      if (!execution.txHash) {
        throw new Error(`KeeperHub runtime settlement execution ${execution.executionId} did not expose a transaction hash`);
      }
      const txHash = execution.txHash;
      const logs = [
        {
          timestamp: new Date().toISOString(),
          node: 'keeperhub.runtime-mcp',
          level: 'info' as const,
          message: `Runtime settlement workflow ${runtimeWorkflow.workflowId} executed`,
          txHash,
          outputHash: stableHash({ runtimeWorkflow, execution }),
        },
      ];

      return {
        mode: 'live' as const,
        runtimeWorkflow: {
          ...runtimeWorkflow,
          phase: 'atomic-settlement' as const,
        },
        data: {
          workflowId: runtimeWorkflow.workflowId,
          phase: 'atomic-settlement' as const,
          executionId: execution.executionId,
          status: 'Completed' as const,
          action: 'ProofCourtEscrow.settleCase()',
          txHash,
          payloadHash: stableHash(payload),
          logHash: stableHash(logs),
          logs,
          gasOptimized: false,
          retryCount: 0,
          runtimeBuilt: true,
          webhookKey: runtimeWorkflow.webhookKey,
        },
      };
    } catch (error) {
      console.warn(`[KeeperHub MCP] runtime workflow failed: ${error instanceof Error ? error.message : String(error)} — using configured settlement workflow`);
    }
  }

  const configuredSettlement = await executeKeeperHubWorkflow({
    workflowId: run.id,
    phase: 'atomic-settlement',
    action: 'ProofCourtEscrow.settleCase()',
    executor: 'Worker Agent',
    payload,
  });
  return { ...configuredSettlement, runtimeWorkflow: undefined };
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
    agentDnsResolution: Boolean(run.agentDnsResolution?.resolutionHash),
    agentSla: Boolean(run.agentSla?.slaHash && run.agentSla.zeroGRoot),
    permitReceipt: Boolean(
      run.permitReceipt?.permitHash &&
      run.permitReceipt.slaHash === run.agentSla?.slaHash &&
      run.permitReceipt.zeroGSlaRoot === run.agentSla?.zeroGRoot
    ),
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
    submittedWork: isSubmittedWorkValid(run),
  };

  return {
    passed: Object.values(checks).every(Boolean),
    checks,
  };
}

async function finalizeTrustUpdate(run: ProofCourtRun): Promise<ProofCourtRun> {
  const receipt = run.verificationReceipt;

  if (!receipt) {
    return run;
  }

  const updatedRun = applyTrustUpdate(run, receipt);
  recordReceipt(receipt);
  const executor = getExecutorAgent(updatedRun);
  const evidenceHash = receipt.verificationHash || receipt.evidenceRoot;
  const onChain = executor.inft
    ? await updateOnChainReputation(executor.inft.tokenId, receipt.scoreDelta, evidenceHash)
    : undefined;
  const kvResult = executor.inft
    ? await writeReputationToKV({
      tokenId: executor.inft.tokenId,
      score: receipt.trustScoreAfter,
      casesTotal: executor.executions,
      casesPassed: executor.executions - executor.blocks,
      lastUpdated: receipt.issuedAt,
      evidenceHash,
    })
    : undefined;

  return {
    ...updatedRun,
    reputationTxHash: onChain?.txHash,
    reputationUpdateMode: onChain?.mode,
    reputationError: onChain?.error,
    zeroGKvTxHash: kvResult?.txHash,
    events: [
      ...run.events,
      `${receipt.executorName} trust score ${receipt.trustScoreBefore} -> ${receipt.trustScoreAfter} from receipt history`,
      ...(onChain
        ? [
          onChain.mode === 'error'
            ? `Agent iNFT #${onChain.tokenId} reputation update failed: ${onChain.error}`
            : `Agent iNFT #${onChain.tokenId} reputation ${onChain.mode === 'live' ? `updated on-chain: ${onChain.txHash}` : `update ${onChain.mode}`}`,
        ]
        : []),
      ...(kvResult?.mode === 'live' ? [`0G KV reputation stream updated: ${kvResult.txHash}`] : []),
    ],
  };
}

function isSubmittedWorkValid(run: ProofCourtRun): boolean {
  if (!run.workOutputHash) return true;
  return !/^0x(?:dead)+$/i.test(run.workOutputHash);
}

function getRequesterAddress(run: ProofCourtRun): string {
  return getAgentHolder(run, run.agentSla?.requesterAgentId, 'Requester');
}

function getAgentHolder(run: ProofCourtRun, agentId: string | undefined, roleLabel: string): string {
  const holder = run.agents.find((agent) => agent.id === agentId)?.inft?.holder;
  if (!holder) throw new Error(`AgentDNS ${roleLabel} holder is required for settlement workflow payload`);
  return holder;
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
