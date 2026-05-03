import { compactId, stableHash } from './hash.ts';
import type { AxlSendInput, AxlSendResult, AxlTopologyNode, IntegrationResult } from './integrationTypes.ts';

const axlNodeUrl = process.env.AXL_NODE_URL;
const axlNodeUrls = {
  requester: process.env.AXL_REQUESTER_NODE_URL ?? process.env.AXL_OWNER_NODE_URL ?? process.env.AXL_STRATEGY_NODE_URL ?? axlNodeUrl,
  worker: process.env.AXL_WORKER_NODE_URL ?? process.env.AXL_EXECUTOR_NODE_URL ?? axlNodeUrl,
  verifier1: process.env.AXL_VERIFIER_1_NODE_URL ?? process.env.AXL_SPECIALIST_NODE_URL ?? axlNodeUrl,
  verifier2: process.env.AXL_VERIFIER_2_NODE_URL ?? process.env.AXL_JUDGE_NODE_URL ?? axlNodeUrl,
  verifier3: process.env.AXL_VERIFIER_3_NODE_URL ?? axlNodeUrl,
};
const axlEnableProtocolRoutes = process.env.AXL_ENABLE_PROTOCOL_ROUTES === 'true';

const transcriptByWorkflow = new Map<string, AxlSendResult[]>();
type AxlRole = keyof typeof axlNodeUrls;

