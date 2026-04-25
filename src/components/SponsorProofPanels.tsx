import React from 'react';
import { motion } from 'motion/react';
import { AppState } from '../types';
import { cn } from '../lib/utils';
import { Code, Terminal, Database, ShieldAlert, CheckCircle } from 'lucide-react';

interface Props {
  state: AppState;
  isTampered: boolean;
}

export default function SponsorProofPanels({ state, isTampered }: Props) {
  const isAxlActive = ['commit_running', 'execution_complete', 'evidence_stored', 'proof_verified', 'payout_released', 'reputation_updated', 'tamper_detected', 'payout_blocked'].includes(state);
  const isKeeperActive = ['execution_complete', 'evidence_stored', 'proof_verified', 'payout_released', 'reputation_updated', 'tamper_detected', 'payout_blocked'].includes(state);
  const isZeroGActive = ['evidence_stored', 'proof_verified', 'payout_released', 'reputation_updated', 'tamper_detected', 'payout_blocked'].includes(state);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* AXL Message Log */}
      <div className="glass-panel p-4 flex flex-col h-[300px]">
        <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-3">
          <Terminal className="w-4 h-4 text-primary" />
          <h4 className="text-xs font-bold uppercase tracking-widest">AXL Message Log</h4>
        </div>
        <div className="flex-1 font-mono text-[10px] space-y-3 overflow-y-auto custom-scrollbar">
          {!isAxlActive ? (
            <div className="text-white/20 italic">Awaiting communication...</div>
          ) : (
            <>
              <div className="text-green-500/80">
                <span className="text-white/20">[14:16:01]</span> ID: axl_839... <br />
                STRATEGY -&gt; JUDGE: WORKFLOW_REQUESTED
              </div>
              <div className="text-green-500/80">
                <span className="text-white/20">[14:16:03]</span> ID: axl_840... <br />
                JUDGE -&gt; EXECUTOR: PERMIT_APPROVED
              </div>
              <div className="text-primary/80 animate-pulse">
                <span className="text-white/20">[14:16:05]</span> ID: axl_841... <br />
                EXECUTOR -&gt; JUDGE: READY_TO_COMMIT
              </div>
              {isKeeperActive && (
                <div className="text-green-500/80">
                  <span className="text-white/20">[14:16:08]</span> ID: axl_842... <br />
                  EXECUTOR -&gt; JUDGE: EXEC_RECEIPT_SUBMITTED
                </div>
              )}
              {isZeroGActive && (
                <div className="text-green-500/80">
                  <span className="text-white/20">[14:16:10]</span> ID: axl_843... <br />
                  JUDGE -&gt; STRATEGY: PROOF_VERIFIED
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
                <span className="text-white/40">Workflow ID:</span>
                <span>kh_12345</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Status:</span>
                <span className="text-green-500">Completed</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Action:</span>
                <span>vaultDeposit(1 ETH)</span>
              </div>
              <div className="flex flex-col gap-1 border-t border-white/5 pt-3">
                <span className="text-white/40">Tx Hash:</span>
                <span className="text-[10px] break-all">{isTampered ? "0xDEAD...BEEF" : "0xabc...789"}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-white/20">Gas Optimized:</span>
                <span className="text-white/40">Yes</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 0G Evidence */}
      <div className="glass-panel p-4 flex flex-col h-[300px]">
        <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-3">
          <Database className="w-4 h-4 text-primary" />
          <h4 className="text-xs font-bold uppercase tracking-widest">0G Evidence</h4>
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
                    {isTampered ? "0g-root-TAMPERED-xyz" : "0g-root-abc123"}
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[9px] uppercase font-bold text-white/40">
                  <span>Storage Mode</span>
                  <span className="text-white">KV + Log</span>
                </div>
                <div className="flex items-center justify-between text-[9px] uppercase font-bold text-white/40">
                  <span>Persistence</span>
                  <span className="text-green-500">Verified</span>
                </div>
                <div className="flex items-center justify-between text-[9px] uppercase font-bold text-white/40">
                  <span>Bundles</span>
                  <span className="text-white">4 Items</span>
                </div>
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
  );
}
