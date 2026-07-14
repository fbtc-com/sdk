import { decodeFunctionData, erc20Abi, parseAbi } from "viem";
import { describe, expect, it } from "vitest";

import {
  AAVE_V3_ETHEREUM_POOL,
  buildAaveSupplyFbtcTransactions,
  FBTC_ETHEREUM_ADDRESS,
  getAaveFbtcReserveDetails,
} from "../aave";

describe("getAaveFbtcReserveDetails", () => {
  it("returns the canonical Ethereum FBTC reserve details", () => {
    expect(getAaveFbtcReserveDetails()).toMatchObject({
      protocol: "Aave V3",
      chainId: 1,
      token: "FBTC",
      tokenAddress: FBTC_ETHEREUM_ADDRESS,
      tokenDecimals: 8,
      poolAddress: AAVE_V3_ETHEREUM_POOL,
    });
  });
});

describe("buildAaveSupplyFbtcTransactions", () => {
  const address = "0x1234567890abcdef1234567890abcdef12345678";

  it("builds exact-amount approve and Pool.supply transactions", () => {
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
});
