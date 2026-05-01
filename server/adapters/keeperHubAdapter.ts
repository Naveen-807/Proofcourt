import { stableHash } from './hash.ts';
import type {
  IntegrationResult,
  KeeperHubExecuteInput,
  KeeperHubExecuteResult,
  KeeperHubLogEntry,
} from './integrationTypes.ts';

const keeperHubApiUrl = process.env.KEEPERHUB_API_URL;
const keeperHubApiKey = process.env.KEEPERHUB_API_KEY;
const legacyWorkflowId = process.env.KEEPERHUB_WORKFLOW_ID;
const keeperHubWorkflowIds: Record<KeeperHubExecuteInput['phase'], string | undefined> = {
  'proof-trial': process.env.KEEPERHUB_TRIAL_WORKFLOW_ID ?? legacyWorkflowId,
  'execute-mandate': process.env.KEEPERHUB_EXECUTE_WORKFLOW_ID ?? legacyWorkflowId,
  'atomic-settlement': process.env.KEEPERHUB_SETTLEMENT_WORKFLOW_ID ?? legacyWorkflowId,
};
const executePath = process.env.KEEPERHUB_EXECUTE_PATH ?? '/workflows/{workflowId}/run';
const statusPath = process.env.KEEPERHUB_STATUS_PATH ?? '/executions/{executionId}';
const logsPath = process.env.KEEPERHUB_LOGS_PATH ?? '/executions/{executionId}/logs';
const pollMs = Number(process.env.KEEPERHUB_POLL_MS ?? 1500);
const maxPolls = Number(process.env.KEEPERHUB_MAX_POLLS ?? 20);

export async function executeKeeperHubWorkflow(
  input: KeeperHubExecuteInput,
): Promise<IntegrationResult<KeeperHubExecuteResult>> {
  const workflowId = resolveKeeperHubWorkflowId(input.phase);

  if (!keeperHubApiUrl) {
    throw new Error('KEEPERHUB_API_URL is required for real-only execution');
  }

  if (!workflowId) {
    throw new Error(`KeeperHub ${input.phase} workflow ID is required for real-only execution`);
  }

  try {
    const executeBody = await keeperHubRequestWithFallback<Record<string, unknown>>(
      executeRouteCandidates(workflowId),
      'POST',
      {
        input: input.payload,
        phase: input.phase,
        proofcourtWorkflowId: input.workflowId,
        proofcourtAction: input.action,
        executor: input.executor,
        metadata: {
          source: 'proofcourt',
          localWorkflowId: input.workflowId,
        },
      },
    );
    const executionId = stringField(executeBody, ['executionId', 'id', 'runId']);
    if (!executionId) throw new Error(`KeeperHub ${input.phase} response did not include an execution ID`);

    const terminal = await pollKeeperHubExecution(executionId);
    const logs = await fetchKeeperHubLogs(executionId, terminal.logs);
    const txHash = findTxHash(logs)
      ?? nestedStringField(terminal.raw, [['output', 'txHash'], ['output', 'transactionHash']])
      ?? stringField(terminal.raw, ['txHash', 'transactionHash'])
      ?? stringField(executeBody, ['txHash', 'transactionHash']);
    if (!txHash) throw new Error(`KeeperHub ${input.phase} execution ${executionId} did not expose a transaction hash`);

    const status = normalizeStatus(stringField(terminal.raw, ['status', 'state']) ?? 'Completed');
    const payloadHash = stableHash(input.payload);

    return {
      mode: 'live',
      data: {
        workflowId,
        phase: input.phase,
        executionId,
        status,
        action: input.action,
        txHash,
        payloadHash,
        logHash: stableHash(logs),
        logs,
        gasOptimized: booleanField(terminal.raw, ['gasOptimized']) ?? false,
        retryCount: numberField(terminal.raw, ['retryCount', 'retries']) ?? 0,
      },
    };
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Unknown KeeperHub adapter error');
  }
}

export function getKeeperHubStatus() {
  const configuredPhases = Object.entries(keeperHubWorkflowIds)
    .filter(([, workflowId]) => Boolean(workflowId))
    .map(([phase, workflowId]) => ({ phase, workflowId: workflowId! }));

  return {
    configured: Boolean(keeperHubApiUrl && configuredPhases.length === 3),
    mode: keeperHubApiUrl && configuredPhases.length === 3 ? 'live' : 'not-configured',
    endpoint: keeperHubApiUrl ?? null,
    workflowId: legacyWorkflowId ?? null,
    workflows: configuredPhases,
    pollMs,
    rateLimit: '100 req/min API, 60 req/min direct execution',
  };
}

async function pollKeeperHubExecution(
  executionId: string,
): Promise<{ status: KeeperHubExecuteResult['status']; logs: KeeperHubLogEntry[]; raw: Record<string, unknown> }> {
  let latest: Record<string, unknown> = {};

  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    latest = await keeperHubRequestWithFallback<Record<string, unknown>>(
      statusRouteCandidates(executionId),
      'GET',
    );
    const rawStatus = stringField(latest, ['status', 'state']) ?? 'Completed';
    const status = normalizeStatus(rawStatus);

    if (isTerminalStatus(rawStatus)) {
      return {
        status,
        logs: normalizeLogs(latest.logs, executionId),
        raw: latest,
      };
    }

    await delay(pollMs);
  }

  throw new Error(`KeeperHub execution ${executionId} did not reach a terminal state`);
}

async function fetchKeeperHubLogs(
  executionId: string,
  existingLogs: KeeperHubLogEntry[],
): Promise<KeeperHubLogEntry[]> {
  const body = await keeperHubRequestWithFallback<Record<string, unknown>>(
    logsRouteCandidates(executionId),
    'GET',
  );
  return normalizeLogs(body.logs ?? body.data ?? body, executionId, existingLogs);
}

