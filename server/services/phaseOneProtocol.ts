import { ethers } from 'ethers';
import type {
  AgentDNSRecord,
  AgentDNSResolution,
  AgentRole,
  AgentSLA,
  AgentStatus,
  Mandate,
} from '../../src/domain/proofcourt.ts';
import { stableHash } from '../adapters/hash.ts';
import { storeEvidenceOnZeroG } from '../adapters/zeroGAdapter.ts';

const rpcUrl = process.env.RPC_URL ?? process.env.ZERO_G_RPC_URL;
const agentInftAddress = process.env.AGENT_INFT_ADDRESS;
const agentDnsTokenIds = process.env.AGENT_DNS_TOKEN_IDS;
const agentDnsRoles = process.env.AGENT_DNS_ROLES;
const agentMemoryUploadTimeoutMs = Number(process.env.PROOFCOURT_AGENT_MEMORY_UPLOAD_TIMEOUT_MS ?? 90_000);
const agentSlaUploadTimeoutMs = Number(process.env.PROOFCOURT_AGENT_SLA_UPLOAD_TIMEOUT_MS ?? 120_000);
const agentDnsRpcTimeoutMs = Number(process.env.PROOFCOURT_AGENT_DNS_RPC_TIMEOUT_MS ?? 20_000);
const agentDnsRpcRetries = Number(process.env.PROOFCOURT_AGENT_DNS_RPC_RETRIES ?? 2);

const AGENT_INFT_ABI = [
  'function ownerOf(uint256 tokenId) external view returns (address)',
  'function tokenURI(uint256 tokenId) external view returns (string)',
  'function intelligencePointer(uint256 tokenId) external view returns (string)',
  'function getReputation(uint256 tokenId) external view returns (tuple(uint256 score,uint256 casesTotal,uint256 casesPassed,uint256 lastUpdated,bytes32 lastEvidenceHash))',
];

type ReputationTuple = {
  score: bigint;
  casesTotal: bigint;
  casesPassed: bigint;
  lastUpdated: bigint;
  lastEvidenceHash: string;
};

export async function createPhaseOneArtifacts(mandate: Mandate): Promise<{
  agentDnsResolution: AgentDNSResolution;
  agentSla: AgentSLA;
}> {
  return createPhaseOneArtifactsWithProgress(mandate);
}

export async function createPhaseOneArtifactsWithProgress(
  mandate: Mandate,
  hooks?: {
    onAgentMemoryStarted?: (payload: { agentId: string; completed: number; total: number }) => void | Promise<void>;
    onAgentMemoryStored?: (payload: { agentId: string; completed: number; total: number; root: string }) => void | Promise<void>;
    onAgentDnsResolved?: (resolution: AgentDNSResolution) => void | Promise<void>;
    onAgentSlaStarted?: () => void | Promise<void>;
    onAgentSlaStored?: (sla: AgentSLA) => void | Promise<void>;
  },
): Promise<{
  agentDnsResolution: AgentDNSResolution;
  agentSla: AgentSLA;
}> {
  const agentDnsResolution = await resolveAgentDns(
    mandate,
    hooks?.onAgentMemoryStarted,
    hooks?.onAgentMemoryStored,
    hooks?.onAgentDnsResolved,
  );
  const agentSla = await createAndStoreAgentSla(
    mandate,
    agentDnsResolution,
    hooks?.onAgentSlaStarted,
    hooks?.onAgentSlaStored,
  );
  return { agentDnsResolution, agentSla };
}

