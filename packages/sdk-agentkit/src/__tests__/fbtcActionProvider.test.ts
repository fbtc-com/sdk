import type { Network } from "@coinbase/agentkit";
import { describe, expect, it } from "vitest";

import { FbtcActionProvider } from "../fbtcActionProvider";

function makeNetwork(networkId?: string, chainId?: string): Network {
  return {
    protocolFamily: "evm",
    networkId,
    chainId,
  };
}

describe("FbtcActionProvider", () => {
  const provider = new FbtcActionProvider();

  describe("supportsNetwork", () => {
    it("supports ethereum-mainnet", () => {
      expect(provider.supportsNetwork(makeNetwork("ethereum-mainnet"))).toBe(
        true,
      );
    });

    it("supports mantle-mainnet", () => {
      expect(provider.supportsNetwork(makeNetwork("mantle-mainnet"))).toBe(
        true,
      );
    });

    it("supports Mantle by chainId when AgentKit omits networkId", () => {
      expect(provider.supportsNetwork(makeNetwork(undefined, "5000"))).toBe(
        true,
      );
    });

    it("supports Ethereum by chainId when AgentKit omits networkId", () => {
      expect(provider.supportsNetwork(makeNetwork(undefined, "1"))).toBe(true);
    });

    it("does not support ethereum-sepolia", () => {
      expect(provider.supportsNetwork(makeNetwork("ethereum-sepolia"))).toBe(
        false,
      );
    });

    it("does not support polygon", () => {
      expect(provider.supportsNetwork(makeNetwork("polygon-mainnet"))).toBe(
        false,
      );
    });

    it("does not support undefined network", () => {
      expect(provider.supportsNetwork(makeNetwork(undefined))).toBe(false);
    });
  });

  describe("action error handling", () => {
    const mockWalletProvider = {
      getAddress: () => "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18",
      getNetwork: () => makeNetwork("polygon-mainnet"),
      getBalance: async () => 0n,
      getName: () => "test",
      nativeTransfer: async () => "0x",
      signMessage: async () => "0x" as `0x${string}`,
      signTypedData: async () => "0x" as `0x${string}`,
      signTransaction: async () => "0x" as `0x${string}`,
      sendTransaction: async () => "0x" as `0x${string}`,
      waitForTransactionReceipt: async () => ({}),
      readContract: async () => 0n,
    } as unknown as Parameters<typeof provider.supplyFbtcToAave>[0];

    it("returns error when wallet networkId mismatches supply target", async () => {
      const result = await provider.supplyFbtcToAave(mockWalletProvider, {
        amount: "0.1",
        networkId: "ethereum-mainnet",
      });
      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("ethereum-mainnet");
    });
  });
});
