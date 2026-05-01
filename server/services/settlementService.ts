import { ethers } from 'ethers';
import type { ProofCourtRun, SettlementReceipt } from '../../src/domain/proofcourt.ts';
import { stableHash } from '../adapters/hash.ts';

const ESCROW_ABI = [
  'function createCase(address executor, bytes32 mandateHash) external payable returns (uint256 caseId)',
];

const WORK_REGISTRY_ABI = [
  'function submitExecution(uint256 workflowId, bytes payload) external',
];

const COORDINATOR_ABI = [
  'function prepare(uint256 caseId, uint256 workflowId, bytes32 mandateHash, address executor, bytes32 actionHash, uint256 expiry, bytes32 permitHash, uint256 minTrustScore) external',
  'function commit(uint256 caseId, uint256 workflowId, address executor, bytes payload, bytes32 permitHash, bytes32 axlTranscriptHash, bytes32 keeperHubReceiptHash, bytes32 zeroGRoot, bytes32 verificationHash) external',
  'function abort(uint256 caseId, uint256 workflowId, address executor, bytes32 reasonHash, bytes32 zeroGRoot) external',
];

const rpcUrl = process.env.RPC_URL;
const privateKey = process.env.PRIVATE_KEY;
const executorPrivateKey = process.env.EXECUTOR_PRIVATE_KEY;
const escrowAddress = process.env.PROOFCOURT_ESCROW_ADDRESS;
const workRegistryAddress = process.env.WORK_REGISTRY_ADDRESS;
const coordinatorAddress = process.env.PROOFCOURT_COORDINATOR_ADDRESS;

export async function prepareSettlement(run: ProofCourtRun): Promise<SettlementReceipt> {
  if (!isLiveConfigured()) {
    throw new Error('0G contract deployment env is required for real-only settlement prepare');
  }

  try {
    const { signer, executorSigner } = getSigners();
    const escrow = new ethers.Contract(escrowAddress, ESCROW_ABI, signer);
    const coordinator = new ethers.Contract(coordinatorAddress, COORDINATOR_ABI, signer);
    const executorAddress = await executorSigner.getAddress();
    const mandateHash = toBytes32(run.mandate.id);
    const actionPayload = encodeActionPayload(run);
    const actionHash = ethers.keccak256(actionPayload);
    const permitHash = toBytes32(run.evidence.permitHash || stableHash({ permit: run.id }));
    const payoutAmount = ethers.parseEther(run.mandate.maxExecutorPayout.replace(' ETH', ''));

    const createTx = await escrow.createCase(executorAddress, mandateHash, { value: payoutAmount });
    const createReceipt = await createTx.wait();
    const caseId = extractCaseId(createReceipt) ?? BigInt(uintId(run.id));
    const workflowId = BigInt(uintId(run.id));
    const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600);

    const prepareTx = await coordinator.prepare(
      caseId,
      workflowId,
      mandateHash,
      executorAddress,
      actionHash,
      expiry,
      permitHash,
      BigInt(run.mandate.minAgentTrustScore),
    );
    const prepareReceipt = await prepareTx.wait();

    return {
      mode: 'live',
      caseId: run.id,
      contractCaseId: caseId.toString(),
      workflowId: workflowId.toString(),
      executorAddress,
      escrowStatus: 'Locked',
      prepareTxHash: prepareReceipt?.hash ?? prepareTx.hash,
    };
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Unknown settlement prepare error');
  }
}

export async function commitSettlement(run: ProofCourtRun): Promise<SettlementReceipt> {
  if (!isLiveConfigured() || !run.settlementReceipt?.contractCaseId) {
    throw new Error('0G contract deployment env and prepared case ID are required for real-only settlement commit');
  }

  try {
    const { signer, executorSigner } = getSigners();
    const workRegistry = new ethers.Contract(workRegistryAddress, WORK_REGISTRY_ABI, executorSigner);
    const coordinator = new ethers.Contract(coordinatorAddress, COORDINATOR_ABI, signer);
    const payload = encodeActionPayload(run);
    const caseId = BigInt(run.settlementReceipt.contractCaseId);
    const workflowId = BigInt(run.settlementReceipt.workflowId);
    const executorAddress = run.settlementReceipt.executorAddress;

    const submitTx = await workRegistry.submitExecution(workflowId, payload);
    await submitTx.wait();

    const commitTx = await coordinator.commit(
      caseId,
      workflowId,
      executorAddress,
      payload,
      toBytes32(run.evidence.permitHash),
      toBytes32(run.evidence.axlTranscriptHash),
      toBytes32(run.evidence.keeperHubReceiptHash),
      toBytes32(run.evidence.root),
      toBytes32(run.evidence.verificationHash ?? stableHash({ verified: run.id })),
    );
    const commitReceipt = await commitTx.wait();

    return {
      ...run.settlementReceipt,
      mode: 'live',
      escrowStatus: 'Released',
      commitTxHash: commitReceipt?.hash ?? commitTx.hash,
    };
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Unknown settlement commit error');
  }
}

export async function abortSettlement(run: ProofCourtRun): Promise<SettlementReceipt> {
  if (!isLiveConfigured() || !run.settlementReceipt?.contractCaseId) {
    throw new Error('0G contract deployment env and prepared case ID are required for real-only settlement abort');
  }

  try {
    const { signer } = getSigners();
    const coordinator = new ethers.Contract(coordinatorAddress, COORDINATOR_ABI, signer);
    const abortTx = await coordinator.abort(
      BigInt(run.settlementReceipt.contractCaseId),
      BigInt(run.settlementReceipt.workflowId),
      run.settlementReceipt.executorAddress,
      toBytes32(stableHash({ reason: 'proof_failed', runId: run.id })),
      toBytes32(run.evidence.root || stableHash({ evidence: run.id })),
    );
    const abortReceipt = await abortTx.wait();

    return {
      ...run.settlementReceipt,
      mode: 'live',
      escrowStatus: 'Blocked',
      abortTxHash: abortReceipt?.hash ?? abortTx.hash,
    };
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Unknown settlement abort error');
  }
}

function isLiveConfigured(): boolean {
  return Boolean(rpcUrl && privateKey && escrowAddress && workRegistryAddress && coordinatorAddress);
}

function getSigners() {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey!, provider);
  const executorSigner = executorPrivateKey
    ? new ethers.Wallet(executorPrivateKey, provider)
    : signer;

  return { signer, executorSigner };
}

function encodeActionPayload(run: ProofCourtRun): Uint8Array {
  return ethers.toUtf8Bytes(JSON.stringify({
    mandateId: run.mandate.id,
    action: run.keeperHubReceipt.action,
    amount: run.mandate.amount,
    destination: run.mandate.destination,
  }));
}

function toBytes32(value: string): string {
  const hex = value.startsWith('0x') ? value.slice(2) : stableHash(value, '').slice(0, 64);
  return `0x${hex.padEnd(64, '0').slice(0, 64)}`;
}

function uintId(value: string): number {
  return Number.parseInt(stableHash(value, '').slice(0, 10), 16);
}

function extractCaseId(receipt: ethers.ContractTransactionReceipt | null): bigint | undefined {
  const log = receipt?.logs.find((entry) => entry.topics.length > 1);
  return log ? BigInt(log.topics[1]) : undefined;
}
