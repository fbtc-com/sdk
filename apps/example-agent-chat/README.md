# Function FBTC Aave V3 Agent Chat

Example chat application for supplying Function FBTC to the Aave V3 Ethereum
Core market with wallet confirmation.

## Flow

1. Connect an Ethereum wallet.
2. Ask the assistant to supply an amount of FBTC to Aave V3.
3. Review and sign the exact-amount FBTC approval.
4. After approval confirms, review and sign the Aave `Pool.supply` call.

The target reserve is:

- FBTC: `0xc96de26018a54d51c097160568752c4e3bd6c364`
- Aave V3 Ethereum Pool: `0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2`
- Network: Ethereum Mainnet (`chainId: 1`)
- [Official Aave reserve page](https://app.aave.com/reserve-overview/?underlyingAsset=0xc96de26018a54d51c097160568752c4e3bd6c364&marketName=proto_mainnet_v3)

## Run locally

From the SDK repository root:

```bash
yarn workspace @functionFBTC/example-agent-chat dev
```

Configure the model provider and wallet connection values using the existing
environment variables before starting the app.

Example prompt:

```text
Supply 0.1 FBTC to Aave V3.
```

The assistant prepares calldata only. The connected wallet signs and submits
both transactions.
