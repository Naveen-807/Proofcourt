import 'dotenv/config';
import express, { type ErrorRequestHandler } from 'express';
import {
  createRun,
  createWorkflowFromMandate,
  parseMandate,
  type ProofCourtRun,
  type WorkflowResponse,
} from '../src/domain/proofcourt.ts';
import { getAxlStatus, getAxlTranscript } from './adapters/axlAdapter.ts';
import { getContractStatus } from './adapters/contractRegistry.ts';
import { getKeeperHubStatus } from './adapters/keeperHubAdapter.ts';
import { getZeroGComputeStatus } from './adapters/zeroGComputeAdapter.ts';
import { getZeroGStatus } from './adapters/zeroGAdapter.ts';
import { getReputationFromKV, getZeroGKvStatus } from './adapters/zeroGKvAdapter.ts';
import {
  advanceRunWithIntegrations,
  getTrustSummary,
  replayRunFromZeroG,
  restoreRunWithIntegrations,
  tamperRunWithIntegrations,
} from './services/integratedRun.ts';
import { createPhaseOneArtifactsWithProgress } from './services/phaseOneProtocol.ts';
import { parseMandateWithZeroG } from './services/mandateIntentService.ts';
import { hydratePersistedState, persistRun, persistWorkflow } from './services/runPersistence.ts';
import { getEscrowFundingIntent } from './services/settlementService.ts';

const app = express();
const port = Number(process.env.PROOFCOURT_API_PORT ?? 8787);
const host = process.env.PROOFCOURT_API_HOST ?? '127.0.0.1';
const workflows = new Map<string, WorkflowResponse>();
const runs = new Map<string, ProofCourtRun>();
const phaseOneBootstrapDeadlineMs = Number(process.env.PROOFCOURT_PHASE_ONE_BOOTSTRAP_TIMEOUT_MS ?? 8 * 60 * 1000);
const activeBootstrapJobs = new Map<string, { token: symbol; startedAt: number; timer: ReturnType<typeof setTimeout> }>();

const persisted = hydratePersistedState();
for (const [id, workflow] of persisted.workflows) workflows.set(id, workflow);
for (const [id, run] of persisted.runs) runs.set(id, markStaleBootstrapIfNeeded(run));

app.use(express.json());
const jsonErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (error instanceof SyntaxError) {
    res.status(400).json({ error: 'invalid_json' });
    return;
  }

  next(error);
};

