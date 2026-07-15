import { decodeFunctionData, erc20Abi, parseAbi } from 'viem';
import { describe, expect, it } from 'vitest';

import {
  AAVE_V3_ETHEREUM_POOL,
  AAVE_V3_MANTLE_POOL,
  FBTC_ETHEREUM_ADDRESS,
  FBTC_MANTLE_ADDRESS,
  getAaveFbtcReserve,
  prepareAaveSupplyFbtc,
} from '../aave';

describe('getAaveFbtcReserve', () => {
  it('returns the canonical Ethereum FBTC reserve details by default', async () => {
    const result = await getAaveFbtcReserve.execute({});

    expect(result).toMatchObject({
      protocol: 'Aave V3',
      chainId: 1,
      chain: 'Ethereum',
      token: 'FBTC',
      tokenAddress: FBTC_ETHEREUM_ADDRESS,
      tokenDecimals: 8,
      poolAddress: AAVE_V3_ETHEREUM_POOL,
    });
  });

  it('returns the Mantle FBTC reserve details when chainId is 5000', async () => {
    const result = await getAaveFbtcReserve.execute({ chainId: 5000 });

    expect(result).toMatchObject({
      protocol: 'Aave V3',
      chainId: 5000,
      chain: 'Mantle',
      token: 'FBTC',
      tokenAddress: FBTC_MANTLE_ADDRESS,
      tokenDecimals: 8,
      poolAddress: AAVE_V3_MANTLE_POOL,
    });
  });
});

describe('prepareAaveSupplyFbtc', () => {
  const address = '0x1234567890abcdef1234567890abcdef12345678';

  it('prepares exact-amount approve and Pool.supply transactions on Ethereum', async () => {
    const result = await prepareAaveSupplyFbtc.execute({
      amount: '0.1',
      address,
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

  it('prepares Mantle approve and Pool.supply transactions when chainId is 5000', async () => {
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
  });

  it('rejects zero amounts', async () => {
    await expect(
      prepareAaveSupplyFbtc.execute({ amount: '0', address }),
    ).rejects.toThrow();
  });
});
