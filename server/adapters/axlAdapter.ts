import { compactId, stableHash } from './hash.ts';
import type { AxlSendInput, AxlSendResult, AxlTopologyNode, IntegrationResult } from './integrationTypes.ts';

const axlNodeUrl = process.env.AXL_NODE_URL;
const axlNodeUrls = {
  owner: process.env.AXL_OWNER_NODE_URL ?? process.env.AXL_STRATEGY_NODE_URL ?? axlNodeUrl,
  specialist: process.env.AXL_SPECIALIST_NODE_URL ?? axlNodeUrl,
  executor: process.env.AXL_EXECUTOR_NODE_URL ?? axlNodeUrl,
  judge: process.env.AXL_JUDGE_NODE_URL ?? axlNodeUrl,
};

const transcriptByWorkflow = new Map<string, AxlSendResult[]>();

export async function sendAxlMessage(input: AxlSendInput): Promise<IntegrationResult<AxlSendResult>> {
  const requestMetadata = buildAxlRequestMetadata(input);
  const targetNode = resolveNode(input.to);
  const targetUrl = axlNodeUrls[targetNode];

  if (!targetUrl) {
    throw new Error(`AXL ${targetNode} node URL is not configured`);
  }

  try {
    const response = await fetch(`${targetUrl.replace(/\/$/, '')}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        envelope: input.envelope,
        workflowId: input.workflowId,
        from: input.from,
        to: input.to,
        type: input.type,
        payload: input.payload,
        nodeRole: targetNode,
        messageId: requestMetadata.messageId,
        payloadHash: requestMetadata.payloadHash,
      }),
    });

    if (!response.ok) {
      throw new Error(`AXL node returned ${response.status}`);
    }

    const body = await response.json() as Partial<AxlSendResult>;
    const data = {
      id: body.id ?? requestMetadata.id,
      nodeId: body.nodeId ?? requestMetadata.nodeId,
      messageId: body.messageId ?? body.id ?? requestMetadata.messageId,
      envelope: body.envelope ?? requestMetadata.envelope,
      hash: body.hash ?? requestMetadata.hash,
      payloadHash: body.payloadHash ?? requestMetadata.payloadHash,
      timestamp: body.timestamp ?? requestMetadata.timestamp,
    };
    if (!data.nodeId || !data.messageId || !data.hash || !data.payloadHash) {
      throw new Error(`AXL ${targetNode} node returned an incomplete receipt`);
    }
    recordTranscript(input.workflowId, data);

    return {
      mode: 'live',
      data,
    };
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Unknown AXL adapter error');
  }
}

export function getAxlTranscript(workflowId: string): AxlSendResult[] {
  return transcriptByWorkflow.get(workflowId) ?? [];
}

export async function getAxlStatus() {
  const configuredNodes = Object.entries(axlNodeUrls)
    .filter(([, endpoint]) => Boolean(endpoint))
    .map(([role, endpoint]) => ({ role, endpoint: endpoint! }));
  const topology = await Promise.all(configuredNodes.map(readTopologyNode));

  return {
    configured: configuredNodes.length === 4,
    mode: configuredNodes.length === 4 ? 'live' : 'not-configured',
    endpoint: axlNodeUrl ?? null,
    separateNodes: configuredNodes.length === 4,
    nodes: topology,
  };
}

function buildAxlRequestMetadata(input: AxlSendInput): AxlSendResult {
  const payloadHash = stableHash(input.payload);
  const messageId = compactId(input.envelope === 'mcp' ? 'mcp_msg' : 'a2a_msg', { ...input, payloadHash });

  return {
    id: messageId,
    nodeId: `configured-${resolveNode(input.to)}-node`,
    messageId,
    envelope: input.envelope,
    hash: stableHash({ protocol: 'proofcourt-axl-v1', envelope: input.envelope, input, payloadHash }),
    payloadHash,
    timestamp: new Date().toISOString(),
  };
}

function resolveNode(agentName: string): keyof typeof axlNodeUrls {
  const normalized = agentName.toLowerCase();
  if (normalized.includes('executor')) return 'executor';
  if (normalized.includes('specialist')) return 'specialist';
  if (normalized.includes('judge') || normalized.includes('core')) return 'judge';
  return 'owner';
}

function recordTranscript(workflowId: string, result: AxlSendResult) {
  const existing = transcriptByWorkflow.get(workflowId) ?? [];
  transcriptByWorkflow.set(workflowId, [...existing, result]);
}

async function readTopologyNode(node: { role: string; endpoint: string }): Promise<AxlTopologyNode> {
  try {
    const response = await fetch(`${node.endpoint.replace(/\/$/, '')}/topology`, {
      signal: AbortSignal.timeout(1200),
    });
    if (!response.ok) throw new Error(`AXL topology returned ${response.status}`);
    const body = await response.json() as Record<string, unknown>;
    const peers = Array.isArray(body.peers) ? body.peers : Array.isArray(body.nodes) ? body.nodes : [];

    return {
      role: node.role,
      endpoint: node.endpoint,
      nodeId: stringField(body, ['nodeId', 'id', 'peerId']) ?? `configured-${node.role}`,
      peerCount: numberField(body, ['peerCount', 'peersCount']) ?? peers.length,
      status: 'online',
    };
  } catch {
    return {
      role: node.role,
      endpoint: node.endpoint,
      nodeId: null,
      peerCount: 0,
      status: 'offline',
    };
  }
}

function stringField(record: Record<string, unknown>, fields: string[]): string | undefined {
  for (const field of fields) {
    const value = record[field];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function numberField(record: Record<string, unknown>, fields: string[]): number | undefined {
  for (const field of fields) {
    const value = record[field];
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && Number.isFinite(Number(value))) return Number(value);
  }
  return undefined;
}
