import express from 'express';
import { createHash } from 'node:crypto';

const app = express();
const role = process.env.AXL_ROLE ?? process.argv[2] ?? 'owner';
const port = Number(process.env.AXL_PORT ?? process.argv[3] ?? 3001);
const peerPorts = (process.env.AXL_PEERS ?? '3001,3002,3003,3004')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
  .map(Number)
  .filter((peerPort) => peerPort !== port);
const nodeId = process.env.AXL_NODE_ID ?? `proofcourt-${role}-${port}`;
const inbox = [];

app.use(express.json());

app.get('/topology', (_, res) => {
  res.json({
    nodeId,
    role,
    peers: peerPorts.map((peerPort) => ({
      nodeId: `proofcourt-peer-${peerPort}`,
      endpoint: `http://127.0.0.1:${peerPort}`,
    })),
    peerCount: peerPorts.length,
  });
});

app.post('/send', (req, res) => {
  const payloadHash = req.body?.payloadHash ?? stableHash(req.body?.payload ?? {});
  const messageId = req.body?.messageId ?? `${req.body?.envelope ?? 'axl'}_${payloadHash.slice(2, 12)}`;
  const record = {
    id: messageId,
    nodeId,
    messageId,
    envelope: req.body?.envelope === 'a2a' ? 'a2a' : 'mcp',
    hash: stableHash({
      nodeId,
      messageId,
      envelope: req.body?.envelope,
      workflowId: req.body?.workflowId,
      payloadHash,
    }),
    payloadHash,
    timestamp: new Date().toISOString(),
    body: req.body,
  };

  inbox.push(record);
  res.json(record);
});

app.get('/recv', (_, res) => {
  res.json({ nodeId, messages: inbox });
});

app.listen(port, '127.0.0.1', () => {
  console.log(`ProofCourt local AXL ${role} node listening on http://127.0.0.1:${port}`);
});

function stableHash(value) {
  return `0x${createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24)}`;
}