app.use(jsonErrorHandler);
app.use((_, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

app.options('*', (_, res) => {
  res.status(204).end();
});

app.get('/api/health', (_, res) => {
  res.json({ ok: true, service: 'proofcourt-api' });
});

app.get('/api/integrations/status', async (_, res) => {
  try {
    res.json({
      axl: await getAxlStatus(),
      keeperHub: getKeeperHubStatus(),
      zeroG: getZeroGStatus(),
      zeroGCompute: getZeroGComputeStatus(),
      zeroGKv: getZeroGKvStatus(),
      contracts: getContractStatus(),
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'integration_status_failed' });
  }
});

app.get('/api/axl/transcript/:workflowId', (req, res) => {
  res.json({
    workflowId: req.params.workflowId,
    messages: getAxlTranscript(req.params.workflowId),
  });
});

function startPhaseOneBootstrap(runId: string, workflow: WorkflowResponse) {
  if (activeBootstrapJobs.has(runId)) return;

  const token = Symbol(runId);
  const timer = setTimeout(() => {
    failBootstrapRun(runId, token, `Phase 1 bootstrap timed out after ${Math.round(phaseOneBootstrapDeadlineMs / 60000)} minutes`);
  }, phaseOneBootstrapDeadlineMs);
  activeBootstrapJobs.set(runId, { token, startedAt: Date.now(), timer });

  void (async () => {
    try {
      const updateRunIfActive = (mutator: (current: ProofCourtRun) => ProofCourtRun) => {
        if (activeBootstrapJobs.get(runId)?.token !== token) return;
        const current = runs.get(runId);
        if (!current) return;
        const next = mutator(current);
        runs.set(next.id, next);
        persistRun(next);
      };

      const { agentDnsResolution, agentSla } = await createPhaseOneArtifactsWithProgress(workflow.mandate, {
        onAgentMemoryStarted: ({ agentId, completed, total }) => {
          updateRunIfActive((current) => ({
            ...current,
            progress: Math.max(current.progress, 5 + completed * 8),
            events: [
              ...current.events,
              `Agent memory upload started for ${agentId} (${completed + 1}/${total})`,
            ],
          }));
        },
        onAgentMemoryStored: ({ agentId, completed, total, root }) => {
          updateRunIfActive((current) => ({
            ...current,
            progress: Math.min(5 + completed * 8, 45),
            events: [
              ...current.events,
              `0G agent memory stored for ${agentId} (${completed}/${total}): ${root.slice(0, 18)}`,
            ],
          }));
        },
        onAgentDnsResolved: (resolution) => {
          updateRunIfActive((current) => ({
            ...current,
            progress: 55,
            agentDnsResolution: resolution,
            selectedAgentIds: resolution.selectedAgentIds,
            rejectedAgentIds: resolution.rejectedAgentIds,
            events: [
              ...current.events,
              `AgentDNS resolved from Agent iNFT contract: ${resolution.resolutionHash}`,
            ],
          }));
        },
        onAgentSlaStarted: () => {
          updateRunIfActive((current) => ({
            ...current,
            progress: Math.max(current.progress, 60),
            events: [...current.events, 'AgentSLA upload started on 0G Storage'],
          }));
        },
        onAgentSlaStored: (sla) => {
          updateRunIfActive((current) => ({
            ...current,
            progress: 70,
            agentSla: sla,
            events: [
              ...current.events,
              ...(sla.zeroGRoot ? [`AgentSLA stored on 0G before permit: ${sla.zeroGRoot}`] : []),
            ],
          }));
        },
      });

      if (activeBootstrapJobs.get(runId)?.token !== token) return;
      const current = runs.get(runId);
      if (!current) return;
      const hydratedRun = createRun(
        {
          ...workflow,
          agents: [],
          selectedAgentIds: agentDnsResolution.selectedAgentIds,
          rejectedAgentIds: agentDnsResolution.rejectedAgentIds,
        },
        agentDnsResolution,
        agentSla,
      );
      const bootstrappedRun: ProofCourtRun = {
        ...hydratedRun,
        id: current.id,
        createdAt: current.createdAt,
        bootstrapping: false,
        bootstrapError: undefined,
        progress: 70,
        events: [...current.events, 'Phase 1 bootstrap completed'],
      };
      runs.set(bootstrappedRun.id, bootstrappedRun);
      persistRun(bootstrappedRun);
    } catch (error) {
      failBootstrapRun(
        runId,
        token,
        error instanceof Error ? error.message : 'phase_one_failed',
      );
    } finally {
      const job = activeBootstrapJobs.get(runId);
      if (job?.token === token) {
        clearTimeout(job.timer);
        activeBootstrapJobs.delete(runId);
      }
    }
  })();
}

function failBootstrapRun(runId: string, token: symbol, reason: string) {
  const job = activeBootstrapJobs.get(runId);
  if (job?.token !== token) return;

  clearTimeout(job.timer);
  activeBootstrapJobs.delete(runId);
  const current = runs.get(runId);
  if (!current || current.settlementReceipt?.fundingTxHash) return;

  const failedRun: ProofCourtRun = {
    ...current,
    bootstrapping: false,
    bootstrapError: reason,
    progress: current.progress,
    events: [
      ...current.events,
      `Phase 1 bootstrap failed: ${reason}`,
    ],
  };
  runs.set(failedRun.id, failedRun);
  persistRun(failedRun);
}

function getStoredRun(id: string): ProofCourtRun | undefined {
  const run = runs.get(id);
  if (!run) return undefined;
  const reconciled = markStaleBootstrapIfNeeded(run);
  if (reconciled !== run) {
    runs.set(reconciled.id, reconciled);
    persistRun(reconciled);
  }
  return reconciled;
}

function markStaleBootstrapIfNeeded(run: ProofCourtRun): ProofCourtRun {
  if (!run.bootstrapping || run.bootstrapError || run.settlementReceipt?.fundingTxHash || activeBootstrapJobs.has(run.id)) {
    return run;
  }

  const createdAtMs = run.createdAt ? Date.parse(run.createdAt) : Number.NaN;
  if (!Number.isFinite(createdAtMs) || Date.now() - createdAtMs < phaseOneBootstrapDeadlineMs) {
    return run;
  }

  const reason = `Phase 1 bootstrap timed out after ${Math.round(phaseOneBootstrapDeadlineMs / 60000)} minutes`;
  return {
    ...run,
    bootstrapping: false,
    bootstrapError: reason,
    events: [...run.events, `Phase 1 bootstrap failed: ${reason}`],
  };
}

app.post('/api/workflows/generate', async (req, res) => {
  const body = req.body ?? {};
  const text =
    (typeof body.text === 'string' && body.text.trim().length > 0 && body.text.trim()) ||
    (typeof body.title === 'string' && body.title.trim().length > 0 && body.title.trim()) ||
    (typeof body.description === 'string' && body.description.trim().length > 0 && body.description.trim());

  if (!text) {
    res.status(400).json({ error: 'workflow_text_required' });
    return;
  }

  try {
    let mandate;
    try {
      mandate = await parseMandateWithZeroG(text);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'mandate_parse_failed';
      const allowDeterministicFallback =
        message.includes('insufficient balance')
        || message.includes('Service provider does not exist')
        || message.includes('No 0G Compute providers were discovered')
        || message.includes('provider metadata lookup failed');

      if (!allowDeterministicFallback) {
        throw error;
      }

      mandate = parseMandate(text);
    }

    const workflow = createWorkflowFromMandate(mandate);
    workflows.set(workflow.mandate.id, workflow);
    persistWorkflow(workflow);
    res.json(workflow);
  } catch (error) {
    res.status(424).json({ error: error instanceof Error ? error.message : 'mandate_parse_failed' });
  }
});

app.post('/api/runs', async (req, res) => {
  const mandateId = req.body?.mandateId;
  const workflow = typeof mandateId === 'string' ? workflows.get(mandateId) : undefined;

  if (!workflow) {
    res.status(404).json({ error: 'workflow_not_found' });
    return;
  }

  const pendingRun = createRun(workflow);
  runs.set(pendingRun.id, pendingRun);
  persistRun(pendingRun);
  res.json(pendingRun);

  startPhaseOneBootstrap(pendingRun.id, workflow);
});

app.post('/api/runs/:id/bootstrap/retry', (req, res) => {
  const run = getStoredRun(req.params.id);

  if (!run) {
    res.status(404).json({ error: 'run_not_found' });
    return;
  }

  if (run.bootstrapping || activeBootstrapJobs.has(run.id)) {
    res.status(409).json({ error: 'phase_one_bootstrap_already_running' });
    return;
  }

  if (run.settlementReceipt?.fundingTxHash) {
    res.status(409).json({ error: 'cannot_retry_phase_one_after_escrow_funding' });
    return;
  }

  const retryRun: ProofCourtRun = {
    ...run,
    state: 'workflow_generated',
    progress: 0,
    bootstrapping: true,
    bootstrapError: undefined,
    agentDnsResolution: undefined,
    agentSla: undefined,
    agentHire: undefined,
    permitReceipt: undefined,
    agents: [],
    selectedAgentIds: [],
    rejectedAgentIds: [],
    events: [...run.events, 'Retrying Phase 1 bootstrap with real AgentDNS + 0G AgentSLA'],
  };
  runs.set(retryRun.id, retryRun);
  persistRun(retryRun);

  const workflow = workflows.get(retryRun.mandate.id) ?? createWorkflowFromMandate(retryRun.mandate);
  workflows.set(workflow.mandate.id, workflow);
  persistWorkflow(workflow);
  startPhaseOneBootstrap(retryRun.id, workflow);
  res.json(retryRun);
});

app.get('/api/runs/:id/escrow-intent', (req, res) => {
  const run = getStoredRun(req.params.id);

  if (!run) {
    res.status(404).json({ error: 'run_not_found' });
    return;
  }

  if (run.bootstrapping || run.bootstrapError || !run.agentDnsResolution || !run.agentSla?.zeroGRoot) {
    res.status(409).json({ error: run.bootstrapError ?? 'phase_one_bootstrap_not_ready' });
    return;
  }

  try {
    res.json(getEscrowFundingIntent(run));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'escrow_intent_failed' });
  }
});

