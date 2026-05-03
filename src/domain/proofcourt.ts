export type AppState =
  | 'idle'
  | 'workflow_generated'
  | 'agents_selected'
  | 'prepare_running'
  | 'permit_issued'
  | 'payout_locked'
  | 'commit_running'
  | 'execution_complete'
  | 'evidence_stored'
  | 'proof_verified'
  | 'payout_released'
  | 'reputation_updated'
  | 'tamper_detected'
  | 'payout_blocked';

export type AgentRole = 'Requester' | 'Worker' | 'Verifier' | 'Strategy' | 'Executor' | 'Judge';
export type AgentStatus = 'Trusted' | 'System' | 'Caution' | 'Suspended';

export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  score: number;
  status: AgentStatus;
  executions: number;
  blocks: number;
  inft?: AgentINFT;
}

export interface AgentINFT {
  tokenId: string;
  holder: string;
  metadataURI: string;
  intelligencePointer: string;
  memoryRoot?: string;
  memoryTxHash?: string;
  explorerUrl?: string;
  royaltyBps: number;
  royaltiesEarned: string;
}

export interface AgentDNSRecord {
  agentId: string;
  tokenId: string;
  role: AgentRole;
  holder: string;
  metadataURI: string;
  intelligencePointer: string;
  score: number;
  status: AgentStatus;
  casesTotal: number;
  casesPassed: number;
  lastEvidenceHash: string;
  memoryRoot: string;
  memoryTxHash?: string;
  memoryUpdatedAt: string;
  explorerUrl: string;
  earnings: string;
}

export interface AgentDNSResolution {
  id: string;
  mandateId: string;
  source: 'onchain-agent-inft-0g';
  chainId: 16602;
  agentInftAddress: string;
  resolvedAt: string;
  records: AgentDNSRecord[];
  selectedAgentIds: string[];
  rejectedAgentIds: string[];
  resolutionHash: string;
}

export interface Mandate {
  id: string;
  text: string;
  intent: 'recurring_vault_deposit' | 'weekly_transfer' | 'protected_buy' | 'proof_only_task';
  amount: string;
  frequency: 'weekly' | 'monthly' | 'event';
  destination: string;
  maxExecutorPayout: string;
  minAgentTrustScore: number;
  requiredProof: Array<'AXL_LOGS' | 'KEEPERHUB_RECEIPT' | '0G_EVIDENCE_ROOT'>;
}

export interface AgentSLA {
  id: string;
  mandateId: string;
  workerAgentId: string;
  requesterAgentId: string;
  verifierAgentIds: string[];
  task: string;
  action: string;
  taskActionType: 'vaultDeposit' | 'protectedBuy' | 'weeklyTransfer' | 'proofOnlyTask';
  payout: string;
  deadlineIso: string;
  acceptanceCriteria: string[];
  disputeRule: '2_OF_3_VERIFIER_QUORUM';
  requiredProof: Mandate['requiredProof'];
  agentDnsResolutionHash: string;
  mandateHash: string;
  actionHash: string;
  agentMemoryRoots: Record<string, string>;
  slaHash: string;
  zeroGRoot?: string;
  zeroGTxHash?: string;
  storedAt?: string;
}

export interface AgentHireReceipt {
  id: string;
  caseId: string;
  eventName: 'AgentHired';
  requesterAgentId: string;
  workerAgentId: string;
  requesterAddress: string;
  workerAddress: string;
  slaHash: string;
  agentDnsResolutionHash: string;
  zeroGSlaRoot: string;
  hiredAt: string;
  prepareTxHash?: string;
}

export interface PermitReceipt {
  id: string;
  caseId: string;
  mandateHash: string;
  slaHash: string;
  zeroGSlaRoot: string;
  agentDnsResolutionHash: string;
  permitHash: string;
  axlTranscriptHash?: string;
  committedAt: string;
  phase: 'MandatePermit';
}

export interface ExecutionReceipt {
  phase: 'ProofCourtSettlement';
  actionType: AgentSLA['taskActionType'];
  keeperHubExecutionId: string;
  keeperHubReceiptHash: string;
  txHash: string;
  recordedAt: string;
}

export interface WorkflowNodeSpec {
  id: string;
  label: string;
  desc: string;
  sponsor?: 'AXL' | 'KeeperHub' | '0G';
}

export interface AxlMessage {
  id: string;
  nodeId?: string;
  messageId?: string;
  envelope?: 'mcp' | 'a2a';
  timestamp: string;
  from: string;
  to: string;
  type: string;
  payloadHash?: string;
  hash: string;
  mode?: 'live';
}

