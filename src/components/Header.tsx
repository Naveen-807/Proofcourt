import React from 'react';
import { Shield } from 'lucide-react';
import WalletPanel from './WalletPanel';

export default function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#050505]/80 backdrop-blur-xl">
      <div className="max-w-[1440px] mx-auto px-10 h-20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary flex items-center justify-center rounded-sm">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-medium tracking-tight">ProofCourt</h1>
            <p className="text-[10px] uppercase tracking-widest text-primary/80 font-bold -mt-0.5">
              Settlement Layer
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-white/60">
            <a href="#" className="hover:text-white transition-colors">Explorer</a>
            <a href="#" className="hover:text-white transition-colors">Agents</a>
            <a href="#" className="hover:text-white transition-colors">Docs</a>
          </nav>
          <div className="h-4 w-px bg-white/10 hidden md:block" />
          <div className="hidden items-center gap-2 text-xs font-mono text-white/40 xl:flex">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            PROOF_STACK_READY
          </div>
          <WalletPanel />
        </div>
      </div>
    </header>
  );
}
