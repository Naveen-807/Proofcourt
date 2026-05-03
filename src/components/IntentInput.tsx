import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, CheckCircle2, FileCheck2, LockKeyhole, Search, ShieldCheck } from 'lucide-react';
import { cn } from '../lib/utils';

interface Props {
  onGenerate: (intent: string) => Promise<void> | void;
  isReady: boolean;
}

const protocolSteps = ['Mandate', 'AgentDNS', 'AgentSLA', 'Permit', 'Execute', 'Settle'];

export default function IntentInput({ onGenerate, isReady }: Props) {
  const [value, setValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleGenerate = async () => {
    if (!isReady || isSubmitting || value.trim().length === 0) return;

    setIsSubmitting(true);
    try {
      await onGenerate(value.trim());
    } finally {
      setIsSubmitting(false);
    }
  };

  const buttonContent = (() => {
    if (isSubmitting) return 'Drafting Permit...';
    if (!isReady) {
      return (
        <>
          Permit Drafted
          <CheckCircle2 className="h-4 w-4" />
        </>
      );
    }
    return (
      <>
        Request Permit
        <ArrowRight className="h-4 w-4" />
      </>
    );
  })();

  return (
    <div className="mx-auto grid max-w-[1260px] grid-cols-[1.05fr_0.95fr] items-center gap-12">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col items-start"
      >
        <div className="status-badge badge-permit mb-7">
          <span className="status-dot" />
          Autonomous work requires approval
        </div>
        <h2 className="max-w-4xl text-left text-[64px] font-bold leading-[0.95] tracking-tight text-[#F4F0E8]">
          No action without a permit.
          <span className="block text-white/42">No payout without proof.</span>
        </h2>
        <p className="mt-7 max-w-2xl text-lg leading-8 text-white/62">
          Use task-only natural language in the form: send amount, transaction type, and destination. ProofCourt attaches AgentDNS, AgentSLA, permit, and proof-gated settlement automatically.
        </p>

        <div className="mt-9 w-full rounded-[14px] border border-white/12 bg-[#0D1117]/92 p-2 shadow-[0_28px_90px_rgba(0,0,0,0.42)]">
          <div className="flex items-stretch gap-2">
            <div className="flex min-h-[58px] flex-1 items-center gap-3 rounded-[10px] border border-white/8 bg-black/25 px-4">
              <Search className="h-5 w-5 text-white/35" />
              <input
                type="text"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder="Send 0.2 weekly transfer to 0x1234... or vault"
                className="w-full border-none bg-transparent text-lg font-medium text-white outline-none placeholder:text-white/24"
                disabled={!isReady || isSubmitting}
              />
            </div>
            <button
              onClick={handleGenerate}
              disabled={!isReady || isSubmitting || value.trim().length === 0}
              className={cn(
                'court-button court-button-primary min-w-[190px]',
                (!isReady || isSubmitting || value.trim().length === 0) && 'bg-white/10 text-white/50 shadow-none',
              )}
            >
              {buttonContent}
            </button>
          </div>
        </div>

      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12, duration: 0.55 }}
        className="court-panel p-6"
      >
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="court-eyebrow">Judge view</p>
            <h3 className="mt-1 text-2xl font-bold tracking-tight">Permit-to-proof chain</h3>
          </div>
          <div className="rounded-full border border-[#3DDC97]/30 bg-[#3DDC97]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#3DDC97]">
            Real-only
          </div>
        </div>

        <div className="space-y-3">
          {protocolSteps.map((step, index) => (
            <div key={step} className="grid grid-cols-[34px_1fr_auto] items-center gap-3 rounded-[10px] border border-white/8 bg-white/[0.035] p-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-xs font-black text-primary">
                {String(index + 1).padStart(2, '0')}
              </div>
              <div>
                <div className="text-sm font-bold text-white/88">{step}</div>
                <div className="text-xs text-white/42">
                  {step === 'Mandate' && 'Plain-English intent becomes a case file'}
                  {step === 'AgentDNS' && 'Agents resolve from onchain identity'}
                  {step === 'AgentSLA' && 'SLA hash is stored on 0G before execution'}
                  {step === 'Permit' && 'Execution is blocked until approved'}
                  {step === 'Execute' && 'KeeperHub runs only the permitted path'}
                  {step === 'Settle' && 'Payout and reputation update after proof'}
                </div>
              </div>
              {step === 'Permit' ? <LockKeyhole className="h-4 w-4 text-primary" /> : step === 'AgentSLA' ? <FileCheck2 className="h-4 w-4 text-[#3DDC97]" /> : <ShieldCheck className="h-4 w-4 text-white/28" />}
            </div>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-3 gap-3">
          <SponsorMini label="Gensyn AXL" value="Agent route" tone="blue" />
          <SponsorMini label="0G" value="Evidence memory" tone="violet" />
          <SponsorMini label="KeeperHub" value="Execution engine" tone="gold" />
        </div>
      </motion.div>
    </div>
  );
}

function SponsorMini({ label, value, tone }: { label: string; value: string; tone: 'blue' | 'violet' | 'gold' }) {
  return (
    <div
      className={cn(
        'rounded-[10px] border p-3',
        tone === 'blue' && 'border-[#5BA7FF]/25 bg-[#5BA7FF]/8',
        tone === 'violet' && 'border-[#9C7BFF]/25 bg-[#9C7BFF]/8',
        tone === 'gold' && 'border-primary/25 bg-primary/8',
      )}
    >
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/42">{label}</div>
      <div className="mt-1 text-sm font-semibold text-white/82">{value}</div>
    </div>
  );
}
