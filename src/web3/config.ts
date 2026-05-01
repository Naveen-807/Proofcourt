import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { http } from 'wagmi';
import { hardhat, sepolia } from 'wagmi/chains';

const walletConnectProjectId =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'proofcourt-local-demo';

export const web3Config = getDefaultConfig({
  appName: 'ProofCourt',
  projectId: walletConnectProjectId,
  chains: [sepolia, hardhat],
  transports: {
    [sepolia.id]: http(import.meta.env.VITE_SEPOLIA_RPC_URL || undefined),
    [hardhat.id]: http(import.meta.env.VITE_LOCAL_RPC_URL || 'http://127.0.0.1:8545'),
  },
  ssr: false,
});
