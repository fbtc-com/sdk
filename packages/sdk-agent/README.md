# @functionFBTC/sdk-agent

Framework-agnostic AI agent tools for Function FBTC and Aave V3.

## Install

```bash
npm install @functionFBTC/sdk-agent
```

## Tools

| Tool | Description |
| --- | --- |
| `get_token_info` | Look up FBTC metadata |
| `get_token_balance` | Read any ERC-20 balance |
| `get_aave_fbtc_reserve` | Aave V3 Ethereum FBTC reserve details |
| `prepare_aave_supply_fbtc` | Prepare approve + Pool.supply calldata |

## Usage

### Vercel AI SDK

```ts
import { functionTools } from '@functionFBTC/sdk-agent/vercel';
import { streamText } from 'ai';

const result = streamText({ model, tools: functionTools, messages });
```

### LangChain

```ts
import { functionLangChainTools } from '@functionFBTC/sdk-agent/langchain';
```

### Direct

```ts
import { getAaveFbtcReserve, prepareAaveSupplyFbtc } from '@functionFBTC/sdk-agent';

const reserve = await getAaveFbtcReserve.execute({});
const prepared = await prepareAaveSupplyFbtc.execute({
  amount: '0.1',
  address: '0x...',
});
```
