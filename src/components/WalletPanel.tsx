import React from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Wallet, ShieldCheck, Unplug, ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';

export default function WalletPanel() {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        mounted,
        openAccountModal,
        openChainModal,
        openConnectModal,
      }) => {
        const connected = mounted && account && chain;
        const unsupported = connected && chain.unsupported;

        if (!connected) {
          return (
            <button
              type="button"
              onClick={openConnectModal}
              className="group flex h-11 items-center gap-3 rounded-sm border border-primary/40 bg-primary px-4 text-xs font-bold uppercase tracking-widest text-white shadow-[0_0_24px_rgba(255,11,11,0.18)] transition-all hover:bg-primary/90 hover:shadow-[0_0_34px_rgba(255,11,11,0.28)]"
            >
              <Wallet className="h-4 w-4" />
              Connect Wallet
            </button>
          );
        }

        if (unsupported) {
          return (
            <button
              type="button"
              onClick={openChainModal}
              className="flex h-11 items-center gap-3 rounded-sm border border-red-500/40 bg-red-500/10 px-4 text-xs font-bold uppercase tracking-widest text-red-300 transition-all hover:bg-red-500/20"
            >
              <Unplug className="h-4 w-4" />
              Wrong Network
            </button>
          );
        }

        return (
          <div className="flex items-center gap-2 rounded-sm border border-white/10 bg-white/[0.03] p-1">
            <button
              type="button"
              onClick={openChainModal}
              className="hidden h-9 items-center gap-2 rounded-sm border border-white/10 bg-black/30 px-3 text-[10px] font-bold uppercase tracking-widest text-white/65 transition-colors hover:text-white sm:flex"
            >
              {chain.hasIcon && chain.iconUrl ? (
                <img src={chain.iconUrl} alt={chain.name} className="h-4 w-4 rounded-full" />
              ) : (
                <span className="h-2 w-2 rounded-full bg-green-500" />
              )}
              {chain.name}
              <ChevronDown className="h-3 w-3 text-white/30" />
            </button>

            <button
              type="button"
              onClick={openAccountModal}
              className="flex h-9 items-center gap-3 rounded-sm bg-primary/10 px-3 text-left transition-colors hover:bg-primary/15"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-primary/20 text-primary">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div className="leading-none">
                <div className="text-[10px] font-bold uppercase tracking-widest text-white">
                  {account.displayName}
                </div>
                <div className={cn('mt-1 text-[9px] font-mono uppercase tracking-widest text-green-400')}>
                  Permit signer ready
                </div>
              </div>
            </button>
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