app.post('/api/runs/:id/escrow', (req, res) => {
  const run = getStoredRun(req.params.id);

  if (!run) {
    res.status(404).json({ error: 'run_not_found' });
    return;
  }

  if (run.bootstrapping || run.bootstrapError || !run.agentDnsResolution || !run.agentSla?.zeroGRoot) {
    res.status(409).json({ error: run.bootstrapError ?? 'phase_one_bootstrap_not_ready' });
    return;
  }

  const { txHash, contractCaseId, payerAddress, executorAddress, fundedAmount, workflowId } = req.body ?? {};
  if (
    typeof txHash !== 'string' ||
    typeof contractCaseId !== 'string' ||
    typeof payerAddress !== 'string' ||
    typeof executorAddress !== 'string' ||
    typeof fundedAmount !== 'string'
  ) {
    res.status(400).json({ error: 'txHash, contractCaseId, payerAddress, executorAddress, and fundedAmount are required' });
    return;
  }

  const updatedRun: ProofCourtRun = {
    ...run,
    settlementReceipt: {
      ...run.settlementReceipt,
      mode: 'live',
      caseId: run.id,
      workflowId: typeof workflowId === 'string' ? workflowId : getEscrowFundingIntent(run).workflowId,
      executorAddress,
      payerAddress,
      fundedAmount,
      escrowStatus: 'Pending',
      contractCaseId,
      fundingTxHash: txHash,
    },
    payout: {
      ...run.payout,
      escrowFunded: fundedAmount,
      executorPayout: fundedAmount,
      status: 'Locked',
    },
    txHash,
    events: [...run.events, `Requester funded escrow case ${contractCaseId} on 0G Galileo: ${txHash}`],
  };

  runs.set(updatedRun.id, updatedRun);
  persistRun(updatedRun);
  res.json(updatedRun);
});

