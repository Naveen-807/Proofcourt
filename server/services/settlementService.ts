import { ethers } from 'ethers';
import type { ProofCourtRun, SettlementReceipt } from '../../src/domain/proofcourt.ts';
import { stableHash } from '../adapters/hash.ts';

const WORK_REGISTRY_ABI = [
  'function submitExecution(uint256 workflowId, bytes payload) external',
];

const COORDINATOR_ABI = [
  'function prepare(uint256 caseId, uint256 workflowId, bytes32 mandateHash, address requester, address executor, bytes32 actionHash, uint256 expiry, bytes32 permitHash, bytes32 slaHash, bytes32 agentDnsResolutionHash, uint256 minTrustScore) external',
  'function commit(uint256 caseId, uint256 workflowId, address executor, bytes payload, bytes32 permitHash, bytes32 axlTranscriptHash, bytes32 keeperHubReceiptHash, bytes32 zeroGRoot, bytes32 verificationHash) external',
  'function abort(uint256 caseId, uint256 workflowId, address executor, bytes32 reasonHash, bytes32 zeroGRoot) external',
];

const rpcUrl = firstDefined(process.env.RPC_URL, process.env.ZERO_G_RPC_URL);
const privateKey = firstDefined(process.env.PRIVATE_KEY, process.env.ZERO_G_PRIVATE_KEY);
const executorPrivateKey = process.env.EXECUTOR_PRIVATE_KEY;
const escrowAddress = process.env.PROOFCOURT_ESCROW_ADDRESS;
const workRegistryAddress = process.env.WORK_REGISTRY_ADDRESS;
const coordinatorAddress = process.env.PROOFCOURT_COORDINATOR_ADDRESS;
const executorAddressEnv = process.env.EXECUTOR_ADDRESS;

export interface EscrowFundingIntent {
  chainId: 16602;
  escrowAddress: string;
  executorAddress: string;
  mandateHash: string;
  payoutWei: string;
  payoutLabel: string;
  workflowId: string;
}

export function getEscrowFundingIntent(run: ProofCourtRun): EscrowFundingIntent {
  if (!escrowAddress) {
    throw new Error('PROOFCOURT_ESCROW_ADDRESS is required before a browser wallet can fund escrow');
  }

  const executorAddress = getExecutorAddress();

  return {
    chainId: 16602,
    escrowAddress,
    executorAddress,
    mandateHash: toBytes32(run.agentSla?.mandateHash ?? run.mandate.id),
    payoutWei: ethers.parseEther(amountToNative(run.mandate.maxExecutorPayout)).toString(),
    payoutLabel: run.mandate.maxExecutorPayout,
    workflowId: workflowIdForRun(run),
  };
}

export async function prepareSettlement(run: ProofCourtRun): Promise<SettlementReceipt> {
  if (!isLiveConfigured()) {
    throw new Error('Live settlement config is required: RPC_URL/ZERO_G_RPC_URL, PRIVATE_KEY/ZERO_G_PRIVATE_KEY, EXECUTOR_PRIVATE_KEY, WORK_REGISTRY_ADDRESS, and PROOFCOURT_COORDINATOR_ADDRESS must be set');
  }

  if (!run.settlementReceipt?.contractCaseId || !run.settlementReceipt.fundingTxHash) {
    throw new Error('Browser-funded escrow case is required before prepare can run');
  }
  if (!run.agentSla?.slaHash || !run.agentDnsResolution?.resolutionHash) {
    throw new Error('AgentSLA and AgentDNS hashes are required before hiring/prepare can run');
  }

  try {
    const { signer, executorSigner } = getSigners();
    const coordinator = new ethers.Contract(coordinatorAddress, COORDINATOR_ABI, signer);
    const requesterAddress = run.settlementReceipt.payerAddress
      || run.agentDnsResolution?.records.find((record) => record.role === 'Requester')?.holder;
    if (!requesterAddress) {
      throw new Error('Requester address is required before prepare can run');
    }
    const executorAddress = await executorSigner.getAddress();
    const mandateHash = toBytes32(run.agentSla?.mandateHash ?? run.mandate.id);
    const actionPayload = encodeActionPayload(run);
    const actionHash = ethers.keccak256(actionPayload);
    const permitHash = toBytes32(run.evidence.permitHash || stableHash({ permit: run.id }));
    const slaHash = toBytes32(run.agentSla.slaHash);
    const agentDnsResolutionHash = toBytes32(run.agentDnsResolution.resolutionHash);
    const caseId = BigInt(run.settlementReceipt.contractCaseId);
    const workflowId = BigInt(workflowIdForRun(run));
    const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600);

    const prepareTx = await coordinator.prepare(
      caseId,
      workflowId,
      mandateHash,
      requesterAddress,
      executorAddress,
      actionHash,
      expiry,
      permitHash,
      slaHash,
      agentDnsResolutionHash,
      BigInt(run.mandate.minAgentTrustScore),
    );
    const prepareReceipt = await prepareTx.wait();

    return {
      ...run.settlementReceipt,
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
    throw new Error('Live settlement config and browser-funded escrow case are required before commit can run');
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
    throw new Error('Live settlement config and browser-funded escrow case are required before abort can run');
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
  return Boolean(rpcUrl && privateKey && executorPrivateKey && escrowAddress && workRegistryAddress && coordinatorAddress);
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
    mandateHash: run.agentSla?.mandateHash,
    slaHash: run.agentSla?.slaHash,
    zeroGSlaRoot: run.agentSla?.zeroGRoot,
    agentDnsResolutionHash: run.agentDnsResolution?.resolutionHash,
    taskActionType: run.agentSla?.taskActionType,
    action: run.keeperHubReceipt.action,
    amount: run.mandate.amount,
    destination: run.mandate.destination,
    workerAgentId: run.agentSla?.workerAgentId,
    requesterAgentId: run.agentSla?.requesterAgentId,
    agentMemoryRoots: run.agentSla?.agentMemoryRoots,
  }));
}

function getExecutorAddress(): string {
  if (executorPrivateKey) {
    return new ethers.Wallet(executorPrivateKey).address;
  }

  if (executorAddressEnv) {
    return executorAddressEnv;
  }

  throw new Error('EXECUTOR_PRIVATE_KEY or EXECUTOR_ADDRESS is required for the worker payout address');
}

function amountToNative(label: string): string {
  return label.replace(/\s*(?:ETH|OG|0G)\s*$/i, '').trim();
}

function toBytes32(value: string): string {
  const hex = value.startsWith('0x') ? value.slice(2) : stableHash(value, '').slice(0, 64);
  return `0x${hex.padEnd(64, '0').slice(0, 64)}`;
}

export function workflowIdForRun(run: ProofCourtRun): string {
  return uintId(run.id).toString();
}

function uintId(value: string): number {
  return Number.parseInt(stableHash(value, '').slice(0, 10), 16);
}

function firstDefined(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => typeof value === 'string' && value.trim().length > 0);
}
