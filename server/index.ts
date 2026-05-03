import 'dotenv/config';
import express, { type ErrorRequestHandler } from 'express';
import {
  createRun,
  createWorkflow,
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
import { createPhaseOneArtifacts } from './services/phaseOneProtocol.ts';
import { hydratePersistedState, persistRun, persistWorkflow } from './services/runPersistence.ts';
import { getEscrowFundingIntent } from './services/settlementService.ts';

const app = express();
const port = Number(process.env.PROOFCOURT_API_PORT ?? 8787);
const host = process.env.PROOFCOURT_API_HOST ?? '127.0.0.1';
const workflows = new Map<string, WorkflowResponse>();
const runs = new Map<string, ProofCourtRun>();

const persisted = hydratePersistedState();
for (const [id, workflow] of persisted.workflows) workflows.set(id, workflow);
for (const [id, run] of persisted.runs) runs.set(id, run);

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

app.post('/api/workflows/generate', (req, res) => {
  const body = req.body ?? {};
  const text =
    (typeof body.text === 'string' && body.text.trim().length > 0 && body.text.trim()) ||
    (typeof body.title === 'string' && body.title.trim().length > 0 && body.title.trim()) ||
    (typeof body.description === 'string' && body.description.trim().length > 0 && body.description.trim());

  if (!text) {
    res.status(400).json({ error: 'workflow_text_required' });
    return;
  }

  const workflow = createWorkflow(text);
  workflows.set(workflow.mandate.id, workflow);
  persistWorkflow(workflow);
  res.json(workflow);
});

app.post('/api/runs', async (req, res) => {
  const mandateId = req.body?.mandateId;
  const workflow = typeof mandateId === 'string' ? workflows.get(mandateId) : undefined;

  if (!workflow) {
    res.status(404).json({ error: 'workflow_not_found' });
    return;
  }

  try {
    const { agentDnsResolution, agentSla } = await createPhaseOneArtifacts(workflow.mandate);
    const run = createRun(
      {
        ...workflow,
        agents: [],
        selectedAgentIds: agentDnsResolution.selectedAgentIds,
        rejectedAgentIds: agentDnsResolution.rejectedAgentIds,
      },
      agentDnsResolution,
      agentSla,
    );
    runs.set(run.id, run);
    persistRun(run);
    res.json(run);
  } catch (error) {
    res.status(424).json({ error: error instanceof Error ? error.message : 'phase_one_failed' });
  }
});

app.get('/api/runs/:id/escrow-intent', (req, res) => {
  const run = runs.get(req.params.id);

  if (!run) {
    res.status(404).json({ error: 'run_not_found' });
    return;
  }

  try {
    res.json(getEscrowFundingIntent(run));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'escrow_intent_failed' });
  }
});

app.post('/api/runs/:id/escrow', (req, res) => {
  const run = runs.get(req.params.id);

  if (!run) {
    res.status(404).json({ error: 'run_not_found' });
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
  const run = runs.get(req.params.id);

  if (!run) {
    res.status(404).json({ error: 'run_not_found' });
    return;
  }

  res.json(run);
});

app.post('/api/runs/:id/advance', async (req, res) => {
  const run = runs.get(req.params.id);

  if (!run) {
    res.status(404).json({ error: 'run_not_found' });
    return;
  }

  try {
    const nextRun = await advanceRunWithIntegrations(run);
    runs.set(nextRun.id, nextRun);
    persistRun(nextRun);
    res.json(nextRun);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'advance_failed' });
  }
});

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
