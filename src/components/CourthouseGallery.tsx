import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Scale, CheckCircle2, XCircle, Clock, ExternalLink, RefreshCw, Database, Vote, Copy, RotateCcw } from 'lucide-react';
import { cn } from '../lib/utils';

interface CaseSummary {
  id: string;
  state: string;
  createdAt?: string;
  mandate?: { intent?: string; title?: string };
  quorum?: { passed: number; failed: number; reached: boolean };
  zeroGRoot?: string;
  txHash?: string;
  evidence?: Record<string, unknown>;
  verdicts?: Array<{
    verifierId: string;
    decision: string;
    reasoningHash: string;
    attestationHash?: string;
    verdictHash: string;
  }>;
  verificationReceipt?: {
    scoreDelta: number;
    trustScoreBefore: number;
    trustScoreAfter: number;
    verificationHash: string;
  };
  settlementReceipt?: {
    commitTxHash?: string;
    abortTxHash?: string;
    escrowStatus?: string;
  };
  settlementKeeperHubReceipt?: {
    executionId?: string;
    txHash?: string;
    workflowId?: string;
  };
  reputationTxHash?: string;
  reputationUpdateMode?: string;
  reputationError?: string;
  runtimeKeeperHubWorkflow?: { workflowId: string; name: string };
  agentInftAddress?: string | null;
  agents?: Array<{ id: string; name: string; inft?: { tokenId: string } }>;
}

interface GalleryResponse {
  cases: CaseSummary[];
  total: number;
}

const TERMINAL_STATES = new Set([
  'payout_released',
  'reputation_updated',
  'payout_blocked',
  'tamper_detected',
]);

const PASS_STATES = new Set(['payout_released', 'reputation_updated']);

function StateChip({ state }: { state: string }) {
  const isPassed = PASS_STATES.has(state);
  const isFailed = state === 'payout_blocked' || state === 'tamper_detected';
  const isTerminal = TERMINAL_STATES.has(state);
  return (
    <span
      className={cn(
        'status-badge px-2 py-1 text-[8px]',
        isPassed && 'badge-proof',
        isFailed && 'badge-blocked',
        !isTerminal && 'badge-permit',
      )}
    >
      {state.replace(/_/g, ' ')}
    </span>
  );
}

function QuorumBadge({ quorum }: { quorum?: CaseSummary['quorum'] }) {
  if (!quorum) return <span className="text-white/20 text-[9px]">awaiting jury</span>;
  return (
    <span
      className={cn(
        'flex items-center gap-1 text-[9px] font-mono',
        quorum.reached && quorum.passed >= 2 ? 'text-green-400' : 'text-red-400',
      )}
    >
      <Vote className="w-3 h-3" />
      {quorum.passed}/3 PASS
    </span>
  );
}

