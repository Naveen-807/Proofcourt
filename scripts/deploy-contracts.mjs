import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';
import { ethers } from 'ethers';

const rootDir = process.cwd();
const artifactsDir = path.join(rootDir, 'artifacts', 'contracts');

const {
  RPC_URL,
  ZERO_G_RPC_URL,
  PRIVATE_KEY,
  ZERO_G_PRIVATE_KEY,
  AGENT_METADATA_BASE_URI,
  REQUESTER_ADDRESS,
  WORKER_ADDRESS,
  VERIFIER_1_ADDRESS,
  VERIFIER_2_ADDRESS,
  VERIFIER_3_ADDRESS,
  // legacy compat
  JUDGE_ADDRESS,
  EXECUTOR_ADDRESS,
  EXECUTOR_PRIVATE_KEY,
} = process.env;

const effectiveRpcUrl = RPC_URL || ZERO_G_RPC_URL;
const effectivePrivateKey = PRIVATE_KEY || ZERO_G_PRIVATE_KEY;

if (!effectiveRpcUrl || !effectivePrivateKey) {
  console.error('Missing RPC_URL/ZERO_G_RPC_URL or PRIVATE_KEY/ZERO_G_PRIVATE_KEY. Copy .env.example to .env and set deployment values.');
  process.exit(1);
}

if (!EXECUTOR_PRIVATE_KEY && !WORKER_ADDRESS && !EXECUTOR_ADDRESS) {
  console.error('Missing EXECUTOR_PRIVATE_KEY, WORKER_ADDRESS, or EXECUTOR_ADDRESS. Use a separate worker address for the payout recipient.');
  process.exit(1);
}

function loadArtifact(contractName) {
  const artifactPath = path.join(artifactsDir, `${contractName}.json`);
  if (!fs.existsSync(artifactPath)) {
    console.error(`Missing artifact ${artifactPath}. Run npm run contracts:compile first.`);
    process.exit(1);
  }

  return JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
}

async function deploy(contractName, signer, args = []) {
  const artifact = loadArtifact(contractName);
  const factory = new ethers.ContractFactory(artifact.abi, `0x${artifact.bytecode}`, signer);
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`${contractName}: ${address}`);
  return contract;
}

const provider = new ethers.JsonRpcProvider(effectiveRpcUrl);
const signer = new ethers.Wallet(effectivePrivateKey, provider);
const workerAddress = WORKER_ADDRESS || EXECUTOR_ADDRESS ||
  (EXECUTOR_PRIVATE_KEY ? new ethers.Wallet(EXECUTOR_PRIVATE_KEY, provider).address : signer.address);
const requesterAddress = REQUESTER_ADDRESS || signer.address;
const verifier1Address = VERIFIER_1_ADDRESS || JUDGE_ADDRESS || signer.address;
const verifier2Address = VERIFIER_2_ADDRESS || signer.address;
const verifier3Address = VERIFIER_3_ADDRESS || signer.address;
const metadataBaseUri = AGENT_METADATA_BASE_URI || '0g://proofcourt/agents';

// 5 court roles: requester, worker, verifier-1, verifier-2, verifier-3
const courtAgents = [
  { address: requesterAddress, role: 1, score: 96, slug: 'requester', playbook: '0g-agent-playbook-requester', bps: 250 },
  { address: workerAddress,    role: 2, score: 89, slug: 'worker',    playbook: '0g-agent-playbook-worker',    bps: 300 },
  { address: verifier1Address, role: 3, score: 100, slug: 'verifier-1', playbook: '0g-agent-playbook-verifier', bps: 200 },
  { address: verifier2Address, role: 3, score: 100, slug: 'verifier-2', playbook: '0g-agent-playbook-verifier', bps: 200 },
  { address: verifier3Address, role: 3, score: 100, slug: 'verifier-3', playbook: '0g-agent-playbook-verifier', bps: 200 },
];

console.log(`Deploying ProofCourt contracts from ${signer.address}`);
console.log(`Court roles: requester=${requesterAddress} worker=${workerAddress}`);
console.log(`Verifiers: [${verifier1Address}, ${verifier2Address}, ${verifier3Address}]`);

