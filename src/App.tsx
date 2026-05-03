import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { waitForTransactionReceipt } from '@wagmi/core';
import { parseEventLogs } from 'viem';
import { useAccount, useChainId, useSwitchChain, useWriteContract } from 'wagmi';
import { Activity, Archive, CheckCircle2, Clock3, FileCheck2, Gavel, ShieldAlert, ShieldCheck, WalletCards } from 'lucide-react';
import { cn } from './lib/utils';
import { AppState, Agent, ProofCourtRun, WorkflowResponse } from './types';
import {
  advanceRun,
  attachEscrowFunding,
  createRun,
  getRun,
  generateWorkflow,
  getEscrowFundingIntent,
  getIntegrationStatus,
  replayRun,
  retryPhaseOneBootstrap,
  type IntegrationStatus,
  restoreRun,
  tamperRun,
} from './api/proofcourtClient';
import { web3Config, zeroGGalileo } from './web3/config';

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

const PROOFCOURT_ESCROW_ABI = [
  {
    type: 'function',
    name: 'createCase',
    stateMutability: 'payable',
    inputs: [
      { name: 'executor', type: 'address' },
      { name: 'mandateHash', type: 'bytes32' },
    ],
    outputs: [{ name: 'caseId', type: 'uint256' }],
  },
  {
    type: 'event',
    name: 'CaseCreated',
    inputs: [
      { name: 'caseId', type: 'uint256', indexed: true },
      { name: 'payer', type: 'address', indexed: true },
      { name: 'executor', type: 'address', indexed: true },
      { name: 'payoutAmount', type: 'uint256', indexed: false },
      { name: 'mandateHash', type: 'bytes32', indexed: false },
    ],
  },
] as const;

