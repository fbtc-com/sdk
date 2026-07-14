import { decodeFunctionData, erc20Abi, parseAbi } from "viem";
import { describe, expect, it } from "vitest";

import {
  AAVE_V3_ETHEREUM_POOL,
  AAVE_V3_MANTLE_POOL,
  buildAaveSupplyFbtcTransactions,
  FBTC_ETHEREUM_ADDRESS,
  FBTC_MANTLE_ADDRESS,
  getAaveFbtcReserveDetails,
} from "../aave";

describe("getAaveFbtcReserveDetails", () => {
  it("returns the canonical Ethereum FBTC reserve details by default", () => {
    expect(getAaveFbtcReserveDetails()).toMatchObject({
      protocol: "Aave V3",
      chainId: 1,
      token: "FBTC",
      tokenAddress: FBTC_ETHEREUM_ADDRESS,
      tokenDecimals: 8,
      poolAddress: AAVE_V3_ETHEREUM_POOL,
    });
  });

  it("returns the Mantle FBTC reserve details when chainId is 5000", () => {
    expect(getAaveFbtcReserveDetails(5000)).toMatchObject({
      protocol: "Aave V3",
      chainId: 5000,
      chain: "Mantle",
      networkId: "mantle-mainnet",
      token: "FBTC",
      tokenAddress: FBTC_MANTLE_ADDRESS,
      tokenDecimals: 8,
      poolAddress: AAVE_V3_MANTLE_POOL,
    });
  });
});

describe("buildAaveSupplyFbtcTransactions", () => {
  const address = "0x1234567890abcdef1234567890abcdef12345678";

  it("builds exact-amount approve and Pool.supply transactions on Ethereum", () => {
    const { approve, supply, amountRaw } = buildAaveSupplyFbtcTransactions(
      "0.1",
      address,
    );

    expect(amountRaw).toBe(10_000_000n);
    expect(approve.to.toLowerCase()).toBe(FBTC_ETHEREUM_ADDRESS.toLowerCase());
    expect(supply.to.toLowerCase()).toBe(AAVE_V3_ETHEREUM_POOL.toLowerCase());

    const approval = decodeFunctionData({
      abi: erc20Abi,
      data: approve.data,
    });
    expect(approval.functionName).toBe("approve");
    expect(approval.args).toEqual([AAVE_V3_ETHEREUM_POOL, 10_000_000n]);

    const supplyCall = decodeFunctionData({
      abi: parseAbi([
        "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)",
      ]),
      data: supply.data,
    });
    expect(supplyCall.functionName).toBe("supply");
    expect(supplyCall.args?.[0].toLowerCase()).toBe(
      FBTC_ETHEREUM_ADDRESS.toLowerCase(),
    );
    expect(supplyCall.args?.[1]).toBe(10_000_000n);
    expect(supplyCall.args?.[2].toLowerCase()).toBe(address.toLowerCase());
    expect(supplyCall.args?.[3]).toBe(0);
  });

  it("builds Mantle approve and Pool.supply transactions when chainId is 5000", () => {
    const { approve, supply, market } = buildAaveSupplyFbtcTransactions(
      "0.1",
      address,
      5000,
    );

    expect(market.chainId).toBe(5000);
    expect(approve.to.toLowerCase()).toBe(FBTC_MANTLE_ADDRESS.toLowerCase());
    expect(supply.to.toLowerCase()).toBe(AAVE_V3_MANTLE_POOL.toLowerCase());

    const approval = decodeFunctionData({
      abi: erc20Abi,
      data: approve.data,
    });
    expect(approval.args).toEqual([AAVE_V3_MANTLE_POOL, 10_000_000n]);
  });
});
