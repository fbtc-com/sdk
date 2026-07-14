import type { Address } from "viem";
import { createPublicClient, erc20Abi, formatUnits, http } from "viem";
import { mainnet } from "viem/chains";

/**
 * Reads an arbitrary ERC-20 token balance via a public client.
 * Pass a dedicated `rpcUrl` when public endpoints are rate-limited / timing out.
 */
export async function getErc20Balance(
  tokenAddress: Address,
  chainId: number,
  address: Address,
  decimals: number,
  rpcUrl?: string,
): Promise<{ balance: bigint; formatted: string; decimals: number }> {
  if (chainId !== mainnet.id) {
    throw new Error(`Unsupported chainId for ERC-20 balance: ${chainId}`);
  }

  const publicClient = createPublicClient({
    chain: mainnet,
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
