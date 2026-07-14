# @functionFBTC/sdk-agentkit

Function FBTC Action Provider for [Coinbase AgentKit](https://docs.cdp.coinbase.com/agentkit/docs/welcome).

## Install

```bash
npm install @functionFBTC/sdk-agentkit @coinbase/agentkit
```

## Actions

| Action | Description |
| --- | --- |
| `get_fbtc_balance` | FBTC ERC-20 balance on Ethereum or Mantle |
| `get_aave_fbtc_reserve` | Aave V3 FBTC reserve details (Ethereum / Mantle) |
| `supply_fbtc_to_aave` | Approve + supply FBTC to Aave V3 (requires `ethereum-mainnet` or `mantle-mainnet`) |

## Usage

```ts
import { AgentKit, walletActionProvider } from '@coinbase/agentkit';
import { fbtcActionProvider } from '@functionFBTC/sdk-agentkit';

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
does not name a network, the default is `ethereum-mainnet`.

See `apps/example-agentkit-cli` for a full LangChain chatbot example.
