# Function FBTC Aave V3 Agent Chat

Example chat application for supplying Function FBTC to Aave V3 Ethereum
and Aave V3 Mantle with wallet confirmation.

## Flow

1. Connect a wallet on Ethereum or Mantle.
2. Ask the assistant to supply / withdraw / borrow / repay on Aave V3.
3. When prepare succeeds, an **Execute Transaction** card appears under the reply.
4. Click **Execute Transaction** — the wallet opens to sign (it does not open automatically).
5. For supply/repay: sign approve, wait for confirmation, then sign the Pool call.

Supported markets:

- FBTC (both chains): `0xc96de26018a54d51c097160568752c4e3bd6c364`
- Aave V3 Ethereum Pool: `0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2` (`chainId: 1`)
- Aave V3 Mantle Pool: `0x458F293454fE0d67EC0655f3672301301DD51422` (`chainId: 5000`)
- [Aave Ethereum reserve](https://app.aave.com/reserve-overview/?underlyingAsset=0xc96de26018a54d51c097160568752c4e3bd6c364&marketName=proto_mainnet_v3)
- [Aave Mantle reserve](https://app.aave.com/reserve-overview/?underlyingAsset=0xc96de26018a54d51c097160568752c4e3bd6c364&marketName=proto_mantle_v3)

## Run locally

From the SDK repository root:

```bash
yarn workspace @functionfbtc/example-agent-chat dev
```

Configure the model provider and wallet connection values using the existing
environment variables before starting the app. See `.env.example`:

- `ETH_RPC_URL` / `MANTLE_RPC_URL` — server-only (agent tool reads; may use keyed RPCs)
- `VITE_PUBLIC_ETH_RPC_URL` / `VITE_PUBLIC_MANTLE_RPC_URL` — browser-only public RPCs

Example prompts:

```text
Supply 0.1 FBTC to Aave V3 Ethereum.
Supply 0.1 FBTC to Aave V3 Mantle.
Borrow 0.1 USDT from Aave V3 Mantle.
```

The assistant prepares calldata only. Click **Execute Transaction** in the chat
card so the connected wallet can sign and submit.
