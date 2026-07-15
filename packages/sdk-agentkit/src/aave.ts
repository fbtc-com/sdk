/**
 * Aave V3 integration for the Function FBTC reserve (Ethereum + Mantle).
 *
 * Read helpers select a market by networkId independently of the wallet.
 * Write actions require the wallet to be on the same networkId.
 *
 * NOTE: Market constants are mirrored in @functionfbtc/sdk-agent `src/aave.ts`.
 * Keep addresses / decimals / reserve URLs in sync when either side changes.
 */
import type { Address, Hex } from "viem";
import { encodeFunctionData, erc20Abi, parseUnits } from "viem";

import {
  DEFAULT_NETWORK_ID,
  type FbtcNetworkId,
  isFbtcNetworkId,
  NETWORK_ID_TO_VIEM_CHAIN,
} from "./networks";

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
  networkId: FbtcNetworkId;
  chain: string;
  /** viem / RPC numeric id — internal only. */
  chainId: number;
  fbtcAddress: `0x${string}`;
  poolAddress: `0x${string}`;
  reserveUrl: string;
  marketLabel: string;
}

export const AAVE_FBTC_MARKETS_BY_NETWORK: Record<
  FbtcNetworkId,
  AaveFbtcMarket
> = {
  "ethereum-mainnet": {
    networkId: "ethereum-mainnet",
    chain: "Ethereum",
    chainId: NETWORK_ID_TO_VIEM_CHAIN["ethereum-mainnet"].id,
    fbtcAddress: FBTC_ETHEREUM_ADDRESS,
    poolAddress: AAVE_V3_ETHEREUM_POOL,
    reserveUrl: AAVE_FBTC_RESERVE_URL,
    marketLabel: "Aave V3 Ethereum",
  },
  "mantle-mainnet": {
    networkId: "mantle-mainnet",
    chain: "Mantle",
    chainId: NETWORK_ID_TO_VIEM_CHAIN["mantle-mainnet"].id,
    fbtcAddress: FBTC_MANTLE_ADDRESS,
    poolAddress: AAVE_V3_MANTLE_POOL,
    reserveUrl: AAVE_FBTC_MANTLE_RESERVE_URL,
    marketLabel: "Aave V3 Mantle",
  },
};

/** @deprecated Prefer AAVE_FBTC_MARKETS_BY_NETWORK keyed by networkId. */
export const AAVE_FBTC_MARKETS: Record<number, AaveFbtcMarket> = {
  [AAVE_FBTC_MARKETS_BY_NETWORK["ethereum-mainnet"].chainId]:
    AAVE_FBTC_MARKETS_BY_NETWORK["ethereum-mainnet"],
  [AAVE_FBTC_MARKETS_BY_NETWORK["mantle-mainnet"].chainId]:
    AAVE_FBTC_MARKETS_BY_NETWORK["mantle-mainnet"],
};

/**
 * Look up the Aave FBTC market for a networkId.
 *
 * @throws {Error} If `networkId` is not a supported FbtcNetworkId
 *   (`ethereum-mainnet` | `mantle-mainnet`). Callers that need a soft miss
 *   should check `isFbtcNetworkId` first or catch this error.
 */
export function getAaveFbtcMarketByNetworkId(
  networkId: string = DEFAULT_NETWORK_ID,
): AaveFbtcMarket {
  if (!isFbtcNetworkId(networkId)) {
    throw new Error(
      `Unsupported networkId: ${networkId}. Supported: ${Object.keys(AAVE_FBTC_MARKETS_BY_NETWORK).join(", ")}`,
    );
  }
  return AAVE_FBTC_MARKETS_BY_NETWORK[networkId];
}

/** @deprecated Prefer getAaveFbtcMarketByNetworkId. */
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

export function getAaveFbtcReserveDetails(
  networkId: string = DEFAULT_NETWORK_ID,
) {
  const market = getAaveFbtcMarketByNetworkId(networkId);
  return {
    protocol: "Aave V3",
    networkId: market.networkId,
    chain: market.chain,
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
  networkId: string = DEFAULT_NETWORK_ID,
): {
  amountRaw: bigint;
  market: AaveFbtcMarket;
  approve: { to: Address; data: Hex; label: string };
  supply: { to: Address; data: Hex; label: string };
} {
  const market = getAaveFbtcMarketByNetworkId(networkId);
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
