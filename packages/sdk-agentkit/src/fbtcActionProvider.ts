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
  FBTC_ETHEREUM_ADDRESS,
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
  /** Ethereum mainnet RPC used for read actions (e.g. get_fbtc_balance). */
  rpcUrl?: string;
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
 *   actionProviders: [fbtcActionProvider({ rpcUrl: process.env.RPC_URL })],
 * });
 * ```
 */
export class FbtcActionProvider extends ActionProvider<EvmWalletProvider> {
  private readonly rpcUrl?: string;

  constructor(options: FbtcActionProviderOptions = {}) {
    super("fbtc", []);
    this.rpcUrl = options.rpcUrl;
  }

  supportsNetwork = (network: Network): boolean => {
    return isFbtcSupportedNetwork(network);
  };

  @CreateAction({
    name: "get_fbtc_balance",
    description:
      "Check the Function FBTC ERC-20 balance for an address on Ethereum mainnet. " +
      "FBTC token address: 0xc96de26018a54d51c097160568752c4e3bd6c364. " +
      "Reads mainnet regardless of the wallet's currently selected network.",
    schema: GetFbtcBalanceSchema,
  })
  async getFbtcBalance(
    walletProvider: EvmWalletProvider,
    args: z.infer<typeof GetFbtcBalanceSchema>,
  ): Promise<string> {
    try {
      const address = (args.address || walletProvider.getAddress()) as Address;
      const { formatted } = await getErc20Balance(
        FBTC_ETHEREUM_ADDRESS,
        1,
        address,
        FBTC_DECIMALS,
        this.rpcUrl,
      );

      return formatSuccess("get_fbtc_balance", {
        address,
        balance: formatted,
        token: "FBTC",
        tokenAddress: FBTC_ETHEREUM_ADDRESS,
        chain: "ethereum-mainnet",
        chainId: 1,
      });
    } catch (error) {
      return formatError("get_fbtc_balance", error);
    }
  }

  @CreateAction({
    name: "get_aave_fbtc_reserve",
    description:
      "Return the canonical FBTC reserve and Aave V3 Pool details for Ethereum mainnet. " +
      "Use this before supplying FBTC when the user asks for reserve details.",
    schema: GetAaveFbtcReserveSchema,
  })
  async getAaveFbtcReserve(
    _walletProvider: EvmWalletProvider,
    _args: z.infer<typeof GetAaveFbtcReserveSchema>,
  ): Promise<string> {
    try {
      return formatSuccess(
        "get_aave_fbtc_reserve",
        getAaveFbtcReserveDetails(),
      );
    } catch (error) {
      return formatError("get_aave_fbtc_reserve", error);
    }
  }

  @CreateAction({
    name: "supply_fbtc_to_aave",
    description:
      "Supply Function FBTC to the Aave V3 Ethereum Core market. " +
      "Requires the wallet to be on ethereum-mainnet. " +
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
      if (!resolved || resolved.networkId !== "ethereum-mainnet") {
        return formatError(
          "supply_fbtc_to_aave",
          "FBTC Aave supply requires ethereum-mainnet. Switch NETWORK_ID to ethereum-mainnet.",
        );
      }

      const account = walletProvider.getAddress() as Address;
      const { approve, supply } = buildAaveSupplyFbtcTransactions(
        args.amount,
        account,
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
        tokenAddress: FBTC_ETHEREUM_ADDRESS,
        onBehalfOf: account,
        chainId: 1,
        approveTxHash,
        supplyTxHash,
        description: `Supplied ${args.amount} FBTC to Aave V3 Ethereum Core.`,
      });
    } catch (error) {
      return formatError("supply_fbtc_to_aave", error);
    }
  }
}

export const fbtcActionProvider = (options?: FbtcActionProviderOptions) =>
  new FbtcActionProvider(options);
