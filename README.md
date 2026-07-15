# Function FBTC Agent SDK

TypeScript SDK and examples for integrating Function FBTC with AI agents — including Aave V3 supply on Ethereum.

## Packages

| Package | Description |
| --- | --- |
| [@functionfbtc/sdk-agent](./packages/sdk-agent) | Framework-agnostic agent tools (Vercel AI SDK / LangChain) |
| [@functionfbtc/sdk-agentkit](./packages/sdk-agentkit) | Coinbase AgentKit action provider |

## Apps

| App | Description |
| --- | --- |
| [example-agent-chat](./apps/example-agent-chat) | Web chat UI with prepared Aave FBTC supply transactions |
| [example-agentkit-cli](./apps/example-agentkit-cli) | CLI chatbot / autonomous agent via AgentKit + LangChain |

## Quick Start

```bash
yarn install
yarn build
```

### Agent chat (web)

```bash
yarn workspace @functionfbtc/example-agent-chat dev
```

### AgentKit CLI

```bash
yarn workspace @functionfbtc/example-agentkit-cli start
```

## Capabilities

- Look up Function FBTC token metadata and ERC-20 balances
- Inspect the Aave V3 Ethereum FBTC reserve
- Prepare / execute FBTC supply to Aave V3 (`approve` + `Pool.supply`)

## Commands

```bash
yarn build                    # Build all packages
yarn lint                     # Lint all packages
yarn test                     # Test all packages
yarn test:required            # CI gate tests
yarn format                   # Prettier format all
```

## License

MIT
