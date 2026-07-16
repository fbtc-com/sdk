/**
 * Aave V3 integration for the Function FBTC reserve (Ethereum + Mantle).
 *
 * Read helpers select a market by networkId independently of the wallet.
 * Write actions require the wallet to be on the same networkId.
 *
 * NOTE: Market constants are mirrored in @functionfbtc/sdk-agent `src/aave.ts`.
 * Keep addresses / decimals / reserve URLs in sync when either side changes.
 */
import type { Address, Hex } from 'viem';
import {
  createPublicClient,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  http,
  maxUint256,
  parseUnits,
} from 'viem';

import {
  DEFAULT_NETWORK_ID,
  type FbtcNetworkId,
  getViemChainByNetworkId,
  isFbtcNetworkId,
  NETWORK_ID_TO_VIEM_CHAIN,
} from './networks';
import { resolveRpcUrl, type RpcUrlByNetwork } from './utils';

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
 * above this are rejected before the transaction is sent.
 */
export const MAX_POST_BORROW_LTV_BPS = 5500n;

export const AAVE_V3_ETHEREUM_ORACLE =
  '0x54586bE62E3c3580375aE3723C145253060Ca0C2' as const;
export const AAVE_V3_MANTLE_ORACLE =
  '0x47a063CfDa980532267970d478EC340C0F80E8df' as const;

export const AAVE_STABLECOIN_SYMBOLS = ['USDC', 'USDT', 'USDe'] as const;
export type AaveStablecoinSymbol = (typeof AAVE_STABLECOIN_SYMBOLS)[number];

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
  networkId: FbtcNetworkId;
  chain: string;
  /** viem / RPC numeric id — internal only. */
  chainId: number;
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

export const AAVE_FBTC_MARKETS_BY_NETWORK: Record<
  FbtcNetworkId,
  AaveFbtcMarket
