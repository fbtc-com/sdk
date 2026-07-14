import { afterEach, describe, expect, it } from "vitest";

import { resolveRpcUrl } from "../utils";

describe("resolveRpcUrl", () => {
  const original = {
    RPC_URL: process.env.RPC_URL,
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
      resolveRpcUrl(5000, { rpcUrl: "https://eth.example", mantleRpcUrl: undefined }),
    ).toBeUndefined();
  });

  it("uses mantleRpcUrl for Mantle", () => {
    expect(
      resolveRpcUrl(5000, {
        rpcUrl: "https://eth.example",
        mantleRpcUrl: "https://mantle.example",
      }),
    ).toBe("https://mantle.example");
  });

  it("uses rpcUrl for Ethereum", () => {
    expect(
      resolveRpcUrl(1, {
        rpcUrl: "https://eth.example",
        mantleRpcUrl: "https://mantle.example",
      }),
    ).toBe("https://eth.example");
  });

  it("reads MANTLE_RPC_URL from the environment", () => {
    process.env.MANTLE_RPC_URL = "https://mantle.env";
    expect(resolveRpcUrl(5000, { rpcUrl: "https://eth.example" })).toBe(
      "https://mantle.env",
    );
  });
});
