# Changelog

## 0.2.1

- Example apps: align landing page, chat suggestions, and CLI prompts with the borrow stablecoins / withdraw / repay capabilities added in 0.2.0
- `example-agentkit-cli` autonomous mode adds a read-only Aave V3 account health factor check

## 0.2.0

- Add `get_aave_atoken_balance` to read aFBTC (aToken) balances on Ethereum and Mantle
- Add `get_aave_user_account` to read health factor, LTV, and liquidation threshold
- Add `prepare_aave_withdraw_fbtc` to prepare Pool.withdraw calldata (supports `max`)
- Add `prepare_aave_borrow_stablecoin` for USDC / USDT / USDe (variable rate; rejects borrows above 55% utilization)
- Add `prepare_aave_repay_stablecoin` for approve + Pool.repay (supports `max` via debt token balance)
- All Aave write tools carry an RPC chain-id check and reject mismatched endpoints
- Exports: `functionTools`, `functionLangChainTools`, `FUNCTION_SYSTEM_PROMPT`

## 0.1.0

- Focus package on Function FBTC + Aave V3 tools only, support Ethereum and Mantle
- Exports: `functionTools`, `functionLangChainTools`, `FUNCTION_SYSTEM_PROMPT`
