# @functionfbtc/sdk-agentkit

Function FBTC Action Provider for [Coinbase AgentKit](https://docs.cdp.coinbase.com/agentkit/docs/welcome).

## Install

```bash
npm install @functionfbtc/sdk-agentkit @coinbase/agentkit
```

## Actions

| Action                        | Description                                                         |
| ----------------------------- | ------------------------------------------------------------------- |
| `get_fbtc_balance`            | FBTC ERC-20 balance on Ethereum or Mantle                           |
| `get_afbtc_balance`           | Aave aFBTC (aToken) balance                                         |
| `get_aave_fbtc_reserve`       | Aave V3 FBTC reserve details (Ethereum / Mantle)                    |
| `get_aave_user_account`       | Health factor, LTV, liquidation threshold                           |
| `supply_fbtc_to_aave`         | Approve + supply; Mantle adds missing collateral / eMode 3 settings |
| `withdraw_fbtc_from_aave`     | Withdraw FBTC from Aave V3                                          |
| `borrow_stablecoin_from_aave` | Borrow USDC / USDT / USDe (variable rate)                           |
| `repay_stablecoin_to_aave`    | Approve + repay stablecoin debt                                     |

## Usage

```ts
import { AgentKit, walletActionProvider } from '@coinbase/agentkit';
import { fbtcActionProvider } from '@functionfbtc/sdk-agentkit';

const agentkit = await AgentKit.from({
  walletProvider,
  actionProviders: [
    walletActionProvider(),
    fbtcActionProvider({
      rpcUrls: {
        'ethereum-mainnet': process.env.ETH_RPC_URL,
        'mantle-mainnet': process.env.MANTLE_RPC_URL,
      },
    }),
  ],
});
```

Tools take a `networkId` (`ethereum-mainnet` | `mantle-mainnet`). If the user
does not name a network, the default is `ethereum-mainnet`. On Mantle, `USDT`
maps to USDT0. Write actions require the wallet to already be on the target
networkId.

See `apps/example-agentkit-cli` for a full LangChain chatbot example.