export interface KeeperHubLogEntry {
  timestamp: string;
  node: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  txHash?: string;
  outputHash?: string;
}

export interface KeeperHubReceipt {
  workflowId: string;
  phase?: 'proof-trial' | 'execute-mandate' | 'atomic-settlement';
  executionId?: string;
  status: 'Pending' | 'Completed' | 'Failed';
  action: string;
  txHash: string;
  payloadHash?: string;
  logHash?: string;
  logs?: KeeperHubLogEntry[];
  gasOptimized: boolean;
  retryCount: number;
  runtimeBuilt?: boolean;
  webhookKey?: string;
}

export interface EvidenceBundle {
  root: string;
  storageMode: '0G Storage';
  permitHash: string;
  axlTranscriptHash: string;
  keeperHubReceiptHash: string;
  bundleHash?: string;
  byteSize?: number;
  txHash?: string;
  source?: '0g-sdk' | '0g-rest';
  verdictHash?: string;
  verdictCompliant?: boolean;
  verdictReason?: string;
  verdictConfidence?: number;
  verdictModel?: string;
  verdictSource?: string;
  verdictAttestationHash?: string;
  verdictTxHash?: string;
  verificationHash?: string;
  verificationResult: 'PASS' | 'FAIL';
  tampered: boolean;
}

export interface PayoutState {
  escrowFunded: string;
  transferAmount: string;
  executorPayout: string;
  status: 'Inactive' | 'Locked' | 'Verified' | 'Released' | 'Blocked';
}

export interface VerificationCriterion {
  id: string;
  label: string;
  passed: boolean;
}

export interface VerifierVerdict {
  verifierId: 'verifier-1' | 'verifier-2' | 'verifier-3';
  /** OFFLINE = verifier timed out; quorum requires recorded verifier outcomes. */
  decision: 'PASS' | 'FAIL' | 'OFFLINE';
  reasoningHash: string;
  attestationHash?: string;
  promptHash?: string;
  responseHash?: string;
  model?: string;
  source?: string;
  signatureValid?: boolean;
  computeVerdictHash?: string;
  computePromptHash?: string;
  computeResponseHash?: string;
  verdictHash: string;
  signature: string;
  timestamp: string;
}

export interface VerificationReceipt {
  id: string;
  caseId: string;
  executorAgentId: string;
  executorName: string;
  proofPassed: boolean;
  severe: boolean;
  finalState: 'PAID' | 'BLOCKED';
  criteria: VerificationCriterion[];
  evidenceRoot: string;
  verificationHash: string;
  keeperHubRetryCount: number;
  axlMessageCount: number;
  trustScoreBefore: number;
  trustScoreAfter: number;
  scoreDelta: number;
  issuedAt: string;
  source: '0G_REPLAY' | 'LIVE_RUN';
}

export interface SettlementReceipt {
  mode: 'live';
  caseId?: string;
  workflowId: string;
  executorAddress: string;
  payerAddress?: string;
  fundedAmount?: string;
  escrowStatus: 'Pending' | 'Locked' | 'Released' | 'Blocked' | 'Refunded';
  contractCaseId?: string;
  fundingTxHash?: string;
  prepareTxHash?: string;
  commitTxHash?: string;
  abortTxHash?: string;
  error?: string;
}

export interface ProofCourtRun {
  id: string;
  state: AppState;
  progress: number;
  bootstrapping?: boolean;
  bootstrapError?: string;
  mandate: Mandate;
  agentDnsResolution?: AgentDNSResolution;
  agentSla?: AgentSLA;
  agentHire?: AgentHireReceipt;
  permitReceipt?: PermitReceipt;
  executionReceipt?: ExecutionReceipt;
  swarmMemory?: {
    caseId: string;
    memoryRoot: string;
    memoryTxHash?: string;
    storedAt: string;
    sharedStateHash: string;
    agentMemoryRoots: Record<string, string>;
  };
  agents: Agent[];
  selectedAgentIds: string[];
  rejectedAgentIds: string[];
  axlMessages: AxlMessage[];
  proofTrialReceipt?: KeeperHubReceipt;
  keeperHubReceipt: KeeperHubReceipt;
  settlementKeeperHubReceipt?: KeeperHubReceipt;
  evidence: EvidenceBundle;
  payout: PayoutState;
  trustScore: number;
  isTampered: boolean;
  verificationReceipt?: VerificationReceipt;
  settlementReceipt?: SettlementReceipt;
  runtimeKeeperHubWorkflow?: {
    workflowId: string;
    webhookKey?: string;
    name: string;
    phase: 'atomic-settlement';
  };
  reputationTxHash?: string;
  reputationUpdateMode?: 'live' | 'not-configured' | 'error';
  reputationError?: string;
  zeroGKvTxHash?: string;
  replayedFromZeroG?: boolean;
  verdicts?: VerifierVerdict[];
  quorum?: { passed: number; failed: number; reached: boolean };
  events: string[];
  // SDK work submission fields (set via POST /api/runs/:id/work)
  workOutputHash?: string;
  workSummary?: string;
  workerAddress?: string;
  // Convenience fields for galleries and SDK polling
  createdAt?: string;
  zeroGStorageRoot?: string;
  txHash?: string;
}

