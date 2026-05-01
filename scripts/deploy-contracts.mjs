import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';
import { ethers } from 'ethers';

const rootDir = process.cwd();
const artifactsDir = path.join(rootDir, 'artifacts', 'contracts');

const {
  RPC_URL,
  PRIVATE_KEY,
  JUDGE_ADDRESS,
  EXECUTOR_PRIVATE_KEY,
  EXECUTOR_ADDRESS,
  OWNER_AGENT_ADDRESS,
  SPECIALIST_AGENT_ADDRESS,
  AGENT_METADATA_BASE_URI,
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
const executor = EXECUTOR_ADDRESS ||
  (EXECUTOR_PRIVATE_KEY ? new ethers.Wallet(EXECUTOR_PRIVATE_KEY, provider).address : signer.address);
const judge = JUDGE_ADDRESS || signer.address;
const ownerAgent = OWNER_AGENT_ADDRESS || signer.address;
const specialistAgent = SPECIALIST_AGENT_ADDRESS || executor;
const metadataBaseUri = AGENT_METADATA_BASE_URI || '0g://proofcourt/agents';

console.log(`Deploying ProofCourt contracts from ${signer.address}`);
console.log(`Initial judge: ${judge}`);
console.log(`Executor agent: ${executor}`);

const escrow = await deploy('ProofCourtEscrow', signer, [signer.address]);
const workRegistry = await deploy('WorkRegistry', signer, [signer.address]);
const evidenceRegistry = await deploy('EvidenceRegistry', signer, [signer.address]);
const reputation = await deploy('AgentReputation', signer, [signer.address]);
const agentInft = await deploy('AgentINFT', signer, [signer.address]);
const coordinator = await deploy('ProofCourtCoordinator', signer, [
  judge,
  await escrow.getAddress(),
  await workRegistry.getAddress(),
  await evidenceRegistry.getAddress(),
  await reputation.getAddress(),
]);

const coordinatorAddress = await coordinator.getAddress();
await registerAgentIfNeeded(reputation, ownerAgent, 1, 96);
await registerAgentIfNeeded(reputation, specialistAgent, 2, 89);
await registerAgentIfNeeded(reputation, judge, 3, 100);
await (await agentInft.mint(ownerAgent, `${metadataBaseUri}/owner.json`, '0g-agent-playbook-owner', 250)).wait();
await (await agentInft.mint(specialistAgent, `${metadataBaseUri}/specialist.json`, '0g-agent-playbook-specialist', 300)).wait();
await (await agentInft.mint(judge, `${metadataBaseUri}/judge.json`, '0g-agent-playbook-judge', 200)).wait();
await (await evidenceRegistry.setVerdictRecorder(specialistAgent)).wait();
await (await escrow.setJudge(coordinatorAddress)).wait();
await (await workRegistry.setJudge(coordinatorAddress)).wait();
await (await evidenceRegistry.setJudge(coordinatorAddress)).wait();
await (await reputation.setJudge(coordinatorAddress)).wait();

const deployments = {
  chainId: Number((await provider.getNetwork()).chainId),
  deployer: signer.address,
  judge,
  executor,
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