const escrow = await deploy('ProofCourtEscrow', signer, [signer.address]);
const workRegistry = await deploy('WorkRegistry', signer, [signer.address]);
const evidenceRegistry = await deploy('EvidenceRegistry', signer, [signer.address]);
const reputation = await deploy('AgentReputation', signer, [signer.address]);
const agentInft = await deploy('AgentINFT', signer, [signer.address]);
const coordinator = await deploy('ProofCourtCoordinator', signer, [
  verifier1Address,  // lead verifier acts as judge for backward compat
  await escrow.getAddress(),
  await workRegistry.getAddress(),
  await evidenceRegistry.getAddress(),
  await reputation.getAddress(),
]);

const coordinatorAddress = await coordinator.getAddress();

// Register and mint iNFTs for all 5 court roles
const agentTokenIds = {};
for (const agent of courtAgents) {
  await registerAgentIfNeeded(reputation, agent.address, agent.role, agent.score);
  await (await agentInft.mint(
    agent.address,
    `${metadataBaseUri}/${agent.slug}.json`,
    agent.playbook,
    agent.bps,
  )).wait();
  const tokenId = Number(await agentInft.nextTokenId()) - 1;
  await (await agentInft.initializeReputation(tokenId, agent.score, ethers.ZeroHash)).wait();
  agentTokenIds[agent.slug] = tokenId;
  console.log(`iNFT #${tokenId} minted for ${agent.slug} (${agent.address}) with score ${agent.score}`);
}

await (await evidenceRegistry.setVerdictRecorder(verifier1Address)).wait();
await (await escrow.setJudge(coordinatorAddress)).wait();
await (await workRegistry.setJudge(coordinatorAddress)).wait();
await (await evidenceRegistry.setJudge(coordinatorAddress)).wait();
await (await reputation.setJudge(coordinatorAddress)).wait();
await (await agentInft.setJudge(coordinatorAddress)).wait();

const deployments = {
  chainId: Number((await provider.getNetwork()).chainId),
  deployer: signer.address,
  courtRoles: {
    requester: requesterAddress,
    worker: workerAddress,
    verifier1: verifier1Address,
    verifier2: verifier2Address,
    verifier3: verifier3Address,
  },
  agentTokenIds,
  contracts: {
    ProofCourtEscrow: await escrow.getAddress(),
    WorkRegistry: await workRegistry.getAddress(),
    EvidenceRegistry: await evidenceRegistry.getAddress(),
    AgentReputation: await reputation.getAddress(),
    AgentINFT: await agentInft.getAddress(),
    ProofCourtCoordinator: coordinatorAddress,
  },
};

fs.mkdirSync(path.join(rootDir, 'deployments'), { recursive: true });
const outPath = path.join(rootDir, 'deployments', `${deployments.chainId}.json`);
fs.writeFileSync(outPath, JSON.stringify(deployments, null, 2));

console.log(`Deployment written to ${path.relative(rootDir, outPath)}`);
console.log('\nAdd these addresses to .env and restart npm run dev:full:');
console.log(`RPC_URL="${effectiveRpcUrl}"`);
console.log(`PROOFCOURT_ESCROW_ADDRESS="${deployments.contracts.ProofCourtEscrow}"`);
console.log(`WORK_REGISTRY_ADDRESS="${deployments.contracts.WorkRegistry}"`);
console.log(`EVIDENCE_REGISTRY_ADDRESS="${deployments.contracts.EvidenceRegistry}"`);
console.log(`AGENT_REPUTATION_ADDRESS="${deployments.contracts.AgentReputation}"`);
console.log(`AGENT_INFT_ADDRESS="${deployments.contracts.AgentINFT}"`);
console.log(`PROOFCOURT_COORDINATOR_ADDRESS="${deployments.contracts.ProofCourtCoordinator}"`);
console.log(`VITE_AGENT_INFT_ADDRESS="${deployments.contracts.AgentINFT}"`);

async function registerAgentIfNeeded(reputation, agent, role, score) {
  const record = await reputation.agents(agent);
  if (Number(record.role) !== 0) return;
  await (await reputation.registerAgent(agent, role, score)).wait();
}
