# Changelog

## 0.2.0

- Add `get_afbtc_balance` to read Aave aFBTC (aToken) balances on Ethereum and Mantle
- Add `get_aave_user_account` to read health factor, LTV, and liquidation threshold
- Add `withdraw_fbtc_from_aave` to withdraw FBTC from Aave V3 (supports `max`)
- Add `borrow_stablecoin_from_aave` for USDC / USDT / USDe (variable rate; rejects borrows above 55% utilization)
- Add `repay_stablecoin_to_aave` for approve + Pool.repay (supports `max` via debt token balance)
- `supply_fbtc_to_aave` on Mantle now sets eMode category 3 and enables FBTC as collateral on demand after Pool.supply
- Write actions enforce that the wallet is already on the target networkId
- Accept per-network RPC URLs via `FbtcActionProviderOptions.rpcUrls`

## 0.1.0

- Focus package on Function FBTC + Aave V3 tools only, support Ethereum and Mantle
- Exports: `functionTools`, `functionLangChainTools`, `FUNCTION_SYSTEM_PROMPT`
