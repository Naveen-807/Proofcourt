import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Zap, AlertTriangle, RefreshCw, Lock, Unlock, CheckCircle2, Search, ArrowRight } from 'lucide-react';
import { cn } from './lib/utils';
import { AppState, INITIAL_AGENTS, WORKFLOW_NODES, Agent } from './types';

// Components
import Header from './components/Header';
import IntentInput from './components/IntentInput';
import WorkflowCanvas from './components/WorkflowCanvas';
import AgentRegistry from './components/AgentRegistry';
import CommitTimeline from './components/CommitTimeline';
import SponsorProofPanels from './components/SponsorProofPanels';
import PayoutStatusCard from './components/PayoutStatusCard';
import TamperTestPanel from './components/TamperTestPanel';
import FinalProofSummary from './components/FinalProofSummary';

export default function App() {
  const [state, setState] = useState<AppState>('idle');
  const [agents, setAgents] = useState<Agent[]>(INITIAL_AGENTS);
  const [isTampered, setIsTampered] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleGenerate = () => {
    setState('workflow_generated');
    setTimeout(() => setState('agents_selected'), 1000);
  };

  const handleStartRun = () => {
    setState('prepare_running');
    setProgress(0);
  };

  useEffect(() => {
    if (state === 'prepare_running') {
      const timer = setInterval(() => {
        setProgress(prev => {
          if (prev >= 45) {
            clearInterval(timer);
            setState('permit_issued');
            return 45;
          }
          return prev + 5;
        });
      }, 200);
      return () => clearInterval(timer);
    }
    
    if (state === 'permit_issued') {
      setTimeout(() => setState('payout_locked'), 800);
    }

    if (state === 'payout_locked') {
      setTimeout(() => setState('commit_running'), 800);
    }

    if (state === 'commit_running') {
      const timer = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(timer);
            setState('execution_complete');
            return 90;
          }
          return prev + 5;
        });
      }, 300);
      return () => clearInterval(timer);
    }

    if (state === 'execution_complete') {
      setTimeout(() => setState('evidence_stored'), 1000);
    }

    if (state === 'evidence_stored') {
      setTimeout(() => {
        if (isTampered) {
          setState('tamper_detected');
        } else {
          setState('proof_verified');
        }
      }, 1200);
    }

    if (state === 'proof_verified') {
      setTimeout(() => setState('payout_released'), 1000);
    }

    if (state === 'payout_released') {
      setTimeout(() => {
        setState('reputation_updated');
        // Update Agent score
        setAgents(prev => prev.map(a => a.id === 'prime' ? { ...a, score: 90 } : a));
      }, 1000);
    }
  }, [state, isTampered]);

  const handleTamper = () => {
    setIsTampered(true);
    if (state === 'reputation_updated' || state === 'payout_released' || state === 'proof_verified') {
      setState('tamper_detected');
      setAgents(prev => prev.map(a => a.id === 'prime' ? { ...a, score: 82 } : a));
    }
  };

  const handleRestore = () => {
    setIsTampered(false);
    if (state === 'tamper_detected' || state === 'payout_blocked') {
      setState('proof_verified');
      setAgents(prev => prev.map(a => a.id === 'prime' ? { ...a, score: 90 } : a));
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-primary selection:text-white pb-20">
      {/* Background Effect */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03] z-0" 
           style={{ backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,1) 0, rgba(255,255,255,1) 1px, transparent 1px, transparent 24px)' }} />
      
      <Header />
      
      <main className="max-w-[1440px] mx-auto px-10 pt-32 pb-32 relative z-10 flex flex-col gap-16">
        <section className={cn("transition-all duration-1000 ease-in-out", state !== 'idle' ? "opacity-60 scale-[0.98] blur-sm pointer-events-none" : "opacity-100")}>
          <IntentInput onGenerate={handleGenerate} isReady={state === 'idle'} />
        </section>

        {state !== 'idle' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-10"
          >
            {/* Left Column: Flow & Timeline */}
            <div className="lg:col-span-8 flex flex-col gap-10">
              <WorkflowCanvas state={state} />
              <CommitTimeline state={state} progress={progress} onStart={handleStartRun} />
              <SponsorProofPanels state={state} isTampered={isTampered} />
            </div>

            {/* Right Column: Registry & Status */}
            <div className="lg:col-span-4 flex flex-col gap-10">
              <AgentRegistry agents={agents} state={state} />
              <PayoutStatusCard state={state} isTampered={isTampered} />
              <TamperTestPanel 
                state={state} 
                onTamper={handleTamper} 
                onRestore={handleRestore} 
                isTampered={isTampered} 
              />
              <FinalProofSummary state={state} />
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
}
