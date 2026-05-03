import React from 'react';
import { Database, LockKeyhole, Route, ShieldCheck } from 'lucide-react';
import WalletPanel from './WalletPanel';

export default function Header() {
  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-white/10 bg-[#07090B]/88 backdrop-blur-2xl">
      <div className="mx-auto flex h-20 max-w-[1440px] items-center justify-between px-10">
        <div className="flex items-center gap-4">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-[10px] border border-primary/40 bg-primary/15">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[#3DDC97] shadow-[0_0_20px_rgba(61,220,151,0.55)]" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[#F4F0E8]">ProofCourt</h1>
            <p className="court-eyebrow -mt-0.5 text-primary/90">Permit and proof control plane</p>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/55 xl:flex">
            <Route className="h-3.5 w-3.5 text-[#5BA7FF]" />
            AXL route
            <span className="h-1 w-1 rounded-full bg-white/25" />
            <Database className="h-3.5 w-3.5 text-[#9C7BFF]" />
            0G evidence
            <span className="h-1 w-1 rounded-full bg-white/25" />
            <LockKeyhole className="h-3.5 w-3.5 text-primary" />
            KeeperHub execution
          </div>
          <div className="h-5 w-px bg-white/10" />
          <WalletPanel />
        </div>
      </div>
    </header>
  );
}
