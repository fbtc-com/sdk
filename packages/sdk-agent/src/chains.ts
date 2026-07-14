import type { Chain } from 'viem';
import { createPublicClient, http, type PublicClient } from 'viem';
import { mainnet } from 'viem/chains';

export interface ChainConfig {
  chain: Chain;
  chainId: number;
  name: string;
}

export const SUPPORTED_CHAINS: Record<number, ChainConfig> = {
  [mainnet.id]: { chain: mainnet, chainId: mainnet.id, name: 'Ethereum' },
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
 * Prefer `rpcUrl`, then `RPC_URL` / `ETH_RPC_URL` env, then the chain default.
 * Public endpoints frequently time out for ERC-20 reads.
 */
export function resolveRpcUrl(rpcUrl?: string): string | undefined {
  return rpcUrl || process.env.RPC_URL || process.env.ETH_RPC_URL || undefined;
}

export function makePublicClient(chainId: number, rpcUrl?: string): PublicClient {
  const config = getChainConfig(chainId);
  return createPublicClient({
    chain: config.chain,
    transport: http(resolveRpcUrl(rpcUrl), { timeout: 60_000 }),
  });
}
