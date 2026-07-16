import { decodeFunctionData, erc20Abi, maxUint256, parseAbi } from 'viem';
import { describe, expect, it } from 'vitest';

import {
  AAVE_MANTLE_FBTC_EMODE_CATEGORY_ID,
  AAVE_V3_ETHEREUM_POOL,
  AAVE_V3_MANTLE_POOL,
  AFBTC_ETHEREUM_ADDRESS,
  AFBTC_MANTLE_ADDRESS,
  assertPostBorrowLtvWithinLimit,
  assetAmountToBaseCurrency,
  buildAaveBorrowStablecoinTransaction,
  buildAaveRepayStablecoinTransactions,
  buildAaveSupplyFbtcTransactions,
  buildAaveWithdrawFbtcTransaction,
  FBTC_ETHEREUM_ADDRESS,
  FBTC_MANTLE_ADDRESS,
  getAaveFbtcReserveDetails,
  isReserveUsedAsCollateral,
  MAX_POST_BORROW_LTV_BPS,
} from '../aave';

describe('getAaveFbtcReserveDetails', () => {
  it('returns Ethereum FBTC reserve details for ethereum-mainnet', () => {
    expect(getAaveFbtcReserveDetails('ethereum-mainnet')).toMatchObject({
      protocol: 'Aave V3',
      networkId: 'ethereum-mainnet',
      token: 'FBTC',
      tokenAddress: FBTC_ETHEREUM_ADDRESS,
      aTokenAddress: AFBTC_ETHEREUM_ADDRESS,
      tokenDecimals: 8,
      poolAddress: AAVE_V3_ETHEREUM_POOL,
    });
  });

  it('returns Mantle FBTC reserve details for mantle-mainnet', () => {
    const details = getAaveFbtcReserveDetails('mantle-mainnet');
    expect(details).toMatchObject({
      protocol: 'Aave V3',
      networkId: 'mantle-mainnet',
      chain: 'Mantle',
      token: 'FBTC',
      tokenAddress: FBTC_MANTLE_ADDRESS,
      aTokenAddress: AFBTC_MANTLE_ADDRESS,
      tokenDecimals: 8,
      poolAddress: AAVE_V3_MANTLE_POOL,
    });
    const usdt = details.stablecoins.find((s) => s.symbol === 'USDT');
    expect(usdt?.label).toBe('USDT0');
  });
});

describe('buildAaveSupplyFbtcTransactions', () => {
  const address = '0x1234567890abcdef1234567890abcdef12345678';

  it('builds Ethereum approve and Pool.supply by default', () => {
    const { approve, supply, amountRaw } = buildAaveSupplyFbtcTransactions(
      '0.1',
      address,
    );

    expect(amountRaw).toBe(10_000_000n);
    expect(approve.to.toLowerCase()).toBe(FBTC_ETHEREUM_ADDRESS.toLowerCase());
    expect(supply.to.toLowerCase()).toBe(AAVE_V3_ETHEREUM_POOL.toLowerCase());

    const approval = decodeFunctionData({
      abi: erc20Abi,
      data: approve.data,
    });
    expect(approval.functionName).toBe('approve');
    expect(approval.args).toEqual([AAVE_V3_ETHEREUM_POOL, 10_000_000n]);

    const supplyCall = decodeFunctionData({
      abi: parseAbi([
        'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)',
      ]),
      data: supply.data,
    });
    expect(supplyCall.functionName).toBe('supply');
    expect(supplyCall.args?.[0].toLowerCase()).toBe(
      FBTC_ETHEREUM_ADDRESS.toLowerCase(),
    );
    expect(supplyCall.args?.[1]).toBe(10_000_000n);
    expect(supplyCall.args?.[2].toLowerCase()).toBe(address.toLowerCase());
    expect(supplyCall.args?.[3]).toBe(0);
  });

  it('builds Mantle supply, collateral, and eMode calls', () => {
    const { approve, supply, enableCollateral, setEMode, market } =
      buildAaveSupplyFbtcTransactions('0.1', address, 'mantle-mainnet');

    expect(market.networkId).toBe('mantle-mainnet');
    expect(approve.to.toLowerCase()).toBe(FBTC_MANTLE_ADDRESS.toLowerCase());
    expect(supply.to.toLowerCase()).toBe(AAVE_V3_MANTLE_POOL.toLowerCase());

    const approval = decodeFunctionData({
      abi: erc20Abi,
      data: approve.data,
    });
    expect(approval.args).toEqual([AAVE_V3_MANTLE_POOL, 10_000_000n]);

    expect(enableCollateral?.to.toLowerCase()).toBe(
      AAVE_V3_MANTLE_POOL.toLowerCase(),
    );
    const enableCollateralCall = decodeFunctionData({
      abi: parseAbi([
        'function setUserUseReserveAsCollateral(address asset, bool useAsCollateral)',
      ]),
      data: enableCollateral!.data,
    });
    expect(enableCollateralCall.args?.[0].toLowerCase()).toBe(
      FBTC_MANTLE_ADDRESS.toLowerCase(),
    );
    expect(enableCollateralCall.args?.[1]).toBe(true);
    expect(enableCollateral?.data.slice(0, 10)).toBe('0x5a3b74b9');

    expect(setEMode?.to.toLowerCase()).toBe(AAVE_V3_MANTLE_POOL.toLowerCase());
    const setEModeCall = decodeFunctionData({
      abi: parseAbi(['function setUserEMode(uint8 categoryId)']),
      data: setEMode!.data,
    });
    expect(setEModeCall.args).toEqual([AAVE_MANTLE_FBTC_EMODE_CATEGORY_ID]);
    expect(setEMode?.data.slice(0, 10)).toBe('0x28530a47');
  });
});

