/**
 * Framework-agnostic Function FBTC agent tools.
 */
import type { Address } from 'viem';
import { erc20Abi, formatUnits } from 'viem';
import type { z } from 'zod';

import {
  getAaveAtokenBalance,
  getAaveFbtcReserve,
  getAaveUserAccount,
  prepareAaveBorrowStablecoin,
  prepareAaveRepayStablecoin,
  prepareAaveSupplyFbtc,
  prepareAaveWithdrawFbtc,
} from './aave';
import {
  FUNCTION_ASSETS,
  type FunctionAsset,
  resolveAssetByAddress,
  resolveAssetByName,
} from './assets';
import { getChainConfig, makePublicClient } from './chains';
import {
  type TokenBalanceParams,
  TokenBalanceSchema,
  TokenBalanceZod,
  TokenInfoSchema,
  TokenInfoZod,
} from './schemas';

export type ToolDefinition<TParams, TResult> = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  schema: z.ZodType<TParams>;
  execute: (params: TParams) => Promise<TResult>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyToolDefinition = ToolDefinition<any, any>;

export const getTokenInfo: ToolDefinition<
  { query?: string; address?: string; chainId?: number },
  {
    found: boolean;
    asset?: {
      symbol: string;
      name: string;
      description: string;
      decimals: number;
      isYieldBearing: boolean;
      addresses: Record<string, string>;
      notes?: string;
    };
    suggestions?: string[];
    note: string;
  }
> = {
  name: 'get_token_info',
  description:
    "Look up a Function FBTC-related asset by symbol, alias, or contract address. Returns the canonical name, description, decimals, and per-chain contract addresses.",
  parameters: TokenInfoSchema as Record<string, unknown>,
  schema: TokenInfoZod,
  execute: async (params) => {
    const suggestions = FUNCTION_ASSETS.map((a) => a.symbol);

    const formatAsset = (asset: FunctionAsset) => {
      const addrMap: Record<string, string> = {};
      for (const [k, v] of Object.entries(asset.addresses)) {
        if (v) addrMap[k] = v;
      }
      return {
        symbol: asset.symbol,
        name: asset.name,
        description: asset.description,
        decimals: asset.decimals,
        isYieldBearing: asset.isYieldBearing,
        addresses: addrMap,
        ...(asset.notes ? { notes: asset.notes } : {}),
      };
    };

    if (params.address && typeof params.chainId === 'number') {
      const found = resolveAssetByAddress(params.chainId, params.address);
      if (found) {
        return {
          found: true,
          asset: formatAsset(found),
          note: `Address ${params.address} on chainId ${params.chainId} is ${found.symbol}.`,
        };
      }
      return {
        found: false,
        suggestions,
        note: `Address ${params.address} on chainId ${params.chainId} is not a known Function asset.`,
      };
    }

    if (params.query) {
      const found = resolveAssetByName(params.query);
      if (found) {
        return {
          found: true,
          asset: formatAsset(found),
          note: `Resolved "${params.query}" to ${found.symbol}.`,
        };
      }
      return {
        found: false,
        suggestions,
        note: `No Function asset matched "${params.query}".`,
      };
    }

    return {
      found: false,
      suggestions,
      note: 'Provide a query or address + chainId.',
    };
  },
};

export const getTokenBalance: ToolDefinition<
  TokenBalanceParams,
  {
    balance: string;
    symbol: string;
    tokenAddress: string;
    chain: string;
    chainId: number;
  }
> = {
  name: 'get_token_balance',
  description:
    'Check the balance of any ERC-20 token for a wallet address. ' +
    'Requires the token contract address (0x...) and chainId. ' +
    'REQUIRED: pass chainId 1 for Ethereum or chainId 5000 for Mantle when the user names a network. ' +
    'Use FBTC address 0xc96de26018a54d51c097160568752c4e3bd6c364.',
  parameters: TokenBalanceSchema as Record<string, unknown>,
  schema: TokenBalanceZod as z.ZodType<TokenBalanceParams>,
  execute: async (params) => {
    const { tokenAddress, address, chainId } = TokenBalanceZod.parse(params);
    const config = getChainConfig(chainId);
    const client = makePublicClient(config.chainId);

    const reportedChainId = await client.getChainId();
    if (reportedChainId !== config.chainId) {
      throw new Error(
        `RPC chain mismatch: expected chainId ${config.chainId} (${config.name}), ` +
          `but the RPC reported ${reportedChainId}. ` +
          `Set ${config.chainId === 5000 ? 'MANTLE_RPC_URL' : 'ETH_RPC_URL'} to an endpoint on the correct chain.`,
      );
    }

    const [balance, decimals, symbol] = await Promise.all([
      client.readContract({
        address: tokenAddress as Address,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [address as Address],
      }),
      client.readContract({
        address: tokenAddress as Address,
        abi: erc20Abi,
        functionName: 'decimals',
      }),
      client.readContract({
        address: tokenAddress as Address,
        abi: erc20Abi,
        functionName: 'symbol',
      }),
    ]);
    return {
      balance: formatUnits(balance, decimals),
      symbol,
      tokenAddress,
      chain: config.name,
      chainId: config.chainId,
    };
  },
};

export {
  getAaveAtokenBalance,
  getAaveFbtcReserve,
  getAaveUserAccount,
  prepareAaveBorrowStablecoin,
  prepareAaveRepayStablecoin,
  prepareAaveSupplyFbtc,
  prepareAaveWithdrawFbtc,
};

/**
 * All Function FBTC tools.
 */
export const allTools: AnyToolDefinition[] = [
  getTokenBalance,
  getTokenInfo,
  getAaveFbtcReserve,
  getAaveAtokenBalance,
  getAaveUserAccount,
  prepareAaveSupplyFbtc,
  prepareAaveWithdrawFbtc,
  prepareAaveBorrowStablecoin,
  prepareAaveRepayStablecoin,
];

/**
 * All tools as a name-keyed record.
 */
export const toolsByName: Record<string, AnyToolDefinition> =
  Object.fromEntries(allTools.map((t) => [t.name, t]));
