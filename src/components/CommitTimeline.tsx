import React from 'react';
import { motion } from 'motion/react';
import { AppState, ProofCourtRun } from '../types';
import { cn } from '../lib/utils';
import { CheckCircle2, Clock3, FileCheck2, Lock, Play, ShieldAlert, SlidersHorizontal, Wallet, XCircle } from 'lucide-react';

interface Props {
  state: AppState;
  progress: number;
  run: ProofCourtRun | null;
  onStart: () => void;
  walletConnected: boolean;
  escrowFunded: boolean;
}

const STATE_COPY: Record<AppState, string> = {
  idle: 'Waiting for a goal',
  workflow_generated: 'Mandate drafted',
  agents_selected: 'AgentDNS + SLA committed',
  prepare_running: 'Phase 1 preparing',
  permit_issued: 'Permit committed',
  payout_locked: 'Payout locked',
  commit_running: 'Phase 2 executing',
  execution_complete: 'Execution complete',
  evidence_stored: 'Evidence stored',
  proof_verified: 'Proof committed',
  payout_released: 'Payout released',
  reputation_updated: 'Reputation updated',
  tamper_detected: 'Tamper detected',
  payout_blocked: 'Payout blocked',
};

const auditSteps = [
  { at: 'workflow_generated', label: 'Mandate drafted', detail: 'User request becomes the control-plane task.' },
  { at: 'agents_selected', label: 'AgentDNS + AgentSLA committed', detail: 'Onchain agent identity and 0G SLA root are locked before AXL.' },
  { at: 'permit_issued', label: 'Phase 1 PermitReceipt committed', detail: 'No execution until mandate, SLA, and AgentDNS hashes agree.' },
  { at: 'payout_locked', label: 'Escrow locked', detail: 'Funds cannot release before proof.' },
  { at: 'execution_complete', label: 'KeeperHub execution receipt collected', detail: 'Execution ID, tx, retry count, and log hash recorded.' },
  { at: 'evidence_stored', label: '0G evidence bundle stored', detail: 'Transcript, receipt, and verdict inputs anchored.' },
  { at: 'proof_verified', label: 'Phase 2 VerificationReceipt committed', detail: 'Proof matched SLA, permit, execution receipt, and evidence root.' },
  { at: 'reputation_updated', label: 'Settlement and trust score finalized', detail: 'Payout/reputation decision linked to receipt bundle.' },
] as const;

