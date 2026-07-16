# @functionfbtc/sdk-agent

Framework-agnostic AI agent tools for Function FBTC and Aave V3.

## Install

```bash
npm install @functionfbtc/sdk-agent
```

## Tools

| Tool                             | Description                                                                      |
| -------------------------------- | -------------------------------------------------------------------------------- |
| `get_token_info`                 | Look up FBTC metadata                                                            |
| `get_token_balance`              | Read any ERC-20 balance                                                          |
| `get_aave_fbtc_reserve`          | Aave V3 FBTC reserve details (Ethereum / Mantle)                                 |
| `get_aave_atoken_balance`        | Read aFBTC (aToken) balance                                                      |
| `get_aave_user_account`          | Health factor, LTV, liquidation threshold                                        |
| `prepare_aave_supply_fbtc`       | Prepare approve + Pool.supply; Mantle adds missing collateral / eMode 3 settings |
| `prepare_aave_withdraw_fbtc`     | Prepare Pool.withdraw calldata                                                   |
| `prepare_aave_borrow_stablecoin` | Prepare Pool.borrow for USDC / USDT / USDe                                       |
| `prepare_aave_repay_stablecoin`  | Prepare approve + Pool.repay calldata                                            |

All Aave tools take `chainId` `1` (Ethereum) or `5000` (Mantle).

## Usage

### Vercel AI SDK

```ts
import { functionTools } from '@functionfbtc/sdk-agent/vercel';
import { streamText } from 'ai';

const result = streamText({ model, tools: functionTools, messages });
```

### LangChain

```ts
import { functionLangChainTools } from '@functionfbtc/sdk-agent/langchain';
```

### Direct

```ts
import {
  getAaveFbtcReserve,
  getAaveUserAccount,
  prepareAaveBorrowStablecoin,
  prepareAaveSupplyFbtc,
  prepareAaveWithdrawFbtc,
} from '@functionfbtc/sdk-agent';

const reserve = await getAaveFbtcReserve.execute({ chainId: 1 });
const account = await getAaveUserAccount.execute({
  address: '0x...',
  chainId: 5000,
});
const supply = await prepareAaveSupplyFbtc.execute({
  amount: '0.1',
  address: '0x...',
  chainId: 1,
});
const withdraw = await prepareAaveWithdrawFbtc.execute({
  amount: 'max',
  address: '0x...',
  chainId: 1,
});
const borrow = await prepareAaveBorrowStablecoin.execute({
  asset: 'USDC',
  amount: '100',
  address: '0x...',
  chainId: 5000,
});
```
