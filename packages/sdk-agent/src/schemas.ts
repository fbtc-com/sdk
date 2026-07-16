/**
 * Zod schema definitions for Function FBTC agent tools.
 * These are the single source of truth; JSON Schema versions are derived automatically.
 */
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// ─── LLM arg normalization ───────────────────────────────────────────
// Models often pass amount as a number, asset in mixed case, or chainId as a
// string. Normalize before strict validation so prepare_* tools still succeed.

function coerceAmountArg(val: unknown): unknown {
  if (typeof val === 'number' && Number.isFinite(val)) return String(val);
  if (typeof val === 'bigint') return val.toString();
  return val;
}

function coerceChainIdArg(val: unknown): unknown {
  if (typeof val === 'string' && val.trim() !== '') {
    const n = Number(val);
    return Number.isFinite(n) ? n : val;
  }
  return val;
}

/** Map common LLM spellings onto canonical Aave stablecoin symbols. */
export function normalizeStablecoinAsset(val: unknown): unknown {
  if (typeof val !== 'string') return val;
  const upper = val.trim().toUpperCase();
  if (upper === 'USDC') return 'USDC';
  if (upper === 'USDT' || upper === 'USDT0') return 'USDT';
  if (upper === 'USDE') return 'USDe';
  return val.trim();
}

function normalizeToolObject(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const next: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  if ('amount' in next) next.amount = coerceAmountArg(next.amount);
  if ('asset' in next) next.asset = normalizeStablecoinAsset(next.asset);
  if ('chainId' in next) next.chainId = coerceChainIdArg(next.chainId);
  return next;
}

// ─── Shared field schemas ────────────────────────────────────────────

export const evmAddress = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid EVM address');

export const amount = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'Must be a numeric string')
  .refine(
    (v) => parseFloat(v) > 0 && parseFloat(v) < 1000,
    'Amount must be positive and under 1000',
  );

/** FBTC amount, or 'max' for full withdraw. */
export const fbtcAmountOrMax = z
  .string()
  .refine(
    (v) => v.toLowerCase() === 'max' || /^\d+(\.\d+)?$/.test(v),
    "Must be a numeric string or 'max'",
  )
  .refine((v) => {
    if (v.toLowerCase() === 'max') return true;
    const n = parseFloat(v);
    return n > 0 && n < 1000;
  }, 'Amount must be positive and under 1000 (or max)');

export const stablecoinAmount = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'Must be a numeric string')
  .refine(
    (v) => parseFloat(v) > 0 && parseFloat(v) < 10_000_000,
    'Amount must be positive and under 10000000',
  );

/** Stablecoin amount, or 'max' for full repay. */
export const stablecoinAmountOrMax = z
  .string()
  .refine(
    (v) => v.toLowerCase() === 'max' || /^\d+(\.\d+)?$/.test(v),
    "Must be a numeric string or 'max'",
  )
  .refine((v) => {
    if (v.toLowerCase() === 'max') return true;
    const n = parseFloat(v);
    return n > 0 && n < 10_000_000;
  }, 'Amount must be positive and under 10000000 (or max)');

export const AAVE_STABLECOIN_SYMBOLS = ['USDC', 'USDT', 'USDe'] as const;
export type AaveStablecoinSymbol = (typeof AAVE_STABLECOIN_SYMBOLS)[number];

export const aaveStablecoinSymbol = z
  .enum(AAVE_STABLECOIN_SYMBOLS)
  .describe(
    'Stablecoin to borrow or repay. Supported: USDC, USDT, USDe. On Mantle, USDT maps to USDT0.',
  );

export const CHAIN_ID_DESCRIPTION =
  "Chain ID. REQUIRED: pass the user's connected chain or the network they named. Supported: 1=Ethereum, 5000=Mantle. Do not omit.";

export const chainId = z.number().describe(CHAIN_ID_DESCRIPTION);

/** Required Aave market chain ID — never default; FBTC addresses match across chains. */
export const aaveChainId = z
  .union([z.literal(1), z.literal(5000)])
  .describe(
    'Aave market chain ID. REQUIRED: 1=Ethereum, 5000=Mantle. Do not omit — FBTC addresses are identical on both chains.',
  );

// ─── Zod Schemas ─────────────────────────────────────────────────────

export const TokenBalanceZod = z.preprocess(
  normalizeToolObject,
  z.object({
    tokenAddress: evmAddress.describe('ERC-20 token contract address'),
    address: evmAddress.describe('Wallet address to check balance for'),
    chainId: chainId,
  }),
);

export const TokenInfoZod = z
  .object({
    query: z
      .string()
      .optional()
      .describe('Token symbol or name (e.g. FBTC, Function BTC)'),
    address: evmAddress.optional().describe('Token contract address'),
    chainId: z.number().optional().describe('Chain ID when looking up by address'),
  })
  .refine(
    (v) => Boolean(v.query) || (Boolean(v.address) && typeof v.chainId === 'number'),
    'Provide query, or address + chainId',
  );

