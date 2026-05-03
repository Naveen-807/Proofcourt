import React from 'react';
import { motion } from 'motion/react';
import { Agent, AppState, ProofCourtRun } from '../types';
import { CheckCircle2, Database, ExternalLink, Fingerprint, Handshake, ShieldCheck, UserCheck, XCircle } from 'lucide-react';
import { cn } from '../lib/utils';

interface Props {
  agents: Agent[];
  state: AppState;
  run: ProofCourtRun | null;
}

export default function AgentRegistry({ agents, state, run }: Props) {
  const isAgentSelectedState = ['agents_selected', 'prepare_running', 'permit_issued', 'payout_locked', 'commit_running', 'execution_complete', 'evidence_stored', 'proof_verified', 'payout_released', 'reputation_updated', 'tamper_detected', 'payout_blocked'].includes(state);
  const selectedAgents = agents.filter((agent) => agent.score >= 80 || agent.status === 'System');
  const averageScore = selectedAgents.length > 0
    ? String(Math.round(selectedAgents.reduce((sum, agent) => sum + agent.score, 0) / selectedAgents.length))
    : '--';

  return (
    <section className="court-panel p-5">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <p className="court-eyebrow">AgentDNS</p>
          <h3 className="mt-1 text-xl font-bold tracking-tight">Onchain + 0G agents</h3>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-[#3DDC97]">{averageScore}</div>
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">Avg trust</div>
        </div>
      </div>

      <div className="mb-5 rounded-[12px] border border-white/8 bg-white/[0.03] p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold text-white/78">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Minimum score
          </div>
          <span className="status-badge badge-permit">80 required</span>
        </div>
        <p className="mt-2 text-xs leading-5 text-white/45">
          Agents are resolved from Agent iNFT ownership, 0G metadata pointers, and onchain reputation before Phase 1 can advance.
        </p>
      </div>

      <div className="space-y-3">
        {agents.length === 0 && (
          <div className="rounded-[12px] border border-white/8 bg-white/[0.025] p-4 text-sm leading-6 text-white/52">
            No AgentDNS records loaded. Configure real Agent iNFT token IDs before Phase 1 can form a quorum.
          </div>
        )}
        {agents.map((agent, index) => {
          const isSelected = agent.score >= 80 || agent.status === 'System';
          const receipt = run?.verificationReceipt?.executorAgentId === agent.id ? run.verificationReceipt : null;
          const wasHired = run?.agentHire?.workerAgentId === agent.id;
          const earnedAmount = wasHired && run?.settlementReceipt?.escrowStatus === 'Released'
            ? run.settlementReceipt.fundedAmount
            : agent.inft?.royaltiesEarned;

          return (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              className={cn(
                'rounded-[12px] border p-4',
                isSelected ? 'border-white/10 bg-white/[0.035]' : 'border-[#EF4D5B]/18 bg-[#EF4D5B]/6 opacity-70',
                isAgentSelectedState && isSelected && 'ring-1 ring-primary/20',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border font-bold',
                      agent.status === 'System' ? 'border-[#5BA7FF]/30 bg-[#5BA7FF]/12 text-[#5BA7FF]' : 'border-primary/24 bg-primary/10 text-primary',
                    )}
                  >
                    {agent.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-white/86">{agent.name}</div>
                    <div className="mt-0.5 text-xs text-white/42">{agent.role} Agent</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={cn('text-lg font-bold', agent.score >= 90 ? 'text-[#3DDC97]' : agent.score >= 80 ? 'text-primary' : 'text-[#EF4D5B]')}>
                    {agent.score}
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/34">score</div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-[10px]">
                <AgentStat label="Executions" value={String(agent.executions)} />
                <AgentStat label="Blocks" value={String(agent.blocks)} />
              </div>

              {agent.inft && (
                <div className="mt-3 rounded-[10px] border border-white/8 bg-black/20 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/38">
                      <Fingerprint className="h-3.5 w-3.5 text-primary" />
                      Agent iNFT #{agent.inft.tokenId}
                    </div>
                    {agent.inft.explorerUrl && (
                      <a
                        href={agent.inft.explorerUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-primary hover:text-white"
                      >
                        Explorer
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <div className="hash-text mb-1 text-[10px]">{agent.inft.metadataURI}</div>
                  <div className="hash-text text-[10px]">{agent.inft.intelligencePointer}</div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
                    <AgentStat label="Memory root" value={agent.inft.memoryRoot ? `${agent.inft.memoryRoot.slice(0, 16)}...` : 'No 0G memory root'} />
                    <AgentStat label="Earned" value={earnedAmount ?? 'No live earnings'} />
                  </div>
                </div>
              )}

              {wasHired && run?.agentHire && (
                <div className="mt-3 rounded-[10px] border border-[#3DDC97]/25 bg-[#3DDC97]/8 p-3 text-xs text-[#3DDC97]">
                  <div className="flex items-center gap-2 font-bold">
                    <Handshake className="h-4 w-4" />
                    Hired for this case
                  </div>
                  <div className="mt-1 hash-text text-[10px] text-white/50">
                    SLA {run.agentHire.slaHash.slice(0, 18)}... / AgentDNS {run.agentHire.agentDnsResolutionHash.slice(0, 18)}...
                  </div>
                </div>
              )}

              {receipt && (
                <div className={cn('mt-3 rounded-[10px] border p-3 text-xs', receipt.proofPassed ? 'border-[#3DDC97]/25 bg-[#3DDC97]/8 text-[#3DDC97]' : 'border-[#EF4D5B]/30 bg-[#EF4D5B]/8 text-[#FF8A96]')}>
                  <div className="flex items-center justify-between font-bold">
                    <span>Receipt score delta</span>
                    <span>{receipt.scoreDelta > 0 ? '+' : ''}{receipt.scoreDelta}</span>
                  </div>
                  <div className="mt-1 text-white/45">
                    {receipt.trustScoreBefore} to {receipt.trustScoreAfter} from {receipt.source.replaceAll('_', ' ')}
                  </div>
                </div>
              )}

              {isAgentSelectedState && (
                <div className={cn('mt-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em]', isSelected ? 'text-[#3DDC97]' : 'text-[#EF4D5B]')}>
                  {isSelected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                  {isSelected ? 'Selected for workflow' : 'Rejected below threshold'}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {isAgentSelectedState && agents.length > 0 && (
        <div className="mt-5 rounded-[12px] border border-[#3DDC97]/22 bg-[#3DDC97]/8 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-[#3DDC97]">
            <UserCheck className="h-4 w-4" />
            Permit quorum formed
          </div>
          <p className="mt-2 text-xs leading-5 text-white/55">
            Owner, worker, verifier, and settlement roles are separated before execution. Each selected agent carries an iNFT identity and 0G memory root.
          </p>
        </div>
      )}

      {run?.swarmMemory && (
        <div className="mt-5 rounded-[12px] border border-[#9C7BFF]/24 bg-[#9C7BFF]/8 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-[#C7B8FF]">
            <Database className="h-4 w-4" />
            Shared 0G swarm memory
          </div>
          <div className="hash-text mt-2 text-[10px] text-white/58">{run.swarmMemory.memoryRoot}</div>
        </div>
      )}
    </section>
  );
}

function AgentStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[9px] border border-white/8 bg-black/18 p-2">
      <div className="font-bold uppercase tracking-[0.12em] text-white/30">{label}</div>
      <div className="mt-0.5 font-mono text-white/70">{value}</div>
    </div>
  );
}
