/**
 * Aave V3 Ethereum integration for the Function FBTC reserve.
 *
 * FBTC lives only on Ethereum mainnet. Read helpers can query mainnet
 * independently of the wallet's current network; write actions require
 * the wallet to be on ethereum-mainnet.
 */
import type { Address, Hex } from "viem";
import { encodeFunctionData, erc20Abi, parseUnits } from "viem";

export const AAVE_V3_ETHEREUM_POOL =
  "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2" as const;
export const FBTC_ETHEREUM_ADDRESS =
  "0xc96de26018a54d51c097160568752c4e3bd6c364" as const;
export const FBTC_DECIMALS = 8;
export const AAVE_FBTC_RESERVE_URL =
  "https://app.aave.com/reserve-overview/?underlyingAsset=0xc96de26018a54d51c097160568752c4e3bd6c364&marketName=proto_mainnet_v3";

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

export function getAaveFbtcReserveDetails() {
  return {
    protocol: "Aave V3",
    chainId: 1,
    chain: "Ethereum",
    token: "FBTC",
    tokenAddress: FBTC_ETHEREUM_ADDRESS,
    tokenDecimals: FBTC_DECIMALS,
    poolAddress: AAVE_V3_ETHEREUM_POOL,
    reserveUrl: AAVE_FBTC_RESERVE_URL,
    description:
      "FBTC is available as a reserve in the Aave V3 Ethereum Core market. Supplying requires an ERC-20 approval followed by Pool.supply.",
  };
}

export function buildAaveSupplyFbtcTransactions(
  amount: string,
  onBehalfOf: Address,
): {
  amountRaw: bigint;
  approve: { to: Address; data: Hex; label: string };
  supply: { to: Address; data: Hex; label: string };
} {
  const amountRaw = parseUnits(amount, FBTC_DECIMALS);

  const approveData = encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [AAVE_V3_ETHEREUM_POOL, amountRaw],
  });
  const supplyData = encodeFunctionData({
    abi: aavePoolSupplyAbi,
    functionName: "supply",
    args: [FBTC_ETHEREUM_ADDRESS, amountRaw, onBehalfOf, 0],
  });

  return {
    amountRaw,
    approve: {
      to: FBTC_ETHEREUM_ADDRESS,
      data: approveData,
      label: `Approve Aave V3 Pool to spend ${amount} FBTC`,
    },
    supply: {
      to: AAVE_V3_ETHEREUM_POOL,
      data: supplyData,
      label: `Supply ${amount} FBTC to Aave V3 Ethereum`,
    },
  };
}
