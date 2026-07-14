# Changelog

## Unreleased

- **Breaking:** `getAaveFbtcMarketByNetworkId` throws on unsupported `networkId`
  instead of returning `null`. Check `isFbtcNetworkId` before calling, or catch.
- Add Mantle (`mantle-mainnet`) alongside Ethereum; tools take `networkId`.

## 0.1.0

- Focus provider on Function FBTC + Aave V3 actions only
- Rename exports: `FbtcActionProvider`, `fbtcActionProvider`
- Support `ethereum-mainnet` only
