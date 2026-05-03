import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Loader2, ShieldCheck, Unplug, Wallet } from 'lucide-react';
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { hardhat } from 'viem/chains';
import { zeroGGalileo } from '../web3/config';
import { cn } from '../lib/utils';

const supportedChains = [zeroGGalileo, hardhat];

export default function WalletPanel() {
  const account = useAccount();
  const chainId = useChainId();
  const { connectors, connect, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const [hasBrowserWallet, setHasBrowserWallet] = useState(false);

  useEffect(() => {
    setHasBrowserWallet(
      typeof window !== 'undefined' &&
        Boolean((window as Window & { ethereum?: unknown }).ethereum),
    );
  }, []);

  const connector = useMemo(() => {
    return (
      connectors.find((item) => item.id === 'injected') ??
      connectors.find((item) => item.id === 'metaMask') ??
      connectors[0]
    );
  }, [connectors]);

  const currentChain = supportedChains.find((chain) => chain.id === chainId);
  const connected = account.isConnected && account.address;
  const unsupported = connected && !currentChain;
  const displayAddress = account.address
    ? `${account.address.slice(0, 6)}...${account.address.slice(-4)}`
    : '';

  if (!connected) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => connector && connect({ connector })}
          disabled={!connector || isPending}
          className="court-button court-button-primary h-11"
          title={!hasBrowserWallet ? 'Install or unlock MetaMask or another injected browser wallet.' : undefined}
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
          {isPending ? 'Connecting...' : hasBrowserWallet ? 'Connect Wallet' : 'Connect Browser Wallet'}
        </button>
        {error && (
          <div className="absolute right-0 top-14 z-50 w-[280px] rounded-[10px] border border-[#EF4D5B]/35 bg-[#1A0C10] p-3 text-xs leading-5 text-red-100 shadow-2xl">
            {error.message}
          </div>
        )}
      </div>
    );
  }

  if (unsupported) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => switchChain({ chainId: zeroGGalileo.id })}
          disabled={isSwitching}
          className="court-button court-button-danger h-11"
        >
          {isSwitching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
          Switch to 0G Galileo
        </button>
        <button
          type="button"
          onClick={() => disconnect()}
          className="court-button court-button-secondary h-11 px-3"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-[10px] border border-white/10 bg-white/[0.035] p-1">
      <button
        type="button"
        onClick={() => switchChain({ chainId: currentChain?.id === hardhat.id ? zeroGGalileo.id : hardhat.id })}
        className="flex h-9 items-center gap-2 rounded-[8px] border border-white/10 bg-black/25 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-white/65 transition-colors hover:text-white"
      >
        <span className="h-2 w-2 rounded-full bg-[#3DDC97]" />
        {currentChain?.name ?? 'Connected'}
        <ChevronDown className="h-3 w-3 text-white/30" />
      </button>

      <button
        type="button"
        onClick={() => disconnect()}
        className="flex h-9 items-center gap-3 rounded-[8px] bg-primary/10 px-3 text-left transition-colors hover:bg-primary/15"
      >
        <div className="flex h-6 w-6 items-center justify-center rounded-[6px] bg-primary/20 text-primary">
          <ShieldCheck className="h-4 w-4" />
        </div>
        <div className="leading-none">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-white">
            {displayAddress}
          </div>
          <div className={cn('mt-1 text-[9px] font-mono uppercase tracking-widest text-[#3DDC97]')}>
            Permit signer ready
          </div>
        </div>
      </button>
    </div>
  );
}