export const AaveFbtcReserveZod = z.preprocess(
  normalizeToolObject,
  z.object({
    chainId: aaveChainId,
  }),
);

export const AaveAtokenBalanceZod = z.preprocess(
  normalizeToolObject,
  z.object({
    address: evmAddress.describe('Wallet address to check aFBTC balance for'),
    chainId: aaveChainId,
  }),
);

export const AaveUserAccountZod = z.preprocess(
  normalizeToolObject,
  z.object({
    address: evmAddress.describe(
      'Wallet address to read Aave health factor / LTV / liquidation threshold for',
    ),
    chainId: aaveChainId,
  }),
);

export const AaveSupplyFbtcZod = z.preprocess(
  normalizeToolObject,
  z.object({
    amount: amount.describe("Amount of FBTC to supply to Aave V3 (e.g. '0.1')"),
    address: evmAddress.describe(
      'EVM wallet address supplying and receiving the Aave aToken position',
    ),
    chainId: aaveChainId,
  }),
);

export const AaveWithdrawFbtcZod = z.preprocess(
  normalizeToolObject,
  z.object({
    amount: fbtcAmountOrMax.describe(
      "Amount of FBTC to withdraw (e.g. '0.1'), or 'max' for the full aFBTC balance. " +
        'Warning: withdraw max while debt remains may revert if collateral would become insufficient.',
    ),
    address: evmAddress.describe(
      'EVM wallet address receiving the withdrawn FBTC',
    ),
    chainId: aaveChainId,
  }),
);

export const AaveBorrowStablecoinZod = z.preprocess(
  normalizeToolObject,
  z.object({
    asset: aaveStablecoinSymbol,
    amount: stablecoinAmount.describe(
      "Amount of stablecoin to borrow (e.g. '100')",
    ),
    address: evmAddress.describe(
      'EVM wallet address receiving the borrowed stablecoin (and owning the debt)',
    ),
    chainId: aaveChainId,
  }),
);

export const AaveRepayStablecoinZod = z.preprocess(
  normalizeToolObject,
  z.object({
    asset: aaveStablecoinSymbol,
    amount: stablecoinAmountOrMax.describe(
      "Amount of stablecoin to repay (e.g. '100'), or 'max' for the full variable debt " +
        '(exact debt + 1% approve buffer; rejected if debt is zero).',
    ),
    address: evmAddress.describe(
      'EVM wallet address whose debt is being repaid',
    ),
    chainId: aaveChainId,
  }),
);

export type AaveSupplyFbtcParams = z.output<typeof AaveSupplyFbtcZod>;
export type AaveWithdrawFbtcParams = z.output<typeof AaveWithdrawFbtcZod>;
export type AaveBorrowStablecoinParams = z.output<typeof AaveBorrowStablecoinZod>;
export type AaveRepayStablecoinParams = z.output<typeof AaveRepayStablecoinZod>;
export type AaveFbtcReserveParams = z.output<typeof AaveFbtcReserveZod>;
export type AaveAtokenBalanceParams = z.output<typeof AaveAtokenBalanceZod>;
export type AaveUserAccountParams = z.output<typeof AaveUserAccountZod>;
export type TokenBalanceParams = z.output<typeof TokenBalanceZod>;

// ─── Derived JSON Schemas ────────────────────────────────────────────

interface JsonObjectSchema {
  type: string;
  properties: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

function toJsonSchema(zodSchema: z.ZodType): JsonObjectSchema {
  // Prefer the inner object schema when present so OpenAI JSON Schema stays clean.
  const inner =
    zodSchema instanceof z.ZodEffects ? zodSchema._def.schema : zodSchema;
  return zodToJsonSchema(inner, { target: 'openAi' }) as JsonObjectSchema;
}

export const TokenBalanceSchema = toJsonSchema(TokenBalanceZod);
export const TokenInfoSchema = toJsonSchema(TokenInfoZod);
export const AaveFbtcReserveSchema = toJsonSchema(AaveFbtcReserveZod);
export const AaveAtokenBalanceSchema = toJsonSchema(AaveAtokenBalanceZod);
export const AaveUserAccountSchema = toJsonSchema(AaveUserAccountZod);
export const AaveSupplyFbtcSchema = toJsonSchema(AaveSupplyFbtcZod);
export const AaveWithdrawFbtcSchema = toJsonSchema(AaveWithdrawFbtcZod);
export const AaveBorrowStablecoinSchema = toJsonSchema(AaveBorrowStablecoinZod);
export const AaveRepayStablecoinSchema = toJsonSchema(AaveRepayStablecoinZod);
