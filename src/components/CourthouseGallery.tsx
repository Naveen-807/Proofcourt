import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Scale, CheckCircle2, XCircle, Clock, ExternalLink, RefreshCw, Database, Vote } from 'lucide-react';
import { cn } from '../lib/utils';

interface CaseSummary {
  id: string;
  state: string;
  createdAt?: string;
  mandate?: { intent?: string; title?: string };
  quorum?: { passed: number; failed: number; reached: boolean };
  zeroGRoot?: string;
  txHash?: string;
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
        'text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm border',
        isPassed && 'border-green-500/30 bg-green-500/10 text-green-400',
        isFailed && 'border-red-500/30 bg-red-500/10 text-red-400',
        !isTerminal && 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400',
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

  useEffect(() => {
    fetchCases();
    // Auto-refresh every 5s while page is open
    const interval = setInterval(fetchCases, 5_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary/10 border border-primary/30 flex items-center justify-center rounded-sm">
            <Scale className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold tracking-tight">Courthouse Gallery</h2>
            <p className="text-[10px] uppercase tracking-widest text-white/40 font-bold -mt-0.5">
              {total} case{total !== 1 ? 's' : ''} on record
            </p>
          </div>
        </div>
        <button
          onClick={fetchCases}
          className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors border border-white/10 rounded-sm px-3 py-1.5"
        >
          <RefreshCw className="w-3 h-3" />
          Refresh
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="glass-panel border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-200 font-mono">
          {error} — make sure <span className="text-white">npm run api</span> is running.
        </div>
      )}

      {/* Loading skeleton */}
      {loading && cases.length === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass-panel p-4 animate-pulse">
              <div className="h-3 bg-white/10 rounded w-3/4 mb-3" />
              <div className="h-2 bg-white/5 rounded w-1/2 mb-2" />
              <div className="h-2 bg-white/5 rounded w-2/3" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && cases.length === 0 && !error && (
        <div className="glass-panel p-12 flex flex-col items-center gap-4 text-center">
          <Scale className="w-8 h-8 text-white/20" />
          <div className="text-sm text-white/40">No cases yet.</div>
          <div className="text-xs text-white/20">
            Submit a mandate above to open the first case.
          </div>
        </div>
      )}

      {/* Case cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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
                'glass-panel p-4 flex flex-col gap-3 font-mono text-xs border',
                isPassed && 'border-green-500/20',
                isFailed && 'border-red-500/20',
                !isTerminal && 'border-white/8',
              )}
            >
              {/* Title row */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {isPassed && <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />}
                  {isFailed && <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                  {!isTerminal && <Clock className="w-3.5 h-3.5 text-yellow-400 shrink-0" />}
                  <span className="truncate text-white/80 font-bold text-[10px] uppercase tracking-wider">{title}</span>
                </div>
                <StateChip state={c.state} />
              </div>

              {/* Case ID */}
              <div className="text-white/30 text-[9px] truncate">{c.id}</div>

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
                  <div className="flex items-center gap-1.5 text-[9px] text-white/30 hover:text-white/60 transition-colors">
                    <Database className="w-3 h-3 text-blue-400/60" />
                    <span className="truncate">0G: {c.zeroGRoot.slice(0, 32)}…</span>
                  </div>
                )}
                {c.txHash && (
                  <a
                    href={`https://chainscan-galileo.0g.ai/tx/${c.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-[9px] text-primary/60 hover:text-primary transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span className="truncate">Tx: {c.txHash.slice(0, 20)}…</span>
                  </a>
                )}
              </div>
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