const stateOrder: AppState[] = [
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

export default function CommitTimeline({ state, progress, run, onStart, walletConnected, escrowFunded }: Props) {
  const isStarted = state !== 'workflow_generated' && state !== 'agents_selected';
  const isBlocked = state === 'tamper_detected' || state === 'payout_blocked';
  const isVerified = ['proof_verified', 'payout_released', 'reputation_updated'].includes(state);
  const currentIndex = stateOrder.indexOf(state);

  return (
    <section className="grid grid-cols-[0.92fr_1.08fr] gap-6">
      <div className="court-panel overflow-hidden p-6">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="court-eyebrow">Phase 1: Mandate / Permit</p>
            <h3 className="mt-1 text-2xl font-bold tracking-tight">No execution until approval is committed</h3>
            <p className="mt-2 text-sm leading-6 text-white/52">
              AgentDNS and AgentSLA must be locked before the worker receives an executable job.
            </p>
          </div>
          <div className={cn('status-badge', isBlocked ? 'badge-blocked' : isVerified ? 'badge-proof' : isStarted ? 'badge-permit' : 'badge-pending')}>
            <span className="status-dot" />
            {STATE_COPY[state]}
          </div>
        </div>

        <div className="rounded-[12px] border border-primary/22 bg-primary/[0.08] p-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <div className="text-lg font-bold">PermitReceipt required before execution</div>
              <div className="text-xs text-white/50">No autonomous action is allowed until Phase 1 commits.</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <PermitFact label="AgentDNS" value={run?.agentDnsResolution?.resolutionHash?.slice(0, 18) ?? 'No live AgentDNS'} />
            <PermitFact label="AgentSLA" value={run?.agentSla?.slaHash?.slice(0, 18) ?? 'No live SLA'} tone="gold" />
            <PermitFact label="0G SLA root" value={run?.agentSla?.zeroGRoot?.slice(0, 18) ?? 'No 0G SLA root'} />
            <PermitFact label="Deadline" value={run?.agentSla?.deadlineIso ? new Date(run.agentSla.deadlineIso).toLocaleTimeString() : 'No live SLA'} />
            <PermitFact label="Required proof" value="AXL + KeeperHub + 0G" tone="green" />
            <PermitFact label="Condition" value="No payout without proof" />
          </div>

          <div className="mt-5 rounded-[10px] border border-white/10 bg-black/20 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-white/48">
              <FileCheck2 className="h-3.5 w-3.5 text-[#3DDC97]" />
              Two-phase rules
            </div>
            <ul className="space-y-2 text-sm leading-6 text-white/62">
              <li>Phase 1 commits Mandate, AgentDNS, AgentSLA, and PermitReceipt.</li>
              <li>Phase 2 commits ExecutionReceipt, VerificationReceipt, and settlement.</li>
              <li>SLA mismatch blocks payout and applies a trust penalty.</li>
            </ul>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          <button
            onClick={onStart}
            disabled={isStarted || !walletConnected}
            className={cn('court-button court-button-primary col-span-2', isStarted && 'bg-white/10 text-white/45 shadow-none')}
          >
            {walletConnected ? <Play className="h-4 w-4 fill-current" /> : <Wallet className="h-4 w-4" />}
            {walletConnected ? (isStarted ? 'Permit Approved' : escrowFunded ? 'Approve Permit' : 'Fund Escrow + Approve') : 'Connect Wallet'}
          </button>
          <button type="button" disabled className="court-button court-button-secondary" title="Visual review control only; execution logic is unchanged.">
            <SlidersHorizontal className="h-4 w-4" />
            Modify
          </button>
        </div>
        <button type="button" disabled className="court-button court-button-danger mt-3 w-full" title="Visual review control only; execution logic is unchanged.">
          <XCircle className="h-4 w-4" />
          Reject Permit
        </button>
      </div>

      <div className="court-panel p-6">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="court-eyebrow">Live audit trail</p>
            <h3 className="mt-1 text-2xl font-bold tracking-tight">Readable execution events</h3>
          </div>
          <div className={cn('status-badge', isBlocked ? 'badge-blocked' : isVerified ? 'badge-proof' : 'badge-active')}>
            <span className="status-dot" />
            {progress}% complete
          </div>
        </div>

        <div className="space-y-3">
          {auditSteps.map((step, index) => {
            const stepIndex = stateOrder.indexOf(step.at);
            const complete = currentIndex >= stepIndex;
            const active = !complete && currentIndex + 1 === stepIndex;
            const failed = isBlocked && index >= 6;

            return (
              <div key={step.label} className="grid grid-cols-[32px_1fr] gap-3">
                <div className="relative flex justify-center">
                  <div
                    className={cn(
                      'z-10 flex h-8 w-8 items-center justify-center rounded-full border bg-[#0D1117]',
                      complete && !failed && 'border-[#3DDC97]/35 text-[#3DDC97]',
                      active && 'border-[#5BA7FF]/35 text-[#5BA7FF]',
                      failed && 'border-[#EF4D5B]/40 text-[#EF4D5B]',
                      !complete && !active && !failed && 'border-white/10 text-white/26',
                    )}
                  >
                    {failed ? <ShieldAlert className="h-4 w-4" /> : complete ? <CheckCircle2 className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
                  </div>
                  {index < auditSteps.length - 1 && <div className="absolute bottom-[-18px] top-8 w-px bg-white/10" />}
                </div>
                <motion.div
                  layout
                  className={cn(
                    'rounded-[10px] border p-3',
                    complete && !failed && 'border-[#3DDC97]/20 bg-[#3DDC97]/7',
                    active && 'border-[#5BA7FF]/22 bg-[#5BA7FF]/8',
                    failed && 'border-[#EF4D5B]/28 bg-[#EF4D5B]/8',
                    !complete && !active && !failed && 'border-white/8 bg-white/[0.025]',
                  )}
                >
                  <div className="text-sm font-bold text-white/84">{step.label}</div>
                  <div className="mt-1 text-xs leading-5 text-white/46">{step.detail}</div>
                </motion.div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 border-t border-white/8 pt-5">
          <div className="mb-2 flex justify-between text-[10px] font-bold uppercase tracking-[0.14em] text-white/42">
            <span>Execution progress</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/8">
            <motion.div
              className={cn('h-full rounded-full', isBlocked ? 'bg-[#EF4D5B]' : isVerified ? 'bg-[#3DDC97]' : 'bg-primary')}
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function PermitFact({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'gold' | 'green' | 'red' }) {
  return (
    <div className="rounded-[10px] border border-white/10 bg-black/18 p-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">{label}</div>
      <div
        className={cn(
          'mt-1 text-sm font-bold',
          tone === 'default' && 'text-white/82',
          tone === 'gold' && 'text-primary',
          tone === 'green' && 'text-[#3DDC97]',
          tone === 'red' && 'text-[#EF4D5B]',
        )}
      >
        {value}
      </div>
    </div>
  );
}
