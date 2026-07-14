import "reflect-metadata";

import {
  ActionProvider,
  CreateAction,
  EvmWalletProvider,
  type Network,
} from "@coinbase/agentkit";
import type { Address } from "viem";
import { z } from "zod";

import {
  buildAaveSupplyFbtcTransactions,
  FBTC_DECIMALS,
  getAaveFbtcMarketByNetworkId,
  getAaveFbtcReserveDetails,
} from "./aave";
import {
  DEFAULT_NETWORK_ID,
  type FbtcNetworkId,
  isFbtcSupportedNetwork,
  resolveNetwork,
  resolveNetworkId,
  SUPPORTED_NETWORK_IDS,
} from "./networks";
import {
  GetAaveFbtcReserveSchema,
  GetFbtcBalanceSchema,
  SupplyFbtcToAaveSchema,
} from "./schemas";
import {
  formatError,
  formatSuccess,
  getErc20Balance,
  type RpcUrlByNetwork,
} from "./utils";

export interface FbtcActionProviderOptions {
  /**
   * RPC endpoints keyed by networkId. Load both ethereum-mainnet and
   * mantle-mainnet at startup so reads can target either network from
   * the user's instruction.
   */
  rpcUrls?: RpcUrlByNetwork;
}

/**
 * FbtcActionProvider exposes Function FBTC / Aave V3 operations
 * as Coinbase AgentKit actions.
 *
 * SECURITY: This provider executes real transactions. Configure your wallet
 * provider with appropriate spending limits.
 *
 * Usage:
 * ```ts
 * import { fbtcActionProvider } from '@functionFBTC/sdk-agentkit';
 *
 * const agentkit = await AgentKit.from({
 *   walletProvider,
 *   actionProviders: [
 *     fbtcActionProvider({
 *       rpcUrls: {
 *         'ethereum-mainnet': process.env.ETH_RPC_URL,
 *         'mantle-mainnet': process.env.MANTLE_RPC_URL,
 *       },
 *     }),
 *   ],
 * });
 * ```
 */
export class FbtcActionProvider extends ActionProvider<EvmWalletProvider> {
  private readonly rpcUrls: RpcUrlByNetwork;

  constructor(options: FbtcActionProviderOptions = {}) {
    super("fbtc", []);
    this.rpcUrls = options.rpcUrls ?? {};
  }

  supportsNetwork = (network: Network): boolean => {
    return isFbtcSupportedNetwork(network);
  };

  private resolveTargetNetworkId(raw?: string): FbtcNetworkId {
    return resolveNetworkId(raw) ?? DEFAULT_NETWORK_ID;
  }

  @CreateAction({
    name: "get_fbtc_balance",
    description:
      "Check the Function FBTC ERC-20 balance for an address. " +
      `Pass networkId from the user instruction (${SUPPORTED_NETWORK_IDS.join(" | ")}). ` +
      `If the user does not name a network, use ${DEFAULT_NETWORK_ID}. ` +
      "FBTC token address: 0xc96de26018a54d51c097160568752c4e3bd6c364.",
    schema: GetFbtcBalanceSchema,
  })
  async getFbtcBalance(
    walletProvider: EvmWalletProvider,
    args: z.infer<typeof GetFbtcBalanceSchema>,
  ): Promise<string> {
    try {
      const address = (args.address || walletProvider.getAddress()) as Address;
      const networkId = this.resolveTargetNetworkId(args.networkId);
      const market = getAaveFbtcMarketByNetworkId(networkId);

      const { formatted } = await getErc20Balance(
        market.fbtcAddress,
        networkId,
        address,
        FBTC_DECIMALS,
        this.rpcUrls,
      );

      return formatSuccess("get_fbtc_balance", {
        address,
        balance: formatted,
        token: "FBTC",
        tokenAddress: market.fbtcAddress,
        networkId: market.networkId,
      });
    } catch (error) {
      return formatError("get_fbtc_balance", error);
    }
  }

  @CreateAction({
    name: "get_aave_fbtc_reserve",
    description:
      "Return the canonical FBTC reserve and Aave V3 Pool details. " +
      `Pass networkId from the user instruction (${SUPPORTED_NETWORK_IDS.join(" | ")}). ` +
      `If the user does not name a network, use ${DEFAULT_NETWORK_ID}.`,
    schema: GetAaveFbtcReserveSchema,
  })
  async getAaveFbtcReserve(
    _walletProvider: EvmWalletProvider,
    args: z.infer<typeof GetAaveFbtcReserveSchema>,
  ): Promise<string> {
    try {
      const networkId = this.resolveTargetNetworkId(args.networkId);
      return formatSuccess(
        "get_aave_fbtc_reserve",
        getAaveFbtcReserveDetails(networkId),
      );
    } catch (error) {
      return formatError("get_aave_fbtc_reserve", error);
    }
  }

  @CreateAction({
    name: "supply_fbtc_to_aave",
    description:
      "Supply Function FBTC to Aave V3. " +
      `Pass networkId from the user instruction (${SUPPORTED_NETWORK_IDS.join(" | ")}). ` +
      `If the user does not name a network, use ${DEFAULT_NETWORK_ID}. ` +
      "The wallet must already be on that same networkId. " +
      "Sends two transactions: ERC-20 approve (exact amount) then Pool.supply. " +
      "Confirm with the user before calling.",
    schema: SupplyFbtcToAaveSchema,
  })
  async supplyFbtcToAave(
    walletProvider: EvmWalletProvider,
    args: z.infer<typeof SupplyFbtcToAaveSchema>,
  ): Promise<string> {
    try {
      const networkId = this.resolveTargetNetworkId(args.networkId);
      const walletNetwork = resolveNetwork(walletProvider.getNetwork());
      if (!walletNetwork || walletNetwork.networkId !== networkId) {
        return formatError(
          "supply_fbtc_to_aave",
          `FBTC Aave supply for ${networkId} requires the wallet on ${networkId}. ` +
            `Current wallet networkId: ${walletNetwork?.networkId ?? "unknown"}.`,
        );
      }

      const market = getAaveFbtcMarketByNetworkId(networkId);
      const account = walletProvider.getAddress() as Address;
      const { approve, supply } = buildAaveSupplyFbtcTransactions(
        args.amount,
        account,
        networkId,
      );

      const approveTxHash = await walletProvider.sendTransaction({
        to: approve.to,
        data: approve.data,
      });
      await walletProvider.waitForTransactionReceipt(approveTxHash);

      const supplyTxHash = await walletProvider.sendTransaction({
        to: supply.to,
        data: supply.data,
      });
      await walletProvider.waitForTransactionReceipt(supplyTxHash);

      return formatSuccess("supply_fbtc_to_aave", {
        amount: args.amount,
        token: "FBTC",
        tokenAddress: market.fbtcAddress,
        onBehalfOf: account,
        networkId: market.networkId,
        approveTxHash,
        supplyTxHash,
        description: `Supplied ${args.amount} FBTC to ${market.marketLabel}.`,
      });
    } catch (error) {
      return formatError("supply_fbtc_to_aave", error);
    }
  }
}

export const fbtcActionProvider = (options?: FbtcActionProviderOptions) =>
  new FbtcActionProvider(options);
