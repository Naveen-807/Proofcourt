import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AppState } from '../types';
import { ShieldCheck, Award, Zap, FileJson } from 'lucide-react';
import { cn } from '../lib/utils';

interface Props {
  state: AppState;
}

export default function FinalProofSummary({ state }: Props) {
  const isComplete = state === 'reputation_updated';
  const isTamperedFallback = state === 'tamper_detected';

  if (!isComplete && !isTamperedFallback) return null;

  return (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
            "p-6 rounded-sm border-2",
            isComplete ? "bg-green-500/5 border-green-500/40" : "bg-red-500/5 border-red-500/40"
        )}
    >
      <div className="flex items-center gap-3 mb-6">
        <div className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center",
            isComplete ? "bg-green-500 text-white" : "bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)]"
        )}>
          {isComplete ? <ShieldCheck className="w-6 h-6" /> : <Zap className="w-6 h-6" />}
        </div>
        <div>
          <h3 className="text-sm font-bold uppercase tracking-widest">
            {isComplete ? "Workflow Verified" : "Verification Failed"}
          </h3>
          <p className="text-[10px] text-white/40 uppercase font-mono">
            ID: court_bundle_90123
          </p>
        </div>
      </div>

      <div className="space-y-4 mb-8">
        <div className="flex justify-between items-center text-xs">
          <span className="text-white/40">ProofCourt Trust Score:</span>
          <span className={cn("font-bold", isComplete ? "text-green-500" : "text-red-500")}>
            {isComplete ? "97/100" : "12/100"}
          </span>
        </div>
        <div className="h-1 bg-white/5 rounded-full overflow-hidden">
          <motion.div 
            className={cn("h-full", isComplete ? "bg-green-500" : "bg-red-500")}
            initial={{ width: 0 }}
            animate={{ width: isComplete ? "97%" : "12%" }}
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-white/60">
            <Award className="w-3 h-3" />
            {isComplete ? "Executor Agent Prime: +1 score" : "Executor Agent Beta: -11 score"}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-white/60">
            <Zap className="w-3 h-3" />
            {isComplete ? "Payout released successfully" : "Payout permanent block"}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-white/60">
            <FileJson className="w-3 h-3" />
            Proof bundle linked to 0G evidence
        </div>
      </div>

      <button className="w-full mt-8 py-3 border border-white/10 bg-white/5 text-[10px] font-bold uppercase tracking-widest hover:bg-white/10 transition-all flex items-center justify-center gap-2">
        <FileJson className="w-4 h-4" />
        VIEW FULL PROOF BUNDLE
      </button>
      
      <p className="mt-4 text-[9px] text-white/20 text-center uppercase tracking-widest">
        Every score update links to a proof bundle.
      </p>
    </motion.div>
  );
}
