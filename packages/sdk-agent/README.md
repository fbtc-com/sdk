# @functionfbtc/sdk-agent

Framework-agnostic AI agent tools for Function FBTC and Aave V3.

## Install

```bash
npm install @functionfbtc/sdk-agent
```

## Tools

| Tool | Description |
| --- | --- |
| `get_token_info` | Look up FBTC metadata |
| `get_token_balance` | Read any ERC-20 balance |
| `get_aave_fbtc_reserve` | Aave V3 FBTC reserve details (Ethereum / Mantle) |
| `prepare_aave_supply_fbtc` | Prepare approve + Pool.supply calldata (chainId 1 or 5000) |

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
import { getAaveFbtcReserve, prepareAaveSupplyFbtc } from '@functionfbtc/sdk-agent';

const reserve = await getAaveFbtcReserve.execute({});
const prepared = await prepareAaveSupplyFbtc.execute({
  amount: '0.1',
  address: '0x...',
  chainId: 1, // or 5000 for Mantle
});
```
