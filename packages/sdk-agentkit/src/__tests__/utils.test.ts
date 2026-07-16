import { afterEach, describe, expect, it } from "vitest";

import { resolveRpcUrl, waitForTxReceipt } from "../utils";

describe("resolveRpcUrl", () => {
  const original = {
    ETH_RPC_URL: process.env.ETH_RPC_URL,
    MANTLE_RPC_URL: process.env.MANTLE_RPC_URL,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("does not reuse Ethereum RPC for Mantle reads", () => {
    delete process.env.MANTLE_RPC_URL;
    expect(
      resolveRpcUrl("mantle-mainnet", {
        "ethereum-mainnet": "https://eth.example",
      }),
    ).toBeUndefined();
  });

  it("uses mantle-mainnet RPC for Mantle", () => {
    expect(
      resolveRpcUrl("mantle-mainnet", {
        "ethereum-mainnet": "https://eth.example",
        "mantle-mainnet": "https://mantle.example",
      }),
    ).toBe("https://mantle.example");
  });

  it("uses ethereum-mainnet RPC for Ethereum", () => {
    expect(
      resolveRpcUrl("ethereum-mainnet", {
        "ethereum-mainnet": "https://eth.example",
        "mantle-mainnet": "https://mantle.example",
      }),
    ).toBe("https://eth.example");
  });

  it("reads MANTLE_RPC_URL from the environment", () => {
    process.env.MANTLE_RPC_URL = "https://mantle.env";
    expect(
      resolveRpcUrl("mantle-mainnet", {
        "ethereum-mainnet": "https://eth.example",
      }),
    ).toBe("https://mantle.env");
  });
});

describe("waitForTxReceipt", () => {
  it("falls back to getTransactionReceipt when wait times out", async () => {
    const receipt = { transactionHash: "0xabc", status: "success" };
    const client = {
      waitForTransactionReceipt: async () => {
        throw new Error("The request took too long to respond.");
      },
      getTransactionReceipt: async () => receipt,
    };

    const result = await waitForTxReceipt({
      networkId: "ethereum-mainnet",
      hash: "0xabc" as `0x${string}`,
      client: client as never,
    });
    expect(result).toBe(receipt);
  });
});
