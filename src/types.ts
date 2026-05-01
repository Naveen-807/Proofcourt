import { Shield, CheckCircle2, History, AlertCircle, XCircle, Search, Cpu, Zap, Database, Lock, Unlock, ArrowRight, ZapOff } from 'lucide-react';
import {
  INITIAL_AGENTS,
  STATE_ORDER,
  WORKFLOW_NODE_SPECS,
  type Agent,
  type AgentINFT,
  type AppState,
  type AxlMessage,
  type EvidenceBundle,
  type KeeperHubReceipt,
  type Mandate,
  type PayoutState,
  type ProofCourtRun,
  type VerifierVerdict,
  type WorkflowResponse,
} from './domain/proofcourt';

export type {
  Agent,
  AgentINFT,
  AppState,
  AxlMessage,
  EvidenceBundle,
  KeeperHubReceipt,
  Mandate,
  PayoutState,
  ProofCourtRun,
  VerifierVerdict,
  WorkflowResponse,
};

export { INITIAL_AGENTS, STATE_ORDER };

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
