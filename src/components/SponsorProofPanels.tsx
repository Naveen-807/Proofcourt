import React from 'react';
import { motion } from 'motion/react';
import type { AppState, ProofCourtRun, VerifierVerdict } from '../types';
import { cn } from '../lib/utils';
import { CheckCircle2, Code2, Database, MessagesSquare, Route, Scale, ShieldAlert, Vote, Zap } from 'lucide-react';
import type { IntegrationHealth, IntegrationStatus } from '../api/proofcourtClient';

interface Props {
  state: AppState;
  isTampered: boolean;
  run: ProofCourtRun | null;
  integrationStatus: IntegrationStatus | null;
}

export default function SponsorProofPanels({ state, isTampered, run, integrationStatus }: Props) {
  const messages = run?.axlMessages ?? [];
  const keeperReceipt = run?.keeperHubReceipt;
  const evidence = run?.evidence;
  const verdicts = run?.verdicts ?? [];
  const quorum = run?.quorum;

  const isAxlActive = messages.length > 0 || ['permit_issued', 'payout_locked', 'commit_running', 'execution_complete', 'evidence_stored', 'proof_verified', 'payout_released', 'reputation_updated', 'tamper_detected', 'payout_blocked'].includes(state);
  const isKeeperActive = Boolean(keeperReceipt?.executionId || keeperReceipt?.txHash) || ['execution_complete', 'evidence_stored', 'proof_verified', 'payout_released', 'reputation_updated', 'tamper_detected', 'payout_blocked'].includes(state);
  const isZeroGActive = Boolean(evidence?.root) || ['evidence_stored', 'proof_verified', 'payout_released', 'reputation_updated', 'tamper_detected', 'payout_blocked'].includes(state);

  return (
    <section className="space-y-6">
      <div className="grid grid-cols-3 gap-5">
        <SponsorCard
          title="Gensyn AXL"
          role="Secure agent communication"
          description="Routes permit, execution, and verdict messages between separate agent roles."
          icon={MessagesSquare}
          status={integrationStatus?.axl}
          active={isAxlActive}
          tone="blue"
          metrics={[
            ['Messages', String(messages.length)],
            ['Envelope', messages.at(-1)?.envelope?.toUpperCase() ?? 'No live envelope'],
            ['Topology', integrationStatus?.axl?.nodes?.length ? `${integrationStatus.axl.nodes.length} nodes` : 'No live topology'],
          ]}
          hashLabel="Transcript hash"
          hashValue={evidence?.axlTranscriptHash}
        />

        <SponsorCard
          title="KeeperHub"
          role="Reliable execution engine"
          description="Runs the permitted work and returns execution, retry, and audit receipts."
          icon={Zap}
          status={integrationStatus?.keeperHub}
          active={isKeeperActive}
          tone="gold"
          metrics={[
            ['Status', keeperReceipt?.txHash ? keeperReceipt.status : 'No live receipt'],
            ['Retries', keeperReceipt?.txHash ? String(keeperReceipt.retryCount) : 'No live receipt'],
            ['Phase', keeperReceipt?.txHash ? keeperReceipt.phase ?? 'execute-mandate' : 'No live receipt'],
          ]}
          hashLabel="Receipt / log hash"
          hashValue={keeperReceipt?.logHash ?? evidence?.keeperHubReceiptHash}
        />

        <SponsorCard
          title="0G"
          role="Evidence memory"
          description="Stores the proof bundle, verdict inputs, and replayable evidence reference."
          icon={Database}
          status={integrationStatus?.zeroG}
          active={isZeroGActive}
          tone="violet"
          metrics={[
            ['Storage', evidence?.root ? evidence.storageMode : 'No 0G root'],
            ['Bytes', evidence?.byteSize ? String(evidence.byteSize) : 'No 0G root'],
            ['Verdict', run?.verificationReceipt ? evidence?.verificationResult ?? 'No verifier receipt' : 'No verifier receipt'],
          ]}
          hashLabel="Evidence root"
          hashValue={evidence?.root}
          flagged={isTampered}
        />
      </div>

      <div className="grid grid-cols-[0.72fr_1.28fr] gap-5">
        <VerifierJury verdicts={verdicts} quorum={quorum} active={isZeroGActive || verdicts.length > 0} tampered={isTampered} />
        <SwarmCoordination run={run} messages={messages} />
      </div>

      <div className="grid grid-cols-[1fr_1fr] gap-5">
        <EvidenceReceipt run={run} isTampered={isTampered} />
        <AgentLifecycle run={run} />
      </div>
    </section>
  );
}

