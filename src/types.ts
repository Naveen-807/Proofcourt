import { Shield, CheckCircle2, History, AlertCircle, XCircle, Search, Cpu, Zap, Database, Lock, Unlock, ArrowRight, ZapOff } from 'lucide-react';
import {
  STATE_ORDER,
  WORKFLOW_NODE_SPECS,
  type Agent,
  type AgentDNSRecord,
  type AgentDNSResolution,
  type AgentHireReceipt,
  type AgentINFT,
  type AgentSLA,
  type AppState,
  type AxlMessage,
  type EvidenceBundle,
  type ExecutionReceipt,
  type KeeperHubReceipt,
  type Mandate,
  type PayoutState,
  type PermitReceipt,
  type ProofCourtRun,
  type VerifierVerdict,
  type WorkflowResponse,
} from './domain/proofcourt';

export type {
  Agent,
  AgentDNSRecord,
  AgentDNSResolution,
  AgentHireReceipt,
  AgentINFT,
  AgentSLA,
  AppState,
  AxlMessage,
  EvidenceBundle,
  ExecutionReceipt,
  KeeperHubReceipt,
  Mandate,
  PayoutState,
  PermitReceipt,
  ProofCourtRun,
  VerifierVerdict,
  WorkflowResponse,
};

export { STATE_ORDER };

const workflowIcons = {
  intent: Search,
  trigger: History,
  requester: Cpu,
  worker: Zap,
  keeper: Database,
  jury: Shield,
  evidence: Database,
  payout: CheckCircle2,
  // legacy compat
  strategy: Cpu,
  executor: Zap,
  judge: Shield,
};

export const WORKFLOW_NODES = WORKFLOW_NODE_SPECS.map((node) => ({
  ...node,
  icon: workflowIcons[node.id as keyof typeof workflowIcons] ?? AlertCircle,
}));