> = {
  'ethereum-mainnet': {
    networkId: 'ethereum-mainnet',
    chain: 'Ethereum',
    chainId: NETWORK_ID_TO_VIEM_CHAIN['ethereum-mainnet'].id,
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
  'mantle-mainnet': {
    networkId: 'mantle-mainnet',
    chain: 'Mantle',
    chainId: NETWORK_ID_TO_VIEM_CHAIN['mantle-mainnet'].id,
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

/** @deprecated Prefer AAVE_FBTC_MARKETS_BY_NETWORK keyed by networkId. */
export const AAVE_FBTC_MARKETS: Record<number, AaveFbtcMarket> = {
  [AAVE_FBTC_MARKETS_BY_NETWORK['ethereum-mainnet'].chainId]:
    AAVE_FBTC_MARKETS_BY_NETWORK['ethereum-mainnet'],
  [AAVE_FBTC_MARKETS_BY_NETWORK['mantle-mainnet'].chainId]:
    AAVE_FBTC_MARKETS_BY_NETWORK['mantle-mainnet'],
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
      `Unsupported networkId: ${networkId}. Supported: ${Object.keys(AAVE_FBTC_MARKETS_BY_NETWORK).join(', ')}`,
    );
  }
  return AAVE_FBTC_MARKETS_BY_NETWORK[networkId];
}

/** @deprecated Prefer getAaveFbtcMarketByNetworkId. */
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

export async function fetchAaveSupplySetupState(
  user: Address,
  market: AaveFbtcMarket,
  rpcUrls: RpcUrlByNetwork = {},
): Promise<AaveSupplySetupState> {
  const chain = getViemChainByNetworkId(market.networkId);
  const rpcUrl = resolveRpcUrl(market.networkId, rpcUrls);
  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl, { timeout: 60_000 }),
  });
  const reportedChainId = await publicClient.getChainId();
  if (reportedChainId !== chain.id) {
    throw new Error(
      `RPC chain mismatch for Aave supply setup: expected networkId ${market.networkId} (chain ${chain.id}), ` +
        `but the RPC reported ${reportedChainId}. Set MANTLE_RPC_URL to an endpoint on the correct network.`,
    );
  }

  const [userConfiguration, eModeCategoryId, reserveData] = await Promise.all([
    publicClient.readContract({
      address: market.poolAddress,
      abi: aavePoolAbi,
      functionName: 'getUserConfiguration',
      args: [user],
    }),
    publicClient.readContract({
      address: market.poolAddress,
      abi: aavePoolAbi,
      functionName: 'getUserEMode',
      args: [user],
    }),
    publicClient.readContract({
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
  rpcUrls?: RpcUrlByNetwork;
}): Promise<{
  currentLtvBps: bigint;
  projectedLtvBps: bigint;
  maxBorrowBase: bigint;
  borrowAmountBase: bigint;
}> {
  const { user, market, asset, amountRaw, decimals, rpcUrls = {} } = params;
  if (!isFbtcNetworkId(market.networkId)) {
    throw new Error(`Unsupported networkId: ${market.networkId}`);
  }

  const chain = getViemChainByNetworkId(market.networkId);
  const rpcUrl = resolveRpcUrl(market.networkId, rpcUrls);
  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl, { timeout: 60_000 }),
  });

  const reportedChainId = await publicClient.getChainId();
  if (reportedChainId !== chain.id) {
    throw new Error(
      `RPC chain mismatch for borrow LTV check: expected networkId ${market.networkId} (chain ${chain.id}), ` +
        `but the RPC reported ${reportedChainId}. ` +
        `Set ${market.networkId === 'mantle-mainnet' ? 'MANTLE_RPC_URL' : 'ETH_RPC_URL'} to an endpoint on the correct network.`,
    );
  }

  const [[totalCollateralBase, totalDebtBase], oraclePrice] = await Promise.all(
    [
      publicClient.readContract({
        address: market.poolAddress,
        abi: aavePoolAbi,
        functionName: 'getUserAccountData',
        args: [user],
      }),
      publicClient.readContract({
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

export type PreparedTx = { to: Address; data: Hex; label: string };

export function getAaveFbtcReserveDetails(
  networkId: string = DEFAULT_NETWORK_ID,
) {
  const market = getAaveFbtcMarketByNetworkId(networkId);
  return {
    protocol: 'Aave V3',
    networkId: market.networkId,
    chain: market.chain,
    token: 'FBTC',
    tokenAddress: market.fbtcAddress,
    aTokenAddress: market.aTokenAddress,
    tokenDecimals: FBTC_DECIMALS,
    poolAddress: market.poolAddress,
    reserveUrl: market.reserveUrl,
    stablecoins: Object.values(market.stablecoins),
    description: `FBTC is available as a reserve in the ${market.marketLabel} market. Supplying requires an ERC-20 approval followed by Pool.supply${market.networkId === 'mantle-mainnet' ? '; missing FBTC collateral and eMode category 3 settings are added on demand' : ''}. Borrowable stables: USDC, USDT${market.networkId === 'mantle-mainnet' ? ' (USDT0 on Mantle)' : ''}, USDe.`,
  };
}

export async function fetchAaveUserAccountData(
  user: Address,
  networkId: string = DEFAULT_NETWORK_ID,
  rpcUrls: RpcUrlByNetwork = {},
) {
  const market = getAaveFbtcMarketByNetworkId(networkId);
  if (!isFbtcNetworkId(market.networkId)) {
    throw new Error(`Unsupported networkId: ${networkId}`);
  }

  const chain = getViemChainByNetworkId(market.networkId);
  const rpcUrl = resolveRpcUrl(market.networkId, rpcUrls);
  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl, { timeout: 60_000 }),
  });

  const reportedChainId = await publicClient.getChainId();
  if (reportedChainId !== chain.id) {
    throw new Error(
      `RPC chain mismatch for Aave account data: expected networkId ${market.networkId} (chain ${chain.id}), ` +
        `but the RPC reported ${reportedChainId}. ` +
        `Set ${market.networkId === 'mantle-mainnet' ? 'MANTLE_RPC_URL' : 'ETH_RPC_URL'} to an endpoint on the correct network.`,
    );
  }

  const [
    totalCollateralBase,
    totalDebtBase,
    availableBorrowsBase,
    currentLiquidationThreshold,
    ltv,
    healthFactor,
  ] = await publicClient.readContract({
    address: market.poolAddress,
    abi: aavePoolAbi,
    functionName: 'getUserAccountData',
    args: [user],
  });

  return {
    address: user,
    networkId: market.networkId,
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
}

export function buildAaveSupplyFbtcTransactions(
  amount: string,
  onBehalfOf: Address,
  networkId: string = DEFAULT_NETWORK_ID,
): {
  amountRaw: bigint;
  market: AaveFbtcMarket;
  approve: PreparedTx;
  supply: PreparedTx;
  setEMode?: PreparedTx;
  enableCollateral?: PreparedTx;
} {
  const market = getAaveFbtcMarketByNetworkId(networkId);
  const amountRaw = parseUnits(amount, FBTC_DECIMALS);

  const approveData = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [market.poolAddress, amountRaw],
  });
  const supplyData = encodeFunctionData({
    abi: aavePoolAbi,
    functionName: 'supply',
    args: [market.fbtcAddress, amountRaw, onBehalfOf, 0],
  });
  const mantleSetup =
    market.networkId === 'mantle-mainnet'
      ? {
          setEMode: {
            to: market.poolAddress,
            data: encodeFunctionData({
              abi: aavePoolAbi,
              functionName: 'setUserEMode',
              args: [AAVE_MANTLE_FBTC_EMODE_CATEGORY_ID],
            }),
            label: `Set Aave V3 Mantle eMode category ${AAVE_MANTLE_FBTC_EMODE_CATEGORY_ID}`,
          },
          enableCollateral: {
            to: market.poolAddress,
            data: encodeFunctionData({
              abi: aavePoolAbi,
              functionName: 'setUserUseReserveAsCollateral',
              args: [market.fbtcAddress, true],
            }),
            label: 'Enable FBTC as collateral on Aave V3 Mantle',
          },
        }
      : {};

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
    ...mantleSetup,
  };
}

