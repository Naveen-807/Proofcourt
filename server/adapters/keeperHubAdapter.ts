/**
 * KeeperHub Adapter — wfb_ webhook-key execution + x402 USDC payment
 *
 * Phase 6 changes:
 * - Execution endpoint is POST /api/workflows/{id}/webhook (not /run or /execute)
 * - Auth uses per-workflow wfb_ keys (one per phase)
 * - Status/logs polling uses the org kh_ key on /api/executions/{id}
 * - x402 USDC payments handled via @keeperhub/wallet paymentSigner.fetch
 * - Graceful mock fallback when keys are absent (demo-safe on laptop)
 */

import { stableHash } from './hash.ts';
import type {
  IntegrationResult,
  KeeperHubExecuteInput,
  KeeperHubExecuteResult,
  KeeperHubLogEntry,
} from './integrationTypes.ts';

// Organisation-scoped key — used for GET /api/workflows, /api/executions
const keeperHubApiUrl = process.env.KEEPERHUB_API_URL ?? 'https://app.keeperhub.com';
const orgApiKey = process.env.KEEPERHUB_API_KEY;

// Per-workflow wfb_ keys for execution via webhook endpoint
const wfbKeys: Record<KeeperHubExecuteInput['phase'], string | undefined> = {
  'proof-trial': process.env.KEEPERHUB_TRIAL_KEY ?? process.env.KEEPERHUB_API_KEY,
  'execute-mandate': process.env.KEEPERHUB_EXECUTE_KEY ?? process.env.KEEPERHUB_API_KEY,
  'atomic-settlement': process.env.KEEPERHUB_SETTLE_KEY ?? process.env.KEEPERHUB_API_KEY,
};

// Workflow IDs pre-created in KeeperHub UI
const workflowIds: Record<KeeperHubExecuteInput['phase'], string | undefined> = {
  'proof-trial': process.env.KEEPERHUB_TRIAL_WORKFLOW_ID ?? process.env.KEEPERHUB_WORKFLOW_ID,
  'execute-mandate': process.env.KEEPERHUB_EXECUTE_WORKFLOW_ID ?? process.env.KEEPERHUB_WORKFLOW_ID,
  'atomic-settlement': process.env.KEEPERHUB_SETTLEMENT_WORKFLOW_ID ?? process.env.KEEPERHUB_WORKFLOW_ID,
};

const pollMs = Number(process.env.KEEPERHUB_POLL_MS ?? 1500);
const maxPolls = Number(process.env.KEEPERHUB_MAX_POLLS ?? 20);

function isConfigured(phase: KeeperHubExecuteInput['phase']): boolean {
  return Boolean(keeperHubApiUrl && workflowIds[phase] && wfbKeys[phase]);
}

// ---------------------------------------------------------------------------
// x402 fetch wrapper — auto-pays 402 challenges using @keeperhub/wallet
// ---------------------------------------------------------------------------
async function x402Fetch(
  url: string,
  init: RequestInit & { paymentHint?: string },
): Promise<Response> {
  try {
    const { paymentSigner } = await import('@keeperhub/wallet');
    return await paymentSigner.fetch(url, init as Parameters<typeof paymentSigner.fetch>[1]);
  } catch {
    // Wallet not configured or payment not needed — fall through to plain fetch
    return fetch(url, init);
  }
}

