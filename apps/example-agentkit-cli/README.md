# Function FBTC AgentKit CLI

Interactive and autonomous CLI agents using `@functionFBTC/sdk-agentkit` with LangChain.

## Setup

```bash
cp .env.example .env
# fill WALLET_PRIVATE_KEY and model API keys
```

## Run

```bash
# Interactive chatbot
yarn workspace @functionFBTC/example-agentkit-cli start

# Autonomous read-only validation
yarn workspace @functionFBTC/example-agentkit-cli start:auto
```

`NETWORK_ID` must be `ethereum-mainnet` for `supply_fbtc_to_aave`.
