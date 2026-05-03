import fs from 'node:fs';
import path from 'node:path';
import { ethers } from 'ethers';
import { stableHash } from './hash.ts';
import type { IntegrationResult, ZeroGStoreInput, ZeroGStoreResult } from './integrationTypes.ts';

const zeroGStorageUrl = process.env.ZERO_G_STORAGE_URL;
const zeroGIndexerRpc = process.env.ZERO_G_INDEXER_RPC ?? 'https://indexer-storage-testnet-turbo.0g.ai';
const zeroGRpcUrl = process.env.ZERO_G_RPC_URL ?? process.env.RPC_URL ?? 'https://evmrpc-testnet.0g.ai';
const zeroGApiKey = process.env.ZERO_G_API_KEY;
const privateKey = process.env.ZERO_G_PRIVATE_KEY ?? process.env.PRIVATE_KEY;
const evidenceStore = new Map<string, StoredZeroGEvidence>();
const evidenceStoreByRoot = new Map<string, StoredZeroGEvidence>();
const cacheDir = path.join(process.cwd(), '.proofcourt', 'evidence');

export interface StoredZeroGEvidence extends ZeroGStoreResult {
  caseId: string;
  evidence: Record<string, unknown>;
  storedAt: string;
}

export async function storeEvidenceOnZeroG(input: ZeroGStoreInput): Promise<IntegrationResult<ZeroGStoreResult>> {
  const canonicalEvidence = canonicalizeEvidence(input);

  if (privateKey && zeroGIndexerRpc && zeroGRpcUrl) {
    try {
      const data = await uploadWithZeroGSdk(canonicalEvidence);
      persistEvidence(canonicalEvidence, data);
      return { mode: 'live', data };
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Unknown 0G SDK upload error');
    }
  }

  if (!zeroGStorageUrl) {
    throw new Error('ZERO_G_PRIVATE_KEY or ZERO_G_STORAGE_URL is required for real-only 0G evidence storage');
  }

  try {
    const response = await fetch(`${zeroGStorageUrl.replace(/\/$/, '')}/evidence`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(zeroGApiKey ? { Authorization: `Bearer ${zeroGApiKey}` } : {}),
      },
      body: JSON.stringify(canonicalEvidence),
    });

    if (!response.ok) {
      throw new Error(`0G Storage returned ${response.status}`);
    }

    const body = await response.json() as Partial<ZeroGStoreResult>;
    if (!body.root || !body.verificationHash || !body.bundleHash || !body.byteSize) {
      throw new Error('0G Storage returned an incomplete evidence receipt');
    }
    const data: ZeroGStoreResult = {
      root: body.root,
      storageMode: body.storageMode ?? '0G Storage',
      verificationHash: body.verificationHash,
      bundleHash: body.bundleHash,
      byteSize: body.byteSize,
      txHash: body.txHash,
      source: body.source ?? '0g-rest',
    };
    persistEvidence(canonicalEvidence, data);

    return {
      mode: 'live',
      data,
    };
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Unknown 0G adapter error');
  }
}

export async function getEvidenceFromZeroG(caseId: string): Promise<IntegrationResult<StoredZeroGEvidence | null>> {
  if (!zeroGStorageUrl) {
    const cached = evidenceStore.get(caseId) ?? readCachedEvidence(caseId) ?? null;
    if (cached) return { mode: 'live', data: cached };
    throw new Error('ZERO_G_STORAGE_URL is required to replay evidence from 0G by case ID');
  }

  try {
    const response = await fetch(`${zeroGStorageUrl.replace(/\/$/, '')}/evidence/${caseId}`, {
      headers: {
        ...(zeroGApiKey ? { Authorization: `Bearer ${zeroGApiKey}` } : {}),
      },
    });

    if (!response.ok) {
      throw new Error(`0G Storage returned ${response.status}`);
    }

    const body = await response.json() as StoredZeroGEvidence;
    persistEvidence({ caseId: body.caseId, evidence: body.evidence }, body);
    return { mode: 'live', data: body };
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Unknown 0G replay error');
  }
}

export function listStoredEvidence(): StoredZeroGEvidence[] {
  return [...evidenceStore.values()];
}

