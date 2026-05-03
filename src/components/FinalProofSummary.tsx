import React from 'react';
import { motion } from 'motion/react';
import { AppState, ProofCourtRun } from '../types';
import { Award, Database, Download, FileCheck2, Scale, ShieldCheck, ShieldX, Zap } from 'lucide-react';
import { cn } from '../lib/utils';

interface Props {
  state: AppState;
  run: ProofCourtRun | null;
}

export default function FinalProofSummary({ state, run }: Props) {
  const isComplete = state === 'reputation_updated';
  const isTamperedFallback = state === 'tamper_detected' || state === 'payout_blocked';
  const receipt = run?.verificationReceipt;

  if (!isComplete && !isTamperedFallback) return null;

  const handleDownloadReceipt = () => {
    if (!run) return;

    const receiptPayload = {
      caseId: run.id,
      state: run.state,
      userGoal: run.mandate.text,
      permitHash: run.evidence.permitHash,
      axlTranscriptHash: run.evidence.axlTranscriptHash,
      keeperHubReceiptHash: run.evidence.keeperHubReceiptHash,
      zeroGRoot: run.evidence.root,
      agentDnsResolution: run.agentDnsResolution,
      agentSla: run.agentSla,
      agentHire: run.agentHire,
      swarmMemory: run.swarmMemory,
      verifierVerdicts: run.verdicts,
      zeroGComputeVerdictHash: run.evidence.verdictHash,
      zeroGComputeCompliant: run.evidence.verdictCompliant,
      zeroGComputeReason: run.evidence.verdictReason,
      zeroGComputeConfidence: run.evidence.verdictConfidence,
      zeroGComputeModel: run.evidence.verdictModel,
      keeperHubProofTrial: run.proofTrialReceipt,
      keeperHubExecution: run.keeperHubReceipt,
      keeperHubAtomicSettlement: run.settlementKeeperHubReceipt,
      prepareTxHash: run.settlementReceipt?.prepareTxHash,
      commitTxHash: run.settlementReceipt?.commitTxHash,
      abortTxHash: run.settlementReceipt?.abortTxHash,
      trustScoreBefore: run.verificationReceipt?.trustScoreBefore,
      trustScoreAfter: run.verificationReceipt?.trustScoreAfter,
      verificationReceipt: run.verificationReceipt,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(receiptPayload, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${run.id}-proofcourt-receipt.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const released = isComplete && !isTamperedFallback;

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('court-panel overflow-hidden p-5', released ? 'border-[#3DDC97]/24' : 'border-[#EF4D5B]/32')}
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-[#3DDC97] to-[#9C7BFF]" />

      <div className="mb-6 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={cn('flex h-12 w-12 items-center justify-center rounded-full', released ? 'bg-[#3DDC97]/14 text-[#3DDC97]' : 'bg-[#EF4D5B]/14 text-[#EF4D5B]')}>
            {released ? <ShieldCheck className="h-6 w-6" /> : <ShieldX className="h-6 w-6" />}
          </div>
          <div>
            <p className="court-eyebrow">Final proof receipt</p>
            <h3 className="mt-1 text-xl font-bold tracking-tight">
              {released ? 'Payout released after proof' : 'Payout blocked by ProofCourt'}
            </h3>
          </div>
        </div>
        <div className={cn('status-badge', released ? 'badge-proof' : 'badge-blocked')}>
          <span className="status-dot" />
          {released ? 'Official receipt' : 'Blocked receipt'}
        </div>
      </div>

      <div className="rounded-[14px] border border-white/10 bg-black/20 p-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">User goal</div>
        <div className="mt-1 text-sm font-semibold leading-6 text-white/82">{run?.mandate.text ?? 'Goal unavailable'}</div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <ReceiptFact icon={Scale} label="Permit granted" value={run?.evidence.permitHash ?? 'No live permit receipt'} />
        <ReceiptFact icon={Zap} label="Execution result" value={run?.keeperHubReceipt?.txHash ? run.keeperHubReceipt.status : 'No live execution receipt'} />
        <ReceiptFact icon={Database} label="Evidence reference" value={run?.evidence.root ?? 'No 0G evidence root'} />
        <ReceiptFact icon={FileCheck2} label="Verification result" value={run?.verificationReceipt ? run.evidence.verificationResult : 'No verifier receipt'} danger={!released} />
      </div>

      {receipt ? (
        <div className="mt-5 rounded-[14px] border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/38">Agent trust score</div>
            <div className={cn('text-sm font-bold', released ? 'text-[#3DDC97]' : 'text-[#EF4D5B]')}>
              {receipt.trustScoreBefore} -&gt; {receipt.trustScoreAfter}
            </div>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/8">
            <motion.div
              className={cn('h-full rounded-full', released ? 'bg-[#3DDC97]' : 'bg-[#EF4D5B]')}
              initial={{ width: 0 }}
              animate={{ width: `${receipt.trustScoreAfter}%` }}
            />
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-white/55">
            <Award className="h-4 w-4 text-primary" />
            {receipt.executorName}: {receipt.scoreDelta > 0 ? '+' : ''}{receipt.scoreDelta} trust score
          </div>
        </div>
      ) : null}

      <button onClick={handleDownloadReceipt} className="court-button court-button-secondary mt-5 w-full">
        <Download className="h-4 w-4" />
        Download Proof Bundle
      </button>
    </motion.section>
  );
}

function ReceiptFact({
  icon: Icon,
  label,
  value,
  danger = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className={cn('rounded-[12px] border p-3', danger ? 'border-[#EF4D5B]/24 bg-[#EF4D5B]/8' : 'border-white/8 bg-white/[0.025]')}>
      <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">
        <Icon className={cn('h-3.5 w-3.5', danger ? 'text-[#EF4D5B]' : 'text-primary')} />
        {label}
      </div>
      <div className="hash-text text-[10px]">{value}</div>
    </div>
  );
}