describe('isReserveUsedAsCollateral', () => {
  it('reads the collateral bit for the requested reserve id', () => {
    expect(isReserveUsedAsCollateral(1n << 11n, 5)).toBe(true);
    expect(isReserveUsedAsCollateral(1n << 10n, 5)).toBe(false);
  });
});

describe('buildAaveWithdrawFbtcTransaction', () => {
  const address = '0x1234567890abcdef1234567890abcdef12345678';

  it('builds Pool.withdraw on Ethereum', () => {
    const { withdraw, amountRaw } = buildAaveWithdrawFbtcTransaction(
      '0.05',
      address,
    );

    expect(amountRaw).toBe(5_000_000n);
    expect(withdraw.to.toLowerCase()).toBe(AAVE_V3_ETHEREUM_POOL.toLowerCase());

    const call = decodeFunctionData({
      abi: parseAbi([
        'function withdraw(address asset, uint256 amount, address to)',
      ]),
      data: withdraw.data,
    });
    expect(call.functionName).toBe('withdraw');
    expect(call.args?.[1]).toBe(5_000_000n);
  });

  it('builds max withdraw', () => {
    const { amountRaw } = buildAaveWithdrawFbtcTransaction(
      'max',
      address,
      'mantle-mainnet',
    );
    expect(amountRaw).toBe(maxUint256);
  });
});

describe('assertPostBorrowLtvWithinLimit', () => {
  it('allows borrows at or under 55% utilization', () => {
    const result = assertPostBorrowLtvWithinLimit(
      10_000_00000000n,
      0n,
      5_500_00000000n,
    );
    expect(result.projectedLtvBps).toBe(MAX_POST_BORROW_LTV_BPS);
  });

  it('rejects borrows above 55% utilization', () => {
    expect(() =>
      assertPostBorrowLtvWithinLimit(10_000_00000000n, 0n, 5_501_00000000n),
    ).toThrow(/projected utilization LTV/);
  });

  it('converts stablecoin amount via oracle price', () => {
    expect(assetAmountToBaseCurrency(100_000000n, 6, 100_000000n)).toBe(
      100_00000000n,
    );
  });
});

describe('buildAaveBorrowStablecoinTransaction', () => {
  const address = '0x1234567890abcdef1234567890abcdef12345678';

  it('builds Pool.borrow USDC on Ethereum', () => {
    const { borrow, stablecoin, amountRaw } =
      buildAaveBorrowStablecoinTransaction('USDC', '100', address);

    expect(amountRaw).toBe(100_000_000n);
    expect(stablecoin.label).toBe('USDC');

    const call = decodeFunctionData({
      abi: parseAbi([
        'function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)',
      ]),
      data: borrow.data,
    });
    expect(call.functionName).toBe('borrow');
    expect(call.args?.[2]).toBe(2n);
  });

  it('maps USDT to USDT0 on Mantle', () => {
    const { stablecoin } = buildAaveBorrowStablecoinTransaction(
      'USDT',
      '50',
      address,
      'mantle-mainnet',
    );
    expect(stablecoin.label).toBe('USDT0');
    expect(stablecoin.address.toLowerCase()).toBe(
      '0x779ded0c9e1022225f8e0630b35a9b54be713736',
    );
  });
});

describe('buildAaveRepayStablecoinTransactions', () => {
  const address = '0x1234567890abcdef1234567890abcdef12345678';

  it('builds approve + Pool.repay for exact amount', async () => {
    const { approve, repay, stablecoin } =
      await buildAaveRepayStablecoinTransactions(
        'USDe',
        '10',
        address,
        'ethereum-mainnet',
      );

    expect(stablecoin.decimals).toBe(18);
    expect(approve.to.toLowerCase()).toBe(stablecoin.address.toLowerCase());
    expect(repay.to.toLowerCase()).toBe(AAVE_V3_ETHEREUM_POOL.toLowerCase());

    const repayCall = decodeFunctionData({
      abi: parseAbi([
        'function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf)',
      ]),
      data: repay.data,
    });
    expect(repayCall.args?.[2]).toBe(2n);

    const approval = decodeFunctionData({
      abi: erc20Abi,
      data: approve.data,
    });
    expect(approval.args?.[1]).toBe(10_000_000_000_000_000_000n);
  });
});
