# Changelog

## Unreleased

- `resolveRpcUrl` no longer falls back across chains when `chainId` is unknown;
  returns `undefined` instead (Ethereum and Mantle URLs never cross-fallback).
- Add Mantle (chainId 5000) alongside Ethereum for Aave V3 FBTC tools.

## 0.1.0

- Focus package on Function FBTC + Aave V3 tools only
- Exports: `functionTools`, `functionLangChainTools`, `FUNCTION_SYSTEM_PROMPT`
