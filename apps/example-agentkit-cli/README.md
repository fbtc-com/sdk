# Function FBTC AgentKit CLI

Interactive and autonomous CLI agents using `@functionFBTC/sdk-agentkit` with LangChain.

Supports **Aave V3 Ethereum** (`ethereum-mainnet`) and **Aave V3 Mantle**
(`mantle-mainnet`). Always name the network in prompts — do not say only “Aave V3”.

## Setup

```bash
cp .env.example .env
# fill WALLET_PRIVATE_KEY, ETH_RPC_URL, MANTLE_RPC_URL, and model API keys
```

Configure **both** network RPCs at startup. Tools pick `networkId` from the user
instruction (`ethereum-mainnet` or `mantle-mainnet`). If the user does not name a
network, the default is `ethereum-mainnet` (Aave V3 Ethereum).

`NETWORK_ID` is only the wallet network used for signing / `supply_fbtc_to_aave`.

## Run

```bash
# Interactive chatbot
yarn workspace @functionFBTC/example-agentkit-cli start

# Autonomous read-only validation
yarn workspace @functionFBTC/example-agentkit-cli start:auto
```