app.get('/api/runs/:id', (req, res) => {
  const run = getStoredRun(req.params.id);

  if (!run) {
    res.status(404).json({ error: 'run_not_found' });
    return;
  }

  res.json(run);
});

app.post('/api/runs/:id/advance', async (req, res) => {
  const run = getStoredRun(req.params.id);

  if (!run) {
    res.status(404).json({ error: 'run_not_found' });
    return;
  }

  if (run.bootstrapping || run.bootstrapError || !run.agentDnsResolution || !run.agentSla?.zeroGRoot) {
    res.status(409).json({ error: run.bootstrapError ?? 'phase_one_bootstrap_not_ready' });
    return;
  }

  try {
    const nextRun = await advanceRunWithIntegrations(run);
    runs.set(nextRun.id, nextRun);
    persistRun(nextRun);
    res.json(nextRun);
  } catch (error) {
    const blockedRun = blockRunOnProofFailure(run, error instanceof Error ? error.message : 'advance_failed');
    if (blockedRun) {
      runs.set(blockedRun.id, blockedRun);
      persistRun(blockedRun);
      res.json(blockedRun);
      return;
    }

    res.status(500).json({ error: error instanceof Error ? error.message : 'advance_failed' });
  }
});

function blockRunOnProofFailure(run: ProofCourtRun, reason: string): ProofCourtRun | undefined {
  const proofGateStates: ProofCourtRun['state'][] = [
    'commit_running',
    'execution_complete',
    'evidence_stored',
    'proof_verified',
    'payout_locked',
  ];
  if (!proofGateStates.includes(run.state)) return undefined;

  return {
    ...run,
    state: 'payout_blocked',
    progress: Math.max(run.progress, 75),
    evidence: {
      ...run.evidence,
      verificationResult: 'FAIL',
      verdictCompliant: false,
      verdictReason: reason,
    },
    payout: {
      ...run.payout,
      status: 'Blocked',
    },
    events: [
      ...run.events,
      `ProofCourt blocked payout: ${reason}`,
    ],
  };
}

