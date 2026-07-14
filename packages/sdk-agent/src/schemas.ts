/**
 * Zod schema definitions for Function FBTC agent tools.
 * These are the single source of truth; JSON Schema versions are derived automatically.
 */
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

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

export const CHAIN_ID_DESCRIPTION =
  "Chain ID. Default to the user's connected chain (provided in your wallet context) unless they specify a different one. Supported: 1=Ethereum, 5000=Mantle.";

export const chainId = z.number().describe(CHAIN_ID_DESCRIPTION);

export const aaveChainId = z
  .number()
  .optional()
  .default(1)
  .describe(
    'Aave market chain ID. Supported: 1=Ethereum, 5000=Mantle. Defaults to 1 (Ethereum).',
  );

// ─── Zod Schemas ─────────────────────────────────────────────────────

export const TokenBalanceZod = z.object({
  tokenAddress: evmAddress.describe('ERC-20 token contract address'),
  address: evmAddress.describe('Wallet address to check balance for'),
  chainId: chainId,
});

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

export const AaveFbtcReserveZod = z.object({
  chainId: aaveChainId,
});

export const AaveSupplyFbtcZod = z.object({
  amount: amount.describe("Amount of FBTC to supply to Aave V3 (e.g. '0.1')"),
  address: evmAddress.describe(
    'EVM wallet address supplying and receiving the Aave aToken position',
  ),
  chainId: aaveChainId,
});

// ─── Derived JSON Schemas ────────────────────────────────────────────

interface JsonObjectSchema {
  type: string;
  properties: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

function toJsonSchema(zodSchema: z.ZodType): JsonObjectSchema {
  return zodToJsonSchema(zodSchema, { target: 'openAi' }) as JsonObjectSchema;
}

export const TokenBalanceSchema = toJsonSchema(TokenBalanceZod);
export const TokenInfoSchema = toJsonSchema(TokenInfoZod);
export const AaveFbtcReserveSchema = toJsonSchema(AaveFbtcReserveZod);
export const AaveSupplyFbtcSchema = toJsonSchema(AaveSupplyFbtcZod);
