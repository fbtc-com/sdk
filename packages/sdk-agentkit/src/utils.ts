import type { Address } from "viem";
import { createPublicClient, erc20Abi, formatUnits, http } from "viem";
import { mantle } from "viem/chains";

import { getViemChainByChainId } from "./networks";

export interface RpcUrlOptions {
  /** Ethereum mainnet RPC used for chainId 1 reads. */
  rpcUrl?: string;
  /** Mantle RPC used for chainId 5000 reads. */
  mantleRpcUrl?: string;
}

/**
 * Resolve a read RPC for the target chain.
 *
 * Ethereum and Mantle URLs are never cross-fallback: passing an Ethereum
 * endpoint into a Mantle balanceOf would silently return the wrong chain's
 * balance (FBTC addresses currently match across both chains).
 */
export function resolveRpcUrl(
  chainId: number,
  options: RpcUrlOptions = {},
): string | undefined {
  if (chainId === mantle.id) {
    return options.mantleRpcUrl || process.env.MANTLE_RPC_URL || undefined;
  }
  return (
    options.rpcUrl ||
    process.env.ETH_RPC_URL ||
    process.env.RPC_URL ||
    undefined
  );
}

/**
 * Reads an arbitrary ERC-20 token balance via a public client.
 * Pass chain-specific RPC URLs; never reuse an Ethereum URL for Mantle reads.
 */
export async function getErc20Balance(
  tokenAddress: Address,
  chainId: number,
  address: Address,
  decimals: number,
  rpcOptions?: string | RpcUrlOptions,
): Promise<{ balance: bigint; formatted: string; decimals: number }> {
  const chain = getViemChainByChainId(chainId);
  if (!chain) {
    throw new Error(`Unsupported chainId for ERC-20 balance: ${chainId}`);
  }

  const options: RpcUrlOptions =
    typeof rpcOptions === "string" ? { rpcUrl: rpcOptions } : (rpcOptions ?? {});
  const rpcUrl = resolveRpcUrl(chainId, options);

  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl, { timeout: 60_000 }),
  });
  const balance = await publicClient.readContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
  });

  return {
    balance,
    formatted: formatUnits(balance, decimals),
    decimals,
  };
}

/**
 * Format a result string for AgentKit action responses.
 */
export function formatSuccess(
  action: string,
  details: Record<string, unknown>,
): string {
  return JSON.stringify({ success: true, action, ...details });
}

export function formatError(action: string, error: unknown): string {
  let message: string;
  if (error instanceof Error) {
    message = error.message
      .replace(/https?:\/\/[^\s]+/g, "[redacted-url]")
      .replace(/0x[a-fA-F0-9]{64,}/g, "[redacted-data]");
  } else {
    message = String(error);
  }
  return JSON.stringify({ success: false, action, error: message });
}