app.post('/api/runs/:id/tamper', (req, res) => {
  const run = runs.get(req.params.id);

  if (!run) {
    res.status(404).json({ error: 'run_not_found' });
    return;
  }

  tamperRunWithIntegrations(run)
    .then((nextRun) => {
      runs.set(nextRun.id, nextRun);
      persistRun(nextRun);
      res.json(nextRun);
    })
    .catch((error) => {
      res.status(500).json({ error: error instanceof Error ? error.message : 'tamper_failed' });
    });
});

app.get('/api/runs/:id/replay', async (req, res) => {
  const run = runs.get(req.params.id);

  if (!run) {
    res.status(404).json({ error: 'run_not_found' });
    return;
  }

  try {
    const nextRun = await replayRunFromZeroG(req.params.id, run);
    runs.set(nextRun.id, nextRun);
    persistRun(nextRun);
    res.json(nextRun);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'replay_failed' });
  }
});

app.post('/api/runs/:id/restore', async (req, res) => {
  const run = runs.get(req.params.id);

  if (!run) {
    res.status(404).json({ error: 'run_not_found' });
    return;
  }

  try {
    const nextRun = await restoreRunWithIntegrations(run);
    runs.set(nextRun.id, nextRun);
    persistRun(nextRun);
    res.json(nextRun);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'restore_failed' });
  }
});

app.get('/api/agents/:id/trust', async (req, res) => {
  const latestRun = [...runs.values()].at(-1);
  const latestAgent = latestRun?.agents.find((agent) => agent.id === req.params.id);
  const trust = getTrustSummary(req.params.id, latestAgent?.score ?? 0);
  const kv = latestAgent?.inft?.tokenId ? await getReputationFromKV(latestAgent.inft.tokenId) : null;
  res.json({
    ...trust,
    iNFTAddress: process.env.AGENT_INFT_ADDRESS ?? null,
    tokenId: latestAgent?.inft?.tokenId ?? null,
    kv,
  });
});

// SDK endpoint: list all cases (used by CourthouseGallery and ProofCourt.awaitVerdict)
app.get('/api/cases', (_req, res) => {
  const cases = [...runs.values()].map((run) => ({
    id: run.id,
    state: run.state,
    createdAt: run.createdAt,
    mandate: run.mandate,
    agentDnsResolution: run.agentDnsResolution,
    agentSla: run.agentSla,
    agentHire: run.agentHire,
    permitReceipt: run.permitReceipt,
    executionReceipt: run.executionReceipt,
    swarmMemory: run.swarmMemory,
    quorum: run.quorum,
    zeroGRoot: run.zeroGStorageRoot ?? run.evidence.root,
    txHash: run.txHash ?? run.settlementReceipt?.commitTxHash ?? run.settlementReceipt?.abortTxHash ?? run.evidence.txHash,
    evidence: run.evidence,
    verdicts: run.verdicts,
    verificationReceipt: run.verificationReceipt,
    settlementReceipt: run.settlementReceipt,
    settlementKeeperHubReceipt: run.settlementKeeperHubReceipt,
    reputationTxHash: run.reputationTxHash,
    reputationUpdateMode: run.reputationUpdateMode,
    reputationError: run.reputationError,
    runtimeKeeperHubWorkflow: run.runtimeKeeperHubWorkflow,
    agentInftAddress: process.env.AGENT_INFT_ADDRESS ?? null,
    agents: run.agents,
  }));
  res.json({ cases, total: cases.length });
});

// SDK endpoint: submit work for an existing run (worker side)
app.post('/api/runs/:id/work', (req, res) => {
  const run = runs.get(req.params.id);
  if (!run) {
    res.status(404).json({ error: 'run_not_found' });
    return;
  }

  const { outputHash, summary, workerAddress } = req.body ?? {};
  if (!outputHash) {
    res.status(400).json({ error: 'outputHash is required' });
    return;
  }

  // Record work submission — advances state toward verification phase
  const updatedRun: ProofCourtRun = {
    ...run,
    workOutputHash: outputHash,
    workSummary: summary ?? undefined,
    workerAddress: workerAddress ?? run.workerAddress,
  };
  runs.set(run.id, updatedRun);
  persistRun(updatedRun);
  res.json({ caseId: run.id, state: updatedRun.state, workOutputHash: outputHash });
});

app.listen(port, host, () => {
  console.log(`ProofCourt API listening on http://${host}:${port}`);
});