export default function CourthouseGallery() {
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replaying, setReplaying] = useState<string | null>(null);

  const fetchCases = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/cases');
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = (await res.json()) as GalleryResponse;
      // Show newest first
      setCases([...data.cases].reverse());
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cases');
    } finally {
      setLoading(false);
    }
  };

  const replayCase = async (caseId: string) => {
    setReplaying(caseId);
    setError(null);
    try {
      const res = await fetch(`/api/runs/${caseId}/replay`);
      if (!res.ok) throw new Error(`Replay API ${res.status}`);
      await fetchCases();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to replay case');
    } finally {
      setReplaying(null);
    }
  };

  const copyText = async (value: string) => {
    await navigator.clipboard?.writeText(value).catch(() => undefined);
  };

  useEffect(() => {
    fetchCases();
    // Auto-refresh every 5s while page is open
    const interval = setInterval(fetchCases, 5_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="flex flex-col gap-6">
      {/* Header */}
      <div className="court-panel p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-primary/30 bg-primary/10">
            <Scale className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="court-eyebrow">Case archive</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight">Replayable proof records</h2>
            <p className="mt-1 text-xs text-white/42">
              {total} case{total !== 1 ? 's' : ''} on record
            </p>
          </div>
        </div>
        <button
          onClick={fetchCases}
          className="court-button court-button-secondary"
        >
          <RefreshCw className="w-3 h-3" />
          Refresh
        </button>
      </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="court-panel border-[#EF4D5B]/30 bg-[#EF4D5B]/10 p-4 text-sm text-red-100">
          Case archive API unavailable: {error}. Start <span className="font-mono text-white">npm run api</span>.
        </div>
      )}

      {/* Loading skeleton */}
      {loading && cases.length === 0 && (
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="court-panel p-4 animate-pulse">
              <div className="h-3 bg-white/10 rounded w-3/4 mb-3" />
              <div className="h-2 bg-white/5 rounded w-1/2 mb-2" />
              <div className="h-2 bg-white/5 rounded w-2/3" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && cases.length === 0 && !error && (
        <div className="court-panel flex flex-col items-center gap-4 p-12 text-center">
          <Scale className="w-8 h-8 text-white/20" />
          <div className="text-lg font-bold text-white/72">No proof cases yet</div>
          <div className="text-sm text-white/42">Request a permit in the courtroom to create the first replayable record.</div>
        </div>
      )}

      {/* Case cards */}
      <div className="grid grid-cols-3 gap-4">
        {cases.map((c, i) => {
          const isPassed = PASS_STATES.has(c.state);
          const isFailed = c.state === 'payout_blocked' || c.state === 'tamper_detected';
          const isTerminal = TERMINAL_STATES.has(c.state);
          const title = c.mandate?.title ?? c.mandate?.intent ?? 'Unnamed case';

          return (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={cn(
                'court-panel flex flex-col gap-3 border p-4 text-xs',
                isPassed && 'border-[#3DDC97]/20',
                isFailed && 'border-[#EF4D5B]/20',
                !isTerminal && 'border-white/8',
              )}
            >
              {/* Title row */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {isPassed && <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />}
                  {isFailed && <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                  {!isTerminal && <Clock className="w-3.5 h-3.5 text-yellow-400 shrink-0" />}
                  <span className="truncate text-sm font-bold text-white/84">{title}</span>
                </div>
                <StateChip state={c.state} />
              </div>

              {/* Case ID */}
              <div className="hash-text truncate text-[10px]">{c.id}</div>

              {/* Quorum */}
              <div className="flex items-center justify-between border-t border-white/5 pt-2">
                <QuorumBadge quorum={c.quorum} />
                {c.createdAt && (
                  <span className="text-white/20 text-[8px]">
                    {new Date(c.createdAt).toLocaleTimeString()}
                  </span>
                )}
              </div>

              {/* Evidence links */}
              <div className="flex flex-col gap-1">
                {c.zeroGRoot && (
                  <div className="flex items-center gap-1.5 text-[10px] text-white/45">
                    <Database className="w-3 h-3 text-blue-400/80" />
                    <button
                      type="button"
                      onClick={() => copyText(c.zeroGRoot!)}
                      className="truncate text-left hover:text-white/70"
                      title="Copy 0G Storage root"
                    >
                      Evidence root: {c.zeroGRoot.slice(0, 34)}...
                    </button>
                    <Copy className="w-3 h-3 text-white/25" />
                  </div>
                )}
                {c.txHash && (
                  <a
                    href={`https://chainscan-galileo.0g.ai/tx/${c.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-[10px] text-primary/70 transition-colors hover:text-primary"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span className="truncate">Tx: {c.txHash.slice(0, 20)}…</span>
                  </a>
                )}
              </div>

              {c.zeroGRoot && (
                <button
                  type="button"
                  onClick={() => replayCase(c.id)}
                  disabled={replaying === c.id}
                  className="court-button court-button-secondary min-h-0 py-2 text-[10px] text-[#5BA7FF] disabled:opacity-50"
                >
                  <RotateCcw className={cn('w-3 h-3', replaying === c.id && 'animate-spin')} />
                  Replay from 0G
                </button>
              )}

              {(c.verdicts?.length || c.verificationReceipt || c.settlementReceipt || c.reputationTxHash) && (
                <div className="space-y-2 rounded-[10px] border border-white/8 bg-black/20 p-3 text-[10px] text-white/45">
                  {c.verdicts?.map((verdict) => (
                    <div key={verdict.verdictHash} className="flex items-center justify-between gap-2">
                      <span className={verdict.decision === 'PASS' ? 'text-green-400' : 'text-red-400'}>
                        {verdict.verifierId}: {verdict.decision}
                      </span>
                      <span className="truncate">reason {verdict.reasoningHash.slice(0, 10)}</span>
                      {verdict.attestationHash && <span className="truncate">TEE {verdict.attestationHash.slice(0, 10)}</span>}
                    </div>
                  ))}
                  {c.settlementReceipt && (
                    <div className="truncate">
                      Final decision: {c.settlementReceipt.escrowStatus} · {(c.settlementReceipt.commitTxHash ?? c.settlementReceipt.abortTxHash ?? 'No live settlement tx').slice(0, 18)}
                    </div>
                  )}
                  {c.verificationReceipt && (
                    <div className={c.verificationReceipt.scoreDelta >= 0 ? 'text-green-400' : 'text-red-400'}>
                      Trust score: {c.verificationReceipt.trustScoreBefore} {'->'} {c.verificationReceipt.trustScoreAfter} ({c.verificationReceipt.scoreDelta})
                    </div>
                  )}
                  {c.reputationTxHash && (
                    <a
                      href={`https://chainscan-galileo.0g.ai/tx/${c.reputationTxHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-primary/70 hover:text-primary"
                    >
                      <ExternalLink className="w-3 h-3" />
                      iNFT reputation tx
                    </a>
                  )}
                  {c.reputationUpdateMode === 'error' && (
                    <div className="text-red-300">
                      iNFT update failed: {c.reputationError ?? 'contract transaction failed'}
                    </div>
                  )}
                  {c.runtimeKeeperHubWorkflow && (
                    <div className="truncate text-[#5BA7FF]/80">
                      KeeperHub workflow: {c.runtimeKeeperHubWorkflow.workflowId}
                    </div>
                  )}
                </div>
              )}

              {c.agentInftAddress && c.agents?.some((agent) => agent.inft) && (
                <div className="flex flex-wrap gap-1 border-t border-white/5 pt-2">
                  {c.agents.filter((agent) => agent.inft).map((agent) => (
                    <a
                      key={`${c.id}-${agent.id}`}
                      href={`https://chainscan-galileo.0g.ai/address/${c.agentInftAddress}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-sm border border-white/10 px-1.5 py-0.5 text-[8px] text-white/35 hover:text-white/70"
                    >
                      {agent.name} #{agent.inft?.tokenId}
                    </a>
                  ))}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Live indicator */}
      {!loading && (
        <div className="flex items-center gap-2 text-[9px] font-mono text-white/20 uppercase tracking-widest">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          Live — refreshes every 5s
        </div>
      )}
    </section>
  );
}
