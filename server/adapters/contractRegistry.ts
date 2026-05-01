const deploymentEnv = {
  proofCourtEscrow: process.env.PROOFCOURT_ESCROW_ADDRESS ?? null,
  workRegistry: process.env.WORK_REGISTRY_ADDRESS ?? null,
  evidenceRegistry: process.env.EVIDENCE_REGISTRY_ADDRESS ?? null,
  agentReputation: process.env.AGENT_REPUTATION_ADDRESS ?? null,
  agentInft: process.env.AGENT_INFT_ADDRESS ?? null,
  proofCourtCoordinator: process.env.PROOFCOURT_COORDINATOR_ADDRESS ?? null,
};

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
    contracts,
  };
}
