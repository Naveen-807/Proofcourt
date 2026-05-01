import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';
import { ethers } from 'ethers';

const rootDir = process.cwd();
const artifactsDir = path.join(rootDir, 'artifacts', 'contracts');

const {
  RPC_URL,
  PRIVATE_KEY,
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

if (!RPC_URL || !PRIVATE_KEY) {
  console.error('Missing RPC_URL or PRIVATE_KEY. Copy .env.example to .env.local and set deployment values.');
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

const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(PRIVATE_KEY, provider);
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
for (const agent of courtAgents) {
  await registerAgentIfNeeded(reputation, agent.address, agent.role, agent.score);
  await (await agentInft.mint(
    agent.address,
    `${metadataBaseUri}/${agent.slug}.json`,
    agent.playbook,
    agent.bps,
  )).wait();
  console.log(`iNFT minted for ${agent.slug} (${agent.address})`);
}

await (await evidenceRegistry.setVerdictRecorder(verifier1Address)).wait();
await (await escrow.setJudge(coordinatorAddress)).wait();
await (await workRegistry.setJudge(coordinatorAddress)).wait();
await (await evidenceRegistry.setJudge(coordinatorAddress)).wait();
await (await reputation.setJudge(coordinatorAddress)).wait();

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

async function registerAgentIfNeeded(reputation, agent, role, score) {
  const record = await reputation.agents(agent);
  if (Number(record.role) !== 0) return;
  await (await reputation.registerAgent(agent, role, score)).wait();
}
