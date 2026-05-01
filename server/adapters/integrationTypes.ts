export type IntegrationMode = 'live';

export interface IntegrationResult<T> {
  mode: IntegrationMode;
  data: T;
  error?: string;
}

export interface AxlSendInput {
  workflowId: string;
  from: string;
  to: string;
  type: string;
  envelope: 'mcp' | 'a2a';
  payload: Record<string, unknown>;
}

export interface AxlSendResult {
  id: string;
  nodeId: string;
  messageId: string;
  envelope: 'mcp' | 'a2a';
  hash: string;
  payloadHash: string;
  timestamp: string;
}

export interface AxlTopologyNode {
  role: string;
  endpoint: string;
  nodeId: string | null;
  peerCount: number;
  status: 'online' | 'offline' | 'unknown';
}

export interface KeeperHubLogEntry {
  timestamp: string;
  node: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  txHash?: string;
  outputHash?: string;
}

export interface KeeperHubExecuteInput {
  workflowId: string;
  phase: 'proof-trial' | 'execute-mandate' | 'atomic-settlement';
  action: string;
  executor: string;
  payload: Record<string, unknown>;
}

export interface KeeperHubExecuteResult {
  workflowId: string;
  phase: KeeperHubExecuteInput['phase'];
  executionId: string;
  status: 'Completed' | 'Failed';
  action: string;
  txHash: string;
  payloadHash: string;
  logHash: string;
  logs: KeeperHubLogEntry[];
  gasOptimized: boolean;
  retryCount: number;
}

export interface ZeroGStoreInput {
  caseId: string;
  evidence: Record<string, unknown>;
}

export interface ZeroGStoreResult {
  root: string;
  storageMode: '0G Storage';
  verificationHash: string;
  bundleHash: string;
  byteSize: number;
  txHash?: string;
  source: '0g-sdk' | '0g-rest';
}

export interface ZeroGComputeInput {
  caseId: string;
  evidenceRoot: string;
  mandateHash: string;
  permitHash: string;
  axlTranscriptHash: string;
  keeperHubReceiptHash: string;
  caseFileHash: string;
}

export interface ZeroGComputeResult {
  verdictHash: string;
  compliant: boolean;
  reason: string;
  confidence: number;
  model: string;
  source: '0g-compute' | 'compute-rest';
  attestationHash?: string;
  txHash?: string;
}
