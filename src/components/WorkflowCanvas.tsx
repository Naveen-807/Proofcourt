import React from 'react';
import { motion } from 'motion/react';
import { AppState, ProofCourtRun } from '../types';
import { cn } from '../lib/utils';
import { CheckCircle2, Database, FileCheck2, LockKeyhole, Route, Scale, ShieldAlert, Sparkles, WalletCards } from 'lucide-react';

interface Props {
  state: AppState;
  run: ProofCourtRun | null;
}

type NodeStatus = 'pending' | 'active' | 'complete' | 'blocked';

const STATE_INDEX: AppState[] = [
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

const workflowNodes = [
  {
    label: 'User Goal',
    role: 'Mandate control plane',
    proof: 'Mandate hash',
    risk: 'Low',
    integration: 'ProofCourt',
    activeAt: 'workflow_generated' as AppState,
    completeAt: 'agents_selected' as AppState,
    icon: Sparkles,
  },
  {
    label: 'AgentDNS',
    role: 'Onchain + 0G lookup',
    proof: 'Resolution hash',
    risk: 'Medium',
    integration: 'Agent iNFT',
    activeAt: 'agents_selected' as AppState,
    completeAt: 'prepare_running' as AppState,
    icon: Database,
  },
  {
    label: 'AgentSLA',
    role: '0G work agreement',
    proof: 'SLA root',
    risk: 'Guarded',
    integration: '0G Storage',
    activeAt: 'prepare_running' as AppState,
    completeAt: 'permit_issued' as AppState,
    icon: LockKeyhole,
  },
  {
    label: 'Phase 1 Permit',
    role: 'No execution before commit',
    proof: 'PermitReceipt',
    risk: 'Guarded',
    integration: 'AXL route',
    activeAt: 'prepare_running' as AppState,
    completeAt: 'permit_issued' as AppState,
    icon: LockKeyhole,
  },
  {
    label: 'KeeperHub Work',
    role: 'Runs only permitted SLA',
    proof: 'KeeperHub receipt',
    risk: 'Capped',
    integration: 'KeeperHub',
    activeAt: 'commit_running' as AppState,
    completeAt: 'execution_complete' as AppState,
    icon: Route,
  },
  {
    label: 'Phase 2 ProofCourt',
    role: 'No payout before proof',
    proof: 'VerificationReceipt',
    risk: 'Strict',
    integration: '0G + jury',
    activeAt: 'evidence_stored' as AppState,
    completeAt: 'proof_verified' as AppState,
    icon: FileCheck2,
  },
  {
    label: 'Settlement',
    role: 'Pays or blocks funds',
    proof: 'Final receipt',
    risk: 'Final',
    integration: 'Escrow',
    activeAt: 'payout_released' as AppState,
    completeAt: 'reputation_updated' as AppState,
    icon: WalletCards,
  },
];

export default function WorkflowCanvas({ state, run }: Props) {
  const currentIndex = STATE_INDEX.indexOf(state);
  const blocked = state === 'tamper_detected' || state === 'payout_blocked';
  const permitReady = currentIndex >= STATE_INDEX.indexOf('permit_issued');
  const proofReady = currentIndex >= STATE_INDEX.indexOf('proof_verified');

  const nodeStatus = (activeAt: AppState, completeAt: AppState, index: number): NodeStatus => {
    if (blocked && index >= 4) return 'blocked';
    if (currentIndex >= STATE_INDEX.indexOf(completeAt)) return 'complete';
    if (currentIndex >= STATE_INDEX.indexOf(activeAt)) return 'active';
    return 'pending';
  };

  return (
    <section className="court-panel overflow-hidden p-6">
      <div className="mb-7 flex items-start justify-between gap-8">
        <div>
          <p className="court-eyebrow">2PC protocol</p>
          <h3 className="mt-1 text-2xl font-bold tracking-tight">Mandate permit to ProofCourt settlement</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/52">
            Phase 1 locks Mandate, AgentDNS, and AgentSLA. Phase 2 releases payout only after verified execution.
          </p>
          {run?.agentSla?.zeroGRoot && (
            <div className="mt-3 hash-text text-[11px] text-white/44">
              SLA root {run.agentSla.zeroGRoot}
            </div>
          )}
        </div>
        <div className={cn('status-badge', blocked ? 'badge-blocked' : proofReady ? 'badge-proof' : permitReady ? 'badge-permit' : 'badge-pending')}>
          <span className="status-dot" />
          {blocked ? 'Execution blocked' : proofReady ? 'Proof verified' : permitReady ? 'Permit approved' : 'Permit pending'}
        </div>
      </div>

      <div className="relative">
        <div className="absolute left-0 right-0 top-[54px] h-px bg-white/10" />
        <motion.div
          className={cn('absolute left-0 top-[54px] h-px', blocked ? 'bg-[#EF4D5B]' : proofReady ? 'bg-[#3DDC97]' : 'bg-primary')}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, Math.max(8, (currentIndex / (STATE_INDEX.length - 4)) * 100))}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />

        <div className="grid grid-cols-7 gap-3">
          {workflowNodes.map((node, index) => {
            const Icon = node.icon;
            const status = nodeStatus(node.activeAt, node.completeAt, index);
            return (
              <motion.div
                key={node.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={cn(
                  'relative rounded-[12px] border bg-[#0A0F15] p-4 transition',
                  status === 'pending' && 'border-white/8 text-white/46',
                  status === 'active' && 'border-[#5BA7FF]/36 bg-[#5BA7FF]/8 text-white shadow-[0_20px_60px_rgba(91,167,255,0.08)]',
                  status === 'complete' && 'border-[#3DDC97]/28 bg-[#3DDC97]/7 text-white',
                  status === 'blocked' && 'border-[#EF4D5B]/35 bg-[#EF4D5B]/8 text-white',
                )}
              >
                <div className="mb-5 flex items-center justify-between">
                  <div
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-full border',
                      status === 'pending' && 'border-white/10 bg-white/[0.03] text-white/35',
                      status === 'active' && 'border-[#5BA7FF]/35 bg-[#5BA7FF]/12 text-[#5BA7FF]',
                      status === 'complete' && 'border-[#3DDC97]/30 bg-[#3DDC97]/12 text-[#3DDC97]',
                      status === 'blocked' && 'border-[#EF4D5B]/40 bg-[#EF4D5B]/15 text-[#EF4D5B]',
                    )}
                  >
                    {status === 'complete' ? <CheckCircle2 className="h-4 w-4" /> : status === 'blocked' ? <ShieldAlert className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </div>
                  <span className="font-mono text-[10px] font-bold text-white/32">{String(index + 1).padStart(2, '0')}</span>
                </div>

                <h4 className="text-base font-bold tracking-tight">{node.label}</h4>
                <p className="mt-1 min-h-[34px] text-xs leading-5 text-white/48">{node.role}</p>

                <div className="mt-4 space-y-2 border-t border-white/8 pt-3">
                  <Detail label="Trust" value={index === 0 ? 'User signed' : index === 5 ? 'Receipt gated' : 'Score >= 80'} />
                  <Detail label="Proof" value={node.proof} />
                  <Detail label="Risk" value={node.risk} />
                </div>

                <div className="mt-4 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white/38">
                  {node.integration.includes('0G') ? <Database className="h-3 w-3 text-[#9C7BFF]" /> : node.integration.includes('jury') ? <Scale className="h-3 w-3 text-[#9C7BFF]" /> : <Route className="h-3 w-3 text-primary" />}
                  {node.integration}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[10px]">
      <span className="font-bold uppercase tracking-[0.12em] text-white/28">{label}</span>
      <span className="text-right font-semibold text-white/58">{value}</span>
    </div>
  );
}
