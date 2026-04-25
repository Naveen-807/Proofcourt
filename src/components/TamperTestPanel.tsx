import React from 'react';
import { AppState } from '../types';
import { ShieldAlert, RefreshCw, ZapOff, ShieldCheck } from 'lucide-react';
import { cn } from '../lib/utils';

interface Props {
  state: AppState;
  onTamper: () => void;
  onRestore: () => void;
  isTampered: boolean;
}

export default function TamperTestPanel({ state, onTamper, onRestore, isTampered }: Props) {
  const isEnabled = ['execution_complete', 'evidence_stored', 'proof_verified', 'payout_released', 'reputation_updated', 'tamper_detected', 'payout_blocked'].includes(state);

  return (
    <div className="glass-panel p-6 border-white/5">
      <h3 className="text-sm font-medium uppercase tracking-widest text-white/80 mb-6 flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 text-primary" />
        Red Team Controls
      </h3>

      <div className="space-y-4">
        <p className="text-[11px] text-white/40 leading-relaxed mb-4">
          Test the protocol's resilience by simulating malicious data injection or evidence tampering.
        </p>

        <button
          onClick={onTamper}
          disabled={!isEnabled || isTampered}
          className={cn(
            "w-full py-3 bg-red-500/10 border border-red-500/40 text-red-500 rounded-sm font-bold text-xs flex items-center justify-center gap-2 hover:bg-red-500/20 transition-all disabled:opacity-30 disabled:pointer-events-none",
            isTampered && "border-red-500 bg-red-500 text-white"
          )}
        >
          <ZapOff className="w-3 h-3" />
          RUN TAMPER TEST
        </button>

        <button
          onClick={onRestore}
          disabled={!isTampered}
          className="w-full py-3 bg-white/5 border border-white/10 text-white/80 rounded-sm font-bold text-xs flex items-center justify-center gap-2 hover:bg-white/10 transition-all disabled:opacity-30 disabled:pointer-events-none"
        >
          <RefreshCw className={cn("w-3 h-3", isTampered && "animate-spin")} />
          RESTORE VALID EVIDENCE
        </button>

        {isTampered && (
          <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-sm">
            <div className="flex items-center gap-2 mb-1">
              <ShieldAlert className="w-4 h-4 text-red-500" />
              <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Tamper Detected</span>
            </div>
            <p className="text-[10px] text-white/80 leading-tight">
              Evidence root mismatch detected. Proof Judge has locked the 
              settlement layer. Payout blocked. Reputation penalty applied.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
