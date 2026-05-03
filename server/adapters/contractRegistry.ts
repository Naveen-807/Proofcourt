import { ethers } from 'ethers';

const deploymentEnv = {
  proofCourtEscrow: process.env.PROOFCOURT_ESCROW_ADDRESS ?? null,
  workRegistry: process.env.WORK_REGISTRY_ADDRESS ?? null,
  evidenceRegistry: process.env.EVIDENCE_REGISTRY_ADDRESS ?? null,
  agentReputation: process.env.AGENT_REPUTATION_ADDRESS ?? null,
  agentInft: process.env.AGENT_INFT_ADDRESS ?? null,
  proofCourtCoordinator: process.env.PROOFCOURT_COORDINATOR_ADDRESS ?? null,
};

const AGENT_INFT_ABI = [
  'function updateReputation(uint256 tokenId, int256 scoreDelta, bytes32 evidenceHash) external',
  'function getReputation(uint256 tokenId) external view returns (tuple(uint256 score,uint256 casesTotal,uint256 casesPassed,uint256 lastUpdated,bytes32 lastEvidenceHash))',
];

export function getContractStatus() {
  const contracts = [
    {
      name: 'ProofCourtEscrow',
      address: deploymentEnv.proofCourtEscrow,
      purpose: 'Locks payout before execution and releases only after proof verification.',
    },
    {
      name: 'WorkRegistry',
      address: deploymentEnv.workRegistry,
      purpose: 'Stores permits and validates protected action payloads.',
    },
    {
      name: 'EvidenceRegistry',
      address: deploymentEnv.evidenceRegistry,
      purpose: 'Records AXL transcript hash, KeeperHub receipt hash, and 0G evidence root.',
    },
    {
      name: 'AgentReputation',
      address: deploymentEnv.agentReputation,
      purpose: 'Updates trust scores from verified or blocked proof outcomes.',
    },
    {
      name: 'AgentINFT',
      address: deploymentEnv.agentInft,
      purpose: 'Mints agent intelligence NFTs with 0G playbook pointers and royalty metadata.',
    },
    {
      name: 'ProofCourtCoordinator',
      address: deploymentEnv.proofCourtCoordinator,
      purpose: 'Runs prepare, commit, and abort across the contract suite.',
    },
  ];

  return {
    deployed: contracts.every((contract) => Boolean(contract.address)),
    chainId: 16602,
    explorer: 'https://chainscan-galileo.0g.ai',
    contracts,
  };
}

export interface OnChainReputationUpdate {
  mode: 'live' | 'not-configured' | 'error';
  txHash?: string;
  tokenId: string;
  scoreDelta: number;
  evidenceHash: string;
  error?: string;
}

export async function updateOnChainReputation(
  agentTokenId: string | number,
  scoreDelta: number,
  evidenceHash: string,
): Promise<OnChainReputationUpdate> {
  const tokenId = String(agentTokenId);
  const normalizedEvidenceHash = toBytes32(evidenceHash);

  const rpcUrl = process.env.RPC_URL ?? process.env.ZERO_G_RPC_URL;
  const privateKey = process.env.PRIVATE_KEY ?? process.env.ZERO_G_PRIVATE_KEY;

  if (!rpcUrl || !privateKey || !deploymentEnv.agentInft) {
    return {
      mode: 'not-configured',
      tokenId,
      scoreDelta,
      evidenceHash: normalizedEvidenceHash,
    };
  }

  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(privateKey, provider);
    const agentInft = new ethers.Contract(deploymentEnv.agentInft, AGENT_INFT_ABI, signer);
    try {
      const tx = await agentInft.updateReputation(BigInt(tokenId), BigInt(scoreDelta), normalizedEvidenceHash);
      const receipt = await tx.wait();

      return {
        mode: 'live',
        txHash: receipt?.hash ?? tx.hash,
        tokenId,
        scoreDelta,
        evidenceHash: normalizedEvidenceHash,
      };
    } finally {
      provider.destroy();
    }
  } catch (error) {
    return {
      mode: 'error',
      tokenId,
      scoreDelta,
      evidenceHash: normalizedEvidenceHash,
      error: error instanceof Error ? error.message : 'onchain_reputation_update_failed',
    };
  }
}

function toBytes32(value: string): string {
  if (value.startsWith('0x') && value.length === 66) return value;
  const hex = value.startsWith('0x') ? value.slice(2) : ethers.id(value).slice(2);
  return `0x${hex.padEnd(64, '0').slice(0, 64)}`;
}
