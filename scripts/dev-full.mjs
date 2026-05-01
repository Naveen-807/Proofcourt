import { spawn } from 'node:child_process';

const commands = [
  ['npm', ['run', 'api']],
  ['npm', ['run', 'dev']],
  // ProofCourt MCP server (port 8788) — exposes 6 proofcourt.* tools via stdio transport
  ['node', ['--experimental-strip-types', 'packages/mcp-server/src/index.ts']],
];

const children = commands.map(([command, args]) => {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
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