async function resolveAgentDns(
  mandate: Mandate,
  onAgentMemoryStarted?: (payload: { agentId: string; completed: number; total: number }) => void | Promise<void>,
  onAgentMemoryStored?: (payload: { agentId: string; completed: number; total: number; root: string }) => void | Promise<void>,
  onAgentDnsResolved?: (resolution: AgentDNSResolution) => void | Promise<void>,
): Promise<AgentDNSResolution> {
  if (!rpcUrl || !agentInftAddress || !agentDnsTokenIds) {
    throw new Error('RPC_URL/ZERO_G_RPC_URL, AGENT_INFT_ADDRESS, and AGENT_DNS_TOKEN_IDS are required for real AgentDNS lookup');
  }

  const tokenIds = agentDnsTokenIds
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (tokenIds.length === 0) {
    throw new Error('AGENT_DNS_TOKEN_IDS must include at least one minted AgentINFT token id');
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
  const agentInft = new ethers.Contract(agentInftAddress, AGENT_INFT_ABI, provider);

  try {
    const roleHints = rolesForTokens(tokenIds.length);
    const baseRecords = await Promise.all(tokenIds.map(async (tokenId, index) => {
      const [holder, metadataURI, intelligencePointer, reputation] = await readAgentInftToken(agentInft, tokenId);
      const role = roleHints[index] ?? 'Worker';
      const score = Number(reputation.score);
      const agentId = agentIdForRole(role, index);
      return {
        agentId,
        tokenId,
        role,
        holder,
        metadataURI,
        intelligencePointer,
        score,
        status: statusForScore(score, role),
        casesTotal: Number(reputation.casesTotal),
        casesPassed: Number(reputation.casesPassed),
        lastEvidenceHash: reputation.lastEvidenceHash,
      };
    }));

    await onAgentMemoryStarted?.({
      agentId: 'agent-memory-batch',
      completed: 0,
      total: 1,
    });
    const memory = await storeAgentMemoryBatchCapsule(mandate, baseRecords);
    await onAgentMemoryStored?.({
      agentId: 'agent-memory-batch',
      completed: 1,
      total: 1,
      root: memory.root,
    });

    const records: AgentDNSRecord[] = baseRecords.map((baseRecord) => ({
      ...baseRecord,
      memoryRoot: memory.root,
      memoryTxHash: memory.txHash,
      memoryUpdatedAt: memory.updatedAt,
      explorerUrl: `https://chainscan-galileo.0g.ai/token/${agentInftAddress}?a=${baseRecord.tokenId}`,
      earnings: '0 OG',
    }));

    const selectedAgentIds = records
      .filter((agent) => agent.role === 'Verifier' || agent.score >= mandate.minAgentTrustScore)
      .map((agent) => agent.agentId);
    const rejectedAgentIds = records
      .filter((agent) => agent.role !== 'Verifier' && agent.score < mandate.minAgentTrustScore)
      .map((agent) => agent.agentId);

    const resolutionHash = stableHash({
      mandateId: mandate.id,
      agentInftAddress,
      tokenIds,
      selectedAgentIds,
      rejectedAgentIds,
      records,
    });

    const resolution: AgentDNSResolution = {
      id: `agentdns_${mandate.id}`,
      mandateId: mandate.id,
      source: 'onchain-agent-inft-0g',
      chainId: 16602,
      agentInftAddress,
      resolvedAt: new Date().toISOString(),
      records,
      selectedAgentIds,
      rejectedAgentIds,
      resolutionHash,
    };
    await onAgentDnsResolved?.(resolution);
    return resolution;
  } finally {
    provider.destroy();
  }
}

async function readAgentInftToken(
  agentInft: ethers.Contract,
  tokenId: string,
): Promise<[string, string, string, ReputationTuple]> {
  return withRetry(
    () => withTimeout(
      Promise.all([
        agentInft.ownerOf(BigInt(tokenId)) as Promise<string>,
        agentInft.tokenURI(BigInt(tokenId)) as Promise<string>,
        agentInft.intelligencePointer(BigInt(tokenId)) as Promise<string>,
        agentInft.getReputation(BigInt(tokenId)) as Promise<ReputationTuple>,
      ]),
      agentDnsRpcTimeoutMs,
      `AgentDNS token ${tokenId} RPC read timed out after ${Math.round(agentDnsRpcTimeoutMs / 1000)}s`,
    ),
    agentDnsRpcRetries,
    `AgentDNS token ${tokenId}`,
  );
}

async function createAndStoreAgentSla(
  mandate: Mandate,
  agentDnsResolution: AgentDNSResolution,
  onAgentSlaStarted?: () => void | Promise<void>,
  onAgentSlaStored?: (sla: AgentSLA) => void | Promise<void>,
): Promise<AgentSLA> {
  const worker = agentDnsResolution.records.find((agent) => agent.role === 'Worker' && agentDnsResolution.selectedAgentIds.includes(agent.agentId));
  const requester = agentDnsResolution.records.find((agent) => agent.role === 'Requester');
  const verifiers = agentDnsResolution.records.filter((agent) => agent.role === 'Verifier');

  if (!worker) throw new Error('AgentDNS did not return a qualified Worker agent');
  if (!requester) throw new Error('AgentDNS did not return a Requester agent');
  if (verifiers.length < 3) throw new Error('AgentDNS must return three Verifier agents for ProofCourt quorum');

  const taskActionType = actionTypeForMandate(mandate);
  const action = actionForType(taskActionType);
  const agentMemoryRoots = Object.fromEntries(
    agentDnsResolution.records.map((agent) => [agent.agentId, agent.memoryRoot]),
  );
  const mandateHash = stableHash(mandate);
  const actionHash = stableHash({
    taskActionType,
    action,
    amount: mandate.amount,
    destination: mandate.destination,
    worker: worker.holder,
    agentMemoryRoots,
  });
  const baseSla = {
    id: `sla_${mandate.id}`,
    mandateId: mandate.id,
    workerAgentId: worker.agentId,
    requesterAgentId: requester.agentId,
    verifierAgentIds: verifiers.slice(0, 3).map((agent) => agent.agentId),
    task: mandate.text,
    action,
    taskActionType,
    payout: mandate.maxExecutorPayout,
    deadlineIso: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    acceptanceCriteria: [
      'Worker executes only after PermitReceipt is committed',
      'KeeperHub execution receipt must include executionId, txHash, and logHash',
      'Verifier quorum must compare execution evidence against this AgentSLA',
      '0G evidence capsule must include mandateHash, slaHash, execution receipt, and verifier verdicts',
    ],
    disputeRule: '2_OF_3_VERIFIER_QUORUM' as const,
    requiredProof: mandate.requiredProof,
    agentDnsResolutionHash: agentDnsResolution.resolutionHash,
    mandateHash,
    actionHash,
    agentMemoryRoots,
  };
  const slaHash = stableHash(baseSla);
  await onAgentSlaStarted?.();
  const result = await withTimeout(
    storeEvidenceOnZeroG({
      caseId: baseSla.id,
      evidence: {
        version: 'proofcourt.agent-sla.v1',
        ...baseSla,
        slaHash,
        agentDnsResolution,
      },
    }),
    agentSlaUploadTimeoutMs,
    `AgentSLA 0G upload timed out after ${Math.round(agentSlaUploadTimeoutMs / 1000)}s`,
  );

  const sla = {
    ...baseSla,
    slaHash,
    zeroGRoot: result.data.root,
    zeroGTxHash: result.data.txHash,
    storedAt: new Date().toISOString(),
  };
  await onAgentSlaStored?.(sla);
  return sla;
}

async function storeAgentMemoryBatchCapsule(
  mandate: Mandate,
  records: Array<Omit<AgentDNSRecord, 'memoryRoot' | 'memoryTxHash' | 'memoryUpdatedAt' | 'explorerUrl' | 'earnings'>>,
): Promise<{ root: string; txHash?: string; updatedAt: string }> {
  const updatedAt = new Date().toISOString();
  const result = await withTimeout(
    storeEvidenceOnZeroG({
      caseId: `agent-memory-batch_${mandate.id}`,
      evidence: {
        version: 'proofcourt.agent-memory-batch.v1',
        mandateId: mandate.id,
        memories: records.map((record) => ({
          agentId: record.agentId,
          role: record.role,
          tokenId: record.tokenId,
          holder: record.holder,
          metadataURI: record.metadataURI,
          intelligencePointer: record.intelligencePointer,
          memory: {
            currentGoal: mandate.text,
            coordinationRole: roleMemoryPolicy(record.role),
            reputation: {
              score: record.score,
              casesTotal: record.casesTotal,
              casesPassed: record.casesPassed,
              lastEvidenceHash: record.lastEvidenceHash,
            },
          },
        })),
        updatedAt,
      },
    }),
    agentMemoryUploadTimeoutMs,
    `Agent memory batch 0G upload timed out after ${Math.round(agentMemoryUploadTimeoutMs / 1000)}s`,
  );

  return {
    root: result.data.root,
    txHash: result.data.txHash,
    updatedAt,
  };
}

function roleMemoryPolicy(role: AgentRole): string {
  if (role === 'Requester') return 'Own the mandate, hire a worker, and close settlement only after proof.';
  if (role === 'Worker') return 'Execute only the permitted AgentSLA action and submit a live execution receipt.';
  if (role === 'Verifier') return 'Independently verify execution artifacts with 0G Compute and sign a verdict.';
  return 'Participate only through the assigned ProofCourt protocol role.';
}

function actionTypeForMandate(mandate: Mandate): AgentSLA['taskActionType'] {
  if (mandate.intent === 'protected_buy') return 'protectedBuy';
  if (mandate.intent === 'weekly_transfer') return 'weeklyTransfer';
  if (mandate.intent === 'proof_only_task') return 'proofOnlyTask';
  return 'vaultDeposit';
}

function actionForType(type: AgentSLA['taskActionType']): string {
  if (type === 'protectedBuy') return 'protectedBuy()';
  if (type === 'weeklyTransfer') return 'weeklyTransfer()';
  if (type === 'proofOnlyTask') return 'produceProofOnlyArtifact()';
  return 'vaultDeposit()';
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function withRetry<T>(
  operation: () => Promise<T>,
  retries: number,
  label: string,
): Promise<T> {
  let lastError: unknown;
  const attempts = Math.max(1, retries + 1);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 1_000 * attempt));
      }
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`${label} failed after ${attempts} attempts: ${message}`);
}

function rolesForTokens(count: number): AgentRole[] {
  const explicit = agentDnsRoles
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean) as AgentRole[] | undefined;
  if (explicit && explicit.length === count) return explicit;

  return ['Requester', 'Worker', 'Verifier', 'Verifier', 'Verifier'].slice(0, count) as AgentRole[];
}

function agentIdForRole(role: AgentRole, index: number): string {
  if (role === 'Requester') return 'requester';
  if (role === 'Worker') return 'worker';
  if (role === 'Verifier') return `verifier-${Math.max(1, index - 1)}`;
  return role.toLowerCase();
}

function statusForScore(score: number, role: AgentRole): AgentStatus {
  if (role === 'Verifier') return 'System';
  if (score >= 80) return 'Trusted';
  if (score >= 60) return 'Caution';
  return 'Suspended';
}
