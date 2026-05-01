import React from 'react';
import { motion } from 'motion/react';
import type { AppState, ProofCourtRun, VerifierVerdict } from '../types';
import { cn } from '../lib/utils';
import { Code, Terminal, Database, ShieldAlert, CheckCircle, Scale, Vote } from 'lucide-react';
import type { IntegrationHealth, IntegrationStatus } from '../api/proofcourtClient';

interface Props {
  state: AppState;
  isTampered: boolean;
  run: ProofCourtRun | null;
  integrationStatus: IntegrationStatus | null;
}

export default function SponsorProofPanels({ state, isTampered, run, integrationStatus }: Props) {
  const isAxlActive = ['permit_issued', 'payout_locked', 'commit_running', 'execution_complete', 'evidence_stored', 'proof_verified', 'payout_released', 'reputation_updated', 'tamper_detected', 'payout_blocked'].includes(state);
  const isKeeperActive = ['execution_complete', 'evidence_stored', 'proof_verified', 'payout_released', 'reputation_updated', 'tamper_detected', 'payout_blocked'].includes(state);
  const isZeroGActive = ['evidence_stored', 'proof_verified', 'payout_released', 'reputation_updated', 'tamper_detected', 'payout_blocked'].includes(state);
  const visibleMessages = run?.axlMessages ?? [];
  const verdicts = run?.verdicts ?? [];
  const quorum = run?.quorum;
  const keeperReceipt = run?.keeperHubReceipt;
  const keeperPhases = [
    run?.proofTrialReceipt,
    run?.keeperHubReceipt,
    run?.settlementKeeperHubReceipt,
  ].filter(Boolean);
  const evidence = run?.evidence;

  const isJuryActive = quorum !== undefined || verdicts.length > 0 || ['proof_verified', 'payout_released', 'reputation_updated', 'payout_blocked', 'tamper_detected'].includes(state);
  const juryVerifiers: Array<'verifier-1' | 'verifier-2' | 'verifier-3'> = ['verifier-1', 'verifier-2', 'verifier-3'];

  return (
    <div className="space-y-6">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* AXL Message Log */}
      <div className="glass-panel p-4 flex flex-col h-[300px]">
        <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-3">
          <Terminal className="w-4 h-4 text-primary" />
          <h4 className="text-xs font-bold uppercase tracking-widest">AXL Message Log</h4>
          <IntegrationBadge status={integrationStatus?.axl} />
        </div>
        <div className="flex-1 font-mono text-[10px] space-y-3 overflow-y-auto custom-scrollbar">
          {!isAxlActive ? (
            <div className="text-white/20 italic">Awaiting communication...</div>
          ) : (
            <>
              {visibleMessages.map((message, index) => (
                <div
                  key={message.id}
                  className={cn(
                    "text-green-500/80",
                    index === visibleMessages.length - 1 && !isZeroGActive && "text-primary/80 animate-pulse",
                  )}
                >
                  <span className="text-white/20">[{new Date(message.timestamp).toLocaleTimeString()}]</span> ID: {message.id} <br />
                  {message.from.toUpperCase()} -&gt; {message.to.toUpperCase()}: {message.type}
                  {message.messageId && <div className="text-white/25">message: {message.messageId}</div>}
                  {message.envelope && <div className="text-white/25">envelope: {message.envelope.toUpperCase()}</div>}
                  {message.nodeId && <div className="text-white/25">node: {message.nodeId}</div>}
                  {message.payloadHash && <div className="text-white/20">payload: {message.payloadHash}</div>}
                  <div className="text-white/20">hash: {message.hash}</div>
                  {message.mode && <div className="text-white/15">mode: {message.mode}</div>}
                </div>
              ))}
              {evidence?.axlTranscriptHash && (
                <div className="border-t border-white/5 pt-2 text-primary/80">
                  transcript: {evidence.axlTranscriptHash}
                </div>
              )}
              {integrationStatus?.axl?.nodes && integrationStatus.axl.nodes.length > 0 && (
                <div className="border-t border-white/5 pt-2">
                  <div className="mb-1 text-[9px] uppercase tracking-widest text-white/30">AXL Topology</div>
                  {integrationStatus.axl.nodes.map((node) => (
                    <div key={`${node.role}-${node.endpoint}`} className="text-white/25">
                      {node.role}: {node.nodeId ?? 'offline'} / peers {node.peerCount} / {node.status}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* KeeperHub Receipt */}
      <div className="glass-panel p-4 flex flex-col h-[300px]">
        <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-3">
          <Code className="w-4 h-4 text-primary" />
          <h4 className="text-xs font-bold uppercase tracking-widest">KeeperHub Receipt</h4>
          <IntegrationBadge status={integrationStatus?.keeperHub} />
        </div>
        <div className="flex-1 flex flex-col justify-center">
          {!isKeeperActive ? (
            <div className="text-center space-y-2">
              <div className="w-8 h-8 rounded-full border-2 border-dashed border-white/10 mx-auto" />
              <div className="text-[10px] text-white/20 uppercase font-bold tracking-widest">Awaiting Execution</div>
            </div>
          ) : (
            <div className="space-y-4 font-mono text-[11px] bg-black/40 p-4 border border-white/5 rounded-sm">
              <div className="flex justify-between">
                <span className="text-white/40">Execution ID:</span>
                <span>{keeperReceipt?.executionId ?? keeperReceipt?.workflowId ?? 'kh_pending'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Status:</span>
                <span className="text-green-500">{keeperReceipt?.status ?? 'Completed'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Action:</span>
                <span>{keeperReceipt?.action ?? 'vaultDeposit(1 ETH)'}</span>
              </div>
              <div className="flex flex-col gap-1 border-t border-white/5 pt-3">
                <span className="text-white/40">Tx Hash:</span>
                <span className="text-[10px] break-all">{keeperReceipt?.txHash || (isTampered ? "0xDEAD...BEEF" : "0xabc...789")}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-white/40">Log Hash:</span>
                <span className="text-[10px] break-all">{keeperReceipt?.logHash ?? 'pending'}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-white/20">Gas Optimized:</span>
                <span className="text-white/40">{keeperReceipt?.gasOptimized ? 'Yes' : 'Pending'}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-white/20">Retry Count:</span>
                <span className="text-white/40">{keeperReceipt?.retryCount ?? 0}</span>
              </div>
              {keeperReceipt?.logs?.slice(-2).map((entry) => (
                <div key={`${entry.node}-${entry.timestamp}`} className="border-t border-white/5 pt-2 text-[9px] text-white/35">
                  <span className="text-white/60">{entry.node}</span>: {entry.message}
                </div>
              ))}
              {keeperPhases.length > 0 && (
                <div className="border-t border-white/5 pt-2 space-y-1">
                  <div className="text-[9px] uppercase tracking-widest text-white/30">Phase Receipts</div>
                  {keeperPhases.map((phase) => (
                    <div key={`${phase!.phase}-${phase!.executionId ?? phase!.workflowId}`} className="text-[9px] text-white/40">
                      <span className="text-white/60">{phase!.phase ?? 'execute-mandate'}</span>
                      {' '}id {phase!.executionId ?? phase!.workflowId}
                      {phase!.logHash && <span> / log {phase!.logHash.slice(0, 12)}</span>}
                    </div>
                  ))}
                  {integrationStatus?.keeperHub?.workflows?.map((workflow) => (
                    <div key={`${workflow.phase}-${workflow.workflowId}`} className="text-[8px] text-white/25">
                      configured {workflow.phase}: {workflow.workflowId}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 0G Evidence */}
      <div className="glass-panel p-4 flex flex-col h-[300px]">
        <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-3">
          <Database className="w-4 h-4 text-primary" />
          <h4 className="text-xs font-bold uppercase tracking-widest">0G Evidence</h4>
          <IntegrationBadge status={integrationStatus?.zeroG} />
        </div>
        <div className="flex-1 flex flex-col">
          {!isZeroGActive ? (
            <div className="flex-1 flex items-center justify-center text-center p-6">
              <p className="text-[10px] text-white/20 uppercase font-bold tracking-widest">Storage Channel Idle</p>
            </div>
          ) : (
            <div className="flex-1 space-y-4">
              <div className="p-3 bg-black/60 rounded-sm border border-white/10">
                <div className="text-[9px] text-white/30 uppercase font-bold tracking-widest mb-1">Evidence Root</div>
                <div className={cn(
                    "text-xs font-mono font-bold break-all",
                    isTampered ? "text-red-500" : "text-primary"
                )}>
                    {evidence?.root || (isTampered ? "0g-root-TAMPERED-xyz" : "0g-root-abc123")}
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[9px] uppercase font-bold text-white/40">
                  <span>Storage Mode</span>
                  <span className="text-white">{evidence?.storageMode ?? '0G Storage'}</span>
                </div>
                <div className="flex items-center justify-between text-[9px] uppercase font-bold text-white/40">
                  <span>Source</span>
                  <span className="text-white">{evidence?.source ?? 'pending'}</span>
                </div>
                <div className="flex items-center justify-between text-[9px] uppercase font-bold text-white/40">
                  <span>Persistence</span>
                  <span className={cn(isTampered ? "text-red-500" : "text-green-500")}>
                    {evidence?.verificationResult === 'FAIL' ? 'Failed' : 'Verified'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[9px] uppercase font-bold text-white/40">
                  <span>Bundle Bytes</span>
                  <span className="text-white">{evidence?.byteSize ?? 0}</span>
                </div>
                {evidence?.bundleHash && (
                  <div className="flex flex-col gap-1 text-[9px] uppercase font-bold text-white/40">
                    <span>Bundle Hash</span>
                    <span className="break-all text-white/70 normal-case">{evidence.bundleHash}</span>
                  </div>
                )}
                {evidence?.txHash && (
                  <div className="flex flex-col gap-1 text-[9px] uppercase font-bold text-white/40">
                    <span>0G Storage Tx</span>
                    <span className="break-all text-white/70 normal-case">{evidence.txHash}</span>
                  </div>
                )}
                {evidence?.verdictHash && (
                  <div className="flex flex-col gap-1 text-[9px] uppercase font-bold text-white/40">
                    <span>0G Compute Verdict</span>
                    <span className="break-all text-white/70 normal-case">{evidence.verdictHash}</span>
                    <span className="text-white/35 normal-case">
                      {evidence.verdictModel ?? evidence.verdictSource ?? 'pending'} / {Math.round((evidence.verdictConfidence ?? 0) * 100)}%
                    </span>
                    {evidence.verdictReason && (
                      <span className="text-white/35 normal-case">{evidence.verdictReason}</span>
                    )}
                    {evidence.verdictAttestationHash && (
                      <span className="break-all text-white/45 normal-case">attestation: {evidence.verdictAttestationHash}</span>
                    )}
                  </div>
                )}
                {evidence?.verdictTxHash && (
                  <div className="flex flex-col gap-1 text-[9px] uppercase font-bold text-white/40">
                    <span>Verdict Tx</span>
                    <span className="break-all text-white/70 normal-case">{evidence.verdictTxHash}</span>
                  </div>
                )}
                <div className="flex flex-col gap-1 text-[9px] uppercase font-bold text-white/40">
                  <span>Keeper Receipt Hash</span>
                  <span className="break-all text-white/70 normal-case">{evidence?.keeperHubReceiptHash ?? 'pending'}</span>
                </div>
                {evidence?.verificationHash && (
                  <div className="flex flex-col gap-1 text-[9px] uppercase font-bold text-white/40">
                    <span>Verification Hash</span>
                    <span className="break-all text-white/70 normal-case">{evidence.verificationHash}</span>
                  </div>
                )}
                {run?.settlementReceipt?.commitTxHash && (
                  <div className="flex flex-col gap-1 text-[9px] uppercase font-bold text-white/40">
                    <span>Commit Tx</span>
                    <span className="break-all text-white/70 normal-case">{run.settlementReceipt.commitTxHash}</span>
                  </div>
                )}
                {run?.settlementReceipt?.abortTxHash && (
                  <div className="flex flex-col gap-1 text-[9px] uppercase font-bold text-white/40">
                    <span>Abort Tx</span>
                    <span className="break-all text-red-300/80 normal-case">{run.settlementReceipt.abortTxHash}</span>
                  </div>
                )}
              </div>

              <div className={cn(
                "mt-auto p-2 rounded-sm border flex items-center gap-2",
                isTampered ? "border-red-500/50 bg-red-500/10" : "border-green-500/50 bg-green-500/10"
              )}>
                {isTampered ? (
                    <>
                        <ShieldAlert className="w-4 h-4 text-red-500" />
                        <span className="text-[10px] font-bold text-red-500 uppercase tracking-tighter">Root Hash Mismatch</span>
                    </>
                ) : (
                    <>
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        <span className="text-[10px] font-bold text-green-500 uppercase tracking-tighter">Immutable Proof Stored</span>
                    </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>

    {/* 3-Verifier Jury Grid — Phase 4 */}
    <div className="glass-panel p-4">
      <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-3">
        <Scale className="w-4 h-4 text-primary" />
        <h4 className="text-xs font-bold uppercase tracking-widest">3-Verifier Jury</h4>
        {quorum && (
          <span className={cn(
            'ml-auto rounded-sm border px-2 py-1 text-[8px] font-bold uppercase tracking-widest',
            quorum.reached
              ? 'border-green-500/30 bg-green-500/10 text-green-400'
              : 'border-red-500/30 bg-red-500/10 text-red-300',
          )}>
            Quorum {quorum.reached ? 'Closed' : 'Incomplete'} — {quorum.passed} PASS / {quorum.failed} FAIL
          </span>
        )}
        {!quorum && isJuryActive && (
          <span className="ml-auto rounded-sm border px-2 py-1 text-[8px] font-bold uppercase tracking-widest border-yellow-500/30 bg-yellow-500/10 text-yellow-400">
            Awaiting Verdicts
          </span>
        )}
      </div>

      {!isJuryActive ? (
        <div className="text-center py-6 text-[10px] text-white/20 uppercase font-bold tracking-widest">
          Jury convenes after execution
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {juryVerifiers.map((vid) => {
            const verdict = verdicts.find((v) => v.verifierId === vid);
            const isPending = !verdict;
            const passed = verdict?.decision === 'PASS';
            const offline = verdict?.decision === 'OFFLINE';

            return (
              <div
                key={vid}
                className={cn(
                  'p-3 rounded-sm border font-mono text-[10px] space-y-2',
                  isPending
                    ? 'border-white/10 bg-black/20'
                    : offline
                    ? 'border-yellow-500/30 bg-yellow-500/5'
                    : passed
                    ? 'border-green-500/30 bg-green-500/5'
                    : 'border-red-500/30 bg-red-500/5',
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Vote className="w-3 h-3 text-white/40" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/70">{vid}</span>
                  </div>
                  <span className={cn(
                    'text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm',
                    isPending
                      ? 'bg-white/10 text-white/40'
                      : offline
                      ? 'bg-yellow-500/20 text-yellow-400'
                      : passed
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-red-500/20 text-red-400',
                  )}>
                    {isPending ? '...' : offline ? 'OFFLINE' : verdict.decision}
                  </span>
                </div>
                {verdict && (
                  <>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-white/30">verdict:</span>
                      <span className="break-all text-white/50 text-[9px]">{verdict.verdictHash.slice(0, 32)}…</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-white/30">reasoning:</span>
                      <span className="break-all text-white/50 text-[9px]">{verdict.reasoningHash.slice(0, 32)}…</span>
                    </div>
                    {verdict.attestationHash && (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-white/30">attestation:</span>
                        <span className="break-all text-white/50 text-[9px]">{verdict.attestationHash.slice(0, 32)}…</span>
                      </div>
                    )}
                    <div className="text-white/20 text-[8px]">{new Date(verdict.timestamp).toLocaleTimeString()}</div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
    </div>
  );
}

function IntegrationBadge({ status }: { status?: IntegrationHealth }) {
  const isLiveReady = status?.configured;

  return (
    <span
      className={cn(
        'ml-auto rounded-sm border px-2 py-1 text-[8px] font-bold uppercase tracking-widest',
        isLiveReady
          ? 'border-green-500/30 bg-green-500/10 text-green-400'
          : 'border-red-500/30 bg-red-500/10 text-red-300',
      )}
      title={status?.endpoint ?? 'No endpoint configured'}
    >
      {isLiveReady ? 'Live' : 'Needs Config'}
    </span>
  );
}
