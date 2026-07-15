import { getDefaultConfig } from 'connectkit';
import { createConfig, createStorage, http } from 'wagmi';
import { mainnet, mantle } from 'wagmi/chains';

// Browser-only public RPCs. Never reuse server ETH_RPC_URL / MANTLE_RPC_URL
// (those may embed Alchemy keys and must stay out of the client bundle).
const ethRpc = import.meta.env.VITE_PUBLIC_ETH_RPC_URL;
const mantleRpc = import.meta.env.VITE_PUBLIC_MANTLE_RPC_URL;

export const wagmiConfig = createConfig(
  getDefaultConfig({
    chains: [mainnet, mantle],
    transports: {
      [mainnet.id]: http(ethRpc || undefined),
      [mantle.id]: http(mantleRpc || undefined),
    },
    walletConnectProjectId:
      import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '',
    appName: 'Function AI Assistant',
    enableAaveAccount: false,
    storage: createStorage({ storage: sessionStorage }),
  }),
);