// ---------------------------------------------------------------------------
// Core webhook execution (wfb_ key)
// ---------------------------------------------------------------------------
async function triggerWebhook(
  phase: KeeperHubExecuteInput['phase'],
  workflowId: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const webhookKey = wfbKeys[phase];
  const url = `${keeperHubApiUrl.replace(/\/$/, '')}/api/workflows/${encodeURIComponent(workflowId)}/webhook`;

  const response = await x402Fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${webhookKey}`,
    },
    body: JSON.stringify(payload),
    paymentHint: 'x402',
  });

  const json: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = extractErrorMessage(json) ?? `KeeperHub webhook returned ${response.status}`;
    throw new Error(msg);
  }

  const executionId =
    extractString(json, ['executionId', 'id', 'runId']) ??
    extractString((json as Record<string, unknown>)?.data, ['executionId', 'id', 'runId']);
  if (!executionId) {
    throw new Error(`KeeperHub webhook for ${phase} did not return an execution ID`);
  }
  return executionId;
}

// ---------------------------------------------------------------------------
// Polling (uses org kh_ key)
// ---------------------------------------------------------------------------
async function pollExecution(executionId: string): Promise<{
  status: KeeperHubExecuteResult['status'];
  logs: KeeperHubLogEntry[];
  txHash?: string;
  raw: Record<string, unknown>;
}> {
  const headers: HeadersInit = orgApiKey
    ? { Authorization: `Bearer ${orgApiKey}` }
    : {};
  const base = keeperHubApiUrl.replace(/\/$/, '');

  for (let attempt = 0; attempt < maxPolls; attempt++) {
    const response = await fetch(`${base}/api/executions/${encodeURIComponent(executionId)}`, {
      headers,
    });
    const json: unknown = await response.json().catch(() => ({}));
    const body = (json as Record<string, unknown>) ?? {};

    const rawStatus = extractString(body, ['status', 'state']) ?? 'running';
    if (isTerminal(rawStatus)) {
      const logsArr = await fetchExecutionLogs(executionId, headers, base);
      const txHash =
        logsArr.find((l) => l.txHash)?.txHash ??
        extractNestedString(body, [
          ['output', 'txHash'],
          ['output', 'transactionHash'],
        ]) ??
        extractString(body, ['txHash', 'transactionHash']);

      return {
        status: normalizeStatus(rawStatus),
        logs: logsArr,
        txHash,
        raw: body,
      };
    }
    await delay(pollMs);
  }

  throw new Error(`KeeperHub execution ${executionId} did not reach terminal state in time`);
}

async function fetchExecutionLogs(
  executionId: string,
  headers: HeadersInit,
  base: string,
): Promise<KeeperHubLogEntry[]> {
  try {
    const res = await fetch(`${base}/api/executions/${encodeURIComponent(executionId)}/logs`, {
      headers,
    });
    const json: unknown = await res.json().catch(() => ({}));
    const body = json as Record<string, unknown>;
    const arr = Array.isArray(body) ? body : Array.isArray(body?.data) ? (body.data as unknown[]) : [];
    return normalizeLogs(arr, executionId);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Mock fallback (demo on laptop without KeeperHub account)
// ---------------------------------------------------------------------------
function buildMock(input: KeeperHubExecuteInput): IntegrationResult<KeeperHubExecuteResult> {
  const workflowId = workflowIds[input.phase] ?? `mock-wf-${input.phase}`;
  const executionId = `mock-exec-${Date.now()}`;
  const txHash = `0x${stableHash(JSON.stringify(input), 'mock-tx').slice(0, 64)}`;
  const payloadHash = stableHash(JSON.stringify(input.payload));

  const logMessages: Record<KeeperHubExecuteInput['phase'], string> = {
    'proof-trial': '[MOCK] Trial proof submitted — 0.00001 USDC transfer simulated',
    'execute-mandate': '[MOCK] Worker mandate executed — payout route selected',
    'atomic-settlement':
      input.payload?.verdict === 'PASS'
        ? '[MOCK] Settlement PASS — worker paid via web3/transfer-token'
        : '[MOCK] Settlement FAIL — requester refunded',
  };

  return {
    mode: 'mock',
    data: {
      workflowId,
      phase: input.phase,
      executionId,
      status: 'Completed',
      action: input.action,
      txHash,
      payloadHash,
      logHash: stableHash(txHash),
      logs: [
        {
          timestamp: new Date().toISOString(),
          node: `keeperhub.${input.phase}`,
          level: 'info',
          message: logMessages[input.phase],
          txHash,
          outputHash: stableHash(txHash),
        },
      ],
      gasOptimized: false,
      retryCount: 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export async function executeKeeperHubWorkflow(
  input: KeeperHubExecuteInput,
): Promise<IntegrationResult<KeeperHubExecuteResult>> {
  if (!isConfigured(input.phase)) {
    console.warn(
      `[KeeperHub] ${input.phase} not configured (KEEPERHUB_${input.phase.toUpperCase().replace(/-/g, '_')}_KEY missing) — using mock`,
    );
    return buildMock(input);
  }

  const workflowId = workflowIds[input.phase]!;

  try {
    const executionId = await triggerWebhook(input.phase, workflowId, {
      input: input.payload,
      phase: input.phase,
      proofcourtWorkflowId: input.workflowId,
      proofcourtAction: input.action,
      executor: input.executor,
      metadata: { source: 'proofcourt', localWorkflowId: input.workflowId },
    });

    const terminal = await pollExecution(executionId);
    const payloadHash = stableHash(JSON.stringify(input.payload));
    const txHash = terminal.txHash;

    if (!txHash) {
      throw new Error(
        `KeeperHub ${input.phase} execution ${executionId} did not expose a transaction hash`,
      );
    }

    return {
      mode: 'live',
      data: {
        workflowId,
        phase: input.phase,
        executionId,
        status: terminal.status,
        action: input.action,
        txHash,
        payloadHash,
        logHash: stableHash(JSON.stringify(terminal.logs)),
        logs: terminal.logs,
        gasOptimized: Boolean(terminal.raw?.gasOptimized),
        retryCount: Number(terminal.raw?.retryCount ?? 0),
      },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown KeeperHub error';
    console.warn(`[KeeperHub] ${input.phase} live call failed: ${msg} — using mock`);
    const mock = buildMock(input);
    return { mode: 'mock', data: { ...mock.data, logs: [{ ...mock.data.logs[0], message: `[FALLBACK] ${msg}` }] } };
  }
}

export function getKeeperHubStatus() {
  const configuredPhases = (
    Object.entries(workflowIds) as [KeeperHubExecuteInput['phase'], string | undefined][]
  )
    .filter(([phase, id]) => Boolean(id && wfbKeys[phase]))
    .map(([phase, id]) => ({ phase, workflowId: id! }));

  return {
    configured: configuredPhases.length === 3,
    mode: configuredPhases.length === 3 ? 'live' : configuredPhases.length > 0 ? 'partial' : 'mock',
    endpoint: keeperHubApiUrl,
    workflows: configuredPhases,
    x402Enabled: Boolean(process.env.KEEPERHUB_TRIAL_KEY ?? process.env.KEEPERHUB_EXECUTE_KEY ?? process.env.KEEPERHUB_SETTLE_KEY),
    keyType: 'wfb_ per-workflow webhook keys',
    pollMs,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function normalizeStatus(status: string): KeeperHubExecuteResult['status'] {
  const s = status.toLowerCase();
  if (s.includes('fail') || s.includes('error') || s.includes('cancel')) return 'Failed';
  return 'Completed';
}

function isTerminal(status: string): boolean {
  return ['complete', 'success', 'succeed', 'done', 'fail', 'error', 'cancel'].some((t) =>
    status.toLowerCase().includes(t),
  );
}

function normalizeLogs(arr: unknown[], executionId: string): KeeperHubLogEntry[] {
  return (arr as Record<string, unknown>[]).map((entry, i) => ({
    timestamp: String(entry?.timestamp ?? entry?.time ?? new Date().toISOString()),
    node: String(entry?.node ?? entry?.step ?? entry?.name ?? `keeperhub.node.${i + 1}`),
    level: normalizeLevel(String(entry?.level ?? entry?.status ?? 'info')),
    message: String(entry?.message ?? entry?.output ?? entry?.error ?? `KeeperHub log ${i + 1} for ${executionId}`),
    txHash: extractString(entry, ['txHash', 'transactionHash', 'hash']) ?? extractNestedString(entry, [['output', 'txHash']]),
    outputHash: extractString(entry, ['outputHash']) ?? stableHash(entry as Record<string, unknown>),
  }));
}

function normalizeLevel(level: string): KeeperHubLogEntry['level'] {
  const l = level.toLowerCase();
  if (l.includes('error') || l.includes('fail')) return 'error';
  if (l.includes('warn')) return 'warn';
  return 'info';
}

function extractString(json: unknown, fields: string[]): string | undefined {
  if (!json || typeof json !== 'object') return undefined;
  const record = json as Record<string, unknown>;
  for (const f of fields) {
    const v = record[f];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

function extractNestedString(json: unknown, paths: string[][]): string | undefined {
  if (!json || typeof json !== 'object') return undefined;
  for (const path of paths) {
    let cur: unknown = json;
    for (const key of path) {
      if (!cur || typeof cur !== 'object') { cur = undefined; break; }
      cur = (cur as Record<string, unknown>)[key];
    }
    if (typeof cur === 'string' && cur.length > 0) return cur;
  }
  return undefined;
}

function extractErrorMessage(json: unknown): string | undefined {
  if (!json || typeof json !== 'object') return undefined;
  const record = json as Record<string, unknown>;
  const err = record?.error ?? record?.message;
  if (typeof err === 'string' && err.length > 0) return err;
  if (err && typeof err === 'object') {
    const m = (err as Record<string, unknown>)?.message;
    if (typeof m === 'string') return m;
  }
  return undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
