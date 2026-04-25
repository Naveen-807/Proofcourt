import React from 'react';
import { motion } from 'motion/react';
import { WORKFLOW_NODES, AppState } from '../types';
import { cn } from '../lib/utils';
import { ArrowRight } from 'lucide-react';

interface Props {
  state: AppState;
}

export default function WorkflowCanvas({ state }: Props) {
  const getStatus = (id: string, index: number) => {
    const states = ['idle', 'workflow_generated', 'agents_selected', 'prepare_running', 'permit_issued', 'payout_locked', 'commit_running', 'execution_complete', 'evidence_stored', 'proof_verified', 'payout_released', 'reputation_updated'];
    const currentStateIndex = states.indexOf(state);
    
    if (state === 'tamper_detected' || state === 'payout_blocked') {
      if (id === 'evidence' || id === 'payout' || id === 'judge') return 'error';
    }

    if (currentStateIndex >= index + 2) return 'completed';
    if (currentStateIndex === index + 1) return 'active';
    return 'pending';
  };

  return (
    <div className="glass-panel tech-card p-10 overflow-hidden relative group">
      <div className="flex items-center justify-between mb-12 relative z-10">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-xs font-bold uppercase tracking-[0.3em] text-white/50">Protected Workflow Engine</h3>
            <span className="px-1.5 py-0.5 rounded-sm bg-white/5 text-[8px] font-mono text-white/30">V3.4.1</span>
          </div>
          <p className="text-[10px] text-white/20 font-mono tracking-wider">CLUSTER_ID: 77291-ALPHA-NODE</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-[9px] font-mono text-white/20 uppercase">Latency: 12ms</span>
            <span className="text-[9px] font-mono text-white/20 uppercase">Protocol: AXL-v2</span>
          </div>
          <div className="flex items-center gap-3 px-3 py-1.5 rounded-sm bg-primary/10 border border-primary/20 text-xs text-primary font-mono shadow-[0_0_15px_rgba(255,11,11,0.1)]">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            LIVE_STATE_ENGINE
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-y-16 gap-x-12 relative z-10">
        {WORKFLOW_NODES.map((node, i) => {
          const status = getStatus(node.id, i);
          const Icon = node.icon;
          
          return (
            <motion.div
              key={node.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1 }}
              className="relative flex flex-col items-center"
            >
              {/* Connector */}
              {i < WORKFLOW_NODES.length - 1 && i % 4 !== 3 && (
                <div className="hidden md:block absolute top-8 -right-16 w-16 h-px bg-white/10 z-0">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: status === 'completed' ? '100%' : '0%' }}
                    className="h-full bg-primary"
                  />
                </div>
              )}

              <div className={cn(
                "w-16 h-16 rounded-sm flex items-center justify-center mb-3 transition-all duration-500 relative z-10 border",
                status === 'completed' && "bg-primary/20 border-primary shadow-[0_0_20px_rgba(255,11,11,0.2)]",
                status === 'active' && "bg-white/10 border-white/40 animate-pulse",
                status === 'pending' && "bg-white/5 border-white/5",
                status === 'error' && "bg-red-500/20 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.2)]"
              )}>
                <Icon className={cn(
                  "w-7 h-7",
                  status === 'completed' ? "text-primary" : "text-white/40",
                  status === 'error' && "text-red-500"
                )} />
                
                {status === 'completed' && (
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-white rounded-full flex items-center justify-center"
                  >
                    <div className="w-2.5 h-2.5 bg-white rounded-full" />
                  </motion.div>
                )}
              </div>

              <div className="text-center">
                <div className="text-xs font-semibold mb-1">{node.label}</div>
                <div className="text-[10px] text-white/40 leading-tight h-8">{node.desc}</div>
                
                {node.sponsor && (
                  <div className="mt-2 inline-flex px-1.5 py-0.5 rounded-sm bg-white/5 border border-white/10 text-[9px] font-bold text-white/60 tracking-tighter">
                    {node.sponsor}
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
