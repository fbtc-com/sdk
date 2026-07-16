import { decodeFunctionData, erc20Abi, maxUint256, parseAbi } from 'viem';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AAVE_MANTLE_FBTC_EMODE_CATEGORY_ID,
  AAVE_V3_ETHEREUM_POOL,
  AAVE_V3_MANTLE_POOL,
  AFBTC_ETHEREUM_ADDRESS,
  AFBTC_MANTLE_ADDRESS,
  assertPostBorrowLtvWithinLimit,
  assetAmountToBaseCurrency,
  FBTC_ETHEREUM_ADDRESS,
  FBTC_MANTLE_ADDRESS,
  getAaveFbtcReserve,
  MAX_POST_BORROW_LTV_BPS,
  prepareAaveBorrowStablecoin,
  prepareAaveRepayStablecoin,
  prepareAaveSupplyFbtc,
  prepareAaveWithdrawFbtc,
} from '../aave';
import * as chains from '../chains';

describe('getAaveFbtcReserve', () => {
  it('returns the canonical Ethereum FBTC reserve details when chainId is 1', async () => {
    const result = await getAaveFbtcReserve.execute({ chainId: 1 });

    expect(result).toMatchObject({
      protocol: 'Aave V3',
      chainId: 1,
      chain: 'Ethereum',
      token: 'FBTC',
      tokenAddress: FBTC_ETHEREUM_ADDRESS,
      aTokenAddress: AFBTC_ETHEREUM_ADDRESS,
      tokenDecimals: 8,
      poolAddress: AAVE_V3_ETHEREUM_POOL,
    });
    expect(result.stablecoins.map((s) => s.symbol)).toEqual([
      'USDC',
      'USDT',
      'USDe',
    ]);
  });

  it('rejects missing chainId', async () => {
    await expect(
      getAaveFbtcReserve.execute({} as { chainId: 1 | 5000 }),
    ).rejects.toThrow();
  });

  it('rejects unsupported chainId at schema layer', async () => {
    await expect(
      getAaveFbtcReserve.execute({
        chainId: 137,
      } as unknown as { chainId: 1 | 5000 }),
    ).rejects.toThrow();
  });

  it('returns the Mantle FBTC reserve details when chainId is 5000', async () => {
    const result = await getAaveFbtcReserve.execute({ chainId: 5000 });

    expect(result).toMatchObject({
      protocol: 'Aave V3',
      chainId: 5000,
      chain: 'Mantle',
      token: 'FBTC',
      tokenAddress: FBTC_MANTLE_ADDRESS,
      aTokenAddress: AFBTC_MANTLE_ADDRESS,
      tokenDecimals: 8,
      poolAddress: AAVE_V3_MANTLE_POOL,
    });
    const usdt = result.stablecoins.find((s) => s.symbol === 'USDT');
    expect(usdt?.label).toBe('USDT0');
  });
});

