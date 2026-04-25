import { Shield, CheckCircle2, History, AlertCircle, XCircle, Search, Cpu, Zap, Database, Lock, Unlock, ArrowRight, ZapOff } from 'lucide-react';

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

export interface Agent {
  id: string;
  name: string;
  role: 'Strategy' | 'Executor' | 'Judge';
  score: number;
  status: 'Trusted' | 'System' | 'Caution' | 'Suspended';
  executions: number;
  blocks: number;
}

export const INITIAL_AGENTS: Agent[] = [
  { id: 'alpha', name: 'Strategy Agent Alpha', role: 'Strategy', score: 96, status: 'Trusted', executions: 47, blocks: 0 },
  { id: 'prime', name: 'Executor Agent Prime', role: 'Executor', score: 89, status: 'Trusted', executions: 31, blocks: 1 },
  { id: 'core', name: 'Proof Judge Core', role: 'Judge', score: 100, status: 'System', executions: 78, blocks: 0 },
  { id: 'beta', name: 'Executor Agent Beta', role: 'Executor', score: 62, status: 'Caution', executions: 8, blocks: 3 },
  { id: 'rogue', name: 'Strategy Agent Rogue', role: 'Strategy', score: 23, status: 'Suspended', executions: 5, blocks: 4 },
];

export const WORKFLOW_NODES = [
  { id: 'intent', label: 'User Intent', icon: Search, desc: 'Natural language mandate' },
  { id: 'trigger', label: 'Schedule Trigger', icon: History, desc: 'Time-based activation' },
  { id: 'strategy', label: 'Strategy Agent', icon: Cpu, desc: 'Logic determination', sponsor: 'AXL' },
  { id: 'executor', label: 'Executor Agent', icon: Zap, desc: 'Action performance' },
  { id: 'keeper', label: 'KeeperHub Execution', icon: Database, desc: 'On-chain facilitation', sponsor: 'KeeperHub' },
  { id: 'judge', label: 'Proof Judge Agent', icon: Shield, desc: 'Evidence verification' },
  { id: 'evidence', label: '0G Evidence', icon: Database, desc: 'Immutable storage', sponsor: '0G' },
  { id: 'payout', label: 'Verified Payout', icon: CheckCircle2, desc: 'Secure settlement' },
];
