import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useAccount } from 'wagmi';
import { cn } from './lib/utils';
import { AppState, INITIAL_AGENTS, Agent, ProofCourtRun, WorkflowResponse } from './types';
import {
  advanceRun,
  createRun,
  generateWorkflow,
  getIntegrationStatus,
  replayRun,
  type IntegrationStatus,
  restoreRun,
  tamperRun,
} from './api/proofcourtClient';

// Components
import Header from './components/Header';
import CourthouseGallery from './components/CourthouseGallery';
import IntentInput from './components/IntentInput';
import WorkflowCanvas from './components/WorkflowCanvas';
import AgentRegistry from './components/AgentRegistry';
import CommitTimeline from './components/CommitTimeline';
import SponsorProofPanels from './components/SponsorProofPanels';
import PayoutStatusCard from './components/PayoutStatusCard';
import TamperTestPanel from './components/TamperTestPanel';
import FinalProofSummary from './components/FinalProofSummary';

export default function App() {
  const { address, isConnected } = useAccount();
  const [activeTab, setActiveTab] = useState<'court' | 'gallery'>('court');
  const [state, setState] = useState<AppState>('idle');
  const [agents, setAgents] = useState<Agent[]>(INITIAL_AGENTS);
  const [isTampered, setIsTampered] = useState(false);
  const [progress, setProgress] = useState(0);
  const [run, setRun] = useState<ProofCourtRun | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus | null>(null);

  const syncRun = (nextRun: ProofCourtRun) => {
    setRun(nextRun);
    setState(nextRun.state);
    setAgents(nextRun.agents);
    setIsTampered(nextRun.isTampered);
    setProgress(nextRun.progress);
  };

  const handleGenerate = async (intent: string) => {
    try {
      setApiError(null);
      const nextWorkflow = await generateWorkflow(intent);
      setAgents(nextWorkflow.agents);
      setState('workflow_generated');

      const nextRun = await createRun(nextWorkflow.mandate.id);
      setTimeout(() => syncRun(nextRun), 700);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Unable to generate workflow');
    }
  };

  useEffect(() => {
    getIntegrationStatus()
      .then(setIntegrationStatus)
      .catch(() => setIntegrationStatus(null));
  }, []);

  const handleStartRun = async () => {
    if (!run) return;

    try {
      setApiError(null);
      const nextRun = await advanceRun(run.id);
      syncRun(nextRun);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Unable to start run');
    }
  };

  useEffect(() => {
    const autoAdvanceStates: AppState[] = [
      'prepare_running',
      'permit_issued',
      'payout_locked',
      'commit_running',
      'execution_complete',
      'evidence_stored',
      'proof_verified',
      'payout_released',
    ];

    if (!run || !autoAdvanceStates.includes(state)) {
      return;
    }

    const delay = state === 'prepare_running' || state === 'commit_running' ? 900 : 700;
    const timer = window.setTimeout(async () => {
      try {
        const nextRun = await advanceRun(run.id);
        syncRun(nextRun);
      } catch (error) {
        setApiError(error instanceof Error ? error.message : 'Unable to advance run');
      }
    }, delay);

    return () => window.clearTimeout(timer);
  }, [state, run?.id]);

  const handleTamper = async () => {
    if (!run) return;

    try {
      setApiError(null);
      const nextRun = await tamperRun(run.id);
      syncRun(nextRun);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Unable to run tamper test');
    }
  };

  const handleRestore = async () => {
    if (!run) return;

    try {
      setApiError(null);
      const nextRun = await restoreRun(run.id);
      syncRun(nextRun);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Unable to restore evidence');
    }
  };

  const handleReplay = async () => {
    if (!run) return;

    try {
      setApiError(null);
      const nextRun = await replayRun(run.id);
      syncRun(nextRun);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Unable to replay from 0G');
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-primary selection:text-white pb-20">
      {/* Background Effect */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03] z-0" 
           style={{ backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,1) 0, rgba(255,255,255,1) 1px, transparent 1px, transparent 24px)' }} />
      
      <Header />

      {/* Tab bar */}
      <div className="fixed top-20 left-0 right-0 z-40 border-b border-white/5 bg-[#050505]/90 backdrop-blur-xl">
        <div className="max-w-[1440px] mx-auto px-10 flex items-center gap-0 h-10">
          {(['court', 'gallery'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'h-full px-5 text-[10px] font-bold uppercase tracking-widest border-b-2 transition-colors',
                activeTab === tab
                  ? 'border-primary text-primary'
                  : 'border-transparent text-white/30 hover:text-white/60',
              )}
            >
              {tab === 'court' ? '⚖️ Court' : '🏛️ Gallery'}
            </button>
          ))}
        </div>
      </div>
      
      <main className="max-w-[1440px] mx-auto px-10 pt-36 pb-32 relative z-10 flex flex-col gap-16">

        {activeTab === 'gallery' ? (
          <CourthouseGallery />
        ) : (
        <>
        <section className={cn("transition-all duration-1000 ease-in-out", state !== 'idle' ? "opacity-60 scale-[0.98] blur-sm pointer-events-none" : "opacity-100")}>
          <IntentInput onGenerate={handleGenerate} isReady={state === 'idle'} />
        </section>

        {apiError && (
          <div className="glass-panel border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-200 font-mono">
            API error: {apiError}. Run <span className="text-white">npm run api</span> in another terminal.
          </div>
        )}

        {state !== 'idle' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-10"
          >
            {/* Left Column: Flow & Timeline */}
            <div className="lg:col-span-8 flex flex-col gap-10">
              <WorkflowCanvas state={state} />
              <CommitTimeline
                state={state}
                progress={progress}
                onStart={handleStartRun}
                walletConnected={isConnected}
              />
              <SponsorProofPanels
                state={state}
                isTampered={isTampered}
                run={run}
                integrationStatus={integrationStatus}
              />
            </div>

            {/* Right Column: Registry & Status */}
            <div className="lg:col-span-4 flex flex-col gap-10">
              <AgentRegistry agents={agents} state={state} run={run} />
              <PayoutStatusCard state={state} isTampered={isTampered} payerAddress={address} run={run} />
              <TamperTestPanel 
                state={state} 
                onTamper={handleTamper} 
                onRestore={handleRestore} 
                onReplay={handleReplay}
                isTampered={isTampered} 
                replayedFromZeroG={Boolean(run?.replayedFromZeroG)}
              />
              <FinalProofSummary state={state} run={run} />
            </div>
          </motion.div>
        )}
        </>
        )}
      </main>
    </div>
  );
}