function SponsorCard({
  title,
  role,
  description,
  icon: Icon,
  status,
  active,
  tone,
  metrics,
  hashLabel,
  hashValue,
  flagged = false,
}: {
  title: string;
  role: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  status?: IntegrationHealth;
  active: boolean;
  tone: 'blue' | 'gold' | 'violet';
  metrics: Array<[string, string]>;
  hashLabel: string;
  hashValue?: string;
  flagged?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'court-panel p-5',
        tone === 'blue' && 'shadow-[0_20px_70px_rgba(91,167,255,0.06)]',
        tone === 'gold' && 'shadow-[0_20px_70px_rgba(216,179,90,0.06)]',
        tone === 'violet' && 'shadow-[0_20px_70px_rgba(156,123,255,0.06)]',
      )}
    >
      <div className="mb-5 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-[10px] border',
              tone === 'blue' && 'border-[#5BA7FF]/28 bg-[#5BA7FF]/10 text-[#5BA7FF]',
              tone === 'gold' && 'border-primary/28 bg-primary/10 text-primary',
              tone === 'violet' && 'border-[#9C7BFF]/28 bg-[#9C7BFF]/10 text-[#9C7BFF]',
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-lg font-bold tracking-tight">{title}</h4>
            <p className="text-xs font-semibold text-white/48">{role}</p>
          </div>
        </div>
        <IntegrationBadge status={status} active={active} />
      </div>

      <p className="min-h-[44px] text-sm leading-6 text-white/52">{description}</p>

      <div className="mt-5 grid grid-cols-3 gap-2">
        {metrics.map(([label, value]) => (
          <div key={label} className="rounded-[9px] border border-white/8 bg-white/[0.03] p-3">
            <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/32">{label}</div>
            <div className="mt-1 truncate text-sm font-bold text-white/78">{value}</div>
          </div>
        ))}
      </div>

      <div className={cn('mt-4 rounded-[10px] border p-3', flagged ? 'border-[#EF4D5B]/35 bg-[#EF4D5B]/8' : 'border-white/8 bg-black/20')}>
        <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/38">
          {flagged ? <ShieldAlert className="h-3.5 w-3.5 text-[#EF4D5B]" /> : <Route className="h-3.5 w-3.5 text-white/35" />}
          {hashLabel}
        </div>
        <div className={cn('hash-text text-[11px]', flagged && 'text-[#FF8A96]')}>
          {hashValue || 'No live proof reference'}
        </div>
      </div>
    </motion.div>
  );
}