export async function getEvidenceByRootFromZeroG(root: string): Promise<IntegrationResult<StoredZeroGEvidence | null>> {
  if (!zeroGStorageUrl) {
    const cached = evidenceStoreByRoot.get(root) ?? readCachedEvidenceByRoot(root) ?? null;
    if (cached) return { mode: 'live', data: cached };
    throw new Error('ZERO_G_STORAGE_URL is required to replay evidence from 0G by root');
  }

  try {
    const response = await fetch(`${zeroGStorageUrl.replace(/\/$/, '')}/evidence/root/${root}`, {
      headers: {
        ...(zeroGApiKey ? { Authorization: `Bearer ${zeroGApiKey}` } : {}),
      },
    });

    if (!response.ok) {
      throw new Error(`0G Storage returned ${response.status}`);
    }

    const body = await response.json() as StoredZeroGEvidence;
    persistEvidence({ caseId: body.caseId, evidence: body.evidence }, body);
    return { mode: 'live', data: body };
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Unknown 0G root replay error');
  }
}

export function getZeroGStatus() {
  return {
    configured: Boolean((privateKey && zeroGIndexerRpc && zeroGRpcUrl) || zeroGStorageUrl),
    mode: (privateKey && zeroGIndexerRpc && zeroGRpcUrl) || zeroGStorageUrl ? 'live' : 'not-configured',
    endpoint: zeroGStorageUrl ?? zeroGIndexerRpc ?? null,
    indexerRpc: zeroGIndexerRpc,
    chainRpc: zeroGRpcUrl,
  };
}

function persistEvidence(input: ZeroGStoreInput, result: ZeroGStoreResult) {
  const record = {
    ...result,
    caseId: input.caseId,
    evidence: input.evidence,
    storedAt: new Date().toISOString(),
  };

  evidenceStore.set(input.caseId, record);
  evidenceStoreByRoot.set(result.root, record);
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cachePath(input.caseId), JSON.stringify(record, null, 2));
}

async function uploadWithZeroGSdk(input: ZeroGStoreInput): Promise<ZeroGStoreResult> {
  const [{ Indexer, MemData }, bytes] = await Promise.all([
    import('@0gfoundation/0g-ts-sdk') as Promise<{
      Indexer: new (url: string) => {
        upload: (data: unknown, rpc: string, signer: ethers.Wallet) => Promise<[unknown, unknown]>;
      };
      MemData: new (data: Uint8Array) => {
        merkleTree: () => Promise<[{ rootHash: () => string } | null, unknown]>;
      };
    }>,
    Promise.resolve(new TextEncoder().encode(JSON.stringify(input))),
  ]);

  const signer = new ethers.Wallet(privateKey!, new ethers.JsonRpcProvider(zeroGRpcUrl));
  const indexer = new Indexer(zeroGIndexerRpc);
  const memData = new MemData(bytes);
  const [tree, treeErr] = await memData.merkleTree();
  if (treeErr !== null) throw new Error(`0G merkle tree error: ${String(treeErr)}`);

  const [tx, uploadErr] = await indexer.upload(memData, zeroGRpcUrl, signer);
  if (uploadErr !== null) throw new Error(`0G upload error: ${String(uploadErr)}`);

  const txRecord = tx as { rootHash?: string; txHash?: string; rootHashes?: string[]; txHashes?: string[] };
  const root = txRecord.rootHash ?? txRecord.rootHashes?.[0] ?? tree?.rootHash() ?? stableHash(input);
  const txHash = txRecord.txHash ?? txRecord.txHashes?.[0];

  return {
    root,
    storageMode: '0G Storage',
    verificationHash: stableHash({ verifier: 'proofcourt-0g-sdk', root, txHash }),
    bundleHash: stableHash(input),
    byteSize: bytes.byteLength,
    txHash,
    source: '0g-sdk',
  };
}

function canonicalizeEvidence(input: ZeroGStoreInput): ZeroGStoreInput {
  return {
    caseId: input.caseId,
    evidence: {
      version: 'proofcourt.evidence.v1',
      createdAt: new Date().toISOString(),
      ...input.evidence,
    },
  };
}

function readCachedEvidence(caseId: string): StoredZeroGEvidence | undefined {
  try {
    const record = JSON.parse(fs.readFileSync(cachePath(caseId), 'utf8')) as StoredZeroGEvidence;
    evidenceStore.set(record.caseId, record);
    evidenceStoreByRoot.set(record.root, record);
    return record;
  } catch {
    return undefined;
  }
}

function readCachedEvidenceByRoot(root: string): StoredZeroGEvidence | undefined {
  if (!fs.existsSync(cacheDir)) return undefined;

  for (const filename of fs.readdirSync(cacheDir)) {
    if (!filename.endsWith('.json')) continue;
    const record = readCachedEvidence(filename.replace(/\.json$/, ''));
    if (record?.root === root) return record;
  }

  return undefined;
}

function cachePath(caseId: string): string {
  return path.join(cacheDir, `${caseId}.json`);
}
