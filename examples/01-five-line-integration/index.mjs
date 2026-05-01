/**
 * ProofCourt — 5-Line Integration Example
 *
 * Demonstrates how any AI agent can integrate ProofCourt in 5 lines of code.
 * No wallet setup required for basic use. Escrow and on-chain settlement are
 * handled automatically by the KeeperHub + 0G + AXL stack.
 *
 * Prerequisites:
 *   npm run dev:full   # starts API (8787) + MCP server (8788) + frontend (3000)
 *
 * Run this example:
 *   node examples/01-five-line-integration/index.mjs
 */

// ---- START 5-LINE INTEGRATION -----------------------------------------------

import { ProofCourt } from '../../packages/sdk/src/index.ts';

const court = new ProofCourt({ apiUrl: 'http://localhost:8787' });

const { caseId } = await court.createCase({ title: 'Summarize quarterly sales report', sla: 3600 });

await court.submitWork(caseId, { outputHash: '0xdeadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678', summary: 'Summarized 47 pages → 3 bullet points' });

const verdict = await court.awaitVerdict(caseId);

// ---- END 5-LINE INTEGRATION -------------------------------------------------

console.log('');
console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║                   ProofCourt Verdict                    ║');
console.log('╠══════════════════════════════════════════════════════════╣');
console.log(`║  Case ID  : ${caseId.padEnd(45)}║`);
console.log(`║  Result   : ${(verdict.passed ? '✅ PASS — escrow released' : '❌ FAIL — escrow refunded').padEnd(45)}║`);
console.log(`║  State    : ${verdict.state.padEnd(45)}║`);
console.log(`║  Quorum   : ${(verdict.quorum ? `${verdict.quorum.passed}/3 verifiers agreed` : 'N/A').padEnd(45)}║`);
console.log(`║  0G Root  : ${(verdict.zeroGRoot?.slice(0, 42) ?? 'not anchored yet').padEnd(45)}║`);
console.log(`║  Tx Hash  : ${(verdict.txHash?.slice(0, 42) ?? 'pending').padEnd(45)}║`);
console.log('╚══════════════════════════════════════════════════════════╝');
console.log('');

if (verdict.verdicts.length > 0) {
  console.log('Individual Verifier Verdicts:');
  for (const v of verdict.verdicts) {
    const icon = v.decision === 'PASS' ? '✅' : '❌';
    console.log(`  ${icon} ${v.verifierId.padEnd(12)} ${v.decision}  (${new Date(v.timestamp).toLocaleTimeString()})`);
  }
}
