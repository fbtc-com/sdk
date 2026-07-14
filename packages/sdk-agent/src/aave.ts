/**
 * Aave V3 Ethereum integration for the Function FBTC reserve.
 *
 * The tool prepares unsigned ERC-20 approval and Pool.supply transactions.
 * The connected wallet remains responsible for signing both transactions.
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
export const FBTC_ETHEREUM_ADDRESS =
  '0xc96de26018a54d51c097160568752c4e3bd6c364' as const;
export const FBTC_DECIMALS = 8;
export const AAVE_FBTC_RESERVE_URL =
  'https://app.aave.com/reserve-overview/?underlyingAsset=0xc96de26018a54d51c097160568752c4e3bd6c364&marketName=proto_mainnet_v3';

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
  z.infer<typeof AaveFbtcReserveZod>,
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
    'Return the canonical FBTC reserve and Aave V3 Pool details for Ethereum mainnet. Use this before preparing an FBTC supply when the user asks for reserve details.',
  parameters: AaveFbtcReserveSchema as Record<string, unknown>,
  schema: AaveFbtcReserveZod,
  execute: async () => ({
    protocol: 'Aave V3',
    chainId: 1,
    chain: 'Ethereum',
    token: 'FBTC',
    tokenAddress: FBTC_ETHEREUM_ADDRESS,
    tokenDecimals: FBTC_DECIMALS,
    poolAddress: AAVE_V3_ETHEREUM_POOL,
    reserveUrl: AAVE_FBTC_RESERVE_URL,
    description:
      'FBTC is available as a reserve in the Aave V3 Ethereum Core market. Supplying requires an ERC-20 approval followed by Pool.supply.',
  }),
};

export const prepareAaveSupplyFbtc: ToolDefinition<
  z.infer<typeof AaveSupplyFbtcZod>,
  {
    action: string;
    method: string;
    params: Record<string, unknown>;
    description: string;
  }
> = {
  name: 'prepare_aave_supply_fbtc',
  description:
    'Prepare two Ethereum mainnet transactions to supply FBTC to Aave V3: approve the Aave Pool, then call Pool.supply on behalf of the connected wallet.',
  parameters: AaveSupplyFbtcSchema as Record<string, unknown>,
  schema: AaveSupplyFbtcZod,
  execute: async (params) => {
    const { amount, address } = AaveSupplyFbtcZod.parse(params);
    const amountRaw = parseUnits(amount, FBTC_DECIMALS);

    const approveData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [AAVE_V3_ETHEREUM_POOL, amountRaw],
    });
    const supplyData = encodeFunctionData({
      abi: aavePoolSupplyAbi,
      functionName: 'supply',
      args: [FBTC_ETHEREUM_ADDRESS, amountRaw, address as Address, 0],
    });

    return {
      action: 'sdk_execute',
      method: 'aave.supplyFbtc',
      params: {
        chainId: 1,
        asset: FBTC_ETHEREUM_ADDRESS,
        amount,
        onBehalfOf: address,
        transactions: [
          {
            to: FBTC_ETHEREUM_ADDRESS,
            data: approveData,
            label: `Approve Aave V3 Pool to spend ${amount} FBTC`,
          },
          {
            to: AAVE_V3_ETHEREUM_POOL,
            data: supplyData,
            label: `Supply ${amount} FBTC to Aave V3 Ethereum`,
          },
        ],
      },
      description: `Supply ${amount} FBTC to the Aave V3 Ethereum Core market. Your wallet will confirm two transactions: approve and supply.`,
    };
  },
};
