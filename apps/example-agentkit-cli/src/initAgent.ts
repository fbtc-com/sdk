import {
  AgentKit,
  ViemWalletProvider,
  walletActionProvider,
} from "@coinbase/agentkit";
import { getLangChainTools } from "@coinbase/agentkit-langchain";
import {
  DEFAULT_NETWORK_ID,
  type FbtcNetworkId,
  fbtcActionProvider,
  isFbtcNetworkId,
  NETWORK_ID_TO_VIEM_CHAIN,
} from "@functionfbtc/sdk-agentkit";
import type { Chain } from "viem";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

/**
 * Load both supported network RPCs at startup. Read tools pick a networkId
 * from the user instruction (default: ethereum-mainnet).
 */
export function loadNetworkRpcUrls(): Record<FbtcNetworkId, string | undefined> {
  return {
    "ethereum-mainnet": process.env.ETH_RPC_URL || undefined,
    "mantle-mainnet": process.env.MANTLE_RPC_URL || undefined,
  };
}

/**
 * Wallet / write network. Defaults to ethereum-mainnet when unset.
 */
export function loadWalletNetworkId(): FbtcNetworkId {
  const raw = process.env.NETWORK_ID || DEFAULT_NETWORK_ID;
  if (!isFbtcNetworkId(raw)) {
    throw new Error(
      `Unsupported NETWORK_ID: ${raw}. Use ethereum-mainnet or mantle-mainnet.`,
    );
  }
  return raw;
}

/**
 * ViemWalletProvider builds its own publicClient with `http()` (default 10s
 * timeout). Write actions in sdk-agentkit wait for receipts on our own
 * publicClient instead (see waitForTxReceipt). We still point the wallet
 * chain RPC at ETH_RPC_URL / MANTLE_RPC_URL for gas estimation / sends.
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

export async function initAgent(walletNetworkId?: FbtcNetworkId) {
  const networkId = walletNetworkId ?? loadWalletNetworkId();
  const rpcUrls = loadNetworkRpcUrls();
  const walletRpcUrl = rpcUrls[networkId];
  const baseChain = NETWORK_ID_TO_VIEM_CHAIN[networkId];
  const chain = chainWithRpc(baseChain, walletRpcUrl);
  const account = privateKeyToAccount(
    process.env.WALLET_PRIVATE_KEY as `0x${string}`,
  );
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(walletRpcUrl, { timeout: 60_000 }),
  });

  // Dual viem versions (workspace root vs local) cause type mismatch
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walletProvider = new ViemWalletProvider(walletClient as any);

  const agentkit = await AgentKit.from({
    walletProvider,
    actionProviders: [
      walletActionProvider(),
      fbtcActionProvider({ rpcUrls }),
    ],
  });

  const tools = await getLangChainTools(agentkit);

  return { walletProvider, tools, networkId, rpcUrls };
}
