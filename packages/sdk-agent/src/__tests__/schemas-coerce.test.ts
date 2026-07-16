import { describe, expect, it } from 'vitest';

import {
  AaveBorrowStablecoinZod,
  AaveRepayStablecoinZod,
  AaveWithdrawFbtcZod,
} from '../schemas';

const address = '0x1234567890abcdef1234567890abcdef12345678';

describe('LLM tool-arg coercion', () => {
  it('accepts numeric amount and lowercase asset for repay', () => {
    const parsed = AaveRepayStablecoinZod.parse({
      asset: 'usdt',
      amount: 0.8,
      address,
      chainId: '1',
    });
    expect(parsed).toEqual({
      asset: 'USDT',
      amount: '0.8',
      address,
      chainId: 1,
    });
  });

  it('maps USDT0 / USDe spellings for borrow', () => {
    expect(
      AaveBorrowStablecoinZod.parse({
        asset: 'USDT0',
        amount: 10,
        address,
        chainId: 5000,
      }),
    ).toMatchObject({ asset: 'USDT', amount: '10', chainId: 5000 });

    expect(
      AaveBorrowStablecoinZod.parse({
        asset: 'usde',
        amount: '1',
        address,
        chainId: 1,
      }),
    ).toMatchObject({ asset: 'USDe' });
  });

  it('accepts numeric amount for withdraw (and max)', () => {
    expect(
      AaveWithdrawFbtcZod.parse({
        amount: 0.01,
        address,
        chainId: 1,
      }),
    ).toMatchObject({ amount: '0.01', chainId: 1 });

    expect(
      AaveWithdrawFbtcZod.parse({
        amount: 'max',
        address,
        chainId: '5000',
      }),
    ).toMatchObject({ amount: 'max', chainId: 5000 });
  });
});
