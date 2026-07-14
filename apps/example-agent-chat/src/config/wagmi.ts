import { getDefaultConfig } from 'connectkit';
import { createConfig, createStorage, http } from 'wagmi';
import { mainnet, mantle } from 'wagmi/chains';

export const wagmiConfig = createConfig(
  getDefaultConfig({
    chains: [mainnet, mantle],
    transports: {
      [mainnet.id]: http(),
      [mantle.id]: http(),
    },
    walletConnectProjectId:
      import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '',
    appName: 'Function AI Assistant',
    enableAaveAccount: false,
    storage: createStorage({ storage: sessionStorage }),
  }),
);
