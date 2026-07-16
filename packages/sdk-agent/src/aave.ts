/**
 * Aave V3 integration for the Function FBTC reserve (Ethereum + Mantle).
 *
 * Read tools query aToken balances and user account risk metrics on-chain.
 * Write tools prepare unsigned transactions; the connected wallet signs them.
 *
 * NOTE: Market constants are mirrored in @functionfbtc/sdk-agentkit `src/aave.ts`.
 * Keep addresses / decimals / reserve URLs in sync when either side changes.
 */
import type { Address } from 'viem';
import {
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  maxUint256,
  parseUnits,
} from 'viem';
import type { z } from 'zod';

import { makePublicClient } from './chains';
import {
  type AaveAtokenBalanceParams,
  AaveAtokenBalanceSchema,
  AaveAtokenBalanceZod,
  type AaveBorrowStablecoinParams,
  AaveBorrowStablecoinSchema,
  AaveBorrowStablecoinZod,
  type AaveFbtcReserveParams,
  AaveFbtcReserveSchema,
  AaveFbtcReserveZod,
  type AaveRepayStablecoinParams,
  AaveRepayStablecoinSchema,
  AaveRepayStablecoinZod,
  type AaveStablecoinSymbol,
  type AaveSupplyFbtcParams,
  AaveSupplyFbtcSchema,
  AaveSupplyFbtcZod,
  type AaveUserAccountParams,
  AaveUserAccountSchema,
  AaveUserAccountZod,
  type AaveWithdrawFbtcParams,
  AaveWithdrawFbtcSchema,
  AaveWithdrawFbtcZod,
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

/** Aave V3 aFBTC on Ethereum. */
export const AFBTC_ETHEREUM_ADDRESS =
  '0xcCA43ceF272c30415866914351fdfc3E881bb7c2' as const;
/** Aave V3 aFBTC on Mantle. */
export const AFBTC_MANTLE_ADDRESS =
  '0xfa14c9DE267b59A586043372bd98Ed99e3Ee0533' as const;

/** Variable interest rate mode (stable rate is deprecated on Aave V3). */
export const AAVE_VARIABLE_RATE_MODE = 2;
/** Mantle Aave V3 eMode category used for FBTC-backed stablecoin borrowing. */
export const AAVE_MANTLE_FBTC_EMODE_CATEGORY_ID = 3;

/**
 * Soft safety cap on post-borrow utilization (debt / collateral).
 * Stricter than Aave's protocol max LTV — borrows that would push utilization
 * above this are rejected before calldata is prepared / sent.
 */
export const MAX_POST_BORROW_LTV_BPS = 5500n;

export const AAVE_V3_ETHEREUM_ORACLE =
  '0x54586bE62E3c3580375aE3723C145253060Ca0C2' as const;
export const AAVE_V3_MANTLE_ORACLE =
  '0x47a063CfDa980532267970d478EC340C0F80E8df' as const;

export const AAVE_FBTC_RESERVE_URL =
  'https://app.aave.com/reserve-overview/?underlyingAsset=0xc96de26018a54d51c097160568752c4e3bd6c364&marketName=proto_mainnet_v3';
export const AAVE_FBTC_MANTLE_RESERVE_URL =
  'https://app.aave.com/reserve-overview/?underlyingAsset=0xc96de26018a54d51c097160568752c4e3bd6c364&marketName=proto_mantle_v3';

export interface AaveStablecoin {
  symbol: AaveStablecoinSymbol;
  /** On-chain / UI label (e.g. USDT0 on Mantle). */
  label: string;
  address: `0x${string}`;
  /** Aave variable debt token — used to size repay 'max' without infinite approve. */
  variableDebtTokenAddress: `0x${string}`;
  decimals: number;
}

export interface AaveFbtcMarket {
  chainId: number;
  chain: string;
  fbtcAddress: `0x${string}`;
  aTokenAddress: `0x${string}`;
  poolAddress: `0x${string}`;
  oracleAddress: `0x${string}`;
  reserveUrl: string;
  marketLabel: string;
  stablecoins: Record<AaveStablecoinSymbol, AaveStablecoin>;
}

/** 1% buffer on approve when repaying max (covers accrual between approve and repay). */
export const REPAY_MAX_APPROVE_BUFFER_BPS = 100n;

export const AAVE_FBTC_MARKETS: Record<number, AaveFbtcMarket> = {
  1: {
    chainId: 1,
    chain: 'Ethereum',
    fbtcAddress: FBTC_ETHEREUM_ADDRESS,
    aTokenAddress: AFBTC_ETHEREUM_ADDRESS,
    poolAddress: AAVE_V3_ETHEREUM_POOL,
    oracleAddress: AAVE_V3_ETHEREUM_ORACLE,
    reserveUrl: AAVE_FBTC_RESERVE_URL,
    marketLabel: 'Aave V3 Ethereum',
    stablecoins: {
      USDC: {
        symbol: 'USDC',
        label: 'USDC',
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        variableDebtTokenAddress: '0x72E95b8931767C79bA4EeE721354d6E99a61D004',
        decimals: 6,
      },
      USDT: {
        symbol: 'USDT',
        label: 'USDT',
        address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        variableDebtTokenAddress: '0x6df1C1E379bC5a00a7b4C6e67A203333772f45A8',
        decimals: 6,
      },
      USDe: {
        symbol: 'USDe',
        label: 'USDe',
        address: '0x4c9EDD5852cd905f086C759E8383e09bff1E68B3',
        variableDebtTokenAddress: '0x015396E1F286289aE23a762088E863b3ec465145',
        decimals: 18,
      },
    },
  },
  5000: {
    chainId: 5000,
    chain: 'Mantle',
    fbtcAddress: FBTC_MANTLE_ADDRESS,
    aTokenAddress: AFBTC_MANTLE_ADDRESS,
    poolAddress: AAVE_V3_MANTLE_POOL,
    oracleAddress: AAVE_V3_MANTLE_ORACLE,
    reserveUrl: AAVE_FBTC_MANTLE_RESERVE_URL,
    marketLabel: 'Aave V3 Mantle',
    stablecoins: {
      USDC: {
        symbol: 'USDC',
        label: 'USDC',
        address: '0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9',
        variableDebtTokenAddress: '0xCea474BDa7Ad0a8F62e938a5563edfAEf7368Fc0',
        decimals: 6,
      },
      USDT: {
        symbol: 'USDT',
        label: 'USDT0',
        address: '0x779Ded0c9e1022225f8E0630b35a9b54bE713736',
        variableDebtTokenAddress: '0x5d9e4663d3d532179c404dBe9edF93045F89aDed',
        decimals: 6,
      },
      USDe: {
        symbol: 'USDe',
        label: 'USDe',
        address: '0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34',
        variableDebtTokenAddress: '0x0169FD279c8c656037E5D199Cff8137f1e2d807c',
        decimals: 18,
      },
    },
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

export function getAaveStablecoin(
  market: AaveFbtcMarket,
  symbol: AaveStablecoinSymbol,
): AaveStablecoin {
  return market.stablecoins[symbol];
}

const aavePoolAbi = [
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
  {
    name: 'setUserUseReserveAsCollateral',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'useAsCollateral', type: 'bool' },
    ],
    outputs: [],
  },
  {
    name: 'setUserEMode',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'categoryId', type: 'uint8' }],
    outputs: [],
  },
  {
    name: 'getUserConfiguration',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: 'data', type: 'uint256' }],
  },
  {
    name: 'getUserEMode',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getReserveData',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'asset', type: 'address' }],
    outputs: [
      { name: 'configuration', type: 'uint256' },
      { name: 'liquidityIndex', type: 'uint128' },
      { name: 'currentLiquidityRate', type: 'uint128' },
      { name: 'variableBorrowIndex', type: 'uint128' },
      { name: 'currentVariableBorrowRate', type: 'uint128' },
      { name: 'currentStableBorrowRate', type: 'uint128' },
      { name: 'lastUpdateTimestamp', type: 'uint40' },
      { name: 'id', type: 'uint16' },
      { name: 'aTokenAddress', type: 'address' },
      { name: 'stableDebtTokenAddress', type: 'address' },
      { name: 'variableDebtTokenAddress', type: 'address' },
      { name: 'interestRateStrategyAddress', type: 'address' },
      { name: 'accruedToTreasury', type: 'uint128' },
      { name: 'unbacked', type: 'uint128' },
      { name: 'isolationModeTotalDebt', type: 'uint128' },
    ],
  },
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'to', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'borrow',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'interestRateMode', type: 'uint256' },
      { name: 'referralCode', type: 'uint16' },
      { name: 'onBehalfOf', type: 'address' },
    ],
    outputs: [],
  },
  {
    name: 'repay',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'interestRateMode', type: 'uint256' },
      { name: 'onBehalfOf', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getUserAccountData',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [
      { name: 'totalCollateralBase', type: 'uint256' },
      { name: 'totalDebtBase', type: 'uint256' },
      { name: 'availableBorrowsBase', type: 'uint256' },
      { name: 'currentLiquidationThreshold', type: 'uint256' },
      { name: 'ltv', type: 'uint256' },
      { name: 'healthFactor', type: 'uint256' },
    ],
  },
] as const;

