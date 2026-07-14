import type { Address } from "viem";
import { createPublicClient, erc20Abi, formatUnits, http } from "viem";

import {
  type FbtcNetworkId,
  getViemChainByNetworkId,
  isFbtcNetworkId,
} from "./networks";

/** Per-networkId RPC endpoints loaded at process start. */
export type RpcUrlByNetwork = Partial<Record<FbtcNetworkId, string>>;

/**
 * Resolve the RPC URL for a networkId.
 * Ethereum and Mantle URLs never cross-fallback.
 */
export function resolveRpcUrl(
  networkId: FbtcNetworkId,
  rpcUrls: RpcUrlByNetwork = {},
): string | undefined {
  if (networkId === "mantle-mainnet") {
    return rpcUrls["mantle-mainnet"] || process.env.MANTLE_RPC_URL || undefined;
  }
  return rpcUrls["ethereum-mainnet"] || process.env.ETH_RPC_URL || undefined;
}

/**
 * Reads an ERC-20 balance on the given networkId.
 * Verifies the RPC node's chain matches the network before reading.
 */
export async function getErc20Balance(
  tokenAddress: Address,
  networkId: FbtcNetworkId,
  address: Address,
  decimals: number,
  rpcUrls: RpcUrlByNetwork = {},
): Promise<{ balance: bigint; formatted: string; decimals: number }> {
  if (!isFbtcNetworkId(networkId)) {
    throw new Error(`Unsupported networkId for ERC-20 balance: ${networkId}`);
  }

  const chain = getViemChainByNetworkId(networkId);
  const rpcUrl = resolveRpcUrl(networkId, rpcUrls);

  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl, { timeout: 60_000 }),
  });

  const reportedChainId = await publicClient.getChainId();
  if (reportedChainId !== chain.id) {
    throw new Error(
      `RPC chain mismatch for FBTC balance: expected networkId ${networkId} (chain ${chain.id}), ` +
        `but the RPC reported ${reportedChainId}. ` +
        `Set ${networkId === "mantle-mainnet" ? "MANTLE_RPC_URL" : "ETH_RPC_URL"} to an endpoint on the correct network.`,
    );
  }

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