async function keeperHubRequest<T>(
  path: string,
  method: 'GET' | 'POST',
  body?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${keeperHubApiUrl!.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(keeperHubApiKey ? { Authorization: `Bearer ${keeperHubApiKey}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const json: unknown = await response.json();

  if (!response.ok) {
    const message = extractKeeperHubErrorMessage(json);
    throw new Error(message ?? `KeeperHub ${path} returned ${response.status}`);
  }

  return unwrapKeeperHubData<T>(json);
}

async function keeperHubRequestWithFallback<T>(
  paths: string[],
  method: 'GET' | 'POST',
  body?: Record<string, unknown>,
): Promise<T> {
  let lastError: unknown;

  for (const path of [...new Set(paths)]) {
    try {
      return await keeperHubRequest<T>(path, method, body);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('KeeperHub request failed');
}

function unwrapKeeperHubData<T>(json: unknown): T {
  if (json && typeof json === 'object' && 'data' in json) {
    return (json as { data: T }).data;
  }
  return json as T;
}

function extractKeeperHubErrorMessage(json: unknown): string | undefined {
  if (!json || typeof json !== 'object' || !('error' in json)) return undefined;
  const err = (json as { error?: { message?: string; code?: string } }).error;
  if (!err || typeof err !== 'object') return undefined;
  if (typeof err.message === 'string' && err.message.length > 0) return err.message;
  if (typeof err.code === 'string' && err.code.length > 0) return err.code;
  return undefined;
}

function normalizeLogs(value: unknown, executionId: string, existingLogs: KeeperHubLogEntry[] = []): KeeperHubLogEntry[] {
  const entries = Array.isArray(value) ? value : [];
  if (entries.length === 0 && existingLogs.length > 0) return existingLogs;
  if (entries.length === 0) throw new Error(`KeeperHub execution ${executionId} did not return logs`);

  return entries.map((entry, index) => {
    const record = typeof entry === 'object' && entry !== null ? entry as Record<string, unknown> : {};
    return {
      timestamp: String(record.timestamp ?? record.time ?? new Date(Date.now() + index).toISOString()),
      node: String(record.node ?? record.step ?? record.name ?? record.nodeName ?? record.nodeId ?? `keeperhub.node.${index + 1}`),
      level: normalizeLevel(String(record.level ?? record.status ?? 'info')),
      message: String(record.message ?? record.output ?? record.error ?? record.nodeType ?? `KeeperHub log ${index + 1} for ${executionId}`),
      txHash: stringField(record, ['txHash', 'transactionHash', 'hash'])
        ?? nestedStringField(record, [['output', 'txHash'], ['output', 'transactionHash'], ['output', 'hash']]),
      outputHash: stringField(record, ['outputHash']) ?? stableHash(record),
    };
  });
}

function normalizeStatus(status: string): KeeperHubExecuteResult['status'] {
  const normalized = status.toLowerCase();
  if (normalized.includes('fail') || normalized.includes('error')) return 'Failed';
  return 'Completed';
}

function isTerminalStatus(status: string): boolean {
  const normalized = status.toLowerCase();
  return ['complete', 'success', 'succeed', 'done', 'fail', 'error', 'cancel'].some((token) =>
    normalized.includes(token),
  );
}

function normalizeLevel(level: string): KeeperHubLogEntry['level'] {
  const normalized = level.toLowerCase();
  if (normalized.includes('error') || normalized.includes('fail')) return 'error';
  if (normalized.includes('warn')) return 'warn';
  return 'info';
}

function findTxHash(logs: KeeperHubLogEntry[]): string | undefined {
  return logs.find((entry) => entry.txHash)?.txHash;
}

function stringField(record: Record<string, unknown>, fields: string[]): string | undefined {
  for (const field of fields) {
    const value = record[field];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function nestedStringField(record: Record<string, unknown>, paths: string[][]): string | undefined {
  for (const path of paths) {
    let value: unknown = record;
    for (const key of path) {
      if (!value || typeof value !== 'object') {
        value = undefined;
        break;
      }
      value = (value as Record<string, unknown>)[key];
    }
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function resolvePath(path: string, params: Record<string, string>): string {
  return Object.entries(params).reduce(
    (resolved, [key, value]) => resolved.replaceAll(`{${key}}`, encodeURIComponent(value)),
    path,
  );
}

function resolveKeeperHubWorkflowId(phase: KeeperHubExecuteInput['phase']): string | undefined {
  return keeperHubWorkflowIds[phase] ?? legacyWorkflowId;
}

function executeRouteCandidates(workflowId: string): string[] {
  return [
    resolvePath(executePath, { workflowId }),
    resolvePath('/workflows/{workflowId}/run', { workflowId }),
    resolvePath('/workflow/{workflowId}/execute', { workflowId }),
  ];
}

function statusRouteCandidates(executionId: string): string[] {
  return [
    resolvePath(statusPath, { executionId }),
    resolvePath('/executions/{executionId}', { executionId }),
    resolvePath('/workflows/executions/{executionId}/status', { executionId }),
  ];
}

function logsRouteCandidates(executionId: string): string[] {
  return [
    resolvePath(logsPath, { executionId }),
    resolvePath('/executions/{executionId}/logs', { executionId }),
    resolvePath('/workflows/executions/{executionId}/logs', { executionId }),
  ];
}

function numberField(record: Record<string, unknown>, fields: string[]): number | undefined {
  for (const field of fields) {
    const value = record[field];
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && Number.isFinite(Number(value))) return Number(value);
  }
  return undefined;
}

function booleanField(record: Record<string, unknown>, fields: string[]): boolean | undefined {
  for (const field of fields) {
    const value = record[field];
    if (typeof value === 'boolean') return value;
  }
  return undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
