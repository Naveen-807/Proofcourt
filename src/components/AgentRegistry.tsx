import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Agent, AppState, ProofCourtRun } from '../types';
import { Shield, Check, X, AlertTriangle, Fingerprint, TrendingUp, Cpu } from 'lucide-react';
import { cn } from '../lib/utils';

interface Props {
  agents: Agent[];
  state: AppState;
  run: ProofCourtRun | null;
}

export default function AgentRegistry({ agents, state, run }: Props) {
  const isAgentSelectedState = ['agents_selected', 'prepare_running', 'permit_issued', 'payout_locked', 'commit_running', 'execution_complete', 'evidence_stored', 'proof_verified', 'payout_released', 'reputation_updated', 'tamper_detected', 'payout_blocked'].includes(state);

  const selectedAgents = agents.filter(a => a.score >= 80 || a.status === 'System');
  const rejectedAgents = agents.filter(a => a.score < 80 && a.status !== 'System');

  return (
    <div className="glass-panel tech-card p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between mb-2 relative z-10">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Cpu className="w-3.5 h-3.5 text-primary" />
            <h3 className="text-xs font-bold uppercase tracking-[0.3em] text-white/50">Agent Registry</h3>
          </div>
          <p className="text-[10px] text-white/20 font-mono tracking-widest">REGISTRY_UPTIME: 1,482H</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="px-2 py-1 rounded-sm border border-white/10 bg-white/5 text-[9px] font-mono text-white/40">
            MIN_SCORE: 80
          </div>
          <span className="text-[8px] text-white/10 font-bold uppercase tracking-widest">Active Search Enabled</span>
        </div>
      </div>

      <div className="space-y-3">
        {agents.map((agent) => {
          const isSelected = agent.score >= 80 || agent.status === 'System';
          const isProcessing = isAgentSelectedState && isSelected;
          const receipt = run?.verificationReceipt?.executorAgentId === agent.id ? run.verificationReceipt : null;
          
          return (
            <motion.div
              key={agent.id}
              className={cn(
                "p-3 border rounded-sm transition-all duration-500",
                isSelected ? "bg-white/5 border-white/10" : "bg-black/40 border-white/5 opacity-50 grayscale",
                isProcessing && isSelected && "border-primary/50 ring-1 ring-primary/20"
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "w-8 h-8 rounded-sm flex items-center justify-center font-bold text-xs",
                    agent.status === 'System' ? "bg-white text-black" : "bg-white/10 text-white"
                  )}>
                    {agent.name.charAt(0)}
                  </div>
                  <div>
                    <div className="text-xs font-medium">{agent.name}</div>
                    <div className="text-[10px] text-white/40">{agent.role} Agent</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={cn(
                    "text-sm font-mono font-bold",
                    agent.score >= 90 ? "text-green-500" : agent.score >= 80 ? "text-primary" : "text-white/40"
                  )}>
                    {agent.score}/100
                  </div>
                  <div className={cn(
                    "text-[9px] uppercase font-bold",
                    agent.status === 'Trusted' && "text-green-500/80",
                    agent.status === 'System' && "text-blue-400",
                    agent.status === 'Caution' && "text-yellow-500",
                    agent.status === 'Suspended' && "text-red-500",
                  )}>
                    {agent.status}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-white/5 text-[9px] font-mono text-white/40">
                <div>EXECUTIONS: <span className="text-white/60">{agent.executions}</span></div>
                <div>BLOCKS: <span className="text-white/60">{agent.blocks}</span></div>
              </div>

              {agent.inft && (
                <div className="mt-3 rounded-sm border border-white/10 bg-black/25 p-2 text-[9px] font-mono text-white/45">
                  <div className="flex items-center gap-1 text-primary/80">
                    <Fingerprint className="h-3 w-3" />
                    <span>iNFT #{agent.inft.tokenId}</span>
                  </div>
                  <div className="mt-1 break-all">pointer: {agent.inft.intelligencePointer}</div>
                  <div className="mt-1 flex justify-between">
                    <span>royalty</span>
                    <span>{agent.inft.royaltyBps / 100}%</span>
                  </div>
                </div>
              )}

              {receipt && (
                <div className={cn(
                  "mt-3 rounded-sm border p-2 text-[9px] font-mono",
                  receipt.proofPassed
                    ? "border-green-500/30 bg-green-500/10 text-green-300"
                    : "border-red-500/30 bg-red-500/10 text-red-300",
                )}>
                  <div className="flex items-center justify-between">
                    <span>RECEIPT SCORE DELTA</span>
                    <span>{receipt.scoreDelta > 0 ? '+' : ''}{receipt.scoreDelta}</span>
                  </div>
                  <div className="mt-1 text-white/45">
                    {receipt.trustScoreBefore} → {receipt.trustScoreAfter} from {receipt.source.replaceAll('_', ' ')}
                  </div>
                </div>
              )}

              {isAgentSelectedState && (
                <div className="mt-2">
                  {isSelected ? (
                    <div className="flex items-center gap-1 text-[9px] text-green-500 font-bold uppercase tracking-tighter">
                      <Check className="w-3 h-3" /> Selected For Workflow
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-[9px] text-red-500/60 font-bold uppercase tracking-tighter">
                      <X className="w-3 h-3" /> Rejected: Below Threshold
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      <AnimatePresence>
        {isAgentSelectedState && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="pt-4 border-t border-white/10"
          >
            <div className="bg-primary/10 border border-primary/20 p-3 rounded-sm">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-primary" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Consensus Formed</span>
              </div>
              <p className="text-[11px] text-white/60 leading-relaxed">
                Permit quorum formed across owner, specialist, executor, and judge roles.
                Identity and memory are linked through agent iNFT pointers.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
