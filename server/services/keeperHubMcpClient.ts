/**
 * KeeperHub MCP Client — agent-driven workflow creation at runtime
 *
 * Connects to the KeeperHub Streamable HTTP MCP endpoint at
 * https://app.keeperhub.com/mcp and provides:
 *   - listActionSchemas(): discover available action blocks
 *   - createWorkflow(spec): create a new workflow programmatically
 *   - executeWorkflow(id, payload): trigger execution via wfb_ key
 *
 * Set KEEPERHUB_BUILD_AT_RUNTIME=true to make the Requester agent
 * dynamically build a settlement workflow at case-creation time.
 *
 * x402 USDC payments auto-handled by @keeperhub/wallet paymentSigner.
 */

const KH_MCP_URL = process.env.KEEPERHUB_MCP_URL ?? 'https://app.keeperhub.com/mcp';
const KH_API_URL = process.env.KEEPERHUB_API_URL ?? 'https://app.keeperhub.com';
const orgKey = process.env.KEEPERHUB_API_KEY ?? '';

export interface ActionSchema {
  id: string;
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface WorkflowSpec {
  name: string;
  description?: string;
  nodes: WorkflowNode[];
}

export interface WorkflowNode {
  id: string;
  type: string;
  config?: Record<string, unknown>;
  next?: string;
}

export interface CreatedWorkflow {
  workflowId: string;
  webhookKey: string;
  name: string;
}

// ---------------------------------------------------------------------------
// JSON-RPC helper for Streamable HTTP MCP
// ---------------------------------------------------------------------------
async function mcpRequest(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    ...(orgKey ? { Authorization: `Bearer ${orgKey}` } : {}),
  };

  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: Date.now(),
    method,
    params,
  });

  let response: Response;
  try {
    const { paymentSigner } = await import('@keeperhub/wallet');
    response = await paymentSigner.fetch(KH_MCP_URL, { method: 'POST', headers, body, paymentHint: 'x402' });
  } catch {
    response = await fetch(KH_MCP_URL, { method: 'POST', headers, body });
  }

  const text = await response.text();

  // Handle SSE (text/event-stream) or plain JSON
  let result: string = text;
  if (text.startsWith('data:')) {
    const lines = text.split('\n').filter((l) => l.startsWith('data:'));
    result = lines[lines.length - 1]?.slice(5).trim() ?? '{}';
  }

  const json = JSON.parse(result) as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(`KeeperHub MCP error: ${json.error.message}`);
  return json.result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** List available action schemas from the KeeperHub MCP server. */
export async function listActionSchemas(): Promise<ActionSchema[]> {
  const result = (await mcpRequest('tools/list')) as { tools?: ActionSchema[] };
  return result?.tools ?? [];
}

/** Create a workflow programmatically via MCP at runtime. */
export async function createWorkflow(spec: WorkflowSpec): Promise<CreatedWorkflow> {
  const result = (await mcpRequest('tools/call', {
    name: 'create_workflow',
    arguments: spec,
  })) as { content?: Array<{ text?: string }> };

  const text = result?.content?.[0]?.text ?? '{}';
  const parsed = JSON.parse(text) as { workflowId?: string; id?: string; webhookKey?: string; wfb_key?: string; name?: string };
  const workflowId = parsed.workflowId ?? parsed.id;
  const webhookKey = parsed.webhookKey ?? parsed.wfb_key;

  if (!workflowId || !webhookKey) {
    throw new Error(`KeeperHub MCP createWorkflow did not return workflowId and webhookKey`);
  }

  return { workflowId, webhookKey, name: parsed.name ?? spec.name };
}

/** Execute a workflow by ID — uses wfb_ key for authentication. */
export async function executeWorkflow(
  workflowId: string,
  webhookKey: string,
  payload: Record<string, unknown>,
): Promise<{ executionId: string; txHash?: string }> {
  const url = `${KH_API_URL.replace(/\/$/, '')}/api/workflows/${encodeURIComponent(workflowId)}/webhook`;

  let response: Response;
  try {
    const { paymentSigner } = await import('@keeperhub/wallet');
    response = await paymentSigner.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${webhookKey}`,
      },
      body: JSON.stringify(payload),
      paymentHint: 'x402',
    });
  } catch {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${webhookKey}`,
      },
      body: JSON.stringify(payload),
    });
  }

  const json = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`KeeperHub execute workflow returned ${response.status}: ${JSON.stringify(json)}`);
  }

  const executionId =
    (json?.executionId as string) ??
    (json?.id as string) ??
    ((json?.data as Record<string, unknown>)?.executionId as string);

  if (!executionId) {
    throw new Error('KeeperHub executeWorkflow did not return an executionId');
  }

  return {
    executionId,
    txHash: (json?.txHash as string) ?? ((json?.output as Record<string, unknown>)?.txHash as string),
  };
}

/**
 * Build and cache a ProofCourt settlement workflow at runtime.
 * Called by Requester agent when KEEPERHUB_BUILD_AT_RUNTIME=true.
 */
export async function buildProofCourtSettlementWorkflow(caseId: string): Promise<CreatedWorkflow> {
  const spec: WorkflowSpec = {
    name: `proofcourt-settle-${caseId}`,
    description: `Auto-generated ProofCourt settlement workflow for case ${caseId}`,
    nodes: [
      {
        id: 'check-quorum',
        type: 'condition',
        config: { expression: '{{input.quorumPassed}} === true' },
        next: 'pay-worker',
      },
      {
        id: 'pay-worker',
        type: 'web3/transfer-token',
        config: {
          token: 'USDC',
          to: '{{input.workerAddress}}',
          amount: '{{input.escrowAmount}}',
        },
      },
      {
        id: 'refund-requester',
        type: 'web3/transfer-token',
        config: {
          token: 'USDC',
          to: '{{input.requesterAddress}}',
          amount: '{{input.escrowAmount}}',
        },
      },
    ],
  };

  return createWorkflow(spec);
}

export function getKeeperHubMcpStatus() {
  return {
    mcpUrl: KH_MCP_URL,
    buildAtRuntime: process.env.KEEPERHUB_BUILD_AT_RUNTIME === 'true',
    configured: Boolean(orgKey),
  };
}
