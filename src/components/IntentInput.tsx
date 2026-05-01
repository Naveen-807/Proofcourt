import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Search, ArrowRight, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface Props {
  onGenerate: (intent: string) => Promise<void> | void;
  isReady: boolean;
}

export default function IntentInput({ onGenerate, isReady }: Props) {
  const [value, setValue] = useState("Send 1 ETH every month into my vault");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const samples = [
    "Send 1 ETH monthly to vault",
    "Send 2.5 ETH weekly",
    "Run protected buy if ETH rises 1%"
  ];

  const handleGenerate = async () => {
    if (!isReady || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onGenerate(value);
    } finally {
      setIsSubmitting(false);
    }
  };

  const buttonContent = (() => {
    if (isSubmitting) return 'Processing...';
    if (!isReady) {
      return (
        <>
          Workflow Generated
          <CheckCircle2 className="w-4 h-4" />
        </>
      );
    }
    return (
      <>
        Generate Workflow
        <ArrowRight className="w-4 h-4" />
      </>
    );
  })();

  return (
    <div className="flex flex-col items-center text-center max-w-4xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h2 className="text-4xl md:text-5xl font-light tracking-tight mb-4">
          No action without a permit. <br />
          <span className="text-white/40">No payout without proof.</span>
        </h2>
        <p className="text-white/60 text-lg mb-8 max-w-2xl mx-auto">
          No trust without a track record. ProofCourt turns user intent into 
          a protected autonomous agent workflow with on-chain evidence.
        </p>
      </motion.div>

      <div className="w-full relative group">
        <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 via-primary/5 to-primary/20 rounded-sm blur opacity-0 group-hover:opacity-100 transition duration-1000 group-focus-within:opacity-100" />
        <div className="relative flex flex-col md:flex-row items-stretch gap-2 bg-[#0A0A0A] border border-white/10 p-2 rounded-sm shadow-2xl">
          <div className="flex-1 flex items-center gap-3 px-4 py-3">
            <Search className="w-5 h-5 text-white/30" />
            <input 
              type="text" 
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Enter your intent..."
              className="bg-transparent border-none outline-none w-full text-lg font-light text-white placeholder:text-white/20"
              disabled={!isReady || isSubmitting}
            />
          </div>
          <button
            onClick={handleGenerate}
            disabled={!isReady || isSubmitting}
            className={cn(
              "px-8 py-3 bg-white text-black font-medium flex items-center justify-center gap-2 rounded-sm transition-all hover:bg-neutral-200 active:scale-95 disabled:opacity-50 disabled:pointer-events-none",
              (!isReady || isSubmitting) && "bg-white/10 text-white/50"
            )}
          >
            {buttonContent}
          </button>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {samples.map((sample) => (
          <button
            key={sample}
            onClick={() => setValue(sample)}
            disabled={!isReady || isSubmitting}
            className="px-3 py-1.5 rounded-sm border border-white/5 bg-white/5 text-xs text-white/60 hover:text-white hover:border-white/20 transition-all"
          >
            {sample}
          </button>
        ))}
      </div>

      <div className="mt-12 flex items-center gap-8 justify-center opacity-40">
        <div className="flex items-center gap-2">
          <div className="text-[10px] uppercase tracking-widest font-bold">Powered BY</div>
          <span className="font-bold tracking-tighter italic">0G STORAGE</span>
        </div>
        <div className="h-4 w-px bg-white/20" />
        <div className="flex items-center gap-2">
          <span className="font-bold tracking-tighter italic">GENSYN AXL</span>
        </div>
        <div className="h-4 w-px bg-white/20" />
        <div className="flex items-center gap-2">
          <span className="font-bold tracking-tighter italic">KEEPERHUB</span>
        </div>
      </div>
    </div>
  );
}
