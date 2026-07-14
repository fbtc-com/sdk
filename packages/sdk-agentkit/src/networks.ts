import type { Network } from "@coinbase/agentkit";
import type { Chain } from "viem";
import { mainnet } from "viem/chains";

/**
 * Maps AgentKit network IDs to viem Chain objects.
 * FBTC / Aave V3 supply currently targets Ethereum mainnet only.
 */
export const NETWORK_ID_TO_VIEM_CHAIN: Record<string, Chain> = {
  "ethereum-mainnet": mainnet,
};

export interface ResolvedNetwork {
  chainId: number;
  networkId: string;
}

const SUPPORTED_NETWORK_IDS = new Set(Object.keys(NETWORK_ID_TO_VIEM_CHAIN));

/**
 * Resolves an AgentKit Network to chain parameters.
 */
export function resolveNetwork(network: Network): ResolvedNetwork | null {
  const networkId = network.networkId;
  if (!networkId || !SUPPORTED_NETWORK_IDS.has(networkId)) return null;

  const chain = NETWORK_ID_TO_VIEM_CHAIN[networkId];
  return { chainId: chain.id, networkId };
}

/**
 * Resolves a user-supplied chain name string.
 */
export function resolveChainName(chainName: string): ResolvedNetwork | null {
  const normalized = chainName.toLowerCase().trim();

  if (SUPPORTED_NETWORK_IDS.has(normalized)) {
    return {
      chainId: NETWORK_ID_TO_VIEM_CHAIN[normalized].id,
      networkId: normalized,
    };
  }

  const aliases: Record<string, string> = {
    ethereum: "ethereum-mainnet",
    eth: "ethereum-mainnet",
    mainnet: "ethereum-mainnet",
  };

  const resolved = aliases[normalized];
  if (resolved && SUPPORTED_NETWORK_IDS.has(resolved)) {
    return {
      chainId: NETWORK_ID_TO_VIEM_CHAIN[resolved].id,
      networkId: resolved,
    };
  }

  return null;
}

export function isFbtcSupportedNetwork(network: Network): boolean {
  return resolveNetwork(network) !== null;
}
