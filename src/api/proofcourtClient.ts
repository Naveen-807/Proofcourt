import type { ProofCourtRun, WorkflowResponse } from '../domain/proofcourt';

const API_BASE_URL = import.meta.env.VITE_PROOFCOURT_API_URL ?? 'http://localhost:8787';

export interface IntegrationHealth {
  configured: boolean;
  mode: 'live' | 'not-configured';
  endpoint: string | null;
  nodes?: Array<{
    role: string;
    endpoint: string;
    nodeId: string | null;
    peerCount: number;
    status: 'online' | 'offline' | 'unknown';
  }>;
  workflowId?: string | null;
  workflows?: Array<{
    phase: string;
    workflowId: string;
  }>;
  pollMs?: number;
  rateLimit?: string;
  evidenceRegistry?: string | null;
}

export interface IntegrationStatus {
  axl: IntegrationHealth;
  keeperHub: IntegrationHealth;
  zeroG: IntegrationHealth;
  zeroGCompute: IntegrationHealth;
  contracts: {
    deployed: boolean;
    chainId: 16602;
    explorer: string;
    contracts: Array<{
      name: string;
      address: string | null;
      purpose: string;
    }>;
  };
}

export interface EscrowFundingIntent {
  chainId: 16602;
  escrowAddress: `0x${string}`;
  executorAddress: `0x${string}`;
  mandateHash: `0x${string}`;
  payoutWei: string;
  payoutLabel: string;
  workflowId: string;
}

export interface EscrowFundingReceipt {
  txHash: `0x${string}`;
  contractCaseId: string;
  payerAddress: `0x${string}`;
  executorAddress: `0x${string}`;
  fundedAmount: string;
  workflowId: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    ...init,
  });

  if (!response.ok) {
    throw new Error(`ProofCourt API ${response.status}: ${await response.text()}`);
  }

  return response.json() as Promise<T>;
}

export async function generateWorkflow(text: string): Promise<WorkflowResponse> {
  return request<WorkflowResponse>('/api/workflows/generate', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

export async function getIntegrationStatus(): Promise<IntegrationStatus> {
  return request<IntegrationStatus>('/api/integrations/status');
}

export async function createRun(mandateId: string): Promise<ProofCourtRun> {
  return request<ProofCourtRun>('/api/runs', {
    method: 'POST',
    body: JSON.stringify({ mandateId }),
  });
}

export async function getEscrowFundingIntent(runId: string): Promise<EscrowFundingIntent> {
  return request<EscrowFundingIntent>(`/api/runs/${runId}/escrow-intent`);
}

export async function attachEscrowFunding(runId: string, receipt: EscrowFundingReceipt): Promise<ProofCourtRun> {
  return request<ProofCourtRun>(`/api/runs/${runId}/escrow`, {
    method: 'POST',
    body: JSON.stringify(receipt),
  });
}

export async function advanceRun(runId: string): Promise<ProofCourtRun> {
  return request<ProofCourtRun>(`/api/runs/${runId}/advance`, { method: 'POST' });
}

export async function tamperRun(runId: string): Promise<ProofCourtRun> {
  return request<ProofCourtRun>(`/api/runs/${runId}/tamper`, { method: 'POST' });
}

export async function restoreRun(runId: string): Promise<ProofCourtRun> {
  return request<ProofCourtRun>(`/api/runs/${runId}/restore`, { method: 'POST' });
}

export async function replayRun(runId: string): Promise<ProofCourtRun> {
  return request<ProofCourtRun>(`/api/runs/${runId}/replay`);
}