export interface WorkflowResponse {
  mandate: Mandate;
  workflowNodes: WorkflowNodeSpec[];
  agents: Agent[];
  selectedAgentIds: string[];
  rejectedAgentIds: string[];
}

export const STATE_ORDER: AppState[] = [
  'idle',
  'workflow_generated',
  'agents_selected',
  'prepare_running',
  'permit_issued',
  'payout_locked',
  'commit_running',
  'execution_complete',
  'evidence_stored',
  'proof_verified',
  'payout_released',
  'reputation_updated',
  'tamper_detected',
  'payout_blocked',
];

export const WORKFLOW_NODE_SPECS: WorkflowNodeSpec[] = [
  { id: 'intent', label: 'Mandate', desc: 'User request and constraints' },
  { id: 'agent_dns', label: 'AgentDNS', desc: 'Onchain agent identity lookup', sponsor: '0G' },
  { id: 'agent_sla', label: 'AgentSLA', desc: '0G-stored work agreement', sponsor: '0G' },
  { id: 'requester', label: 'Phase 1 Permit', desc: 'Mandate approval commit', sponsor: 'AXL' },
  { id: 'keeper', label: 'KeeperHub Execution', desc: 'Permitted work only', sponsor: 'KeeperHub' },
  { id: 'jury', label: 'Phase 2 ProofCourt', desc: 'Verifier settlement commit', sponsor: 'AXL' },
  { id: 'evidence', label: '0G Evidence Capsule', desc: 'Replayable case file', sponsor: '0G' },
  { id: 'payout', label: 'Verified Payout', desc: 'Proof-gated settlement' },
];

const NATIVE_TOKEN_LABEL = 'OG';
export const MANDATORY_REQUIRED_PROOF: Mandate['requiredProof'] = ['AXL_LOGS', 'KEEPERHUB_RECEIPT', '0G_EVIDENCE_ROOT'];
export const MANDATORY_MIN_AGENT_TRUST_SCORE = 80;

export function applyProofCourtProtocolDefaults(mandate: Mandate): Mandate {
  return {
    ...mandate,
    minAgentTrustScore: MANDATORY_MIN_AGENT_TRUST_SCORE,
    requiredProof: MANDATORY_REQUIRED_PROOF,
  };
}

export function parseMandate(text: string): Mandate {
  const normalized = text.toLowerCase();
  const amountMatch = text.match(/send\s+(\d+(?:\.\d+)?)(?:\s*(?:eth|og|0g))?/i) ?? text.match(/(\d+(?:\.\d+)?)\s*(?:eth|og|0g)/i);
  const explicitInstructionMatch = text.match(
    /send\s+\d+(?:\.\d+)?\s+(.*?)\s+to\s+((?:0x[a-fA-F0-9]{40})|(?:[a-zA-Z0-9._:-]+\.(?:eth|0g))|(?:vault))/i,
  );
  const typeHint = explicitInstructionMatch?.[1]?.trim().toLowerCase() ?? normalized;
  const destinationHint = explicitInstructionMatch?.[2]?.trim();
  const amount = amountMatch ? `${amountMatch[1]} ${NATIVE_TOKEN_LABEL}` : `Requires explicit ${NATIVE_TOKEN_LABEL} amount`;
  const intent = inferMandateIntent(typeHint, normalized);
  const frequency = inferMandateFrequency(intent, normalized);
  const destination = inferMandateDestination(destinationHint, normalized);

  return applyProofCourtProtocolDefaults({
    id: `mandate_${Date.now()}`,
    text,
    intent,
    amount,
    frequency,
    destination,
    maxExecutorPayout: amountMatch ? `${amountMatch[1]} ${NATIVE_TOKEN_LABEL}` : `Requires explicit ${NATIVE_TOKEN_LABEL} payout`,
    minAgentTrustScore: MANDATORY_MIN_AGENT_TRUST_SCORE,
    requiredProof: MANDATORY_REQUIRED_PROOF,
  });
}

