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
  const agentDnsResolution = await resolveAgentDns(mandate);
  const agentSla = await createAndStoreAgentSla(mandate, agentDnsResolution);
  return { agentDnsResolution, agentSla };
}

async function resolveAgentDns(mandate: Mandate): Promise<AgentDNSResolution> {
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

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const agentInft = new ethers.Contract(agentInftAddress, AGENT_INFT_ABI, provider);

  try {
    const roleHints = rolesForTokens(tokenIds.length);
    const baseRecords = await Promise.all(tokenIds.map(async (tokenId, index) => {
      const [holder, metadataURI, intelligencePointer, reputation] = await Promise.all([
        agentInft.ownerOf(BigInt(tokenId)) as Promise<string>,
        agentInft.tokenURI(BigInt(tokenId)) as Promise<string>,
        agentInft.intelligencePointer(BigInt(tokenId)) as Promise<string>,
        agentInft.getReputation(BigInt(tokenId)) as Promise<ReputationTuple>,
      ]);
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

    const records: AgentDNSRecord[] = [];
    for (const baseRecord of baseRecords) {
      const memory = await storeAgentMemoryCapsule(mandate, baseRecord);

      records.push({
        ...baseRecord,
        memoryRoot: memory.root,
        memoryTxHash: memory.txHash,
        memoryUpdatedAt: memory.updatedAt,
        explorerUrl: `https://chainscan-galileo.0g.ai/token/${agentInftAddress}?a=${baseRecord.tokenId}`,
        earnings: '0 ETH',
      });
    }

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

    return {
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
  } finally {
    provider.destroy();
  }
}

async function createAndStoreAgentSla(mandate: Mandate, agentDnsResolution: AgentDNSResolution): Promise<AgentSLA> {
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
  const result = await storeEvidenceOnZeroG({
    caseId: baseSla.id,
    evidence: {
      version: 'proofcourt.agent-sla.v1',
      ...baseSla,
      slaHash,
      agentDnsResolution,
    },
  });

  return {
    ...baseSla,
    slaHash,
    zeroGRoot: result.data.root,
    zeroGTxHash: result.data.txHash,
    storedAt: new Date().toISOString(),
  };
}

async function storeAgentMemoryCapsule(
  mandate: Mandate,
  record: Omit<AgentDNSRecord, 'memoryRoot' | 'memoryTxHash' | 'memoryUpdatedAt' | 'explorerUrl' | 'earnings'>,
): Promise<{ root: string; txHash?: string; updatedAt: string }> {
  const updatedAt = new Date().toISOString();
  const result = await storeEvidenceOnZeroG({
    caseId: `agent-memory_${record.tokenId}_${mandate.id}`,
    evidence: {
      version: 'proofcourt.agent-memory.v1',
      mandateId: mandate.id,
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
      updatedAt,
    },
  });

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
