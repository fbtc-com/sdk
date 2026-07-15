/**
 * Block explorer URL helpers for the supported chains.
 *
 * Used by the chat UI to turn a hex string (address or tx hash) into a
 * clickable link so users can verify a transaction without having to copy
 * the hash by hand. Keeping this in one place so the canonical URLs match
 * what the system prompt declares.
 */

const EXPLORERS: Record<number, string> = {
  1: "https://etherscan.io",
  5000: "https://mantlescan.xyz",
  11155111: "https://sepolia.etherscan.io",
  8453: "https://basescan.org",
  84532: "https://sepolia.basescan.org",
};

export type ExplorerEntity = "tx" | "address";

/**
 * Returns a full explorer URL for the given chainId + entity. Returns
 * null when the chain doesn't have a known explorer (callers can fall back
 * to plain text).
 */
export function getExplorerUrl(
  chainId: number | undefined,
  type: ExplorerEntity,
  value: string,
): string | null {
  if (!chainId) return null;
  const base = EXPLORERS[chainId];
  if (!base) return null;
  return `${base}/${type}/${value}`;
}

/** Classifies a hex string as a tx hash (64 nibbles) vs address (40 nibbles). */
export function classifyHex(text: string): ExplorerEntity | null {
  if (/^0x[a-fA-F0-9]{64}$/.test(text)) return "tx";
  if (/^0x[a-fA-F0-9]{40}$/.test(text)) return "address";
  return null;
}
