import React from 'react';
import { motion } from 'motion/react';
import { AppState } from '../types';
import { cn } from '../lib/utils';
import { Play, CheckCircle2, Circle, Loader2, ShieldCheck, Lock, Wallet, XCircle } from 'lucide-react';

interface Props {
  state: AppState;
  progress: number;
  onStart: () => void;
  walletConnected: boolean;
}

const PHASE1_STEPS = [
  { id: 'mandate', label: 'Mandate parsed', state: 'permit_issued' },
  { id: 'identities', label: 'Agent identities verified', state: 'permit_issued' },
  { id: 'threshold', label: 'Trust threshold passed', state: 'permit_issued' },
  { id: 'escrow', label: 'Escrow funded', state: 'payout_locked' },
  { id: 'axl', label: 'AXL nodes ready', state: 'permit_issued' },
  { id: 'keeper', label: 'KeeperHub ready', state: 'permit_issued' },
  { id: 'zeroG', label: '0G evidence storage ready', state: 'permit_issued' },
  { id: 'permit', label: 'Permit issued', state: 'permit_issued' },
  { id: 'payout', label: 'Payout locked', state: 'payout_locked' },
];

const PHASE2_STEPS = [
  { id: 'receive', label: 'Executor receives permit', state: 'commit_running' },
  { id: 'execute', label: 'Executor executes via KeeperHub', state: 'execution_complete' },
  { id: 'receipt', label: 'KeeperHub receipt collected', state: 'execution_complete' },
  { id: 'axl_final', label: 'AXL transcript finalized', state: 'evidence_stored' },
  { id: 'zeroG_upload', label: 'Evidence uploaded to 0G', state: 'evidence_stored' },
  { id: 'verify', label: 'Proof Judge verifies bundle', state: 'proof_verified' },
  { id: 'release', label: 'Payout released', state: 'payout_released' },
  { id: 'reputation', label: 'Reputation updated', state: 'reputation_updated' },
];

export default function CommitTimeline({ state, progress, onStart, walletConnected }: Props) {
  const isStarted = state !== 'workflow_generated' && state !== 'agents_selected';
  const isComplete = state === 'reputation_updated';

  const checkStepStatus = (index: number, phase: 1 | 2) => {
    const statesOrder: AppState[] = [
      'idle', 'workflow_generated', 'agents_selected', 
      'prepare_running', 'permit_issued', 'payout_locked', 
      'commit_running', 'execution_complete', 'evidence_stored', 
      'proof_verified', 'payout_released', 'reputation_updated',
      'tamper_detected', 'payout_blocked'
    ];
    
    if (state === 'tamper_detected' || state === 'payout_blocked') {
        if (phase === 2 && index >= 5) return 'error';
    }

    const currentStateIdx = statesOrder.indexOf(state);
    
    if (phase === 1) {
      if (currentStateIdx >= 5) return 'completed';
      if (currentStateIdx === 3) return 'active';
    } else {
      const p2StartIndex = 6;
      if (currentStateIdx >= p2StartIndex + index + 1) return 'completed';
      if (currentStateIdx === p2StartIndex + index) return 'active';
    }
    
    return 'pending';
  };

  return (
    <div className="glass-panel p-10 bg-[#0A0A0A]/60">
      <div className="flex items-center justify-between mb-12">
        <div className="flex flex-col gap-1">
          <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">Permit + Proof Commit</h3>
          <p className="text-[10px] text-white/20 font-mono uppercase">System Node Status: {state.replace('_', ' ')}</p>
        </div>
        
        {!isStarted && (
          <button
            onClick={onStart}
            disabled={!walletConnected}
            className={cn(
              "px-6 py-2 text-white text-xs font-bold rounded-sm flex items-center gap-2 transition-all",
              walletConnected
                ? "bg-primary hover:bg-primary/80 red-glow"
                : "bg-white/5 text-white/25 border border-white/10 cursor-not-allowed",
            )}
          >
            {walletConnected ? <Play className="w-3 h-3 fill-current" /> : <Wallet className="w-3 h-3" />}
            {walletConnected ? 'START AUTONOMOUS RUN' : 'CONNECT WALLET TO FUND'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Phase 1 */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 mb-4">
            <Lock className="w-4 h-4 text-primary" />
            <span className="text-xs font-bold uppercase tracking-widest text-white/40">Phase 1: Prepare</span>
          </div>
          <div className="space-y-4">
            {PHASE1_STEPS.map((step, i) => {
              const status = checkStepStatus(i, 1);
              return (
                <div key={step.id} className="flex items-center gap-3">
                  <div className="relative">
                    {status === 'completed' ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    ) : status === 'active' ? (
                      <Loader2 className="w-4 h-4 text-primary animate-spin" />
                    ) : (
                      <Circle className="w-4 h-4 text-white/10" />
                    )}
                    {i < PHASE1_STEPS.length - 1 && (
                      <div className="absolute top-4 left-2 w-px h-4 bg-white/10" />
                    )}
                  </div>
                  <span className={cn(
                    "text-xs transition-colors",
                    status === 'completed' ? "text-white/80" : status === 'active' ? "text-primary font-bold" : "text-white/20"
                  )}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Phase 2 */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <span className="text-xs font-bold uppercase tracking-widest text-white/40">Phase 2: Commit</span>
          </div>
          <div className="space-y-4">
            {PHASE2_STEPS.map((step, i) => {
              const status = checkStepStatus(i, 2);
              return (
                <div key={step.id} className="flex items-center gap-3">
                  <div className="relative">
                    {status === 'completed' ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    ) : status === 'active' ? (
                      <Loader2 className="w-4 h-4 text-primary animate-spin" />
                    ) : status === 'error' ? (
                      <XCircle className="w-4 h-4 text-red-500" />
                    ) : (
                      <Circle className="w-4 h-4 text-white/10" />
                    )}
                    {i < PHASE2_STEPS.length - 1 && (
                      <div className="absolute top-4 left-2 w-px h-4 bg-white/10" />
                    )}
                  </div>
                  <span className={cn(
                    "text-xs transition-colors",
                    status === 'completed' ? "text-white/80" : status === 'active' ? "text-primary font-bold" : status === 'error' ? "text-red-500" : "text-white/20"
                  )}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Global Progress Bar */}
      <div className="mt-8 pt-8 border-t border-white/5">
        <div className="flex justify-between text-[10px] uppercase font-bold text-white/40 mb-2">
          <span>Simulation Progress</span>
          <span>{progress}%</span>
        </div>
        <div className="h-1 bg-white/5 rounded-full overflow-hidden">
          <motion.div 
            className="h-full bg-primary red-glow"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
