import type { Network } from "@coinbase/agentkit";
import type { Chain } from "viem";
import { mainnet, mantle } from "viem/chains";

/** Supported AgentKit / FBTC network IDs. */
export type FbtcNetworkId = "ethereum-mainnet" | "mantle-mainnet";

/** Default network when the user does not name one. */
export const DEFAULT_NETWORK_ID: FbtcNetworkId = "ethereum-mainnet";

/**
 * Maps network IDs to viem Chain objects.
 * Numeric chain IDs are an implementation detail of viem / RPC nodes.
 */
export const NETWORK_ID_TO_VIEM_CHAIN: Record<FbtcNetworkId, Chain> = {
  "ethereum-mainnet": mainnet,
  "mantle-mainnet": mantle,
};

export const SUPPORTED_NETWORK_IDS: FbtcNetworkId[] = Object.keys(
  NETWORK_ID_TO_VIEM_CHAIN,
) as FbtcNetworkId[];

export interface ResolvedNetwork {
  networkId: FbtcNetworkId;
  /** viem / RPC numeric id — internal only. */
  chainId: number;
}

const NETWORK_ID_SET = new Set<string>(SUPPORTED_NETWORK_IDS);

const CHAIN_ID_TO_NETWORK_ID: Record<number, FbtcNetworkId> = {
  [mainnet.id]: "ethereum-mainnet",
  [mantle.id]: "mantle-mainnet",
};

function parseChainId(chainId: Network["chainId"]): number | null {
  if (chainId == null) return null;
  const n = typeof chainId === "string" ? Number(chainId) : chainId;
  return Number.isFinite(n) ? n : null;
}

export function isFbtcNetworkId(value: string): value is FbtcNetworkId {
  return NETWORK_ID_SET.has(value);
}

/**
 * Resolves a user- or tool-supplied networkId string (with common aliases).
 * Returns null when the value is not a supported FBTC network.
 */
export function resolveNetworkId(value?: string | null): FbtcNetworkId | null {
  if (!value) return null;
  const normalized = value.toLowerCase().trim();
  if (isFbtcNetworkId(normalized)) return normalized;

  const aliases: Record<string, FbtcNetworkId> = {
    ethereum: "ethereum-mainnet",
    eth: "ethereum-mainnet",
    mainnet: "ethereum-mainnet",
    mantle: "mantle-mainnet",
    mnt: "mantle-mainnet",
  };
  return aliases[normalized] ?? null;
}

/**
 * Resolves an AgentKit Network to a supported FBTC networkId.
 *
 * Coinbase AgentKit's ViemWalletProvider often only sets `chainId` and leaves
 * `networkId` undefined for chains it does not ship (e.g. Mantle). Fall back
 * from the numeric chain id in that case.
 */
export function resolveNetwork(network: Network): ResolvedNetwork | null {
  const fromId = resolveNetworkId(network.networkId);
  if (fromId) {
    return {
      networkId: fromId,
      chainId: NETWORK_ID_TO_VIEM_CHAIN[fromId].id,
    };
  }

  const chainId = parseChainId(network.chainId);
  if (chainId != null) {
    const networkId = CHAIN_ID_TO_NETWORK_ID[chainId];
    if (networkId) {
      return { networkId, chainId };
    }
  }

  return null;
}

/** @deprecated Prefer resolveNetworkId — kept for existing call sites. */
export function resolveChainName(chainName: string): ResolvedNetwork | null {
  const networkId = resolveNetworkId(chainName);
  if (!networkId) return null;
  return {
    networkId,
    chainId: NETWORK_ID_TO_VIEM_CHAIN[networkId].id,
  };
}

export function isFbtcSupportedNetwork(network: Network): boolean {
  return resolveNetwork(network) !== null;
}

export function getViemChainByNetworkId(networkId: FbtcNetworkId): Chain {
  return NETWORK_ID_TO_VIEM_CHAIN[networkId];
}

/** @deprecated Prefer getViemChainByNetworkId. */
export function getViemChainByChainId(chainId: number): Chain | null {
  const networkId = CHAIN_ID_TO_NETWORK_ID[chainId];
  return networkId ? NETWORK_ID_TO_VIEM_CHAIN[networkId] : null;
}
