#!/usr/bin/env node

import { ProofCourt } from '../../sdk/src/index.ts';

const [, , command, ...argv] = process.argv;
const flags = parseFlags(argv);
const apiUrl = flags.apiUrl ?? process.env.PROOFCOURT_API_URL ?? 'http://127.0.0.1:8787';
const court = new ProofCourt({ apiUrl });

try {
  switch (command) {
    case 'create':
      await createCase();
      break;
    case 'submit':
      await submitWork();
      break;
    case 'watch':
      await watchCase();
      break;
    case 'replay':
      await replayCase();
      break;
    case 'reputation':
      await reputation();
      break;
    case 'demo-cheat':
      await demoCheat();
      break;
    case 'help':
    case undefined:
      printHelp();
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exitCode = 1;
}

async function createCase() {
  const title = flags.title ?? flags._[0];
  if (!title) throw new Error('create requires --title "..."');

  const result = await court.createCase({
    title,
    description: flags.description,
    intent: flags.intent,
    escrowAmount: flags.escrowAmount,
    sla: flags.sla ? Number(flags.sla) : undefined,
    requesterAddress: flags.requesterAddress,
  });
  print(result);
}

async function submitWork() {
  const caseId = flags.caseId ?? flags._[0];
  const outputHash = flags.outputHash ?? flags._[1];
  if (!caseId || !outputHash) throw new Error('submit requires --case-id and --output-hash');

  await court.submitWork(caseId, {
    outputHash,
    summary: flags.summary,
    workerAddress: flags.workerAddress,
  });
  print({ caseId, submitted: true, outputHash });
}

async function watchCase() {
  const caseId = flags.caseId ?? flags._[0];
  if (!caseId) throw new Error('watch requires --case-id');
  const verdict = await court.awaitVerdict(caseId, {
    timeoutMs: flags.timeoutMs ? Number(flags.timeoutMs) : undefined,
    pollIntervalMs: flags.pollIntervalMs ? Number(flags.pollIntervalMs) : undefined,
  });
  print(verdict);
}

async function replayCase() {
  const caseId = flags.caseId ?? flags._[0];
  if (!caseId) throw new Error('replay requires --case-id');
  print(await court.replayCase(caseId));
}

async function reputation() {
  const agentId = flags.agentId ?? flags._[0] ?? 'worker';
  print(await court.getAgentReputation(agentId));
}

async function demoCheat() {
  const invalidHash = `0x${'dead'.repeat(16)}`;
  const { caseId } = await court.createCase({
    title: flags.title ?? 'Audit smart contract for reentrancy vulnerabilities',
    description: flags.description ?? 'Fraud demo: worker submits invalid output hash.',
    escrowAmount: flags.escrowAmount ?? '0.05',
    sla: 3600,
  });
  await court.submitWork(caseId, {
    outputHash: invalidHash,
    summary: 'No issues found.',
    workerAddress: flags.workerAddress ?? '0x1234567890123456789012345678901234567890',
  });
  const verdict = await court.awaitVerdict(caseId, {
    timeoutMs: flags.timeoutMs ? Number(flags.timeoutMs) : 180_000,
    pollIntervalMs: flags.pollIntervalMs ? Number(flags.pollIntervalMs) : 2_000,
  });
  print({ caseId, invalidHash, verdict });
}

function parseFlags(args) {
  const out = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      out._.push(arg);
      continue;
    }
    const [rawKey, inlineValue] = arg.slice(2).split('=', 2);
    const key = rawKey.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (inlineValue !== undefined) {
      out[key] = inlineValue;
    } else if (args[i + 1] && !args[i + 1].startsWith('--')) {
      out[key] = args[++i];
    } else {
      out[key] = true;
    }
  }
  return out;
}

function print(value) {
  console.log(JSON.stringify(value, null, 2));
}

function printHelp() {
  console.log(`proofcourt <command> [flags]

Commands:
  create --title "Audit contract"
  submit --case-id run_... --output-hash 0x...
  watch --case-id run_...
  replay --case-id run_...
  reputation --agent-id worker
  demo-cheat

Global:
  --api-url http://127.0.0.1:8787`);
}
