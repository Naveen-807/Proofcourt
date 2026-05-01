import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const nodes = [
  ['requester', '9002'],
  ['worker', '9012'],
  ['verifier-1', '9022'],
  ['verifier-2', '9032'],
  ['verifier-3', '9042'],
];

const axlBin = path.resolve('bin/axl');

if (!existsSync(axlBin)) {
  console.error('Missing real AXL binary at bin/axl. Run: npm run setup:axl');
  process.exit(1);
}

const children = nodes.map(([role]) => {
  const configPath = path.resolve('axl-data', role, 'node-config.json');
  if (!existsSync(configPath)) {
    console.error(`Missing AXL config for ${role} at ${configPath}. Run: npm run setup:axl`);
    process.exit(1);
  }

  const child = spawn(axlBin, ['-config', configPath], {
    stdio: 'inherit',
    env: {
      ...process.env,
      AXL_ROLE: role,
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
