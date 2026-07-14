import { z } from "zod";

import { DEFAULT_NETWORK_ID, SUPPORTED_NETWORK_IDS } from "./networks";

const networkIdField = z
  .enum(["ethereum-mainnet", "mantle-mainnet"])
  .optional()
  .default(DEFAULT_NETWORK_ID)
  .describe(
    `Network ID for the FBTC / Aave operation. Supported: ${SUPPORTED_NETWORK_IDS.join(", ")}. ` +
      `Choose from the user's instruction (e.g. Mantle → mantle-mainnet). ` +
      `If the user does not name a network, use ${DEFAULT_NETWORK_ID}.`,
  );

export const GetFbtcBalanceSchema = z.object({
  address: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid EVM address")
    .optional()
    .describe(
      "EVM address to check FBTC balance for. If omitted, uses the connected wallet address.",
    ),
  networkId: networkIdField,
});

export const GetAaveFbtcReserveSchema = z.object({
  networkId: networkIdField,
});

export const SupplyFbtcToAaveSchema = z.object({
  amount: z
    .string()
    .describe("Amount of FBTC to supply to Aave V3 (e.g. '0.1')")
    .refine((v) => /^\d+(\.\d+)?$/.test(v), "Amount must be a numeric string")
    .refine((v) => parseFloat(v) > 0, "Amount must be positive")
    .refine((v) => parseFloat(v) < 1000, "Amount must be under 1000 BTC"),
  networkId: networkIdField,
});
