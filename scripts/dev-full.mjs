import { spawn } from 'node:child_process';

const commands = [
  ['npm', ['run', 'api'], {}],
  ['npm', ['run', 'dev'], {}],
  // ProofCourt MCP server (port 8788) — exposes 6 proofcourt.* tools via Streamable HTTP
  ['node', ['--experimental-strip-types', 'packages/mcp-server/src/index.ts'], { PROOFCOURT_MCP_HTTP_PORT: process.env.PROOFCOURT_MCP_HTTP_PORT ?? '8788' }],
];

const children = commands.map(([command, args, env]) => {
  const child = spawn(command, args, {
    env: { ...process.env, ...env },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  child.on('exit', (code) => {
    if (code && code !== 0) {
      process.exitCode = code;
      children.forEach((childProcess) => childProcess.kill());
    }
  });

  return child;
});

process.on('SIGINT', () => {
  children.forEach((child) => child.kill('SIGINT'));
});

process.on('SIGTERM', () => {
  children.forEach((child) => child.kill('SIGTERM'));
});