export async function sendAxlMessage(input: AxlSendInput): Promise<IntegrationResult<AxlSendResult>> {
  const requestMetadata = buildAxlRequestMetadata(input);
  const sourceNode = resolveNode(input.from);
  const targetNode = resolveNode(input.to);
  const sourceUrl = axlNodeUrls[sourceNode];
  const targetUrl = axlNodeUrls[targetNode];

  if (!sourceUrl) {
    throw new Error(`AXL ${sourceNode} node URL is not configured`);
  }
  if (!targetUrl) {
    throw new Error(`AXL ${targetNode} node URL is not configured`);
  }

  try {
    const targetTopology = await readTopologyNode({ role: targetNode, endpoint: targetUrl });
    const targetPeerId = targetTopology.peerId;
    if (!targetPeerId) {
      throw new Error(`AXL ${targetNode} node is online but did not expose a peer id`);
    }

    let transport: 'mcp' | 'a2a' | 'send' = input.envelope;
    let response: Response;
    if (axlEnableProtocolRoutes) {
      response = await fetch(buildProtocolUrl(sourceUrl, input.envelope, targetPeerId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildProtocolBody(input, requestMetadata)),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        response = await fallbackSend(sourceUrl, targetPeerId, input, requestMetadata, `${response.status}${text ? `: ${text.slice(0, 180)}` : ''}`);
        transport = 'send';
      }
    } else {
      response = await fallbackSend(sourceUrl, targetPeerId, input, requestMetadata, 'protocol routes disabled');
      transport = 'send';
    }

    const body = transport === 'send' ? {} : await readJsonOrEmpty(response);
    const data = {
      id: stringField(body, ['id', 'messageId']) ?? requestMetadata.id,
      nodeId: targetTopology.nodeId ?? targetPeerId,
      messageId: stringField(body, ['messageId', 'id']) ?? requestMetadata.messageId,
      envelope: requestMetadata.envelope,
      hash: stringField(body, ['hash']) ?? stableHash({ protocol: 'proofcourt-axl-v2', transport, requestMetadata, body }),
      payloadHash: requestMetadata.payloadHash,
      timestamp: stringField(body, ['timestamp']) ?? requestMetadata.timestamp,
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
    throw new Error(error instanceof Error ? error.message : 'Unknown AXL error');
  }
}

async function fallbackSend(
  sourceUrl: string,
  targetPeerId: string,
  input: AxlSendInput,
  requestMetadata: AxlSendResult,
  routeError: string,
): Promise<Response> {
  const response = await fetch(`${sourceUrl.replace(/\/$/, '')}/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Destination-Peer-Id': targetPeerId,
      'X-ProofCourt-Envelope': input.envelope,
      'X-ProofCourt-Type': input.type,
      'X-ProofCourt-Route-Error': routeError,
    },
    body: JSON.stringify({
      workflowId: input.workflowId,
      from: input.from,
      to: input.to,
      type: input.type,
      envelope: input.envelope,
      payload: input.payload,
      payloadHash: requestMetadata.payloadHash,
      messageId: requestMetadata.messageId,
      sentAt: requestMetadata.timestamp,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`AXL send fallback returned ${response.status}${text ? `: ${text.slice(0, 180)}` : ''}`);
  }

  return response;
}

export function getAxlTranscript(workflowId: string): AxlSendResult[] {
  return transcriptByWorkflow.get(workflowId) ?? [];
}

export async function getAxlStatus() {
  const configuredNodes = Object.entries(axlNodeUrls)
    .filter(([, endpoint]) => Boolean(endpoint))
    .map(([role, endpoint]) => ({ role, endpoint: endpoint! }));
  const topology = await Promise.all(configuredNodes.map(readTopologyNode));
  const allNodesLive = configuredNodes.length === 5 &&
    topology.every((node) => node.status === 'online' && Boolean(node.peerId));

  return {
    configured: allNodesLive,
    mode: allNodesLive ? 'live' : configuredNodes.length === 5 ? 'offline' : 'not-configured',
    endpoint: axlNodeUrl ?? null,
    separateNodes: configuredNodes.length === 5,
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

function resolveNode(agentName: string): AxlRole {
  const normalized = agentName.toLowerCase();
  if (normalized.includes('worker') || normalized.includes('executor')) return 'worker';
  if (normalized.includes('verifier-3')) return 'verifier3';
  if (normalized.includes('verifier-2') || normalized.includes('judge') || normalized.includes('core')) return 'verifier2';
  if (normalized.includes('verifier-1') || normalized.includes('specialist')) return 'verifier1';
  return 'requester';
}

function recordTranscript(workflowId: string, result: AxlSendResult) {
  const existing = transcriptByWorkflow.get(workflowId) ?? [];
  transcriptByWorkflow.set(workflowId, [...existing, result]);
}

function buildProtocolUrl(sourceUrl: string, envelope: AxlSendInput['envelope'], targetPeerId: string): string {
  const base = sourceUrl.replace(/\/$/, '');
  if (envelope === 'mcp') return `${base}/mcp/${encodeURIComponent(targetPeerId)}/proofcourt`;
  return `${base}/a2a/${encodeURIComponent(targetPeerId)}`;
}

function buildProtocolBody(input: AxlSendInput, requestMetadata: AxlSendResult): Record<string, unknown> {
  if (input.envelope === 'mcp') {
    return {
      jsonrpc: '2.0',
      method: 'tools/call',
      id: requestMetadata.messageId,
      params: {
        name: input.type,
        arguments: {
          workflowId: input.workflowId,
          from: input.from,
          to: input.to,
          payload: input.payload,
          payloadHash: requestMetadata.payloadHash,
        },
      },
    };
  }

  return {
    jsonrpc: '2.0',
    method: 'SendMessage',
    id: requestMetadata.messageId,
    params: {
      message: {
        role: 'ROLE_USER',
        messageId: requestMetadata.messageId,
        parts: [
          {
            text: JSON.stringify({
              workflowId: input.workflowId,
              from: input.from,
              to: input.to,
              type: input.type,
              payload: input.payload,
              payloadHash: requestMetadata.payloadHash,
            }),
          },
        ],
      },
    },
  };
}

async function readTopologyNode(node: { role: string; endpoint: string }): Promise<AxlTopologyNode & { peerId?: string }> {
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
      nodeId: stringField(body, ['our_ipv6', 'nodeId', 'id', 'peerId']) ?? `configured-${node.role}`,
      peerId: stringField(body, ['our_public_key', 'peerId', 'publicKey']),
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

async function readJsonOrEmpty(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : { value: parsed };
  } catch {
    return { value: text };
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
