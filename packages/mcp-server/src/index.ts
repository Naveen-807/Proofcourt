/**
 * @proofcourt/mcp-server — MCP server for ProofCourt
 *
 * Exposes 6 tools so any MCP-compatible agent (Claude, GPT-4, custom)
 * can interact with the ProofCourt trust layer:
 *
 *   proofcourt.createCase     — open a new verification case
 *   proofcourt.submitWork     — submit work output as a worker agent
 *   proofcourt.getCase        — get full run state / verdict
 *   proofcourt.getReputation  — query an agent's trust score
 *   proofcourt.replayCase     — reconstruct a case from its 0G root hash
 *   proofcourt.settleCase     — trigger final settlement
 *
 * Usage:
 *   PROOFCOURT_API_URL=http://localhost:8787 node packages/mcp-server/src/index.ts
 *   PROOFCOURT_MCP_HTTP_PORT=8788 node packages/mcp-server/src/index.ts
 *   # or via the workspace scripts:
 *   npm run mcp:server
 */

import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';

const PROOFCOURT_API_URL = (process.env.PROOFCOURT_API_URL ?? 'http://localhost:8787').replace(/\/$/, '');
const PROOFCOURT_MCP_HTTP_PORT = process.env.PROOFCOURT_MCP_HTTP_PORT
  ? Number(process.env.PROOFCOURT_MCP_HTTP_PORT)
  : null;
const PROOFCOURT_MCP_HTTP_HOST = process.env.PROOFCOURT_MCP_HTTP_HOST ?? '127.0.0.1';

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOLS: Tool[] = [
  {
    name: 'proofcourt.createCase',
    description:
      'Open a new ProofCourt verification case. Returns the caseId used in all subsequent calls.',
    inputSchema: {
      type: 'object',
      required: ['title'],
      properties: {
        title: { type: 'string', description: 'Short description of the task to be verified' },
        description: { type: 'string', description: 'Detailed mandate description' },
        intent: { type: 'string', description: 'protected_buy | vault_deposit | custom', default: 'protected_buy' },
        requesterAddress: { type: 'string', description: 'Ethereum address of the requester agent' },
        escrowAmount: { type: 'string', description: 'Escrow in ETH, e.g. "0.05"', default: '0.01' },
        sla: { type: 'number', description: 'Time limit in seconds', default: 3600 },
      },
    },
  },
  {
    name: 'proofcourt.submitWork',
    description:
      'Worker agent: submit work output for a case. The 3-verifier jury will evaluate outputHash.',
    inputSchema: {
      type: 'object',
      required: ['caseId', 'outputHash'],
      properties: {
        caseId: { type: 'string', description: 'The run ID returned by proofcourt.createCase' },
        outputHash: { type: 'string', description: 'Keccak-256 hash (0x-prefixed) of the work output' },
        summary: { type: 'string', description: 'Human-readable description of what was done' },
        workerAddress: { type: 'string', description: 'Ethereum address to receive escrow if PASS' },
      },
    },
  },
  {
    name: 'proofcourt.getCase',
    description:
      'Get full run state for a case, including verdicts, quorum result, evidence root, and KeeperHub receipts.',
    inputSchema: {
      type: 'object',
      required: ['caseId'],
      properties: {
        caseId: { type: 'string', description: 'The run ID' },
        advance: { type: 'boolean', description: 'Auto-advance the state machine one step', default: false },
      },
    },
  },
  {
    name: 'proofcourt.getReputation',
    description:
      'Query the on-chain trust score and ERC-7857 iNFT profile for a ProofCourt agent.',
    inputSchema: {
      type: 'object',
      required: ['agentId'],
      properties: {
        agentId: { type: 'string', description: 'Agent ID, e.g. requester | worker | verifier-1' },
      },
    },
  },
  {
    name: 'proofcourt.replayCase',
    description:
      'Reconstruct a case from its immutable 0G Storage root hash. Useful for audits and dispute resolution.',
    inputSchema: {
      type: 'object',
      required: ['caseId'],
      properties: {
        caseId: { type: 'string', description: 'Run ID or 0G storage root (0x…)' },
      },
    },
  },
  {
    name: 'proofcourt.settleCase',
    description:
      'Trigger KeeperHub-based atomic settlement for a case. Advances through verification → payout pipeline.',
    inputSchema: {
      type: 'object',
      required: ['caseId'],
      properties: {
        caseId: { type: 'string', description: 'The run ID to settle' },
      },
    },
  },
];

// ---------------------------------------------------------------------------
// HTTP helpers (plain fetch, no SDK dependency loop)
// ---------------------------------------------------------------------------

