/**
 * KeeperHub Adapter — wfb_ webhook-key execution + x402 USDC payment
 *
 * Phase 6 changes:
 * - Execution endpoint is POST /api/workflows/{id}/webhook (not /run or /execute)
 * - Auth uses per-workflow wfb_ keys (one per phase)
 * - Status polling uses the org kh_ key on GET /api/workflows/{workflowId}/executions
 *   (find execution by id — KeeperHub does not expose GET /api/executions/{id})
 * - x402 USDC payments handled via @keeperhub/wallet paymentSigner.fetch
 * - Strict real-only behavior: missing keys or failed live execution stop the run
 */

import { stableHash } from './hash.ts';
import type {
  IntegrationResult,
  KeeperHubExecuteInput,
  KeeperHubExecuteResult,
  KeeperHubLogEntry,
} from './integrationTypes.ts';

// Organisation-scoped key — used for GET /api/workflows, GET /api/workflows/{id}/executions
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
// KeeperHub returns executions via GET /api/workflows/{workflowId}/executions (array).
// There is no working GET /api/executions/{id} on app.keeperhub.com (HTML 404).
// ---------------------------------------------------------------------------
async function pollExecution(executionId: string, workflowId: string): Promise<{
  status: KeeperHubExecuteResult['status'];
  logs: KeeperHubLogEntry[];
  txHash?: string;
  raw: Record<string, unknown>;
}> {
  const headers: HeadersInit = {
    ...(orgApiKey ? { Authorization: `Bearer ${orgApiKey}` } : {}),
    Accept: 'application/json',
  };
  const base = keeperHubApiUrl.replace(/\/$/, '');
  const listUrl = `${base}/api/workflows/${encodeURIComponent(workflowId)}/executions`;

  for (let attempt = 0; attempt < maxPolls; attempt++) {
    const response = await fetch(listUrl, { headers });
    const json: unknown = await response.json().catch(() => null);
    const rows = normalizeExecutionsList(json);
    const body = rows.find((row) => extractString(row, ['id']) === executionId) ?? null;

    if (body) {
      const rawStatus = extractString(body, ['status', 'state']) ?? 'running';
      if (isTerminal(rawStatus)) {
        const logsArr = logsFromExecutionRecord(body, executionId);
        const txHash =
          logsArr.find((l) => l.txHash)?.txHash ??
          extractTxHashFromExecution(body);

        return {
          status: normalizeStatus(rawStatus),
          logs: logsArr.length > 0 ? logsArr : syntheticLogFromTx(executionId, txHash),
          txHash,
          raw: body,
        };
      }
    }
    await delay(pollMs);
  }

  throw new Error(`KeeperHub execution ${executionId} did not reach terminal state in time`);
}

function normalizeExecutionsList(json: unknown): Record<string, unknown>[] {
  if (Array.isArray(json)) return json as Record<string, unknown>[];
  if (json && typeof json === 'object') {
    const data = (json as Record<string, unknown>).data;
    if (Array.isArray(data)) return data as Record<string, unknown>[];
    const items = (json as Record<string, unknown>).items;
    if (Array.isArray(items)) return items as Record<string, unknown>[];
  }
  return [];
}

/** Walk KeeperHub execution.output for tx hashes (shape varies by workflow). */
function extractTxHashFromExecution(body: Record<string, unknown>): string | undefined {
  const out = body.output;
  if (!out || typeof out !== 'object') {
    return extractString(body, ['txHash', 'transactionHash']);
  }
  const o = out as Record<string, unknown>;
  const nested =
    extractNestedString(o, [
      ['result', 'txHash'],
      ['result', 'transactionHash'],
      ['txHash'],
      ['transactionHash'],
    ]) ?? extractNestedString(body, [['output', 'result', 'txHash'], ['output', 'result', 'transactionHash']]);
  return nested ?? extractString(o, ['txHash', 'transactionHash']);
}

function logsFromExecutionRecord(body: Record<string, unknown>, executionId: string): KeeperHubLogEntry[] {
  const out = body.output;
  if (!out || typeof out !== 'object') return [];
  const logs = (out as Record<string, unknown>).logs;
  if (!Array.isArray(logs)) return [];
  return normalizeLogs(logs as unknown[], executionId);
}

function syntheticLogFromTx(executionId: string, txHash: string | undefined): KeeperHubLogEntry[] {
  if (!txHash) return [];
  return [
    {
      timestamp: new Date().toISOString(),
      node: 'keeperhub.execution',
      level: 'info',
      message: `Execution ${executionId} completed`,
      txHash,
      outputHash: stableHash(txHash),
    },
  ];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export async function executeKeeperHubWorkflow(
  input: KeeperHubExecuteInput,
): Promise<IntegrationResult<KeeperHubExecuteResult>> {
  if (!isConfigured(input.phase)) {
    throw new Error(
      `KeeperHub ${input.phase} is not configured. Set its workflow ID and wfb_ key before running ProofCourt.`,
    );
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

    const terminal = await pollExecution(executionId, workflowId);
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
    throw new Error(error instanceof Error ? error.message : 'Unknown KeeperHub error');
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
    mode: configuredPhases.length === 3 ? 'live' : configuredPhases.length > 0 ? 'partial' : 'not-configured',
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
