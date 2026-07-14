import type { Chain } from 'viem';
import { createPublicClient, http, type PublicClient } from 'viem';
import { mainnet, mantle } from 'viem/chains';

export interface ChainConfig {
  chain: Chain;
  chainId: number;
  name: string;
}

export const SUPPORTED_CHAINS: Record<number, ChainConfig> = {
  [mainnet.id]: { chain: mainnet, chainId: mainnet.id, name: 'Ethereum' },
  [mantle.id]: { chain: mantle, chainId: mantle.id, name: 'Mantle' },
};

export function getChainConfig(chainId: number): ChainConfig {
  const config = SUPPORTED_CHAINS[chainId];
  if (!config) {
    const supported = Object.keys(SUPPORTED_CHAINS).join(', ');
    throw new Error(`Unsupported chain ID: ${chainId}. Supported: ${supported}`);
  }
  return config;
}

/**
 * Resolve a read RPC for the target chain.
 *
 * Ethereum and Mantle URLs never cross-fallback — FBTC addresses currently
 * match on both chains, so a wrong RPC silently returns the other chain's balance.
 */
export function resolveRpcUrl(rpcUrl?: string, chainId?: number): string | undefined {
  if (rpcUrl) return rpcUrl;
  if (chainId === mantle.id) {
    return process.env.MANTLE_RPC_URL || undefined;
  }
  if (chainId === mainnet.id) {
    return process.env.ETH_RPC_URL || undefined;
  }
  return process.env.ETH_RPC_URL || process.env.MANTLE_RPC_URL || undefined;
}

export function makePublicClient(chainId: number, rpcUrl?: string): PublicClient {
  const config = getChainConfig(chainId);
  return createPublicClient({
    chain: config.chain,
    transport: http(resolveRpcUrl(rpcUrl, chainId), { timeout: 60_000 }),
  });
}