const aaveOracleAbi = [
  {
    name: 'getAssetPrice',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'asset', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

/** Aave base currency uses 8 decimals (USD). */
const AAVE_BASE_CURRENCY_DECIMALS = 8;

export interface AaveSupplySetupState {
  collateralEnabled: boolean;
  eModeCategoryId: number;
}

export function isReserveUsedAsCollateral(
  userConfiguration: bigint,
  reserveId: number,
): boolean {
  const collateralBit = BigInt(reserveId) * 2n + 1n;
  return ((userConfiguration >> collateralBit) & 1n) === 1n;
}

async function fetchAaveSupplySetupState(
  user: Address,
  market: AaveFbtcMarket,
): Promise<AaveSupplySetupState> {
  const client = makePublicClient(market.chainId);
  const reportedChainId = await client.getChainId();
  if (reportedChainId !== market.chainId) {
    throw new Error(
      `RPC chain mismatch: expected chainId ${market.chainId} (${market.chain}), ` +
        `but the RPC reported ${reportedChainId}. Set MANTLE_RPC_URL to an endpoint on the correct chain.`,
    );
  }

  const [userConfiguration, eModeCategoryId, reserveData] = await Promise.all([
    client.readContract({
      address: market.poolAddress,
      abi: aavePoolAbi,
      functionName: 'getUserConfiguration',
      args: [user],
    }),
    client.readContract({
      address: market.poolAddress,
      abi: aavePoolAbi,
      functionName: 'getUserEMode',
      args: [user],
    }),
    client.readContract({
      address: market.poolAddress,
      abi: aavePoolAbi,
      functionName: 'getReserveData',
      args: [market.fbtcAddress],
    }),
  ]);

  return {
    collateralEnabled: isReserveUsedAsCollateral(
      userConfiguration,
      reserveData[7],
    ),
    eModeCategoryId: Number(eModeCategoryId),
  };
}

/**
 * Convert an asset amount into Aave base-currency units (USD, 8 decimals)
 * using the market oracle price.
 */
export function assetAmountToBaseCurrency(
  amountRaw: bigint,
  decimals: number,
  oraclePrice: bigint,
): bigint {
  return (amountRaw * oraclePrice) / 10n ** BigInt(decimals);
}

/**
 * Assert that borrowing `borrowAmountBase` keeps utilization
 * (debt / collateral) at or below `MAX_POST_BORROW_LTV_BPS` (55%).
 *
 * Note: this is current utilization, not Aave's configured max LTV from
 * getUserAccountData().ltv.
 */
export function assertPostBorrowLtvWithinLimit(
  totalCollateralBase: bigint,
  totalDebtBase: bigint,
  borrowAmountBase: bigint,
  maxLtvBps: bigint = MAX_POST_BORROW_LTV_BPS,
): {
  currentLtvBps: bigint;
  projectedLtvBps: bigint;
  maxBorrowBase: bigint;
} {
  if (totalCollateralBase === 0n) {
    throw new Error(
      'Cannot borrow: account has no collateral on this Aave market.',
    );
  }

  const currentLtvBps = (totalDebtBase * 10_000n) / totalCollateralBase;
  const projectedLtvBps =
    ((totalDebtBase + borrowAmountBase) * 10_000n) / totalCollateralBase;
  const maxDebtBase = (totalCollateralBase * maxLtvBps) / 10_000n;
  const maxBorrowBase =
    maxDebtBase > totalDebtBase ? maxDebtBase - totalDebtBase : 0n;

  if (projectedLtvBps > maxLtvBps) {
    throw new Error(
      `Borrow rejected: projected utilization LTV ${formatBps(projectedLtvBps)} ` +
        `would exceed the ${formatBps(maxLtvBps)} safety limit ` +
        `(current ${formatBps(currentLtvBps)}). ` +
        `Max additional borrow ≈ $${formatUnits(maxBorrowBase, AAVE_BASE_CURRENCY_DECIMALS)} (Aave base).`,
    );
  }

  return { currentLtvBps, projectedLtvBps, maxBorrowBase };
}

/**
 * On-chain preflight: reject borrows that would push utilization above 55%.
 */
export async function ensureBorrowWithinMaxLtv(params: {
  user: Address;
  market: AaveFbtcMarket;
  asset: Address;
  amountRaw: bigint;
  decimals: number;
}): Promise<{
  currentLtvBps: bigint;
  projectedLtvBps: bigint;
  maxBorrowBase: bigint;
  borrowAmountBase: bigint;
}> {
  const { user, market, asset, amountRaw, decimals } = params;
  const client = makePublicClient(market.chainId);

  const reportedChainId = await client.getChainId();
  if (reportedChainId !== market.chainId) {
    throw new Error(
      `RPC chain mismatch: expected chainId ${market.chainId} (${market.chain}), ` +
        `but the RPC reported ${reportedChainId}. ` +
        `Set ${market.chainId === 5000 ? 'MANTLE_RPC_URL' : 'ETH_RPC_URL'} to an endpoint on the correct chain.`,
    );
  }

  const [[totalCollateralBase, totalDebtBase], oraclePrice] = await Promise.all(
    [
      client.readContract({
        address: market.poolAddress,
        abi: aavePoolAbi,
        functionName: 'getUserAccountData',
        args: [user],
      }),
      client.readContract({
        address: market.oracleAddress,
        abi: aaveOracleAbi,
        functionName: 'getAssetPrice',
        args: [asset],
      }),
    ],
  );

  const borrowAmountBase = assetAmountToBaseCurrency(
    amountRaw,
    decimals,
    oraclePrice,
  );
  const check = assertPostBorrowLtvWithinLimit(
    totalCollateralBase,
    totalDebtBase,
    borrowAmountBase,
  );

  return { ...check, borrowAmountBase };
}

function formatBps(value: bigint): string {
  return `${(Number(value) / 100).toFixed(2)}%`;
}

function formatHealthFactor(healthFactor: bigint): string {
  // No debt → protocol returns type(uint256).max
  if (healthFactor >= maxUint256 / 2n) {
    return '∞';
  }
  return formatUnits(healthFactor, 18);
}

function parseAmountOrMax(amount: string, decimals: number): bigint {
  if (amount.toLowerCase() === 'max') {
    return maxUint256;
  }
  return parseUnits(amount, decimals);
}

/**
 * Resolve repay amounts. For `max`, reads variable-debt token balance and
 * approves debt + 1% buffer (no infinite allowance). Rejects zero debt.
 */
export async function resolveRepayAmounts(params: {
  amount: string;
  user: Address;
  market: AaveFbtcMarket;
  stablecoin: AaveStablecoin;
}): Promise<{
  approveAmountRaw: bigint;
  repayAmountRaw: bigint;
  debtRaw: bigint | null;
  isMax: boolean;
  amountLabel: string;
}> {
  const { amount, user, market, stablecoin } = params;
  const isMax = amount.toLowerCase() === 'max';

  if (!isMax) {
    const raw = parseUnits(amount, stablecoin.decimals);
    return {
      approveAmountRaw: raw,
      repayAmountRaw: raw,
      debtRaw: null,
      isMax: false,
      amountLabel: amount,
    };
  }

  const client = makePublicClient(market.chainId);
  const reportedChainId = await client.getChainId();
  if (reportedChainId !== market.chainId) {
    throw new Error(
      `RPC chain mismatch: expected chainId ${market.chainId} (${market.chain}), ` +
        `but the RPC reported ${reportedChainId}. ` +
        `Set ${market.chainId === 5000 ? 'MANTLE_RPC_URL' : 'ETH_RPC_URL'} to an endpoint on the correct chain.`,
    );
  }

  const debtRaw = await client.readContract({
    address: stablecoin.variableDebtTokenAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [user],
  });

  if (debtRaw === 0n) {
    throw new Error(
      `No variable ${stablecoin.label} debt to repay on ${market.marketLabel}.`,
    );
  }

  const approveAmountRaw =
    (debtRaw * (10_000n + REPAY_MAX_APPROVE_BUFFER_BPS)) / 10_000n;

  return {
    approveAmountRaw,
    // Pool.repay pulls min(amount, debt); maxUint256 clears all debt within allowance.
    repayAmountRaw: maxUint256,
    debtRaw,
    isMax: true,
    amountLabel: 'MAX',
  };
}

type PreparedTxResult = {
  action: string;
  method: string;
  params: Record<string, unknown>;
  description: string;
};

export const getAaveFbtcReserve: ToolDefinition<
  AaveFbtcReserveParams,
  {
    protocol: string;
    chainId: number;
    chain: string;
    token: string;
    tokenAddress: string;
    aTokenAddress: string;
    tokenDecimals: number;
    poolAddress: string;
    reserveUrl: string;
    stablecoins: Array<{
      symbol: string;
      label: string;
      address: string;
      decimals: number;
    }>;
    description: string;
  }
> = {
  name: 'get_aave_fbtc_reserve',
  description:
    'Return FBTC reserve and Aave V3 Pool details, including aFBTC and borrowable stablecoin addresses. REQUIRED: pass chainId 1 for Ethereum or chainId 5000 for Mantle. Do not omit chainId when the user names a network.',
  parameters: AaveFbtcReserveSchema as Record<string, unknown>,
  schema: AaveFbtcReserveZod as z.ZodType<AaveFbtcReserveParams>,
  execute: async (params) => {
    const { chainId } = AaveFbtcReserveZod.parse(params);
    const market = getAaveFbtcMarket(chainId);
    return {
      protocol: 'Aave V3',
      chainId: market.chainId,
      chain: market.chain,
      token: 'FBTC',
      tokenAddress: market.fbtcAddress,
      aTokenAddress: market.aTokenAddress,
      tokenDecimals: FBTC_DECIMALS,
      poolAddress: market.poolAddress,
      reserveUrl: market.reserveUrl,
      stablecoins: Object.values(market.stablecoins),
      description: `FBTC is available as a reserve in the ${market.marketLabel} market. Supplying requires an ERC-20 approval followed by Pool.supply${market.chainId === 5000 ? '; missing FBTC collateral and eMode category 3 settings are added on demand' : ''}. Borrowable stables: USDC, USDT${market.chainId === 5000 ? ' (USDT0 on Mantle)' : ''}, USDe.`,
    };
  },
};

export const getAaveAtokenBalance: ToolDefinition<
  AaveAtokenBalanceParams,
  {
    balance: string;
    symbol: string;
    tokenAddress: string;
    underlying: string;
    underlyingAddress: string;
    chain: string;
    chainId: number;
    address: string;
  }
> = {
  name: 'get_aave_atoken_balance',
  description:
    'Read the user aFBTC (Aave aToken) balance for a wallet on Aave V3 Ethereum or Mantle. REQUIRED: pass chainId 1 or 5000.',
  parameters: AaveAtokenBalanceSchema as Record<string, unknown>,
  schema: AaveAtokenBalanceZod as z.ZodType<AaveAtokenBalanceParams>,
  execute: async (params) => {
    const { address, chainId } = AaveAtokenBalanceZod.parse(params);
    const market = getAaveFbtcMarket(chainId);
    const client = makePublicClient(market.chainId);

    const reportedChainId = await client.getChainId();
    if (reportedChainId !== market.chainId) {
      throw new Error(
        `RPC chain mismatch: expected chainId ${market.chainId} (${market.chain}), ` +
          `but the RPC reported ${reportedChainId}. ` +
          `Set ${market.chainId === 5000 ? 'MANTLE_RPC_URL' : 'ETH_RPC_URL'} to an endpoint on the correct chain.`,
      );
    }

    const balance = await client.readContract({
      address: market.aTokenAddress,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [address as Address],
    });

    return {
      balance: formatUnits(balance, FBTC_DECIMALS),
      symbol: 'aFBTC',
      tokenAddress: market.aTokenAddress,
      underlying: 'FBTC',
      underlyingAddress: market.fbtcAddress,
      chain: market.chain,
      chainId: market.chainId,
      address,
    };
  },
};

export const getAaveUserAccount: ToolDefinition<
  AaveUserAccountParams,
  {
    address: string;
    chainId: number;
    chain: string;
    marketLabel: string;
    totalCollateralUsd: string;
    totalDebtUsd: string;
    availableBorrowsUsd: string;
    ltv: string;
    ltvBps: string;
    liquidationThreshold: string;
    liquidationThresholdBps: string;
    healthFactor: string;
  }
> = {
  name: 'get_aave_user_account',
  description:
    'Read Aave V3 account risk metrics for a wallet: health factor, LTV, liquidation threshold, collateral, and debt (USD base). REQUIRED: pass chainId 1 (Ethereum) or 5000 (Mantle).',
  parameters: AaveUserAccountSchema as Record<string, unknown>,
  schema: AaveUserAccountZod as z.ZodType<AaveUserAccountParams>,
  execute: async (params) => {
    const { address, chainId } = AaveUserAccountZod.parse(params);
    const market = getAaveFbtcMarket(chainId);
    const client = makePublicClient(market.chainId);

    const reportedChainId = await client.getChainId();
    if (reportedChainId !== market.chainId) {
      throw new Error(
        `RPC chain mismatch: expected chainId ${market.chainId} (${market.chain}), ` +
          `but the RPC reported ${reportedChainId}. ` +
          `Set ${market.chainId === 5000 ? 'MANTLE_RPC_URL' : 'ETH_RPC_URL'} to an endpoint on the correct chain.`,
      );
    }

    const [
      totalCollateralBase,
      totalDebtBase,
      availableBorrowsBase,
      currentLiquidationThreshold,
      ltv,
      healthFactor,
    ] = await client.readContract({
      address: market.poolAddress,
      abi: aavePoolAbi,
      functionName: 'getUserAccountData',
      args: [address as Address],
    });

    return {
      address,
      chainId: market.chainId,
      chain: market.chain,
      marketLabel: market.marketLabel,
      totalCollateralUsd: formatUnits(
        totalCollateralBase,
        AAVE_BASE_CURRENCY_DECIMALS,
      ),
      totalDebtUsd: formatUnits(totalDebtBase, AAVE_BASE_CURRENCY_DECIMALS),
      availableBorrowsUsd: formatUnits(
        availableBorrowsBase,
        AAVE_BASE_CURRENCY_DECIMALS,
      ),
      ltv: formatBps(ltv),
      ltvBps: ltv.toString(),
      liquidationThreshold: formatBps(currentLiquidationThreshold),
      liquidationThresholdBps: currentLiquidationThreshold.toString(),
      healthFactor: formatHealthFactor(healthFactor),
    };
  },
};

export const prepareAaveSupplyFbtc: ToolDefinition<
  AaveSupplyFbtcParams,
  PreparedTxResult
> = {
  name: 'prepare_aave_supply_fbtc',
  description:
    'Prepare transactions to supply FBTC to Aave V3. Ethereum: approve then Pool.supply. Mantle: approve and supply, then set eMode category 3 and enable FBTC as collateral when the current account settings require them. Pass chainId 1 (Ethereum) or 5000 (Mantle).',
  parameters: AaveSupplyFbtcSchema as Record<string, unknown>,
  schema: AaveSupplyFbtcZod as z.ZodType<AaveSupplyFbtcParams>,
  execute: async (params) => {
    const { amount, address, chainId } = AaveSupplyFbtcZod.parse(params);
    const market = getAaveFbtcMarket(chainId);
    const amountRaw = parseUnits(amount, FBTC_DECIMALS);
    const setupState =
      market.chainId === 5000
        ? await fetchAaveSupplySetupState(address as Address, market)
        : null;

    const approveData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [market.poolAddress, amountRaw],
    });
    const supplyData = encodeFunctionData({
      abi: aavePoolAbi,
      functionName: 'supply',
      args: [market.fbtcAddress, amountRaw, address as Address, 0],
    });
    const transactions = [
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
    ];

    if (
      setupState &&
      setupState.eModeCategoryId !== AAVE_MANTLE_FBTC_EMODE_CATEGORY_ID
    ) {
      const setEModeData = encodeFunctionData({
        abi: aavePoolAbi,
        functionName: 'setUserEMode',
        args: [AAVE_MANTLE_FBTC_EMODE_CATEGORY_ID],
      });
      transactions.push({
        to: market.poolAddress,
        data: setEModeData,
        label: `Set Aave V3 Mantle eMode category ${AAVE_MANTLE_FBTC_EMODE_CATEGORY_ID}`,
      });
    }

    if (setupState && !setupState.collateralEnabled) {
      const enableCollateralData = encodeFunctionData({
        abi: aavePoolAbi,
        functionName: 'setUserUseReserveAsCollateral',
        args: [market.fbtcAddress, true],
      });
      transactions.push({
        to: market.poolAddress,
        data: enableCollateralData,
        label: 'Enable FBTC as collateral on Aave V3 Mantle',
      });
    }

    return {
      action: 'sdk_execute',
      method: 'aave.supplyFbtc',
      params: {
        chainId: market.chainId,
        asset: market.fbtcAddress,
        amount,
        onBehalfOf: address,
        transactions,
      },
      description:
        market.chainId === 5000
          ? `Supply ${amount} FBTC to the ${market.marketLabel} market.${setupState?.eModeCategoryId === AAVE_MANTLE_FBTC_EMODE_CATEGORY_ID ? '' : ` Set eMode category ${AAVE_MANTLE_FBTC_EMODE_CATEGORY_ID}.`}${setupState?.collateralEnabled ? '' : ' Enable it as collateral.'} Click Execute in the chat card to sign ${transactions.length} transaction${transactions.length === 1 ? '' : 's'}.`
          : `Supply ${amount} FBTC to the ${market.marketLabel} market. Click Execute in the chat card to sign two transactions: approve and supply.`,
    };
  },
};

