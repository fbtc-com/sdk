import { z } from "zod";

export const GetFbtcBalanceSchema = z.object({
  address: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid EVM address")
    .optional()
    .describe(
      "EVM address to check FBTC balance for on Ethereum mainnet. If omitted, uses the connected wallet address.",
    ),
});

export const GetAaveFbtcReserveSchema = z.object({});

export const SupplyFbtcToAaveSchema = z.object({
  amount: z
    .string()
    .describe("Amount of FBTC to supply to Aave V3 (e.g. '0.1')")
    .refine((v) => /^\d+(\.\d+)?$/.test(v), "Amount must be a numeric string")
    .refine((v) => parseFloat(v) > 0, "Amount must be positive")
    .refine((v) => parseFloat(v) < 1000, "Amount must be under 1000 BTC"),
});
