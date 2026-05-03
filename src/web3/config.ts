import { injected, metaMask } from '@wagmi/connectors';
import { createConfig, http } from 'wagmi';
import { defineChain } from 'viem';
import { hardhat } from 'viem/chains';

export const zeroGGalileo = defineChain({
  id: 16602,
  name: '0G Galileo Testnet',
  nativeCurrency: {
    name: '0G',
    symbol: '0G',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [import.meta.env.VITE_ZERO_G_RPC_URL?.trim() || 'https://evmrpc-testnet.0g.ai'],
    },
  },
  blockExplorers: {
    default: {
      name: '0G Galileo Explorer',
      url: 'https://chainscan-galileo.0g.ai',
    },
  },
  testnet: true,
});

export const web3Config = createConfig({
  chains: [zeroGGalileo, hardhat],
  connectors: [
    metaMask(),
    injected({ shimDisconnect: true }),
  ],
  transports: {
    [zeroGGalileo.id]: http(import.meta.env.VITE_ZERO_G_RPC_URL?.trim() || 'https://evmrpc-testnet.0g.ai'),
    [hardhat.id]: http(import.meta.env.VITE_LOCAL_RPC_URL || 'http://127.0.0.1:8545'),
  },
  multiInjectedProviderDiscovery: true,
  ssr: false,
});