export default function App() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [activeTab, setActiveTab] = useState<'court' | 'gallery'>('court');
  const [state, setState] = useState<AppState>('idle');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isTampered, setIsTampered] = useState(false);
  const [progress, setProgress] = useState(0);
  const [run, setRun] = useState<ProofCourtRun | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus | null>(null);
  const [isCreatingRun, setIsCreatingRun] = useState(false);

  const syncRun = (nextRun: ProofCourtRun) => {
    setRun(nextRun);
    setState(nextRun.state);
    setAgents(nextRun.agents);
    setIsTampered(nextRun.isTampered);
    setProgress(nextRun.progress);
  };

  const handleGenerate = async (intent: string) => {
    setIsCreatingRun(true);
    try {
      setApiError(null);
      setRun(null);
      setProgress(0);
      const nextWorkflow = await generateWorkflow(intent);
      setAgents(nextWorkflow.agents);
      setState('workflow_generated');

      const nextRun = await createRun(nextWorkflow.mandate.id);
      syncRun(nextRun);
    } catch (error) {
      setState('idle');
      setAgents([]);
      setApiError(error instanceof Error ? error.message : 'Unable to generate workflow');
      setIsCreatingRun(false);
    }
  };

  useEffect(() => {
    const shouldPollRun = Boolean(run?.id && (isCreatingRun || run.bootstrapping));
    if (!shouldPollRun || !run?.id) {
      return;
    }

    let cancelled = false;
    const poll = window.setInterval(async () => {
      try {
        const latestRun = await getRun(run.id);
        if (cancelled) return;
        syncRun(latestRun);

        if (latestRun.bootstrapError) {
          setApiError(latestRun.bootstrapError);
          setIsCreatingRun(false);
          return;
        }

        if (!latestRun.bootstrapping && latestRun.agentDnsResolution && latestRun.agentSla) {
          setApiError(null);
          setIsCreatingRun(false);
        }
      } catch (error) {
        if (cancelled) return;
        setApiError(error instanceof Error ? error.message : 'Unable to load live run');
        setIsCreatingRun(false);
      }
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [isCreatingRun, run?.bootstrapping, run?.id]);

  useEffect(() => {
    getIntegrationStatus()
      .then(setIntegrationStatus)
      .catch(() => setIntegrationStatus(null));
  }, []);

  const handleStartRun = async () => {
    if (!run || run.bootstrapping || run.bootstrapError || !run.agentDnsResolution || !run.agentSla?.zeroGRoot) {
      setApiError('Live AgentDNS and AgentSLA are still being prepared. Wait for the run to finish bootstrapping before funding escrow.');
      return;
    }

    try {
      setApiError(null);
      let fundedRun = run;

      if (!fundedRun.settlementReceipt?.fundingTxHash) {
        if (!isConnected || !address) {
          throw new Error('Connect a wallet before funding escrow');
        }

        const intent = await getEscrowFundingIntent(fundedRun.id);
        if (chainId !== intent.chainId) {
          await switchChainAsync({ chainId: intent.chainId });
        }

        const fundingHash = await writeContractAsync({
          address: intent.escrowAddress,
          abi: PROOFCOURT_ESCROW_ABI,
          functionName: 'createCase',
          args: [intent.executorAddress, intent.mandateHash],
          value: BigInt(intent.payoutWei),
          chainId: intent.chainId,
          chain: zeroGGalileo,
          account: address,
        });
        const receipt = await waitForTransactionReceipt(web3Config, {
          hash: fundingHash,
          chainId: intent.chainId,
        });
        const logs = parseEventLogs({
          abi: PROOFCOURT_ESCROW_ABI,
          eventName: 'CaseCreated',
          logs: receipt.logs,
        });
        const caseId = logs[0]?.args.caseId?.toString();
        if (!caseId) {
          throw new Error('Escrow funding transaction did not emit CaseCreated');
        }

        fundedRun = await attachEscrowFunding(fundedRun.id, {
          txHash: fundingHash,
          contractCaseId: caseId,
          payerAddress: address,
          executorAddress: intent.executorAddress,
          fundedAmount: intent.payoutLabel,
          workflowId: intent.workflowId,
        });
        syncRun(fundedRun);
      }

      const nextRun = await advanceRun(fundedRun.id);
      syncRun(nextRun);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Unable to start run');
    }
  };

  const handleRetryBootstrap = async () => {
    if (!run) return;

    try {
      setApiError(null);
      setIsCreatingRun(true);
      const nextRun = await retryPhaseOneBootstrap(run.id);
      syncRun(nextRun);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Unable to retry Phase 1');
      setIsCreatingRun(false);
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
        setApiError(null);
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
    <div className="court-shell pb-20 text-white selection:bg-primary selection:text-black">
      <Header />

      <div className="fixed left-0 right-0 top-20 z-40 border-b border-white/10 bg-[#07090B]/86 backdrop-blur-2xl">
        <div className="mx-auto flex h-12 max-w-[1440px] items-center justify-between px-10">
          <div className="flex items-center gap-1">
          {(['court', 'gallery'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'flex h-12 items-center gap-2 border-b-2 px-5 text-[10px] font-bold uppercase tracking-[0.16em] transition-colors',
                activeTab === tab
                  ? 'border-primary text-primary'
                  : 'border-transparent text-white/35 hover:text-white/70',
              )}
            >
              {tab === 'court' ? <Gavel className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
              {tab === 'court' ? 'Courtroom' : 'Case Archive'}
            </button>
          ))}
          </div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/38">
            <span className="h-1.5 w-1.5 rounded-full bg-[#3DDC97]" />
            Live 2PC cockpit
          </div>
        </div>
      </div>
      
      <main className="relative z-10 mx-auto flex max-w-[1440px] flex-col gap-12 px-10 pb-32 pt-40">

        {activeTab === 'gallery' ? (
          <CourthouseGallery />
        ) : (
        <>
        <section className={cn('transition-all duration-700 ease-out', state !== 'idle' ? 'pointer-events-none opacity-0 max-h-0 overflow-hidden' : 'opacity-100')}>
          <IntentInput onGenerate={handleGenerate} isReady={state === 'idle' && !isCreatingRun} />
        </section>

        {apiError && (
          <div className="court-panel border-[#EF4D5B]/35 bg-[#EF4D5B]/10 p-4 text-sm text-red-100">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-4 w-4 text-[#EF4D5B]" />
              <div>
                <div className="font-bold">Courtroom request failed</div>
                <div className="mt-1 text-xs text-white/55">
                  {apiError}
                </div>
              </div>
            </div>
          </div>
        )}

        {state !== 'idle' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col gap-8"
          >
            <ControlCenter
              state={state}
              progress={progress}
              run={run}
              agents={agents}
              integrationStatus={integrationStatus}
            />

            <div className="grid grid-cols-[minmax(0,1.42fr)_minmax(360px,0.58fr)] gap-8">
              <div className="flex flex-col gap-8">
                <WorkflowCanvas state={state} run={run} />
                <CommitTimeline
                  state={state}
                  progress={progress}
                  run={run}
                  onStart={handleStartRun}
                  onRetryBootstrap={handleRetryBootstrap}
                  walletConnected={isConnected}
                  escrowFunded={Boolean(run?.settlementReceipt?.fundingTxHash)}
                  isBootstrappingRun={isCreatingRun || Boolean(run?.bootstrapping)}
                />
                <SponsorProofPanels
                  state={state}
                  isTampered={isTampered}
                  run={run}
                  integrationStatus={integrationStatus}
                />
              </div>

              <div className="flex flex-col gap-8">
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
            </div>
          </motion.div>
        )}
        </>
        )}
      </main>
    </div>
  );
}

function ControlCenter({
  state,
  progress,
  run,
  agents,
  integrationStatus,
}: {
  state: AppState;
  progress: number;
  run: ProofCourtRun | null;
  agents: Agent[];
  integrationStatus: IntegrationStatus | null;
}) {
  const trustedAgents = agents.filter((agent) => agent.score >= 80 || agent.status === 'System');
  const isBlocked = state === 'tamper_detected' || state === 'payout_blocked' || Boolean(run?.bootstrapError);
  const isVerified = ['proof_verified', 'payout_released', 'reputation_updated'].includes(state);
  const pendingPermit = ['workflow_generated', 'agents_selected', 'prepare_running'].includes(state);
  const sponsorReady = [integrationStatus?.axl, integrationStatus?.zeroG, integrationStatus?.keeperHub].filter(Boolean).filter((item) => item?.configured).length;
  const verifiedProofs = run?.verificationReceipt ? '3/3' : '0/3';
  const agentTrust = trustedAgents.length > 0
    ? `${Math.round(trustedAgents.reduce((sum, agent) => sum + agent.score, 0) / trustedAgents.length)}`
    : '--';

  return (
    <section className="court-panel p-5">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <p className="court-eyebrow">Active courtroom</p>
          <h2 className="mt-1 text-3xl font-bold tracking-tight">
            {run?.mandate.text ?? 'Permit case is being prepared'}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/52">
            ProofCourt gates the action before execution, records the proof after execution, and releases settlement only after verification.
          </p>
        </div>
        <div className={cn('status-badge', isBlocked ? 'badge-blocked' : isVerified ? 'badge-proof' : pendingPermit ? 'badge-permit' : 'badge-active')}>
          <span className="status-dot" />
          {isBlocked ? 'Execution blocked' : isVerified ? 'Proof verified' : pendingPermit ? 'Permit pending' : state.replace(/_/g, ' ')}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3">
        <MetricCard icon={Clock3} label="Execution status" value={`${progress}%`} detail={state.replace(/_/g, ' ')} tone="blue" />
        <MetricCard icon={FileCheck2} label="Pending permits" value={pendingPermit ? '1' : '0'} detail={pendingPermit ? 'Awaiting approval' : 'Permit cleared'} tone="gold" />
        <MetricCard icon={CheckCircle2} label="Verified proofs" value={verifiedProofs} detail={isVerified ? 'AXL + Keeper + 0G' : 'Waiting for live evidence'} tone="green" />
        <MetricCard icon={ShieldCheck} label="Agent trust" value={agentTrust} detail={trustedAgents.length > 0 ? `${trustedAgents.length} AgentDNS agents` : 'AgentDNS required'} tone="violet" />
        <MetricCard icon={WalletCards} label="Sponsor stack" value={`${sponsorReady}/3`} detail="AXL + 0G + KeeperHub" tone="neutral" />
      </div>
    </section>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail: string;
  tone: 'blue' | 'gold' | 'green' | 'violet' | 'neutral';
}) {
  return (
    <div className="court-panel-soft p-4">
      <div className="mb-5 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/42">{label}</span>
        <Icon
          className={cn(
            'h-4 w-4',
            tone === 'blue' && 'text-[#5BA7FF]',
            tone === 'gold' && 'text-primary',
            tone === 'green' && 'text-[#3DDC97]',
            tone === 'violet' && 'text-[#9C7BFF]',
            tone === 'neutral' && 'text-white/38',
          )}
        />
      </div>
      <div className="text-3xl font-bold tracking-tight">{value}</div>
      <div className="mt-1 truncate text-xs capitalize text-white/42">{detail}</div>
    </div>
  );
}
