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
  royaltyBps: number;
  royaltiesEarned: string;
}

export interface Mandate {
  id: string;
  text: string;
  intent: 'recurring_vault_deposit' | 'weekly_transfer' | 'protected_buy';
  amount: string;
  frequency: 'weekly' | 'monthly' | 'event';
  destination: string;
  maxExecutorPayout: string;
  minAgentTrustScore: number;
  requiredProof: Array<'AXL_LOGS' | 'KEEPERHUB_RECEIPT' | '0G_EVIDENCE_ROOT'>;
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
  mode?: 'live' | 'mock';
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
  decision: 'PASS' | 'FAIL';
  reasoningHash: string;
  attestationHash?: string;
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
  mode: 'live' | 'mock';
  caseId: string;
  workflowId: string;
  executorAddress: string;
  escrowStatus: 'Locked' | 'Released' | 'Blocked';
  contractCaseId?: string;
  prepareTxHash?: string;
  commitTxHash?: string;
  abortTxHash?: string;
  error?: string;
}

export interface ProofCourtRun {
  id: string;
  state: AppState;
  progress: number;
  mandate: Mandate;
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
  replayedFromZeroG?: boolean;
  verdicts?: VerifierVerdict[];
  quorum?: { passed: number; failed: number; reached: boolean };
  events: string[];
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

export const INITIAL_AGENTS: Agent[] = [
  {
    id: 'requester',
    name: 'Requester Agent',
    role: 'Requester',
    score: 96,
    status: 'Trusted',
    executions: 47,
    blocks: 0,
    inft: {
      tokenId: '1',
      holder: 'requester-agent',
      metadataURI: '0g://proofcourt/agents/requester.json',
      intelligencePointer: '0g-agent-playbook-requester',
      royaltyBps: 250,
      royaltiesEarned: '0.000 ETH',
    },
  },
  {
    id: 'worker',
    name: 'Worker Agent',
    role: 'Worker',
    score: 89,
    status: 'Trusted',
    executions: 31,
    blocks: 1,
    inft: {
      tokenId: '2',
      holder: 'worker-agent',
      metadataURI: '0g://proofcourt/agents/worker.json',
      intelligencePointer: '0g-agent-playbook-worker',
      royaltyBps: 300,
      royaltiesEarned: '0.000 ETH',
    },
  },
  {
    id: 'verifier-1',
    name: 'Verifier-1',
    role: 'Verifier',
    score: 100,
    status: 'System',
    executions: 78,
    blocks: 0,
    inft: {
      tokenId: '3',
      holder: 'verifier-1-agent',
      metadataURI: '0g://proofcourt/agents/verifier-1.json',
      intelligencePointer: '0g-agent-playbook-verifier',
      royaltyBps: 200,
      royaltiesEarned: '0.000 ETH',
    },
  },
  {
    id: 'verifier-2',
    name: 'Verifier-2',
    role: 'Verifier',
    score: 100,
    status: 'System',
    executions: 65,
    blocks: 0,
    inft: {
      tokenId: '4',
      holder: 'verifier-2-agent',
      metadataURI: '0g://proofcourt/agents/verifier-2.json',
      intelligencePointer: '0g-agent-playbook-verifier',
      royaltyBps: 200,
      royaltiesEarned: '0.000 ETH',
    },
  },
  {
    id: 'verifier-3',
    name: 'Verifier-3',
    role: 'Verifier',
    score: 100,
    status: 'System',
    executions: 52,
    blocks: 0,
    inft: {
      tokenId: '5',
      holder: 'verifier-3-agent',
      metadataURI: '0g://proofcourt/agents/verifier-3.json',
      intelligencePointer: '0g-agent-playbook-verifier',
      royaltyBps: 200,
      royaltiesEarned: '0.000 ETH',
    },
  },
  { id: 'worker-beta', name: 'Worker Agent Beta', role: 'Worker', score: 62, status: 'Caution', executions: 8, blocks: 3 },
  { id: 'rogue', name: 'Rogue Worker', role: 'Worker', score: 23, status: 'Suspended', executions: 5, blocks: 4 },
];

export const WORKFLOW_NODE_SPECS: WorkflowNodeSpec[] = [
  { id: 'intent', label: 'User Intent', desc: 'Natural language mandate' },
  { id: 'trigger', label: 'Schedule Trigger', desc: 'Time-based activation' },
  { id: 'requester', label: 'Requester Agent', desc: 'Case filing and permit', sponsor: 'AXL' },
  { id: 'worker', label: 'Worker Agent', desc: 'Trusted task executor' },
  { id: 'keeper', label: 'KeeperHub Execution', desc: 'Approved execution rail', sponsor: 'KeeperHub' },
  { id: 'jury', label: '3-Verifier Jury', desc: 'AXL quorum verdict', sponsor: 'AXL' },
  { id: 'evidence', label: '0G Evidence', desc: 'Case File proof memory', sponsor: '0G' },
  { id: 'payout', label: 'Verified Payout', desc: 'Proof-gated settlement' },
];

export function parseMandate(text: string): Mandate {
  const normalized = text.toLowerCase();
  const isWeekly = normalized.includes('weekly') || normalized.includes('week');
  const isBuy = normalized.includes('buy') || normalized.includes('eth rises') || normalized.includes('protected');
  const amountMatch = text.match(/(\d+(?:\.\d+)?)\s*eth/i);
  const amount = amountMatch ? `${amountMatch[1]} ETH` : isBuy ? '0.01 ETH' : '1 ETH';

  return {
    id: `mandate_${Date.now()}`,
    text,
    intent: isBuy ? 'protected_buy' : isWeekly ? 'weekly_transfer' : 'recurring_vault_deposit',
    amount,
    frequency: isBuy ? 'event' : isWeekly ? 'weekly' : 'monthly',
    destination: normalized.includes('vault') ? 'vault' : 'approved recipient',
    maxExecutorPayout: '0.01 ETH',
    minAgentTrustScore: 80,
    requiredProof: ['AXL_LOGS', 'KEEPERHUB_RECEIPT', '0G_EVIDENCE_ROOT'],
  };
}

export function selectTrustedAgents(agents: Agent[], threshold: number) {
  const selectedAgentIds = agents
    .filter((agent) => agent.status === 'System' || agent.score >= threshold)
    .map((agent) => agent.id);

  const rejectedAgentIds = agents
    .filter((agent) => agent.status !== 'System' && agent.score < threshold)
    .map((agent) => agent.id);

  return { selectedAgentIds, rejectedAgentIds };
}

export function createWorkflow(text: string): WorkflowResponse {
  const mandate = parseMandate(text);
  const { selectedAgentIds, rejectedAgentIds } = selectTrustedAgents(INITIAL_AGENTS, mandate.minAgentTrustScore);

  return {
    mandate,
    workflowNodes: WORKFLOW_NODE_SPECS,
    agents: INITIAL_AGENTS,
    selectedAgentIds,
    rejectedAgentIds,
  };
}

export function createRun(workflow: WorkflowResponse): ProofCourtRun {
  return {
    id: `run_${Date.now()}`,
    state: 'agents_selected',
    progress: 0,
    mandate: workflow.mandate,
    agents: workflow.agents,
    selectedAgentIds: workflow.selectedAgentIds,
    rejectedAgentIds: workflow.rejectedAgentIds,
    axlMessages: [],
    keeperHubReceipt: {
      workflowId: 'kh_pending',
      phase: 'execute-mandate',
      status: 'Pending',
      action: workflow.mandate.intent === 'protected_buy' ? 'protectedBuy()' : 'vaultDeposit(1 ETH)',
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
      escrowFunded: '1.01 ETH',
      transferAmount: workflow.mandate.amount,
      executorPayout: workflow.mandate.maxExecutorPayout,
      status: 'Inactive',
    },
    trustScore: 0,
    isTampered: false,
    replayedFromZeroG: false,
    events: ['Agents selected by trust threshold'],
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
        axlMessages: [
          ...run.axlMessages,
          createAxlMessage('Strategy Agent Alpha', 'Proof Judge Core', 'WORKFLOW_REQUESTED', 839),
          createAxlMessage('Proof Judge Core', 'Executor Agent Prime', 'PERMIT_APPROVED', 840),
        ],
        evidence: {
          ...run.evidence,
          permitHash: '0xpermit91f7a',
          axlTranscriptHash: '0xaxl3d8c2',
        },
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
        axlMessages: [
          ...run.axlMessages,
          createAxlMessage('Executor Agent Prime', 'Proof Judge Core', 'READY_TO_COMMIT', 841),
        ],
        events: [...run.events, 'Commit phase started'],
      };
    case 'commit_running':
      return {
        ...run,
        state: 'execution_complete',
        progress: 75,
        keeperHubReceipt: {
          workflowId: 'kh_12345',
          phase: 'execute-mandate',
          status: 'Completed',
          action: run.keeperHubReceipt.action,
          txHash: '0xabc...789',
          gasOptimized: true,
          retryCount: 0,
        },
        axlMessages: [
          ...run.axlMessages,
          createAxlMessage('Executor Agent Prime', 'Proof Judge Core', 'EXECUTION_RECEIPT_SUBMITTED', 842),
        ],
        events: [...run.events, 'Executor ran through KeeperHub'],
      };
    case 'execution_complete':
      return {
        ...run,
        state: 'evidence_stored',
        progress: 90,
        evidence: {
          ...run.evidence,
          root: '0g-root-abc123',
          keeperHubReceiptHash: '0xkeeper7f91',
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
        axlMessages: [
          ...run.axlMessages,
          createAxlMessage('Proof Judge Core', 'Strategy Agent Alpha', 'PROOF_VERIFIED', 843),
        ],
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
        events: [...run.events, 'Executor reputation recalculated from verification receipts'],
      };
    default:
      return run;
  }
}

export function markTampered(run: ProofCourtRun): ProofCourtRun {
  return {
    ...run,
    state: 'tamper_detected',
    progress: Math.max(run.progress, 90),
    isTampered: true,
    keeperHubReceipt: {
      ...run.keeperHubReceipt,
      txHash: '0xDEAD...BEEF',
    },
    evidence: {
      ...run.evidence,
      root: '0g-root-TAMPERED-xyz',
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
    agents: updateAgentScore(run.agents, 'prime', 90, 32, 1),
    keeperHubReceipt: {
      ...run.keeperHubReceipt,
      txHash: '0xabc...789',
      status: 'Completed',
    },
    evidence: {
      root: '0g-root-abc123',
      storageMode: '0G Storage',
      permitHash: run.evidence.permitHash || '0xpermit91f7a',
      axlTranscriptHash: run.evidence.axlTranscriptHash || '0xaxl3d8c2',
      keeperHubReceiptHash: '0xkeeper7f91',
      verificationResult: 'PASS',
      tampered: false,
    },
    payout: { ...run.payout, status: 'Verified' },
    trustScore: 97,
    events: [...run.events, 'Evidence restored from 0G root and verified'],
  };
}

function createAxlMessage(from: string, to: string, type: string, sequence: number): AxlMessage {
  return {
    id: `axl_${sequence}`,
    timestamp: new Date(Date.now() + sequence).toISOString(),
    from,
    to,
    type,
    hash: `0x${sequence.toString(16)}${type.toLowerCase().replaceAll('_', '').slice(0, 8)}`,
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
