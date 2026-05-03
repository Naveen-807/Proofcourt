import React from 'react';
import { motion } from 'motion/react';
import { AppState, ProofCourtRun } from '../types';
import { cn } from '../lib/utils';
import { CheckCircle2, Lock, ShieldX, Unlock, WalletCards } from 'lucide-react';

interface Props {
  state: AppState;
  isTampered: boolean;
  payerAddress?: `0x${string}`;
  run: ProofCourtRun | null;
}

export default function PayoutStatusCard({ state, payerAddress, run }: Props) {
  const isLocked = ['payout_locked', 'commit_running', 'execution_complete', 'evidence_stored'].includes(state);
  const isVerified = state === 'proof_verified';
  const isReleased = ['payout_released', 'reputation_updated'].includes(state);
  const isBlocked = state === 'tamper_detected' || state === 'payout_blocked';
  const funded = Boolean(run?.settlementReceipt?.fundingTxHash);
  const status = isBlocked ? 'Payout blocked' : isReleased ? 'Payout released' : isVerified ? 'Proof verified' : isLocked ? 'Escrow locked' : funded ? 'Escrow funded' : 'Awaiting funding';
  const fundedAmount = run?.settlementReceipt?.fundedAmount;
  const executorReward = run?.settlementReceipt?.fundedAmount ?? run?.agentSla?.payout;
  const displayAmount = fundedAmount?.replace(/ (?:ETH|OG|0G)$/i, '');

  return (
    <section className="court-panel p-5">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <p className="court-eyebrow">Proof-gated settlement</p>
          <h3 className="mt-1 text-xl font-bold tracking-tight">Escrow release rule</h3>
        </div>
        <div className={cn('status-badge', isBlocked ? 'badge-blocked' : isReleased ? 'badge-proof' : isLocked || isVerified ? 'badge-permit' : 'badge-pending')}>
          <span className="status-dot" />
          {status}
        </div>
      </div>

      <div className="rounded-[14px] border border-white/10 bg-black/22 p-5">
        <div className="mb-5 flex items-end justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/38">Total funded</div>
            <div className="mt-1 text-4xl font-bold tracking-tight">
              {displayAmount ?? '--'} {displayAmount && <span className="text-base text-white/42">OG</span>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/38">Executor reward</div>
            <div className="mt-1 text-xl font-semibold text-white/72">{executorReward ?? 'No live SLA payout'}</div>
          </div>
        </div>

        <div className="space-y-3 border-t border-white/8 pt-4">
          <FactRow label="Payer wallet" value={payerAddress ? `${payerAddress.slice(0, 6)}...${payerAddress.slice(-4)}` : 'Not connected'} />
          <FactRow label="0G escrow case" value={run?.settlementReceipt?.contractCaseId ?? 'No live funding receipt'} />
          <FactRow label="Release condition" value="Proof verified" />
          {run?.settlementReceipt && (
            <>
              <FactRow label="Settlement mode" value={run.settlementReceipt.mode.toUpperCase()} />
              <FactRow label="Escrow status" value={run.settlementReceipt.escrowStatus} />
              <TxLine label="Funding tx" value={run.settlementReceipt.fundingTxHash} />
              <TxLine label="Prepare tx" value={run.settlementReceipt.prepareTxHash} />
              <TxLine label="Commit tx" value={run.settlementReceipt.commitTxHash} />
              <TxLine label="Abort tx" value={run.settlementReceipt.abortTxHash} danger />
            </>
          )}
        </div>
      </div>

      {!payerAddress && (
        <div className="mt-4 flex items-center gap-2 rounded-[10px] border border-[#F6A94A]/24 bg-[#F6A94A]/8 p-3 text-xs font-semibold text-[#F6A94A]">
          <WalletCards className="h-4 w-4" />
          Wallet must be connected before escrow funding.
        </div>
      )}

      <div className="mt-5">
        <div className="mb-2 flex justify-between text-[10px] font-bold uppercase tracking-[0.14em] text-white/38">
          <span>Settlement gate</span>
          <span>{status}</span>
        </div>
        <div className="flex h-2 overflow-hidden rounded-full bg-white/8">
          <motion.div
            className={cn('h-full rounded-full', isBlocked ? 'bg-[#EF4D5B]' : isReleased ? 'bg-[#3DDC97]' : isVerified ? 'bg-[#5BA7FF]' : isLocked ? 'bg-primary' : 'bg-white/20')}
            initial={{ width: 0 }}
            animate={{ width: isReleased || isBlocked ? '100%' : isVerified ? '70%' : isLocked ? '42%' : '12%' }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <GateStep active={isLocked || isVerified || isReleased || isBlocked} icon={Lock} label="Locked" />
        <GateStep active={isVerified || isReleased || isBlocked} icon={CheckCircle2} label="Verified" />
        <GateStep active={isReleased || isBlocked} icon={isBlocked ? ShieldX : Unlock} label={isBlocked ? 'Blocked' : 'Released'} danger={isBlocked} />
      </div>
    </section>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-white/42">{label}</span>
      <span className="text-right font-semibold text-white/78">{value}</span>
    </div>
  );
}

function TxLine({ label, value, danger = false }: { label: string; value?: string; danger?: boolean }) {
  if (!value) return null;

  return (
    <div className="rounded-[10px] border border-white/8 bg-white/[0.025] p-3">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">{label}</div>
      <a
        href={`https://chainscan-galileo.0g.ai/tx/${value}`}
        target="_blank"
        rel="noreferrer"
        className={cn('hash-text text-[10px] underline decoration-white/15 underline-offset-4 hover:text-white', danger && 'text-[#FF8A96]')}
      >
        {value}
      </a>
    </div>
  );
}

function GateStep({
  active,
  icon: Icon,
  label,
  danger = false,
}: {
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  danger?: boolean;
}) {
  return (
    <div className={cn('rounded-[10px] border p-3 text-center', active ? danger ? 'border-[#EF4D5B]/30 bg-[#EF4D5B]/8 text-[#EF4D5B]' : 'border-[#3DDC97]/24 bg-[#3DDC97]/8 text-[#3DDC97]' : 'border-white/8 bg-white/[0.025] text-white/30')}>
      <Icon className="mx-auto h-4 w-4" />
      <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.12em]">{label}</div>
    </div>
  );
}
