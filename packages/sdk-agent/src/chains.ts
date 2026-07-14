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
 * Prefer `rpcUrl`, then chain-specific env, then shared RPC env, then the chain default.
 * Public endpoints frequently time out for ERC-20 reads.
 */
export function resolveRpcUrl(rpcUrl?: string, chainId?: number): string | undefined {
  if (rpcUrl) return rpcUrl;
  if (chainId === mantle.id) {
    return process.env.MANTLE_RPC_URL || process.env.RPC_URL || undefined;
  }
  return process.env.RPC_URL || process.env.ETH_RPC_URL || undefined;
}

export function makePublicClient(chainId: number, rpcUrl?: string): PublicClient {
  const config = getChainConfig(chainId);
  return createPublicClient({
    chain: config.chain,
    transport: http(resolveRpcUrl(rpcUrl, chainId), { timeout: 60_000 }),
  });
}
