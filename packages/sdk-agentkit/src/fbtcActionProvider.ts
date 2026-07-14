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
  AAVE_FBTC_MARKETS,
  buildAaveSupplyFbtcTransactions,
  FBTC_DECIMALS,
  getAaveFbtcMarket,
  getAaveFbtcMarketByNetworkId,
  getAaveFbtcReserveDetails,
} from "./aave";
import { isFbtcSupportedNetwork, resolveNetwork } from "./networks";
import {
  GetAaveFbtcReserveSchema,
  GetFbtcBalanceSchema,
  SupplyFbtcToAaveSchema,
} from "./schemas";
import { formatError, formatSuccess, getErc20Balance } from "./utils";

export interface FbtcActionProviderOptions {
  /** Ethereum mainnet RPC used for chainId 1 reads (e.g. get_fbtc_balance). */
  rpcUrl?: string;
  /** Mantle RPC used for chainId 5000 reads. Never reuse rpcUrl for Mantle. */
  mantleRpcUrl?: string;
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
 *       rpcUrl: process.env.ETH_RPC_URL ?? process.env.RPC_URL,
 *       mantleRpcUrl: process.env.MANTLE_RPC_URL,
 *     }),
 *   ],
 * });
 * ```
 */
export class FbtcActionProvider extends ActionProvider<EvmWalletProvider> {
  private readonly rpcUrl?: string;
  private readonly mantleRpcUrl?: string;

  constructor(options: FbtcActionProviderOptions = {}) {
    super("fbtc", []);
    this.rpcUrl = options.rpcUrl;
    this.mantleRpcUrl = options.mantleRpcUrl;
  }

  supportsNetwork = (network: Network): boolean => {
    return isFbtcSupportedNetwork(network);
  };

  @CreateAction({
    name: "get_fbtc_balance",
    description:
      "Check the Function FBTC ERC-20 balance for an address on Ethereum (chainId 1) or Mantle (chainId 5000). " +
      "FBTC token address: 0xc96de26018a54d51c097160568752c4e3bd6c364. " +
      "Optional chainId defaults to the wallet network when supported, otherwise Ethereum.",
    schema: GetFbtcBalanceSchema,
  })
  async getFbtcBalance(
    walletProvider: EvmWalletProvider,
    args: z.infer<typeof GetFbtcBalanceSchema>,
  ): Promise<string> {
    try {
      const address = (args.address || walletProvider.getAddress()) as Address;
      const walletNetwork = resolveNetwork(walletProvider.getNetwork());
      const chainId =
        args.chainId ?? walletNetwork?.chainId ?? AAVE_FBTC_MARKETS[1].chainId;
      const market = getAaveFbtcMarket(chainId);

      const { formatted } = await getErc20Balance(
        market.fbtcAddress,
        market.chainId,
        address,
        FBTC_DECIMALS,
        { rpcUrl: this.rpcUrl, mantleRpcUrl: this.mantleRpcUrl },
      );

      return formatSuccess("get_fbtc_balance", {
        address,
        balance: formatted,
        token: "FBTC",
        tokenAddress: market.fbtcAddress,
        chain: market.networkId,
        chainId: market.chainId,
      });
    } catch (error) {
      return formatError("get_fbtc_balance", error);
    }
  }

  @CreateAction({
    name: "get_aave_fbtc_reserve",
    description:
      "Return the canonical FBTC reserve and Aave V3 Pool details for Ethereum Core (chainId 1) or Mantle (chainId 5000). " +
      "Use this before supplying FBTC when the user asks for reserve details.",
    schema: GetAaveFbtcReserveSchema,
  })
  async getAaveFbtcReserve(
    _walletProvider: EvmWalletProvider,
    args: z.infer<typeof GetAaveFbtcReserveSchema>,
  ): Promise<string> {
    try {
      return formatSuccess(
        "get_aave_fbtc_reserve",
        getAaveFbtcReserveDetails(args.chainId),
      );
    } catch (error) {
      return formatError("get_aave_fbtc_reserve", error);
    }
  }

  @CreateAction({
    name: "supply_fbtc_to_aave",
    description:
      "Supply Function FBTC to Aave V3 Ethereum Core or Aave V3 Mantle. " +
      "Requires the wallet to be on ethereum-mainnet or mantle-mainnet. " +
      "Sends two transactions: ERC-20 approve (exact amount) then Pool.supply. " +
      "Confirm with the user before calling.",
    schema: SupplyFbtcToAaveSchema,
  })
  async supplyFbtcToAave(
    walletProvider: EvmWalletProvider,
    args: z.infer<typeof SupplyFbtcToAaveSchema>,
  ): Promise<string> {
    try {
      const resolved = resolveNetwork(walletProvider.getNetwork());
      const market = resolved
        ? getAaveFbtcMarketByNetworkId(resolved.networkId)
        : null;
      if (!market) {
        return formatError(
          "supply_fbtc_to_aave",
          "FBTC Aave supply requires ethereum-mainnet or mantle-mainnet. Switch NETWORK_ID to a supported network.",
        );
      }

      const account = walletProvider.getAddress() as Address;
      const { approve, supply } = buildAaveSupplyFbtcTransactions(
        args.amount,
        account,
        market.chainId,
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
        chainId: market.chainId,
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
