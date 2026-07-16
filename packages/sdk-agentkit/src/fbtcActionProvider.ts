import 'reflect-metadata';

import {
  ActionProvider,
  CreateAction,
  EvmWalletProvider,
  type Network,
} from '@coinbase/agentkit';
import type { Address } from 'viem';
import { z } from 'zod';

import {
  AAVE_MANTLE_FBTC_EMODE_CATEGORY_ID,
  buildAaveBorrowStablecoinTransaction,
  buildAaveRepayStablecoinTransactions,
  buildAaveSupplyFbtcTransactions,
  buildAaveWithdrawFbtcTransaction,
  ensureBorrowWithinMaxLtv,
  FBTC_DECIMALS,
  fetchAaveSupplySetupState,
  fetchAaveUserAccountData,
  getAaveFbtcMarketByNetworkId,
  getAaveFbtcReserveDetails,
  MAX_POST_BORROW_LTV_BPS,
} from './aave';
import {
  type FbtcNetworkId,
  isFbtcSupportedNetwork,
  resolveNetwork,
  resolveNetworkId,
  SUPPORTED_NETWORK_IDS,
} from './networks';
import {
  BorrowStablecoinFromAaveSchema,
  GetAaveFbtcReserveSchema,
  GetAaveUserAccountSchema,
  GetAfbtcBalanceSchema,
  GetFbtcBalanceSchema,
  RepayStablecoinToAaveSchema,
  SupplyFbtcToAaveSchema,
  WithdrawFbtcFromAaveSchema,
} from './schemas';
import {
  formatError,
  formatSuccess,
  getErc20Balance,
  type RpcUrlByNetwork,
  waitForTxReceipt,
} from './utils';

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
 * import { fbtcActionProvider } from '@functionfbtc/sdk-agentkit';
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
    super('fbtc', []);
    this.rpcUrls = options.rpcUrls ?? {};
  }

  supportsNetwork = (network: Network): boolean => {
    return isFbtcSupportedNetwork(network);
  };

  private requireNetworkId(raw?: string): FbtcNetworkId {
    const networkId = resolveNetworkId(raw);
    if (!networkId) {
      throw new Error(
        `networkId is required. Supported: ${SUPPORTED_NETWORK_IDS.join(', ')}. ` +
          `Do not omit — FBTC addresses are identical on Ethereum and Mantle.`,
      );
    }
    return networkId;
  }

  private assertWalletOnNetwork(
    walletProvider: EvmWalletProvider,
    networkId: FbtcNetworkId,
    action: string,
  ): string | null {
    const walletNetwork = resolveNetwork(walletProvider.getNetwork());
    if (!walletNetwork || walletNetwork.networkId !== networkId) {
      return formatError(
        action,
        `FBTC Aave action for ${networkId} requires the wallet on ${networkId}. ` +
          `Current wallet networkId: ${walletNetwork?.networkId ?? 'unknown'}.`,
      );
    }
    return null;
  }

  @CreateAction({
    name: 'get_fbtc_balance',
    description:
      'Check the Function FBTC ERC-20 balance for an address. ' +
      `Pass networkId from the user instruction (${SUPPORTED_NETWORK_IDS.join(' | ')}). ` +
      `REQUIRED: pass networkId explicitly. ` +
      'FBTC token address: 0xc96de26018a54d51c097160568752c4e3bd6c364.',
    schema: GetFbtcBalanceSchema,
  })
  async getFbtcBalance(
    walletProvider: EvmWalletProvider,
    args: z.infer<typeof GetFbtcBalanceSchema>,
  ): Promise<string> {
    try {
      const address = (args.address || walletProvider.getAddress()) as Address;
      const networkId = this.requireNetworkId(args.networkId);
      const market = getAaveFbtcMarketByNetworkId(networkId);

      const { formatted } = await getErc20Balance(
        market.fbtcAddress,
        networkId,
        address,
        FBTC_DECIMALS,
        this.rpcUrls,
      );

      return formatSuccess('get_fbtc_balance', {
        address,
        balance: formatted,
        token: 'FBTC',
        tokenAddress: market.fbtcAddress,
        networkId: market.networkId,
      });
    } catch (error) {
      return formatError('get_fbtc_balance', error);
    }
  }

  @CreateAction({
    name: 'get_afbtc_balance',
    description:
      'Check the Aave aFBTC (aToken) balance for an address on Aave V3. ' +
      `Pass networkId from the user instruction (${SUPPORTED_NETWORK_IDS.join(' | ')}). ` +
      `REQUIRED: pass networkId explicitly.`,
    schema: GetAfbtcBalanceSchema,
  })
  async getAfbtcBalance(
    walletProvider: EvmWalletProvider,
    args: z.infer<typeof GetAfbtcBalanceSchema>,
  ): Promise<string> {
    try {
      const address = (args.address || walletProvider.getAddress()) as Address;
      const networkId = this.requireNetworkId(args.networkId);
      const market = getAaveFbtcMarketByNetworkId(networkId);

      const { formatted } = await getErc20Balance(
        market.aTokenAddress,
        networkId,
        address,
        FBTC_DECIMALS,
        this.rpcUrls,
      );

      return formatSuccess('get_afbtc_balance', {
        address,
        balance: formatted,
        token: 'aFBTC',
        tokenAddress: market.aTokenAddress,
        underlying: 'FBTC',
        underlyingAddress: market.fbtcAddress,
        networkId: market.networkId,
      });
    } catch (error) {
      return formatError('get_afbtc_balance', error);
    }
  }

  @CreateAction({
    name: 'get_aave_fbtc_reserve',
    description:
      'Return the canonical FBTC reserve and Aave V3 Pool details, including aFBTC and borrowable stablecoin addresses. ' +
      `Pass networkId from the user instruction (${SUPPORTED_NETWORK_IDS.join(' | ')}). ` +
      `REQUIRED: pass networkId explicitly.`,
    schema: GetAaveFbtcReserveSchema,
  })
  async getAaveFbtcReserve(
    _walletProvider: EvmWalletProvider,
    args: z.infer<typeof GetAaveFbtcReserveSchema>,
  ): Promise<string> {
    try {
      const networkId = this.requireNetworkId(args.networkId);
      return formatSuccess(
        'get_aave_fbtc_reserve',
        getAaveFbtcReserveDetails(networkId),
      );
    } catch (error) {
      return formatError('get_aave_fbtc_reserve', error);
    }
  }

  @CreateAction({
    name: 'get_aave_user_account',
    description:
      'Read Aave V3 account risk metrics for an address: health factor, LTV, liquidation threshold, collateral, and debt (USD). ' +
      `Pass networkId from the user instruction (${SUPPORTED_NETWORK_IDS.join(' | ')}). ` +
      `REQUIRED: pass networkId explicitly.`,
    schema: GetAaveUserAccountSchema,
  })
  async getAaveUserAccount(
    walletProvider: EvmWalletProvider,
    args: z.infer<typeof GetAaveUserAccountSchema>,
  ): Promise<string> {
    try {
      const address = (args.address || walletProvider.getAddress()) as Address;
      const networkId = this.requireNetworkId(args.networkId);
      const data = await fetchAaveUserAccountData(
        address,
        networkId,
        this.rpcUrls,
      );
      return formatSuccess('get_aave_user_account', data);
    } catch (error) {
      return formatError('get_aave_user_account', error);
    }
  }

  @CreateAction({
    name: 'supply_fbtc_to_aave',
    description:
      'Supply Function FBTC to Aave V3. ' +
      `Pass networkId from the user instruction (${SUPPORTED_NETWORK_IDS.join(' | ')}). ` +
      `REQUIRED: pass networkId explicitly. ` +
      'The wallet must already be on that same networkId. ' +
      'Ethereum sends two transactions: ERC-20 approve (exact amount), then Pool.supply. ' +
      'After Mantle supply, missing FBTC collateral and eMode category 3 settings are configured on demand. ' +
      'Confirm with the user before calling.',
    schema: SupplyFbtcToAaveSchema,
  })
  async supplyFbtcToAave(
    walletProvider: EvmWalletProvider,
    args: z.infer<typeof SupplyFbtcToAaveSchema>,
  ): Promise<string> {
    try {
      const networkId = this.requireNetworkId(args.networkId);
      const mismatch = this.assertWalletOnNetwork(
        walletProvider,
        networkId,
        'supply_fbtc_to_aave',
      );
      if (mismatch) return mismatch;

      const market = getAaveFbtcMarketByNetworkId(networkId);
      const account = walletProvider.getAddress() as Address;
      const { approve, supply, enableCollateral, setEMode } =
        buildAaveSupplyFbtcTransactions(args.amount, account, networkId);

      const approveTxHash = await walletProvider.sendTransaction({
        to: approve.to,
        data: approve.data,
      });
      await waitForTxReceipt({
        networkId,
        hash: approveTxHash as `0x${string}`,
        rpcUrls: this.rpcUrls,
      });

      const supplyTxHash = await walletProvider.sendTransaction({
        to: supply.to,
        data: supply.data,
      });
      await waitForTxReceipt({
        networkId,
        hash: supplyTxHash as `0x${string}`,
        rpcUrls: this.rpcUrls,
      });

      const setupState =
        networkId === 'mantle-mainnet'
          ? await fetchAaveSupplySetupState(account, market, this.rpcUrls)
          : null;
      let enableCollateralTxHash: string | undefined;
      let setEModeTxHash: string | undefined;
      if (
        setEMode &&
        setupState &&
        setupState.eModeCategoryId !== AAVE_MANTLE_FBTC_EMODE_CATEGORY_ID
      ) {
        setEModeTxHash = await walletProvider.sendTransaction({
          to: setEMode.to,
          data: setEMode.data,
        });
        await waitForTxReceipt({
          networkId,
          hash: setEModeTxHash as `0x${string}`,
          rpcUrls: this.rpcUrls,
        });
      }

      if (enableCollateral && setupState && !setupState.collateralEnabled) {
        enableCollateralTxHash = await walletProvider.sendTransaction({
          to: enableCollateral.to,
          data: enableCollateral.data,
        });
        await waitForTxReceipt({
          networkId,
          hash: enableCollateralTxHash as `0x${string}`,
          rpcUrls: this.rpcUrls,
        });
      }

      return formatSuccess('supply_fbtc_to_aave', {
        amount: args.amount,
        token: 'FBTC',
        tokenAddress: market.fbtcAddress,
        onBehalfOf: account,
        networkId: market.networkId,
        approveTxHash,
        supplyTxHash,
        ...(enableCollateralTxHash ? { enableCollateralTxHash } : {}),
        ...(setEModeTxHash ? { setEModeTxHash } : {}),
        description:
          networkId === 'mantle-mainnet'
            ? `Supplied ${args.amount} FBTC to ${market.marketLabel}; FBTC collateral and eMode category 3 are configured.`
            : `Supplied ${args.amount} FBTC to ${market.marketLabel}.`,
      });
    } catch (error) {
      return formatError('supply_fbtc_to_aave', error);
    }
  }

  @CreateAction({
    name: 'withdraw_fbtc_from_aave',
    description:
      'Withdraw Function FBTC from Aave V3. ' +
      `Pass networkId from the user instruction (${SUPPORTED_NETWORK_IDS.join(' | ')}). ` +
      'REQUIRED: pass networkId explicitly. ' +
      'The wallet must already be on that same networkId. ' +
      "Pass amount as a numeric string, or 'max' for the full aFBTC balance. " +
      'Warning: withdraw max while debt remains may revert if collateral would become insufficient. ' +
      'Sends one Pool.withdraw transaction. Confirm with the user before calling.',
    schema: WithdrawFbtcFromAaveSchema,
  })
  async withdrawFbtcFromAave(
    walletProvider: EvmWalletProvider,
    args: z.infer<typeof WithdrawFbtcFromAaveSchema>,
  ): Promise<string> {
    try {
      const networkId = this.requireNetworkId(args.networkId);
      const mismatch = this.assertWalletOnNetwork(
        walletProvider,
        networkId,
        'withdraw_fbtc_from_aave',
      );
      if (mismatch) return mismatch;

      const account = walletProvider.getAddress() as Address;
      const { withdraw, market } = buildAaveWithdrawFbtcTransaction(
        args.amount,
        account,
        networkId,
      );

      const withdrawTxHash = await walletProvider.sendTransaction({
        to: withdraw.to,
        data: withdraw.data,
      });
      await waitForTxReceipt({
        networkId,
        hash: withdrawTxHash as `0x${string}`,
        rpcUrls: this.rpcUrls,
      });

      return formatSuccess('withdraw_fbtc_from_aave', {
        amount: args.amount,
        token: 'FBTC',
        tokenAddress: market.fbtcAddress,
        to: account,
        networkId: market.networkId,
        withdrawTxHash,
        description: `Withdrew ${args.amount} FBTC from ${market.marketLabel}.`,
      });
    } catch (error) {
      return formatError('withdraw_fbtc_from_aave', error);
    }
  }

  @CreateAction({
    name: 'borrow_stablecoin_from_aave',
    description:
      'Borrow USDC, USDT, or USDe from Aave V3 against collateral (variable rate). ' +
      `Pass networkId from the user instruction (${SUPPORTED_NETWORK_IDS.join(' | ')}). ` +
      `REQUIRED: pass networkId explicitly. ` +
      'The wallet must already be on that same networkId. On Mantle, USDT is USDT0. ' +
      'Rejects borrows that would push utilization (debt/collateral) above 55%. ' +
      'Sends one Pool.borrow transaction. Confirm with the user before calling.',
    schema: BorrowStablecoinFromAaveSchema,
  })
  async borrowStablecoinFromAave(
    walletProvider: EvmWalletProvider,
    args: z.infer<typeof BorrowStablecoinFromAaveSchema>,
  ): Promise<string> {
    try {
      const networkId = this.requireNetworkId(args.networkId);
      const mismatch = this.assertWalletOnNetwork(
        walletProvider,
        networkId,
        'borrow_stablecoin_from_aave',
      );
      if (mismatch) return mismatch;

      const account = walletProvider.getAddress() as Address;
      const { borrow, market, stablecoin, amountRaw } =
        buildAaveBorrowStablecoinTransaction(
          args.asset,
          args.amount,
          account,
          networkId,
        );

      const ltvCheck = await ensureBorrowWithinMaxLtv({
        user: account,
        market,
        asset: stablecoin.address,
        amountRaw,
        decimals: stablecoin.decimals,
        rpcUrls: this.rpcUrls,
      });

      const borrowTxHash = await walletProvider.sendTransaction({
        to: borrow.to,
        data: borrow.data,
      });
      await waitForTxReceipt({
        networkId,
        hash: borrowTxHash as `0x${string}`,
        rpcUrls: this.rpcUrls,
      });

      return formatSuccess('borrow_stablecoin_from_aave', {
        amount: args.amount,
        asset: stablecoin.symbol,
        label: stablecoin.label,
        tokenAddress: stablecoin.address,
        interestRateMode: 2,
        onBehalfOf: account,
        networkId: market.networkId,
        currentLtv: `${(Number(ltvCheck.currentLtvBps) / 100).toFixed(2)}%`,
        projectedLtv: `${(Number(ltvCheck.projectedLtvBps) / 100).toFixed(2)}%`,
        maxPostBorrowLtv: `${(Number(MAX_POST_BORROW_LTV_BPS) / 100).toFixed(2)}%`,
        borrowTxHash,
        description: `Borrowed ${args.amount} ${stablecoin.label} from ${market.marketLabel}.`,
      });
    } catch (error) {
      return formatError('borrow_stablecoin_from_aave', error);
    }
  }

  @CreateAction({
    name: 'repay_stablecoin_to_aave',
    description:
      'Repay USDC, USDT, or USDe debt on Aave V3 (variable rate). ' +
      `Pass networkId from the user instruction (${SUPPORTED_NETWORK_IDS.join(' | ')}). ` +
      'REQUIRED: pass networkId explicitly. ' +
      'The wallet must already be on that same networkId. On Mantle, USDT is USDT0. ' +
      "Pass amount as a numeric string, or 'max' for the full debt " +
      '(reads debt token balance and approves debt+1% — not infinite; rejected if debt is zero). ' +
      'Sends two transactions: ERC-20 approve then Pool.repay. Confirm with the user before calling.',
    schema: RepayStablecoinToAaveSchema,
  })
  async repayStablecoinToAave(
    walletProvider: EvmWalletProvider,
    args: z.infer<typeof RepayStablecoinToAaveSchema>,
  ): Promise<string> {
    try {
      const networkId = this.requireNetworkId(args.networkId);
      const mismatch = this.assertWalletOnNetwork(
        walletProvider,
        networkId,
        'repay_stablecoin_to_aave',
      );
      if (mismatch) return mismatch;

      const account = walletProvider.getAddress() as Address;
      const { approve, repay, market, stablecoin, isMax, debtRaw } =
        await buildAaveRepayStablecoinTransactions(
          args.asset,
          args.amount,
          account,
          networkId,
          this.rpcUrls,
        );

      const approveTxHash = await walletProvider.sendTransaction({
        to: approve.to,
        data: approve.data,
      });
      await waitForTxReceipt({
        networkId,
        hash: approveTxHash as `0x${string}`,
        rpcUrls: this.rpcUrls,
      });

      const repayTxHash = await walletProvider.sendTransaction({
        to: repay.to,
        data: repay.data,
      });
      await waitForTxReceipt({
        networkId,
        hash: repayTxHash as `0x${string}`,
        rpcUrls: this.rpcUrls,
      });

      return formatSuccess('repay_stablecoin_to_aave', {
        amount: args.amount,
        asset: stablecoin.symbol,
        label: stablecoin.label,
        tokenAddress: stablecoin.address,
        interestRateMode: 2,
        onBehalfOf: account,
        networkId: market.networkId,
        isMax,
        debtRaw: debtRaw?.toString() ?? null,
        approveTxHash,
        repayTxHash,
        description: `Repaid ${args.amount} ${stablecoin.label} on ${market.marketLabel}.`,
      });
    } catch (error) {
      return formatError('repay_stablecoin_to_aave', error);
    }
  }
}

export const fbtcActionProvider = (options?: FbtcActionProviderOptions) =>
  new FbtcActionProvider(options);
