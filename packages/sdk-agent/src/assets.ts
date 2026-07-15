/**
 * Canonical Function FBTC asset metadata for agent tool lookups.
 */
import {
  FBTC_DECIMALS,
  FBTC_ETHEREUM_ADDRESS,
  FBTC_MANTLE_ADDRESS,
} from './aave';

export interface FunctionAsset {
  symbol: string;
  name: string;
  description: string;
  decimals: number;
  isYieldBearing: boolean;
  addresses: Record<number, string>;
  aliases: string[];
  notes?: string;
}

export const FUNCTION_ASSETS: FunctionAsset[] = [
  {
    symbol: 'FBTC',
    name: 'Function Bitcoin',
    description:
      'Function FBTC ERC-20 on Ethereum mainnet and Mantle. Can be supplied to Aave V3 Ethereum or Aave V3 Mantle.',
    decimals: FBTC_DECIMALS,
    isYieldBearing: false,
    addresses: {
      1: FBTC_ETHEREUM_ADDRESS,
      5000: FBTC_MANTLE_ADDRESS,
    },
    aliases: ['fbtc', 'function btc', 'function bitcoin'],
    notes:
      'Listed on Ethereum mainnet (chainId 1) and Mantle (chainId 5000). Addresses are stored per-chain even when identical.',
  },
];

export const FUNCTION_ASSETS_GLOSSARY = FUNCTION_ASSETS.map(
  (a) => `${a.symbol}: ${a.description}`,
).join('\n');

export function buildAssetGlossary(): string {
  return FUNCTION_ASSETS_GLOSSARY;
}

export function resolveAssetByName(query: string): FunctionAsset | undefined {
  const normalized = query.trim().toLowerCase();
  return FUNCTION_ASSETS.find(
    (a) =>
      a.symbol.toLowerCase() === normalized ||
      a.name.toLowerCase() === normalized ||
      a.aliases.includes(normalized),
  );
}

export function resolveAssetByAddress(
  chainId: number,
  address: string,
): FunctionAsset | undefined {
  const normalized = address.toLowerCase();
  return FUNCTION_ASSETS.find(
    (a) => a.addresses[chainId]?.toLowerCase() === normalized,
  );
}
