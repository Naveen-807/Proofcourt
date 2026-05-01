import { ethers } from 'ethers';
import { stableHash } from './hash.ts';
import type { IntegrationResult, ZeroGComputeInput, ZeroGComputeResult } from './integrationTypes.ts';

const computeUrl = process.env.ZERO_G_COMPUTE_URL;
const computeApiKey = process.env.ZERO_G_COMPUTE_API_KEY ?? process.env.ZERO_G_API_KEY;
const rpcUrl = process.env.RPC_URL ?? process.env.ZERO_G_RPC_URL;
const executorPrivateKey = process.env.EXECUTOR_PRIVATE_KEY;
const privateKey = process.env.PRIVATE_KEY ?? process.env.ZERO_G_PRIVATE_KEY;
const evidenceRegistryAddress = process.env.EVIDENCE_REGISTRY_ADDRESS;

const EVIDENCE_REGISTRY_ABI = [
  'function recordVerdict(uint256 caseId, bytes32 verdictHash) external',
];

export async function runZeroGComputeVerdict(
  input: ZeroGComputeInput,
): Promise<IntegrationResult<ZeroGComputeResult>> {
  if (!computeUrl) {
    throw new Error('ZERO_G_COMPUTE_URL is required for real-only verdict generation');
  }

  try {
    const response = await fetch(`${computeUrl.replace(/\/$/, '')}/verdict`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(computeApiKey ? { Authorization: `Bearer ${computeApiKey}` } : {}),
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new Error(`0G Compute returned ${response.status}`);
    }

    const body = await response.json() as Partial<ZeroGComputeResult>;
    if (!body.verdictHash || typeof body.compliant !== 'boolean' || !body.reason || !body.model) {
      throw new Error('0G Compute returned an incomplete verdict receipt');
    }
    return {
      mode: 'live',
      data: {
        verdictHash: body.verdictHash,
        compliant: body.compliant,
        reason: body.reason,
        confidence: body.confidence ?? 0,
        model: body.model,
        source: body.source ?? 'compute-rest',
        attestationHash: body.attestationHash,
        txHash: body.txHash,
      },
    };
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Unknown 0G Compute adapter error');
  }
}

export async function recordZeroGComputeVerdict(
  caseId: string | undefined,
  verdictHash: string | undefined,
): Promise<string | undefined> {
  if (!caseId || !verdictHash || !rpcUrl || !evidenceRegistryAddress || !(executorPrivateKey || privateKey)) {
    return undefined;
  }

  const signer = new ethers.Wallet(executorPrivateKey ?? privateKey!, new ethers.JsonRpcProvider(rpcUrl));
  const registry = new ethers.Contract(evidenceRegistryAddress, EVIDENCE_REGISTRY_ABI, signer);
  const tx = await registry.recordVerdict(BigInt(caseId), toBytes32(verdictHash));
  const receipt = await tx.wait();
  return receipt?.hash ?? tx.hash;
}

export function getZeroGComputeStatus() {
  return {
    configured: Boolean(computeUrl || (rpcUrl && evidenceRegistryAddress && (executorPrivateKey || privateKey))),
    mode: computeUrl ? 'live' : 'not-configured',
    endpoint: computeUrl ?? null,
    evidenceRegistry: evidenceRegistryAddress ?? null,
  };
}

function toBytes32(value: string): string {
  const hex = value.startsWith('0x') ? value.slice(2) : stableHash(value, '').slice(0, 64);
  return `0x${hex.padEnd(64, '0').slice(0, 64)}`;
}
