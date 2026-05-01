import { spawn } from 'node:child_process';

const nodes = [
  ['owner', '3001'],
  ['specialist', '3002'],
  ['executor', '3003'],
  ['judge', '3004'],
];

const children = nodes.map(([role, port]) => {
  const child = spawn('node', ['scripts/axl-local-node.mjs', role, port], {
    stdio: 'inherit',
    env: {
      ...process.env,
      AXL_ROLE: role,
      AXL_PORT: port,
      AXL_PEERS: nodes.map(([, peerPort]) => peerPort).join(','),
    },
  });

  child.on('exit', (code) => {
    if (code && code !== 0) {
      process.exitCode = code;
      children.forEach((process) => process.kill());
    }
  });

  return child;
});

process.on('SIGINT', () => {
  children.forEach((child) => child.kill('SIGINT'));
});
