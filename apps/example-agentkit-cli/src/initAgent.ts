import {
  AgentKit,
  ViemWalletProvider,
  walletActionProvider,
} from "@coinbase/agentkit";
import { getLangChainTools } from "@coinbase/agentkit-langchain";
import type { Chain } from "viem";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { fbtcActionProvider } from "@functionFBTC/sdk-agentkit";

import { CHAINS } from "./config.js";

/**
 * ViemWalletProvider builds its own publicClient with `http()` (no URL),
 * which falls back to `chain.rpcUrls.default`. Point that at RPC_URL so
 * gas estimation / receipt waits don't hit flaky public endpoints.
 */
function chainWithRpc(chain: Chain, rpcUrl?: string): Chain {
  if (!rpcUrl) return chain;
  return {
    ...chain,
    rpcUrls: {
      ...chain.rpcUrls,
      default: { http: [rpcUrl] },
      public: { http: [rpcUrl] },
    },
  };
}

export async function initAgent(networkId: string) {
  const baseChain = CHAINS[networkId];
  if (!baseChain) {
    throw new Error(`Unsupported network: ${networkId}. Use one of: ${Object.keys(CHAINS).join(", ")}`);
  }

  const rpcUrl = process.env.RPC_URL;
  const chain = chainWithRpc(baseChain, rpcUrl);
  const account = privateKeyToAccount(process.env.WALLET_PRIVATE_KEY as `0x${string}`);
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl, { timeout: 60_000 }),
  });

  // Dual viem versions (workspace root vs local) cause type mismatch
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walletProvider = new ViemWalletProvider(walletClient as any);

  const agentkit = await AgentKit.from({
    walletProvider,
    actionProviders: [
      walletActionProvider(),
      fbtcActionProvider({ rpcUrl }),
    ],
  });

  const tools = await getLangChainTools(agentkit);

  return { walletProvider, tools };
}