export const prepareAaveWithdrawFbtc: ToolDefinition<
  AaveWithdrawFbtcParams,
  PreparedTxResult
> = {
  name: 'prepare_aave_withdraw_fbtc',
  description:
    "Prepare a Pool.withdraw transaction to withdraw FBTC from Aave V3 (Ethereum or Mantle). Pass amount as a numeric string, or 'max' to withdraw the full aFBTC balance. Warning: withdraw max while debt remains may revert if collateral would become insufficient — check get_aave_user_account first. REQUIRED: pass chainId 1 or 5000.",
  parameters: AaveWithdrawFbtcSchema as Record<string, unknown>,
  schema: AaveWithdrawFbtcZod as z.ZodType<AaveWithdrawFbtcParams>,
  execute: async (params) => {
    const { amount, address, chainId } = AaveWithdrawFbtcZod.parse(params);
    const market = getAaveFbtcMarket(chainId);
    const amountRaw = parseAmountOrMax(amount, FBTC_DECIMALS);
    const amountLabel = amount.toLowerCase() === 'max' ? 'MAX' : amount;

    const withdrawData = encodeFunctionData({
      abi: aavePoolAbi,
      functionName: 'withdraw',
      args: [market.fbtcAddress, amountRaw, address as Address],
    });

    return {
      action: 'sdk_execute',
      method: 'aave.withdrawFbtc',
      params: {
        chainId: market.chainId,
        asset: market.fbtcAddress,
        amount,
        to: address,
        transactions: [
          {
            to: market.poolAddress,
            data: withdrawData,
            label: `Withdraw ${amountLabel} FBTC from ${market.marketLabel}`,
          },
        ],
      },
      description: `Withdraw ${amountLabel} FBTC from the ${market.marketLabel} market. Click Execute in the chat card to sign one Pool.withdraw transaction.`,
    };
  },
};