describe('prepareAaveSupplyFbtc', () => {
  const address = '0x1234567890abcdef1234567890abcdef12345678';

  beforeEach(() => {
    vi.spyOn(chains, 'makePublicClient').mockImplementation(
      (chainId: number) =>
        ({
          getChainId: async () => chainId,
          readContract: async ({ functionName }: { functionName: string }) => {
            if (functionName === 'getUserConfiguration') return 0n;
            if (functionName === 'getUserEMode') return 0n;
            if (functionName === 'getReserveData') {
              return [0n, 0n, 0n, 0n, 0n, 0n, 0, 5] as const;
            }
            throw new Error(`unexpected readContract: ${functionName}`);
          },
        }) as never,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prepares exact-amount approve and Pool.supply transactions on Ethereum', async () => {
    const result = await prepareAaveSupplyFbtc.execute({
      amount: '0.1',
      address,
      chainId: 1,
    });
    const transactions = result.params.transactions as Array<{
      to: string;
      data: `0x${string}`;
    }>;

    expect(result).toMatchObject({
      action: 'sdk_execute',
      method: 'aave.supplyFbtc',
    });
    expect(result.params).toMatchObject({
      chainId: 1,
      asset: FBTC_ETHEREUM_ADDRESS,
      amount: '0.1',
      onBehalfOf: address,
    });
    expect(transactions).toHaveLength(2);
    expect(transactions[0].to.toLowerCase()).toBe(
      FBTC_ETHEREUM_ADDRESS.toLowerCase(),
    );
    expect(transactions[1].to.toLowerCase()).toBe(
      AAVE_V3_ETHEREUM_POOL.toLowerCase(),
    );

    const approval = decodeFunctionData({
      abi: erc20Abi,
      data: transactions[0].data,
    });
    expect(approval.functionName).toBe('approve');
    expect(approval.args).toEqual([AAVE_V3_ETHEREUM_POOL, 10_000_000n]);

    const supply = decodeFunctionData({
      abi: parseAbi([
        'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)',
      ]),
      data: transactions[1].data,
    });
    expect(supply.functionName).toBe('supply');
    expect(supply.args?.[0].toLowerCase()).toBe(
      FBTC_ETHEREUM_ADDRESS.toLowerCase(),
    );
    expect(supply.args?.[1]).toBe(10_000_000n);
    expect(supply.args?.[2].toLowerCase()).toBe(address.toLowerCase());
    expect(supply.args?.[3]).toBe(0);
  });

  it('prepares Mantle supply, collateral, and eMode transactions when chainId is 5000', async () => {
    const result = await prepareAaveSupplyFbtc.execute({
      amount: '0.1',
      address,
      chainId: 5000,
    });
    const transactions = result.params.transactions as Array<{
      to: string;
      data: `0x${string}`;
    }>;

    expect(result.params).toMatchObject({
      chainId: 5000,
      asset: FBTC_MANTLE_ADDRESS,
      amount: '0.1',
      onBehalfOf: address,
    });
    expect(transactions).toHaveLength(4);
    expect(transactions[0].to.toLowerCase()).toBe(
      FBTC_MANTLE_ADDRESS.toLowerCase(),
    );
    expect(transactions[1].to.toLowerCase()).toBe(
      AAVE_V3_MANTLE_POOL.toLowerCase(),
    );

    const approval = decodeFunctionData({
      abi: erc20Abi,
      data: transactions[0].data,
    });
    expect(approval.args).toEqual([AAVE_V3_MANTLE_POOL, 10_000_000n]);

    expect(transactions[2].to.toLowerCase()).toBe(
      AAVE_V3_MANTLE_POOL.toLowerCase(),
    );
    const setEMode = decodeFunctionData({
      abi: parseAbi(['function setUserEMode(uint8 categoryId)']),
      data: transactions[2].data,
    });
    expect(setEMode.functionName).toBe('setUserEMode');
    expect(setEMode.args).toEqual([AAVE_MANTLE_FBTC_EMODE_CATEGORY_ID]);
    expect(transactions[2].data.slice(0, 10)).toBe('0x28530a47');

    const enableCollateral = decodeFunctionData({
      abi: parseAbi([
        'function setUserUseReserveAsCollateral(address asset, bool useAsCollateral)',
      ]),
      data: transactions[3].data,
    });
    expect(transactions[3].to.toLowerCase()).toBe(
      AAVE_V3_MANTLE_POOL.toLowerCase(),
    );
    expect(enableCollateral.functionName).toBe('setUserUseReserveAsCollateral');
    expect(enableCollateral.args?.[0].toLowerCase()).toBe(
      FBTC_MANTLE_ADDRESS.toLowerCase(),
    );
    expect(enableCollateral.args?.[1]).toBe(true);
    expect(transactions[3].data.slice(0, 10)).toBe('0x5a3b74b9');
  });

  it('rejects zero amounts', async () => {
    await expect(
      prepareAaveSupplyFbtc.execute({ amount: '0', address, chainId: 1 }),
    ).rejects.toThrow();
  });

  it('skips Mantle setup calls when collateral and eMode are already configured', async () => {
    vi.mocked(chains.makePublicClient).mockImplementation(
      (chainId: number) =>
        ({
          getChainId: async () => chainId,
          readContract: async ({ functionName }: { functionName: string }) => {
            if (functionName === 'getUserConfiguration') return 1n << 11n;
            if (functionName === 'getUserEMode') {
              return BigInt(AAVE_MANTLE_FBTC_EMODE_CATEGORY_ID);
            }
            if (functionName === 'getReserveData') {
              return [0n, 0n, 0n, 0n, 0n, 0n, 0, 5] as const;
            }
            throw new Error(`unexpected readContract: ${functionName}`);
          },
        }) as never,
    );

    const result = await prepareAaveSupplyFbtc.execute({
      amount: '0.1',
      address,
      chainId: 5000,
    });
    const transactions = result.params.transactions as unknown[];

    expect(transactions).toHaveLength(2);
  });
});

describe('prepareAaveWithdrawFbtc', () => {
  const address = '0x1234567890abcdef1234567890abcdef12345678';

  it('prepares Pool.withdraw on Ethereum', async () => {
    const result = await prepareAaveWithdrawFbtc.execute({
      amount: '0.05',
      address,
      chainId: 1,
    });
    const transactions = result.params.transactions as Array<{
      to: string;
      data: `0x${string}`;
    }>;

    expect(result.method).toBe('aave.withdrawFbtc');
    expect(transactions).toHaveLength(1);
    expect(transactions[0].to.toLowerCase()).toBe(
      AAVE_V3_ETHEREUM_POOL.toLowerCase(),
    );

    const withdraw = decodeFunctionData({
      abi: parseAbi([
        'function withdraw(address asset, uint256 amount, address to)',
      ]),
      data: transactions[0].data,
    });
    expect(withdraw.functionName).toBe('withdraw');
    expect(withdraw.args?.[0].toLowerCase()).toBe(
      FBTC_ETHEREUM_ADDRESS.toLowerCase(),
    );
    expect(withdraw.args?.[1]).toBe(5_000_000n);
    expect(withdraw.args?.[2].toLowerCase()).toBe(address.toLowerCase());
  });

  it('prepares max withdraw with type(uint256).max', async () => {
    const result = await prepareAaveWithdrawFbtc.execute({
      amount: 'max',
      address,
      chainId: 5000,
    });
    const transactions = result.params.transactions as Array<{
      data: `0x${string}`;
    }>;

    const withdraw = decodeFunctionData({
      abi: parseAbi([
        'function withdraw(address asset, uint256 amount, address to)',
      ]),
      data: transactions[0].data,
    });
    expect(withdraw.args?.[1]).toBe(maxUint256);
  });
});

describe('assertPostBorrowLtvWithinLimit', () => {
  it('allows borrows that stay at or under 55% utilization', () => {
    // $10,000 collateral, $0 debt, borrow $5,500 → exactly 55%
    const result = assertPostBorrowLtvWithinLimit(
      10_000_00000000n,
      0n,
      5_500_00000000n,
    );
    expect(result.projectedLtvBps).toBe(MAX_POST_BORROW_LTV_BPS);
  });

  it('rejects borrows that would exceed 55% utilization', () => {
    expect(() =>
      assertPostBorrowLtvWithinLimit(10_000_00000000n, 0n, 5_501_00000000n),
    ).toThrow(/projected utilization LTV/);
  });

  it('rejects when there is no collateral', () => {
    expect(() => assertPostBorrowLtvWithinLimit(0n, 0n, 1n)).toThrow(
      /no collateral/,
    );
  });

  it('converts stablecoin amount to base currency via oracle price', () => {
    // 100 USDC (6 decimals) at $1 oracle price (8 decimals)
    expect(assetAmountToBaseCurrency(100_000000n, 6, 100_000000n)).toBe(
      100_00000000n,
    );
  });
});

describe('prepareAaveBorrowStablecoin', () => {
  const address = '0x1234567890abcdef1234567890abcdef12345678';

  beforeEach(() => {
    vi.spyOn(chains, 'makePublicClient').mockImplementation(
      (chainId: number) =>
        ({
          getChainId: async () => chainId,
          readContract: async ({ functionName }: { functionName: string }) => {
            if (functionName === 'getUserAccountData') {
              // $10,000 collateral, $0 debt — room up to $5,500 at 55%
              return [10_000_00000000n, 0n, 0n, 0n, 0n, maxUint256] as const;
            }
            if (functionName === 'getAssetPrice') {
              return 100_000000n; // $1
            }
            throw new Error(`unexpected readContract: ${functionName}`);
          },
        }) as never,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prepares Pool.borrow USDC on Ethereum when under 55% LTV', async () => {
    const result = await prepareAaveBorrowStablecoin.execute({
      asset: 'USDC',
      amount: '100',
      address,
      chainId: 1,
    });
    const transactions = result.params.transactions as Array<{
      to: string;
      data: `0x${string}`;
    }>;

    expect(result.method).toBe('aave.borrowStablecoin');
    expect(result.params).toMatchObject({
      symbol: 'USDC',
      label: 'USDC',
      interestRateMode: 2,
      maxPostBorrowLtv: '55.00%',
      projectedLtv: '1.00%',
    });

    const borrow = decodeFunctionData({
      abi: parseAbi([
        'function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)',
      ]),
      data: transactions[0].data,
    });
    expect(borrow.functionName).toBe('borrow');
    expect(borrow.args?.[0].toLowerCase()).toBe(
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    );
    expect(borrow.args?.[1]).toBe(100_000_000n);
    expect(borrow.args?.[2]).toBe(2n);
  });

  it('maps USDT to USDT0 on Mantle', async () => {
    const result = await prepareAaveBorrowStablecoin.execute({
      asset: 'USDT',
      amount: '50',
      address,
      chainId: 5000,
    });

    expect(result.params).toMatchObject({
      chainId: 5000,
      symbol: 'USDT',
      label: 'USDT0',
      asset: '0x779Ded0c9e1022225f8E0630b35a9b54bE713736',
    });
  });

  it('rejects borrows that would exceed 55% utilization LTV', async () => {
    await expect(
      prepareAaveBorrowStablecoin.execute({
        asset: 'USDC',
        amount: '6000',
        address,
        chainId: 1,
      }),
    ).rejects.toThrow(/projected utilization LTV/);
  });
});

describe('prepareAaveRepayStablecoin', () => {
  const address = '0x1234567890abcdef1234567890abcdef12345678';

  it('prepares approve + Pool.repay for USDe on Ethereum', async () => {
    const result = await prepareAaveRepayStablecoin.execute({
      asset: 'USDe',
      amount: '10',
      address,
      chainId: 1,
    });
    const transactions = result.params.transactions as Array<{
      to: string;
      data: `0x${string}`;
    }>;

    expect(result.method).toBe('aave.repayStablecoin');
    expect(transactions).toHaveLength(2);

    const approval = decodeFunctionData({
      abi: erc20Abi,
      data: transactions[0].data,
    });
    expect(approval.functionName).toBe('approve');
    expect(approval.args?.[1]).toBe(10_000_000_000_000_000_000n);

    const repay = decodeFunctionData({
      abi: parseAbi([
        'function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf)',
      ]),
      data: transactions[1].data,
    });
    expect(repay.functionName).toBe('repay');
    expect(repay.args?.[2]).toBe(2n);
  });

  it('prepares max repay with debt+1% approve (not infinite)', async () => {
    const debt = 1_000_000n; // 1 USDC
    vi.spyOn(chains, 'makePublicClient').mockImplementation(
      (chainId: number) =>
        ({
          getChainId: async () => chainId,
          readContract: async () => debt,
        }) as never,
    );

    const result = await prepareAaveRepayStablecoin.execute({
      asset: 'USDC',
      amount: 'max',
      address,
      chainId: 5000,
    });
    const transactions = result.params.transactions as Array<{
      data: `0x${string}`;
    }>;

    const approval = decodeFunctionData({
      abi: erc20Abi,
      data: transactions[0].data,
    });
    // debt + 1% = 1_010_000
    expect(approval.args?.[1]).toBe(1_010_000n);

    const repay = decodeFunctionData({
      abi: parseAbi([
        'function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf)',
      ]),
      data: transactions[1].data,
    });
    expect(repay.args?.[1]).toBe(maxUint256);

    vi.restoreAllMocks();
  });

  it('rejects max repay when debt is zero', async () => {
    vi.spyOn(chains, 'makePublicClient').mockImplementation(
      (chainId: number) =>
        ({
          getChainId: async () => chainId,
          readContract: async () => 0n,
        }) as never,
    );

    await expect(
      prepareAaveRepayStablecoin.execute({
        asset: 'USDC',
        amount: 'max',
        address,
        chainId: 1,
      }),
    ).rejects.toThrow(/No variable/);

    vi.restoreAllMocks();
  });
});