function inferMandateIntent(
  typeHint: string,
  normalizedText: string,
): Mandate['intent'] {
  if (
    typeHint.includes('proofonlytask')
    || typeHint.includes('proof only')
    || typeHint.includes('audit')
    || typeHint.includes('research')
    || typeHint.includes('report')
    || normalizedText.includes('proof only')
  ) {
    return 'proof_only_task';
  }

  if (
    typeHint.includes('protectedbuy')
    || typeHint.includes('protected buy')
    || typeHint.includes('buy')
    || normalizedText.includes('eth rises')
    || normalizedText.includes('protected')
  ) {
    return 'protected_buy';
  }

  if (
    typeHint.includes('weeklytransfer')
    || typeHint.includes('weekly transfer')
    || (typeHint.includes('transfer') && normalizedText.includes('weekly'))
    || normalizedText.includes('week')
  ) {
    return 'weekly_transfer';
  }

  return 'recurring_vault_deposit';
}

function inferMandateFrequency(
  intent: Mandate['intent'],
  normalizedText: string,
): Mandate['frequency'] {
  if (intent === 'protected_buy' || intent === 'proof_only_task') return 'event';
  if (intent === 'weekly_transfer' || normalizedText.includes('week')) return 'weekly';
  return 'monthly';
}

function inferMandateDestination(
  destinationHint: string | undefined,
  normalizedText: string,
): string {
  if (destinationHint && destinationHint.length > 0) return destinationHint;
  if (normalizedText.includes(' to vault') || normalizedText.endsWith(' vault')) return 'vault';
  return 'Requires explicit destination address';
}

export function createWorkflow(text: string): WorkflowResponse {
  const mandate = parseMandate(text);
  return createWorkflowFromMandate(mandate);
}

export function createWorkflowFromMandate(mandate: Mandate): WorkflowResponse {
  const normalizedMandate = applyProofCourtProtocolDefaults(mandate);
  return {
    mandate: normalizedMandate,
    workflowNodes: WORKFLOW_NODE_SPECS,
    agents: [],
    selectedAgentIds: [],
    rejectedAgentIds: [],
  };
}

export function createRun(
  workflow: WorkflowResponse,
  agentDnsResolution?: AgentDNSResolution,
  agentSla?: AgentSLA,
): ProofCourtRun {
  const agents = workflow.agents.length > 0 ? workflow.agents : agentsFromDns(agentDnsResolution);
  const artifactsReady = Boolean(agentDnsResolution && agentSla?.zeroGRoot);
  return {
    id: `run_${Date.now()}`,
    createdAt: new Date().toISOString(),
    state: artifactsReady ? 'agents_selected' : 'workflow_generated',
    progress: 0,
    bootstrapping: !artifactsReady,
    mandate: workflow.mandate,
    agentDnsResolution,
    agentSla,
    agents,
    selectedAgentIds: agentDnsResolution?.selectedAgentIds ?? workflow.selectedAgentIds,
    rejectedAgentIds: agentDnsResolution?.rejectedAgentIds ?? workflow.rejectedAgentIds,
    axlMessages: [],
    keeperHubReceipt: {
      workflowId: 'kh_pending',
      phase: 'execute-mandate',
      status: 'Pending',
      action: agentSla?.action ?? 'requires-agent-sla',
      txHash: '',
      gasOptimized: false,
      retryCount: 0,
    },
    evidence: {
      root: '',
      storageMode: '0G Storage',
      permitHash: '',
      axlTranscriptHash: '',
      keeperHubReceiptHash: '',
      verificationResult: 'FAIL',
      tampered: false,
    },
    payout: {
      escrowFunded: `0 ${NATIVE_TOKEN_LABEL}`,
      transferAmount: workflow.mandate.amount,
      executorPayout: workflow.mandate.maxExecutorPayout,
      status: 'Inactive',
    },
    trustScore: 0,
    isTampered: false,
    replayedFromZeroG: false,
    events: [
      'Mandate created',
      ...(!artifactsReady ? ['Preparing live AgentDNS + AgentSLA artifacts'] : []),
      ...(agentDnsResolution ? [`AgentDNS resolved from Agent iNFT contract: ${agentDnsResolution.resolutionHash}`] : []),
      ...(agentSla?.zeroGRoot ? [`AgentSLA stored on 0G before permit: ${agentSla.zeroGRoot}`] : []),
    ],
  };
}

