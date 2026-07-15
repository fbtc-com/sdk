/**
 * Aave V3 integration for the Function FBTC reserve (Ethereum + Mantle).
 *
 * The tool prepares unsigned ERC-20 approval and Pool.supply transactions.
 * The connected wallet remains responsible for signing both transactions.
 *
 * NOTE: Market constants are mirrored in @functionfbtc/sdk-agentkit `src/aave.ts`.
 * Keep addresses / decimals / reserve URLs in sync when either side changes.
 */
import type { Address } from 'viem';
import { encodeFunctionData, erc20Abi, parseUnits } from 'viem';
import type { z } from 'zod';

import {
  AaveFbtcReserveSchema,
  AaveFbtcReserveZod,
  AaveSupplyFbtcSchema,
  AaveSupplyFbtcZod,
} from './schemas';
import type { ToolDefinition } from './tools';

export const AAVE_V3_ETHEREUM_POOL =
  '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2' as const;
export const AAVE_V3_MANTLE_POOL =
  '0x458F293454fE0d67EC0655f3672301301DD51422' as const;

/** FBTC on Ethereum mainnet. */
export const FBTC_ETHEREUM_ADDRESS =
  '0xc96de26018a54d51c097160568752c4e3bd6c364' as const;
/**
 * FBTC on Mantle. Currently the same address as Ethereum, stored separately
 * so either chain can diverge later without a breaking rename.
 */
export const FBTC_MANTLE_ADDRESS =
  '0xc96de26018a54d51c097160568752c4e3bd6c364' as const;

export const FBTC_DECIMALS = 8;

export const AAVE_FBTC_RESERVE_URL =
  'https://app.aave.com/reserve-overview/?underlyingAsset=0xc96de26018a54d51c097160568752c4e3bd6c364&marketName=proto_mainnet_v3';
export const AAVE_FBTC_MANTLE_RESERVE_URL =
  'https://app.aave.com/reserve-overview/?underlyingAsset=0xc96de26018a54d51c097160568752c4e3bd6c364&marketName=proto_mantle_v3';

export interface AaveFbtcMarket {
  chainId: number;
  chain: string;
  fbtcAddress: `0x${string}`;
  poolAddress: `0x${string}`;
  reserveUrl: string;
  marketLabel: string;
}

export const AAVE_FBTC_MARKETS: Record<number, AaveFbtcMarket> = {
  1: {
    chainId: 1,
    chain: 'Ethereum',
    fbtcAddress: FBTC_ETHEREUM_ADDRESS,
    poolAddress: AAVE_V3_ETHEREUM_POOL,
    reserveUrl: AAVE_FBTC_RESERVE_URL,
    marketLabel: 'Aave V3 Ethereum',
  },
  5000: {
    chainId: 5000,
    chain: 'Mantle',
    fbtcAddress: FBTC_MANTLE_ADDRESS,
    poolAddress: AAVE_V3_MANTLE_POOL,
    reserveUrl: AAVE_FBTC_MANTLE_RESERVE_URL,
    marketLabel: 'Aave V3 Mantle',
  },
};

export function getAaveFbtcMarket(chainId = 1): AaveFbtcMarket {
  const market = AAVE_FBTC_MARKETS[chainId];
  if (!market) {
    const supported = Object.keys(AAVE_FBTC_MARKETS).join(', ');
    throw new Error(
      `Unsupported Aave FBTC market chainId: ${chainId}. Supported: ${supported}`,
    );
  }
  return market;
}

const aavePoolSupplyAbi = [
  {
    name: 'supply',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'onBehalfOf', type: 'address' },
      { name: 'referralCode', type: 'uint16' },
    ],
    outputs: [],
  },
] as const;

export const getAaveFbtcReserve: ToolDefinition<
  z.input<typeof AaveFbtcReserveZod>,
  {
    protocol: string;
    chainId: number;
    chain: string;
    token: string;
    tokenAddress: string;
    tokenDecimals: number;
    poolAddress: string;
    reserveUrl: string;
    description: string;
  }
> = {
  name: 'get_aave_fbtc_reserve',
  description:
    'Return FBTC reserve and Aave V3 Pool details. REQUIRED: pass chainId 1 for Ethereum or chainId 5000 for Mantle. Do not omit chainId when the user names a network.',
  parameters: AaveFbtcReserveSchema as Record<string, unknown>,
  schema: AaveFbtcReserveZod as z.ZodType<z.input<typeof AaveFbtcReserveZod>>,
  execute: async (params) => {
    const { chainId } = AaveFbtcReserveZod.parse(params);
    const market = getAaveFbtcMarket(chainId);
    return {
      protocol: 'Aave V3',
      chainId: market.chainId,
      chain: market.chain,
      token: 'FBTC',
      tokenAddress: market.fbtcAddress,
      tokenDecimals: FBTC_DECIMALS,
      poolAddress: market.poolAddress,
      reserveUrl: market.reserveUrl,
      description: `FBTC is available as a reserve in the ${market.marketLabel} market. Supplying requires an ERC-20 approval followed by Pool.supply.`,
    };
  },
};

export const prepareAaveSupplyFbtc: ToolDefinition<
  z.input<typeof AaveSupplyFbtcZod>,
  {
    action: string;
    method: string;
    params: Record<string, unknown>;
    description: string;
  }
> = {
  name: 'prepare_aave_supply_fbtc',
  description:
    'Prepare two transactions to supply FBTC to Aave V3 (Ethereum or Mantle): approve the Aave Pool, then call Pool.supply on behalf of the connected wallet. Pass chainId 1 (Ethereum) or 5000 (Mantle).',
  parameters: AaveSupplyFbtcSchema as Record<string, unknown>,
  schema: AaveSupplyFbtcZod as z.ZodType<z.input<typeof AaveSupplyFbtcZod>>,
  execute: async (params) => {
    const { amount, address, chainId } = AaveSupplyFbtcZod.parse(params);
    const market = getAaveFbtcMarket(chainId);
    const amountRaw = parseUnits(amount, FBTC_DECIMALS);

    const approveData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [market.poolAddress, amountRaw],
    });
    const supplyData = encodeFunctionData({
      abi: aavePoolSupplyAbi,
      functionName: 'supply',
      args: [market.fbtcAddress, amountRaw, address as Address, 0],
    });

    return {
      action: 'sdk_execute',
      method: 'aave.supplyFbtc',
      params: {
        chainId: market.chainId,
        asset: market.fbtcAddress,
        amount,
        onBehalfOf: address,
        transactions: [
          {
            to: market.fbtcAddress,
            data: approveData,
            label: `Approve Aave V3 Pool to spend ${amount} FBTC`,
          },
          {
            to: market.poolAddress,
            data: supplyData,
            label: `Supply ${amount} FBTC to ${market.marketLabel}`,
          },
        ],
      },
      description: `Supply ${amount} FBTC to the ${market.marketLabel} market. Your wallet will confirm two transactions: approve and supply.`,
    };
  },
};
