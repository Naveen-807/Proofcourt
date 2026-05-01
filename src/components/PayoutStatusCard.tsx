import React from 'react';
import { motion } from 'motion/react';
import { AppState, ProofCourtRun } from '../types';
import { cn } from '../lib/utils';
import { Lock, Unlock, CheckCircle2, ShieldX, WalletCards } from 'lucide-react';

interface Props {
  state: AppState;
  isTampered: boolean;
  payerAddress?: `0x${string}`;
  run: ProofCourtRun | null;
}

export default function PayoutStatusCard({ state, isTampered, payerAddress, run }: Props) {
  const isLocked = ['payout_locked', 'commit_running', 'execution_complete', 'evidence_stored'].includes(state);
  const isVerified = state === 'proof_verified';
  const isReleased = ['payout_released', 'reputation_updated'].includes(state);
  const isBlocked = state === 'tamper_detected' || state === 'payout_blocked';

  return (
    <div className="glass-panel tech-card p-8 border-primary/20 red-glow">
      <div className="flex items-center justify-between mb-8 relative z-10">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-xs font-bold uppercase tracking-[0.3em] text-white/50">Settlement Escrow</h3>
          <p className="text-[10px] text-white/20 font-mono">CHANNEL: P_COURT_MAIN_V1</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="px-2 py-0.5 rounded-sm bg-primary/20 text-[9px] font-extrabold text-primary border border-primary/20 uppercase tracking-tighter shadow-[0_0_10px_rgba(255,11,11,0.1)]">
            SECURE_VAULT
          </span>
          <span className="text-[8px] text-white/10 font-bold uppercase tracking-[0.2em]">Non-Custodial</span>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex justify-between items-end">
          <div>
            <div className="text-[10px] text-white/40 uppercase font-bold tracking-widest mb-1">Total Funded</div>
            <div className="text-3xl font-light tracking-tight">1.01 <span className="text-sm text-white/40 tracking-normal">ETH</span></div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-white/40 uppercase font-bold tracking-widest mb-1">Protocol Fee</div>
            <div className="text-lg font-light text-white/60">0.01 <span className="text-[10px] tracking-normal">ETH</span></div>
          </div>
        </div>

        <div className="p-4 bg-black/40 rounded-sm border border-white/5 space-y-4">
          <div className="flex justify-between gap-4 text-xs">
            <span className="text-white/40">Payer Wallet:</span>
            <span className="font-mono text-right text-white/70">
              {payerAddress ? `${payerAddress.slice(0, 6)}...${payerAddress.slice(-4)}` : 'Not connected'}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-white/40">User Vault:</span>
            <span className="font-mono">1.00 ETH</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-white/40">Executor Reward:</span>
            <span className="font-mono">0.01 ETH</span>
          </div>
          {run?.settlementReceipt && (
            <div className="border-t border-white/5 pt-3 space-y-2 text-[10px]">
              <div className="flex justify-between gap-3">
                <span className="text-white/30">Settlement Mode:</span>
                <span className="font-mono uppercase text-white/60">{run.settlementReceipt.mode}</span>
              </div>
              <TxLine label="Prepare Tx" value={run.settlementReceipt.prepareTxHash} />
              <TxLine label="Commit Tx" value={run.settlementReceipt.commitTxHash} />
              <TxLine label="Abort Tx" value={run.settlementReceipt.abortTxHash} />
              {run.settlementReceipt.error && (
                <div className="text-red-300/80 break-words">
                  Fallback reason: {run.settlementReceipt.error}
                </div>
              )}
            </div>
          )}
        </div>

        {!payerAddress && (
          <div className="flex items-center gap-2 rounded-sm border border-yellow-500/20 bg-yellow-500/5 p-3 text-[10px] font-bold uppercase tracking-widest text-yellow-300/80">
            <WalletCards className="h-4 w-4" />
            Wallet required before escrow funding
          </div>
        )}

        <div className="pt-4 border-t border-white/5">
          <div className="flex items-center justify-between mb-3 text-[10px] uppercase font-bold tracking-widest">
            <span className="text-white/40">Status:</span>
            <motion.div
              layout
              className={cn(
                "px-2 py-1 rounded-sm flex items-center gap-1.5",
                isLocked && "bg-yellow-500/20 text-yellow-500 border border-yellow-500/30",
                isVerified && "bg-blue-500/20 text-blue-400 border border-blue-500/30",
                isReleased && "bg-green-500/20 text-green-500 border border-green-500/30",
                isBlocked && "bg-red-500/20 text-red-500 border border-red-500/30",
                !isLocked && !isVerified && !isReleased && !isBlocked && "bg-white/5 text-white/20 border border-white/5"
              )}
            >
              {isLocked && <><Lock className="w-3 h-3" /> LOCKED</>}
              {isVerified && <><CheckCircle2 className="w-3 h-3" /> VERIFIED</>}
              {isReleased && <><Unlock className="w-3 h-3" /> RELEASED / PAID</>}
              {isBlocked && <><ShieldX className="w-3 h-3" /> BLOCKED</>}
              {!isLocked && !isVerified && !isReleased && !isBlocked && "INACTIVE"}
            </motion.div>
          </div>

          <div className="h-2 bg-black/60 rounded-full overflow-hidden flex">
            <div className={cn(
                "h-full transition-all duration-1000",
                isReleased ? "w-full bg-green-500" : isVerified ? "w-2/3 bg-blue-500" : isLocked ? "w-1/3 bg-yellow-500" : isBlocked ? "w-full bg-red-500" : "w-0"
            )} />
          </div>
        </div>
      </div>
    </div>
  );
}

function TxLine({ label, value }: { label: string; value?: string }) {
  if (!value) return null;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-white/30">{label}:</span>
      <span className="break-all font-mono text-white/60">{value}</span>
    </div>
  );
}
