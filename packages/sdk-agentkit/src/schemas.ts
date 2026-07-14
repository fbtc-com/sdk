import { z } from "zod";

export const GetFbtcBalanceSchema = z.object({
  address: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid EVM address")
    .optional()
    .describe(
      "EVM address to check FBTC balance for. If omitted, uses the connected wallet address.",
    ),
  chainId: z
    .number()
    .optional()
    .describe(
      "Chain ID to read FBTC on. Supported: 1=Ethereum, 5000=Mantle. Defaults to the wallet network when supported, otherwise Ethereum (1).",
    ),
});

export const GetAaveFbtcReserveSchema = z.object({
  chainId: z
    .number()
    .optional()
    .default(1)
    .describe(
      "Aave market chain ID. Supported: 1=Ethereum Core, 5000=Mantle. Defaults to 1 (Ethereum).",
    ),
});

export const SupplyFbtcToAaveSchema = z.object({
  amount: z
    .string()
    .describe("Amount of FBTC to supply to Aave V3 (e.g. '0.1')")
    .refine((v) => /^\d+(\.\d+)?$/.test(v), "Amount must be a numeric string")
    .refine((v) => parseFloat(v) > 0, "Amount must be positive")
    .refine((v) => parseFloat(v) < 1000, "Amount must be under 1000 BTC"),
});