export const prepareAaveBorrowStablecoin: ToolDefinition<
  AaveBorrowStablecoinParams,
  PreparedTxResult
> = {
  name: 'prepare_aave_borrow_stablecoin',
  description:
    'Prepare a Pool.borrow transaction to borrow USDC, USDT, or USDe against collateral on Aave V3 (Ethereum or Mantle). Uses variable interest rate. Rejects borrows that would push utilization (debt/collateral) above 55%. On Mantle, USDT is USDT0. Pass chainId 1 or 5000.',
  parameters: AaveBorrowStablecoinSchema as Record<string, unknown>,
  schema: AaveBorrowStablecoinZod as z.ZodType<AaveBorrowStablecoinParams>,
  execute: async (params) => {
    const { amount, address, chainId, asset } =
      AaveBorrowStablecoinZod.parse(params);
    const market = getAaveFbtcMarket(chainId);
    const stablecoin = getAaveStablecoin(market, asset);
    const amountRaw = parseUnits(amount, stablecoin.decimals);

    const ltvCheck = await ensureBorrowWithinMaxLtv({
      user: address as Address,
      market,
      asset: stablecoin.address,
      amountRaw,
      decimals: stablecoin.decimals,
    });

    const borrowData = encodeFunctionData({
      abi: aavePoolAbi,
      functionName: 'borrow',
      args: [
        stablecoin.address,
        amountRaw,
        BigInt(AAVE_VARIABLE_RATE_MODE),
        0,
        address as Address,
      ],
    });

    return {
      action: 'sdk_execute',
      method: 'aave.borrowStablecoin',
      params: {
        chainId: market.chainId,
        asset: stablecoin.address,
        symbol: stablecoin.symbol,
        label: stablecoin.label,
        amount,
        interestRateMode: AAVE_VARIABLE_RATE_MODE,
        onBehalfOf: address,
        currentLtv: formatBps(ltvCheck.currentLtvBps),
        projectedLtv: formatBps(ltvCheck.projectedLtvBps),
        maxPostBorrowLtv: formatBps(MAX_POST_BORROW_LTV_BPS),
        transactions: [
          {
            to: market.poolAddress,
            data: borrowData,
            label: `Borrow ${amount} ${stablecoin.label} from ${market.marketLabel}`,
          },
        ],
      },
      description: `Borrow ${amount} ${stablecoin.label} (variable rate) from the ${market.marketLabel} market. Projected utilization LTV ${formatBps(ltvCheck.projectedLtvBps)} (limit ${formatBps(MAX_POST_BORROW_LTV_BPS)}). Click Execute in the chat card to sign one Pool.borrow transaction.`,
    };
  },
};