export function buildAaveWithdrawFbtcTransaction(
  amount: string,
  to: Address,
  networkId: string = DEFAULT_NETWORK_ID,
): {
  amountRaw: bigint;
  market: AaveFbtcMarket;
  withdraw: PreparedTx;
} {
  const market = getAaveFbtcMarketByNetworkId(networkId);
  const amountRaw = parseAmountOrMax(amount, FBTC_DECIMALS);
  const amountLabel = amount.toLowerCase() === 'max' ? 'MAX' : amount;

  const withdrawData = encodeFunctionData({
    abi: aavePoolAbi,
    functionName: 'withdraw',
    args: [market.fbtcAddress, amountRaw, to],
  });

  return {
    amountRaw,
    market,
    withdraw: {
      to: market.poolAddress,
      data: withdrawData,
      label: `Withdraw ${amountLabel} FBTC from ${market.marketLabel}`,
    },
  };
}

export function buildAaveBorrowStablecoinTransaction(
  asset: AaveStablecoinSymbol,
  amount: string,
  onBehalfOf: Address,
  networkId: string = DEFAULT_NETWORK_ID,
): {
  amountRaw: bigint;
  market: AaveFbtcMarket;
  stablecoin: AaveStablecoin;
  borrow: PreparedTx;
} {
  const market = getAaveFbtcMarketByNetworkId(networkId);
  const stablecoin = getAaveStablecoin(market, asset);
  const amountRaw = parseUnits(amount, stablecoin.decimals);

  const borrowData = encodeFunctionData({
    abi: aavePoolAbi,
    functionName: 'borrow',
    args: [
      stablecoin.address,
      amountRaw,
      BigInt(AAVE_VARIABLE_RATE_MODE),
      0,
      onBehalfOf,
    ],
  });

  return {
    amountRaw,
    market,
    stablecoin,
    borrow: {
      to: market.poolAddress,
      data: borrowData,
      label: `Borrow ${amount} ${stablecoin.label} from ${market.marketLabel}`,
    },
  };
}

export async function resolveRepayAmounts(params: {
  amount: string;
  user: Address;
  market: AaveFbtcMarket;
  stablecoin: AaveStablecoin;
  rpcUrls?: RpcUrlByNetwork;
}): Promise<{
  approveAmountRaw: bigint;
  repayAmountRaw: bigint;
  debtRaw: bigint | null;
  isMax: boolean;
  amountLabel: string;
}> {
  const { amount, user, market, stablecoin, rpcUrls = {} } = params;
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

  if (!isFbtcNetworkId(market.networkId)) {
    throw new Error(`Unsupported networkId: ${market.networkId}`);
  }

  const chain = getViemChainByNetworkId(market.networkId);
  const rpcUrl = resolveRpcUrl(market.networkId, rpcUrls);
  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl, { timeout: 60_000 }),
  });

  const reportedChainId = await publicClient.getChainId();
  if (reportedChainId !== chain.id) {
    throw new Error(
      `RPC chain mismatch for repay amount: expected networkId ${market.networkId} (chain ${chain.id}), ` +
        `but the RPC reported ${reportedChainId}. ` +
        `Set ${market.networkId === 'mantle-mainnet' ? 'MANTLE_RPC_URL' : 'ETH_RPC_URL'} to an endpoint on the correct network.`,
    );
  }

  const debtRaw = await publicClient.readContract({
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
    repayAmountRaw: maxUint256,
    debtRaw,
    isMax: true,
    amountLabel: 'MAX',
  };
}

export async function buildAaveRepayStablecoinTransactions(
  asset: AaveStablecoinSymbol,
  amount: string,
  onBehalfOf: Address,
  networkId: string,
  rpcUrls: RpcUrlByNetwork = {},
): Promise<{
  approveAmountRaw: bigint;
  repayAmountRaw: bigint;
  debtRaw: bigint | null;
  isMax: boolean;
  market: AaveFbtcMarket;
  stablecoin: AaveStablecoin;
  approve: PreparedTx;
  repay: PreparedTx;
}> {
  const market = getAaveFbtcMarketByNetworkId(networkId);
  const stablecoin = getAaveStablecoin(market, asset);
  const resolved = await resolveRepayAmounts({
    amount,
    user: onBehalfOf,
    market,
    stablecoin,
    rpcUrls,
  });

  const approveData = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [market.poolAddress, resolved.approveAmountRaw],
  });
  const repayData = encodeFunctionData({
    abi: aavePoolAbi,
    functionName: 'repay',
    args: [
      stablecoin.address,
      resolved.repayAmountRaw,
      BigInt(AAVE_VARIABLE_RATE_MODE),
      onBehalfOf,
    ],
  });

  return {
    ...resolved,
    market,
    stablecoin,
    approve: {
      to: stablecoin.address,
      data: approveData,
      label: `Approve Aave V3 Pool to spend ${resolved.amountLabel} ${stablecoin.label}${resolved.isMax ? ' (debt+1%)' : ''}`,
    },
    repay: {
      to: market.poolAddress,
      data: repayData,
      label: `Repay ${resolved.amountLabel} ${stablecoin.label} on ${market.marketLabel}`,
    },
  };
}
