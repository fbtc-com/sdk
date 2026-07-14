/**
 * Aave V3 integration for the Function FBTC reserve (Ethereum Core + Mantle).
 *
 * Read helpers can query a supported market independently of the wallet's
 * current network; write actions require the wallet to be on that market's
 * network (ethereum-mainnet or mantle-mainnet).
 *
 * NOTE: Market constants are mirrored in @functionFBTC/sdk-agent `src/aave.ts`.
 * Keep addresses / decimals / reserve URLs in sync when either side changes.
 */
import type { Address, Hex } from "viem";
import { encodeFunctionData, erc20Abi, parseUnits } from "viem";

export const AAVE_V3_ETHEREUM_POOL =
  "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2" as const;
export const AAVE_V3_MANTLE_POOL =
  "0x458F293454fE0d67EC0655f3672301301DD51422" as const;

/** FBTC on Ethereum mainnet. */
export const FBTC_ETHEREUM_ADDRESS =
  "0xc96de26018a54d51c097160568752c4e3bd6c364" as const;
/**
 * FBTC on Mantle. Currently the same address as Ethereum, stored separately
 * so either chain can diverge later without a breaking rename.
 */
export const FBTC_MANTLE_ADDRESS =
  "0xc96de26018a54d51c097160568752c4e3bd6c364" as const;

export const FBTC_DECIMALS = 8;

export const AAVE_FBTC_RESERVE_URL =
  "https://app.aave.com/reserve-overview/?underlyingAsset=0xc96de26018a54d51c097160568752c4e3bd6c364&marketName=proto_mainnet_v3";
export const AAVE_FBTC_MANTLE_RESERVE_URL =
  "https://app.aave.com/reserve-overview/?underlyingAsset=0xc96de26018a54d51c097160568752c4e3bd6c364&marketName=proto_mantle_v3";

export interface AaveFbtcMarket {
  chainId: number;
  chain: string;
  networkId: string;
  fbtcAddress: `0x${string}`;
  poolAddress: `0x${string}`;
  reserveUrl: string;
  marketLabel: string;
}

export const AAVE_FBTC_MARKETS: Record<number, AaveFbtcMarket> = {
  1: {
    chainId: 1,
    chain: "Ethereum",
    networkId: "ethereum-mainnet",
    fbtcAddress: FBTC_ETHEREUM_ADDRESS,
    poolAddress: AAVE_V3_ETHEREUM_POOL,
    reserveUrl: AAVE_FBTC_RESERVE_URL,
    marketLabel: "Aave V3 Ethereum Core",
  },
  5000: {
    chainId: 5000,
    chain: "Mantle",
    networkId: "mantle-mainnet",
    fbtcAddress: FBTC_MANTLE_ADDRESS,
    poolAddress: AAVE_V3_MANTLE_POOL,
    reserveUrl: AAVE_FBTC_MANTLE_RESERVE_URL,
    marketLabel: "Aave V3 Mantle",
  },
};

export function getAaveFbtcMarket(chainId = 1): AaveFbtcMarket {
  const market = AAVE_FBTC_MARKETS[chainId];
  if (!market) {
    const supported = Object.keys(AAVE_FBTC_MARKETS).join(", ");
    throw new Error(
      `Unsupported Aave FBTC market chainId: ${chainId}. Supported: ${supported}`,
    );
  }
  return market;
}

export function getAaveFbtcMarketByNetworkId(
  networkId: string,
): AaveFbtcMarket | null {
  return (
    Object.values(AAVE_FBTC_MARKETS).find((m) => m.networkId === networkId) ??
    null
  );
}

const aavePoolSupplyAbi = [
  {
    name: "supply",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "onBehalfOf", type: "address" },
      { name: "referralCode", type: "uint16" },
    ],
    outputs: [],
  },
] as const;

export function getAaveFbtcReserveDetails(chainId = 1) {
  const market = getAaveFbtcMarket(chainId);
  return {
    protocol: "Aave V3",
    chainId: market.chainId,
    chain: market.chain,
    networkId: market.networkId,
    token: "FBTC",
    tokenAddress: market.fbtcAddress,
    tokenDecimals: FBTC_DECIMALS,
    poolAddress: market.poolAddress,
    reserveUrl: market.reserveUrl,
    description: `FBTC is available as a reserve in the ${market.marketLabel} market. Supplying requires an ERC-20 approval followed by Pool.supply.`,
  };
}

export function buildAaveSupplyFbtcTransactions(
  amount: string,
  onBehalfOf: Address,
  chainId = 1,
): {
  amountRaw: bigint;
  market: AaveFbtcMarket;
  approve: { to: Address; data: Hex; label: string };
  supply: { to: Address; data: Hex; label: string };
} {
  const market = getAaveFbtcMarket(chainId);
  const amountRaw = parseUnits(amount, FBTC_DECIMALS);

  const approveData = encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [market.poolAddress, amountRaw],
  });
  const supplyData = encodeFunctionData({
    abi: aavePoolSupplyAbi,
    functionName: "supply",
    args: [market.fbtcAddress, amountRaw, onBehalfOf, 0],
  });

  return {
    amountRaw,
    market,
    approve: {
      to: market.fbtcAddress,
      data: approveData,
      label: `Approve Aave V3 Pool to spend ${amount} FBTC`,
    },
    supply: {
      to: market.poolAddress,
      data: supplyData,
      label: `Supply ${amount} FBTC to ${market.marketLabel}`,
    },
  };
}