async function apiGet(path: string): Promise<unknown> {
  const res = await fetch(`${PROOFCOURT_API_URL}${path}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, string>;
    throw new Error(`ProofCourt API ${path}: ${res.status} ${err?.error ?? res.statusText}`);
  }
  return res.json();
}

async function apiPost(path: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${PROOFCOURT_API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, string>;
    throw new Error(`ProofCourt API POST ${path}: ${res.status} ${err?.error ?? res.statusText}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Tool handler
// ---------------------------------------------------------------------------

async function handleTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'proofcourt.createCase': {
      const wf = await apiPost('/api/workflows/generate', {
        intent: args.intent ?? 'protected_buy',
        title: args.title,
        description: args.description,
        requester: args.requesterAddress,
        escrowAmount: args.escrowAmount ?? '0.01',
        sla: args.sla ?? 3600,
      }) as Record<string, unknown>;
      const mandate = wf?.mandate as Record<string, string> | undefined;
      const mandateId = mandate?.id ?? wf?.id as string | undefined;
      if (!mandateId) throw new Error('No mandateId returned from workflow generation');

      const run = await apiPost('/api/runs', { mandateId }) as Record<string, string>;
      return JSON.stringify({ caseId: run?.id, state: run?.state, mandate: (wf?.mandate ?? { id: mandateId }) });
    }

    case 'proofcourt.submitWork': {
      const result = await apiPost(`/api/runs/${args.caseId}/work`, {
        outputHash: args.outputHash,
        summary: args.summary,
        workerAddress: args.workerAddress,
      });
      return JSON.stringify(result);
    }

    case 'proofcourt.getCase': {
      if (args.advance === true) {
        await apiPost(`/api/runs/${args.caseId}/advance`, {}).catch(() => null);
      }
      const run = await apiGet(`/api/runs/${args.caseId}`);
      return JSON.stringify(run);
    }

    case 'proofcourt.getReputation': {
      const trust = await apiGet(`/api/agents/${args.agentId}/trust`);
      return JSON.stringify(trust);
    }

    case 'proofcourt.replayCase': {
      const replayed = await apiGet(`/api/runs/${args.caseId}/replay`);
      return JSON.stringify(replayed);
    }

    case 'proofcourt.settleCase': {
      // Advance up to 10 times to push through settlement
      let lastRun: unknown = null;
      for (let i = 0; i < 10; i++) {
        lastRun = await apiPost(`/api/runs/${args.caseId}/advance`, {}).catch(() => null);
        const state = (lastRun as Record<string, string> | null)?.state;
        if (state === 'payout_released' || state === 'payout_blocked' || state === 'reputation_updated') break;
        await new Promise((r) => setTimeout(r, 1500));
      }
      return JSON.stringify(lastRun ?? { error: 'settle_timeout', caseId: args.caseId });
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ---------------------------------------------------------------------------
// MCP server bootstrap
// ---------------------------------------------------------------------------

function createProofCourtMcpServer() {
  const server = new Server(
    {
      name: '@proofcourt/mcp-server',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    try {
      const output = await handleTool(name, args as Record<string, unknown>);
      return {
        content: [{ type: 'text', text: output }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  });

  return server;
}

if (PROOFCOURT_MCP_HTTP_PORT) {
  const sessions = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = http.createServer(async (req, res) => {
    if (!req.url?.startsWith('/mcp')) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not_found', path: '/mcp' }));
      return;
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Mcp-Session-Id, Last-Event-ID');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      const sessionId = req.headers['mcp-session-id'];
      const normalizedSessionId = Array.isArray(sessionId) ? sessionId[0] : sessionId;
      let transport = normalizedSessionId ? sessions.get(normalizedSessionId) : undefined;

      if (!transport && normalizedSessionId) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'unknown_mcp_session', sessionId: normalizedSessionId }));
        return;
      }

      if (!transport) {
        const server = createProofCourtMcpServer();
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
        });
        transport.onclose = () => {
          if (transport?.sessionId) sessions.delete(transport.sessionId);
        };
        transport.onerror = (error) => {
          process.stderr.write(`[proofcourt-mcp] HTTP transport error: ${error.message}\n`);
        };
        await server.connect(transport);

        const originalSend = transport.send.bind(transport);
        transport.send = async (message, options) => {
          if (transport?.sessionId) sessions.set(transport.sessionId, transport);
          return originalSend(message, options);
        };
      }

      await transport.handleRequest(req, res);
      if (transport.sessionId) sessions.set(transport.sessionId, transport);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
      }
      res.end(JSON.stringify({ error: message }));
    }
  });

  httpServer.listen(PROOFCOURT_MCP_HTTP_PORT, PROOFCOURT_MCP_HTTP_HOST, () => {
    process.stderr.write(`[proofcourt-mcp] HTTP transport ready: http://${PROOFCOURT_MCP_HTTP_HOST}:${PROOFCOURT_MCP_HTTP_PORT}/mcp\n`);
  });
} else {
  const stdioServer = createProofCourtMcpServer();
  const transport = new StdioServerTransport();
  await stdioServer.connect(transport);
}

// Log to stderr (not stdout — stdout is for MCP protocol messages)
process.stderr.write(`[proofcourt-mcp] ProofCourt MCP server ready. API: ${PROOFCOURT_API_URL}\n`);
process.stderr.write(`[proofcourt-mcp] Tools: ${TOOLS.map((t) => t.name).join(', ')}\n`);
