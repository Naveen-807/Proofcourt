import React, { type ReactNode, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { web3Config } from './config';

interface Props {
  children: ReactNode;
}

export function Web3Provider({ children }: Props) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <WagmiProvider config={web3Config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