function VerifierJury({
  verdicts,
  quorum,
  active,
  tampered,
}: {
  verdicts: VerifierVerdict[];
  quorum?: ProofCourtRun['quorum'];
  active: boolean;
  tampered: boolean;
}) {
  const verifiers: VerifierVerdict['verifierId'][] = ['verifier-1', 'verifier-2', 'verifier-3'];

  return (
    <div className="court-panel p-5">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <p className="court-eyebrow">Verifier jury</p>
          <h4 className="mt-1 text-xl font-bold tracking-tight">2-of-3 proof quorum</h4>
        </div>
        <div className={cn('status-badge', tampered ? 'badge-blocked' : quorum?.reached ? 'badge-proof' : active ? 'badge-active' : 'badge-pending')}>
          <span className="status-dot" />
          {tampered ? 'Mismatch' : quorum?.reached ? `${quorum.passed} pass / ${quorum.failed} fail` : active ? 'Voting' : 'Waiting'}
        </div>
      </div>

      <div className="space-y-3">
        {verifiers.map((id) => {
          const verdict = verdicts.find((item) => item.verifierId === id);
          const passed = verdict?.decision === 'PASS';
          const failed = verdict?.decision === 'FAIL';
          const offline = verdict?.decision === 'OFFLINE';
          return (
            <div
              key={id}
              className={cn(
                'rounded-[10px] border p-3',
                !verdict && 'border-white/8 bg-white/[0.025]',
                passed && 'border-[#3DDC97]/25 bg-[#3DDC97]/8',
                failed && 'border-[#EF4D5B]/30 bg-[#EF4D5B]/8',
                offline && 'border-[#F6A94A]/30 bg-[#F6A94A]/8',
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold text-white/78">
                  <Vote className="h-4 w-4 text-white/35" />
                  {id.replace('-', ' ')}
                </div>
                <span className={cn('status-badge px-2 py-1 text-[8px]', passed ? 'badge-proof' : failed ? 'badge-blocked' : offline ? 'badge-risk' : 'badge-pending')}>
                  {verdict?.decision ?? 'No receipt'}
                </span>
              </div>
              {verdict && (
                <div className="mt-2 space-y-1 hash-text text-[10px]">
                  <div>verdict {verdict.verdictHash.slice(0, 34)}...</div>
                  <div>{verdict.attestationHash ? `chat ${verdict.attestationHash.slice(0, 18)}...` : 'No compute attestation'}</div>
                  <div>{verdict.promptHash ? `prompt ${verdict.promptHash.slice(0, 18)}...` : 'No prompt hash'}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EvidenceReceipt({ run, isTampered }: { run: ProofCourtRun | null; isTampered: boolean }) {
  const evidence = run?.evidence;
  const receipt = run?.verificationReceipt;

  return (
    <div className="court-panel p-5">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <p className="court-eyebrow">Proof surfaces</p>
          <h4 className="mt-1 text-xl font-bold tracking-tight">Agent proof custody</h4>
        </div>
        <div className={cn('status-badge', isTampered ? 'badge-blocked' : receipt?.proofPassed ? 'badge-proof' : 'badge-pending')}>
          <span className="status-dot" />
          {isTampered ? 'Blocked' : receipt?.proofPassed ? 'Verified' : 'Collecting'}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ProofLine icon={MessagesSquareIcon} label="AXL transcript" value={evidence?.axlTranscriptHash} />
        <ProofLine icon={Code2} label="KeeperHub receipt" value={evidence?.keeperHubReceiptHash} />
        <ProofLine icon={Database} label="0G evidence root" value={evidence?.root} danger={isTampered} />
        <ProofLine icon={Scale} label="0G memory root" value={run?.swarmMemory?.memoryRoot} />
      </div>

      {evidence?.verdictReason && (
        <div className="mt-4 rounded-[10px] border border-white/8 bg-black/20 p-4">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/38">0G compute verdict</div>
          <p className="text-sm leading-6 text-white/62">{evidence.verdictReason}</p>
          <div className="mt-2 text-xs text-white/38">
            Confidence {Math.round((evidence.verdictConfidence ?? 0) * 100)}%
            {evidence.verdictModel ? ` / ${evidence.verdictModel}` : ''}
          </div>
        </div>
      )}
    </div>
  );
}

function SwarmCoordination({ run, messages }: { run: ProofCourtRun | null; messages: ProofCourtRun['axlMessages'] }) {
  const hire = run?.agentHire;
  const latestMessage = messages.at(-1);

  return (
    <div className="court-panel p-5">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <p className="court-eyebrow">Swarm coordination</p>
          <h4 className="mt-1 text-xl font-bold tracking-tight">Requester hires worker, verifiers judge</h4>
        </div>
        <div className={cn('status-badge', hire ? 'badge-proof' : 'badge-pending')}>
          <span className="status-dot" />
          {hire ? 'Agent hired' : 'No hire receipt'}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ProofLine icon={Route} label="Requester -> Worker" value={hire ? `${hire.requesterAgentId} hired ${hire.workerAgentId}` : undefined} />
        <ProofLine icon={MessagesSquareIcon} label="AXL transcript" value={run?.evidence.axlTranscriptHash} />
        <ProofLine icon={Database} label="Shared memory" value={run?.swarmMemory?.memoryRoot} />
        <ProofLine icon={Scale} label="Latest envelope" value={latestMessage ? `${latestMessage.from} -> ${latestMessage.to}` : undefined} />
      </div>
    </div>
  );
}

function AgentLifecycle({ run }: { run: ProofCourtRun | null }) {
  const worker = run?.agents.find((agent) => agent.id === run.agentSla?.workerAgentId);
  const earned = run?.settlementReceipt?.escrowStatus === 'Released'
    ? run.settlementReceipt.fundedAmount
    : undefined;
  const earningsOrPenalty = earned ?? (run?.verificationReceipt ? `${run.verificationReceipt.scoreDelta} trust delta` : undefined);

  return (
    <div className="court-panel p-5">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <p className="court-eyebrow">Agent lifecycle</p>
          <h4 className="mt-1 text-xl font-bold tracking-tight">Own, remember, execute, earn</h4>
        </div>
        <div className={cn('status-badge', worker?.inft ? 'badge-proof' : 'badge-pending')}>
          <span className="status-dot" />
          {worker?.inft ? `iNFT #${worker.inft.tokenId}` : 'No live iNFT'}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ProofLine icon={Database} label="Intelligence root" value={worker?.inft?.intelligencePointer} />
        <ProofLine icon={Database} label="Memory root" value={worker?.inft?.memoryRoot} />
        <ProofLine icon={Zap} label="Task action" value={run?.agentSla?.taskActionType} />
        <ProofLine icon={Scale} label="Earned / penalty" value={earningsOrPenalty} />
      </div>
    </div>
  );
}

function ProofLine({
  icon: Icon,
  label,
  value,
  danger = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value?: string;
  danger?: boolean;
}) {
  return (
    <div className={cn('rounded-[10px] border p-3', danger ? 'border-[#EF4D5B]/35 bg-[#EF4D5B]/8' : 'border-white/8 bg-white/[0.025]')}>
      <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">
        <Icon className={cn('h-3.5 w-3.5', danger ? 'text-[#EF4D5B]' : 'text-primary')} />
        {label}
      </div>
      <div className={cn('hash-text text-[10px]', danger && 'text-[#FF8A96]')}>{value || 'No live receipt'}</div>
    </div>
  );
}

function IntegrationBadge({ status, active }: { status?: IntegrationHealth; active: boolean }) {
  const isLiveReady = status?.configured;

  return (
    <span
      className={cn(
        'status-badge px-2 py-1 text-[8px]',
        isLiveReady ? 'badge-proof' : active ? 'badge-active' : 'badge-pending',
      )}
      title={status?.endpoint ?? 'No endpoint configured'}
    >
      <span className="status-dot" />
      {isLiveReady ? 'Ready' : active ? 'Active' : 'Waiting'}
    </span>
  );
}

function MessagesSquareIcon({ className }: { className?: string }) {
  return <MessagesSquare className={className} />;
}