export const prepareAaveRepayStablecoin: ToolDefinition<
  AaveRepayStablecoinParams,
  PreparedTxResult
> = {
  name: 'prepare_aave_repay_stablecoin',
  description:
    "Prepare approve + Pool.repay to repay USDC, USDT, or USDe debt on Aave V3 (Ethereum or Mantle). Pass amount as a numeric string, or 'max' to repay the full variable debt (reads debt token balance and approves debt+1% — not infinite; rejected if debt is zero). On Mantle, USDT is USDT0. REQUIRED: pass chainId 1 or 5000.",
  parameters: AaveRepayStablecoinSchema as Record<string, unknown>,
  schema: AaveRepayStablecoinZod as z.ZodType<AaveRepayStablecoinParams>,
  execute: async (params) => {
    const { amount, address, chainId, asset } =
      AaveRepayStablecoinZod.parse(params);
    const market = getAaveFbtcMarket(chainId);
    const stablecoin = getAaveStablecoin(market, asset);
    const { approveAmountRaw, repayAmountRaw, amountLabel, isMax, debtRaw } =
      await resolveRepayAmounts({
        amount,
        user: address as Address,
        market,
        stablecoin,
      });

    const approveData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [market.poolAddress, approveAmountRaw],
    });
    const repayData = encodeFunctionData({
      abi: aavePoolAbi,
      functionName: 'repay',
      args: [
        stablecoin.address,
        repayAmountRaw,
        BigInt(AAVE_VARIABLE_RATE_MODE),
        address as Address,
      ],
    });

    return {
      action: 'sdk_execute',
      method: 'aave.repayStablecoin',
      params: {
        chainId: market.chainId,
        asset: stablecoin.address,
        symbol: stablecoin.symbol,
        label: stablecoin.label,
        amount,
        isMax,
        debtRaw: debtRaw?.toString() ?? null,
        approveAmountRaw: approveAmountRaw.toString(),
        interestRateMode: AAVE_VARIABLE_RATE_MODE,
        onBehalfOf: address,
        transactions: [
          {
            to: stablecoin.address,
            data: approveData,
            label: `Approve Aave V3 Pool to spend ${amountLabel} ${stablecoin.label}${isMax ? ' (debt+1%)' : ''}`,
          },
          {
            to: market.poolAddress,
            data: repayData,
            label: `Repay ${amountLabel} ${stablecoin.label} on ${market.marketLabel}`,
          },
        ],
      },
      description: `Repay ${amountLabel} ${stablecoin.label} on the ${market.marketLabel} market. Click Execute in the chat card to sign two transactions: approve and repay.`,
    };
  },
};
