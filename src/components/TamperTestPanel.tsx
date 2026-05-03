import React from 'react';
import { AppState } from '../types';
import { RotateCcw, ShieldAlert, ShieldCheck, ZapOff } from 'lucide-react';
import { cn } from '../lib/utils';

interface Props {
  state: AppState;
  onTamper: () => void;
  onRestore: () => void;
  onReplay: () => void;
  isTampered: boolean;
  replayedFromZeroG: boolean;
}

export default function TamperTestPanel({ state, onTamper, onRestore, onReplay, isTampered, replayedFromZeroG }: Props) {
  const isEnabled = ['execution_complete', 'evidence_stored', 'proof_verified', 'payout_released', 'reputation_updated', 'tamper_detected', 'payout_blocked'].includes(state);

  return (
    <section className="court-panel p-5">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <p className="court-eyebrow">Proof challenge</p>
          <h3 className="mt-1 text-xl font-bold tracking-tight">Tamper test</h3>
        </div>
        <div className={cn('status-badge', isTampered ? 'badge-blocked' : 'badge-pending')}>
          <span className="status-dot" />
          {isTampered ? 'Mismatch found' : 'Ready'}
        </div>
      </div>

      <p className="mb-5 text-sm leading-6 text-white/52">
        Demonstrate that ProofCourt blocks settlement when the evidence root no longer matches the approved work.
      </p>

      <div className="grid grid-cols-1 gap-3">
        <button onClick={onTamper} disabled={!isEnabled || isTampered} className="court-button court-button-danger">
          <ZapOff className="h-4 w-4" />
          Run Tamper Test
        </button>
        <button onClick={onRestore} disabled={!isTampered} className="court-button court-button-secondary">
          <RotateCcw className={cn('h-4 w-4', isTampered && 'animate-spin')} />
          Restore Valid Evidence
        </button>
        <button onClick={onReplay} disabled={!isEnabled} className="court-button court-button-secondary">
          <ShieldCheck className="h-4 w-4 text-[#9C7BFF]" />
          Replay Score From 0G
        </button>
      </div>

      {replayedFromZeroG && (
        <div className="mt-4 rounded-[10px] border border-[#3DDC97]/28 bg-[#3DDC97]/8 p-3">
          <div className="mb-1 flex items-center gap-2 text-xs font-bold text-[#3DDC97]">
            <ShieldCheck className="h-4 w-4" />
            0G replay verified
          </div>
          <p className="text-xs leading-5 text-white/62">
            Local state was reconstructed from stored case evidence.
          </p>
        </div>
      )}

      {isTampered && (
        <div className="mt-4 rounded-[10px] border border-[#EF4D5B]/35 bg-[#EF4D5B]/10 p-3">
          <div className="mb-1 flex items-center gap-2 text-xs font-bold text-[#FF8A96]">
            <ShieldAlert className="h-4 w-4" />
            Execution blocked
          </div>
          <p className="text-xs leading-5 text-white/70">
            Evidence root mismatch detected. Payout remains locked and reputation is penalized.
          </p>
        </div>
      )}
    </section>
  );
}