export function advanceRun(run: ProofCourtRun): ProofCourtRun {
  switch (run.state) {
    case 'agents_selected':
      return {
        ...run,
        state: 'prepare_running',
        progress: 15,
        events: [...run.events, 'Prepare phase started'],
      };
    case 'prepare_running':
      return {
        ...run,
        state: 'permit_issued',
        progress: 45,
        events: [...run.events, 'Permit issued over AXL'],
      };
    case 'permit_issued':
      return {
        ...run,
        state: 'payout_locked',
        progress: 50,
        payout: { ...run.payout, status: 'Locked' },
        events: [...run.events, 'Payout locked in ProofCourt escrow'],
      };
    case 'payout_locked':
      return {
        ...run,
        state: 'commit_running',
        progress: 60,
        events: [...run.events, 'Commit phase started'],
      };
    case 'commit_running':
      return {
        ...run,
        state: 'execution_complete',
        progress: 75,
        events: [...run.events, 'Executor ran through KeeperHub'],
      };
    case 'execution_complete':
      return {
        ...run,
        state: 'evidence_stored',
        progress: 90,
        evidence: {
          ...run.evidence,
          verificationResult: 'PASS',
        },
        events: [...run.events, 'Evidence bundle stored on 0G'],
      };
    case 'evidence_stored':
      if (run.isTampered) {
        return markTampered(run);
      }

      return {
        ...run,
        state: 'proof_verified',
        progress: 95,
        payout: { ...run.payout, status: 'Verified' },
        events: [...run.events, 'Proof Judge verified evidence bundle'],
      };
    case 'proof_verified':
      return {
        ...run,
        state: 'payout_released',
        progress: 100,
        payout: { ...run.payout, status: 'Released' },
        events: [...run.events, 'Payout released'],
      };
    case 'payout_released':
      return {
        ...run,
        state: 'reputation_updated',
        events: [...run.events, 'Worker Agent reputation recalculated from verification receipts'],
      };
    default:
      return run;
  }
}

function agentsFromDns(agentDnsResolution?: AgentDNSResolution): Agent[] {
  if (!agentDnsResolution) return [];

  return agentDnsResolution.records.map((record) => ({
    id: record.agentId,
    name: labelForAgent(record.agentId, record.role),
    role: record.role,
    score: record.score,
    status: record.status,
    executions: record.casesTotal,
    blocks: Math.max(0, record.casesTotal - record.casesPassed),
    inft: {
      tokenId: record.tokenId,
      holder: record.holder,
      metadataURI: record.metadataURI,
      intelligencePointer: record.intelligencePointer,
      memoryRoot: record.memoryRoot,
      memoryTxHash: record.memoryTxHash,
      explorerUrl: record.explorerUrl,
      royaltyBps: 0,
      royaltiesEarned: record.earnings,
    },
  }));
}

function labelForAgent(agentId: string, role: AgentRole): string {
  if (role === 'Verifier') return agentId.replace(/^./, (char) => char.toUpperCase());
  return `${role} Agent`;
}

export function markTampered(run: ProofCourtRun): ProofCourtRun {
  return {
    ...run,
    state: 'tamper_detected',
    progress: Math.max(run.progress, 90),
    isTampered: true,
    keeperHubReceipt: {
      ...run.keeperHubReceipt,
      txHash: '',
    },
    evidence: {
      ...run.evidence,
      verificationResult: 'FAIL',
      tampered: true,
    },
    payout: { ...run.payout, status: 'Blocked' },
    events: [...run.events, 'Tamper detected: evidence root mismatch, payout blocked'],
  };
}

export function restoreRun(run: ProofCourtRun): ProofCourtRun {
  return {
    ...run,
    state: 'proof_verified',
    progress: 95,
    isTampered: false,
    agents: updateAgentScore(run.agents, 'worker', 90, 32, 1),
    evidence: {
      root: run.evidence.root,
      storageMode: '0G Storage',
      permitHash: run.evidence.permitHash,
      axlTranscriptHash: run.evidence.axlTranscriptHash,
      keeperHubReceiptHash: run.evidence.keeperHubReceiptHash,
      verificationResult: 'PASS',
      tampered: false,
    },
    payout: { ...run.payout, status: 'Verified' },
    trustScore: 97,
    events: [...run.events, 'Evidence restored from 0G root and verified'],
  };
}

function updateAgentScore(
  agents: Agent[],
  id: string,
  score: number,
  executions: number,
  blocks: number,
): Agent[] {
  return agents.map((agent) =>
    agent.id === id
      ? {
          ...agent,
          score,
          executions,
          blocks,
          status: score >= 80 ? 'Trusted' : 'Caution',
        }
      : agent,
  );
}
