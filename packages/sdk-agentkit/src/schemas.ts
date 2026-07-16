import { z } from "zod";

import { AAVE_STABLECOIN_SYMBOLS } from "./aave";
import { SUPPORTED_NETWORK_IDS } from "./networks";

const networkIdField = z
  .enum(["ethereum-mainnet", "mantle-mainnet"])
  .describe(
    `Network ID for the FBTC / Aave operation. REQUIRED. Supported: ${SUPPORTED_NETWORK_IDS.join(", ")}. ` +
      `Choose from the user's instruction (e.g. Mantle → mantle-mainnet). ` +
      `Do not omit — FBTC addresses are identical on both networks.`,
  );

const stablecoinAssetField = z
  .string()
  .transform((v) => {
    const upper = v.trim().toUpperCase();
    if (upper === "USDC") return "USDC";
    if (upper === "USDT" || upper === "USDT0") return "USDT";
    if (upper === "USDE") return "USDe";
    return v.trim();
  })
  .pipe(z.enum(AAVE_STABLECOIN_SYMBOLS))
  .describe(
    "Stablecoin symbol. Supported: USDC, USDT, USDe. On Mantle, USDT maps to USDT0.",
  );

function coerceAmount(val: unknown): unknown {
  if (typeof val === "number" && Number.isFinite(val)) return String(val);
  if (typeof val === "bigint") return val.toString();
  return val;
}

const fbtcAmountField = z.preprocess(
  coerceAmount,
  z
    .string()
    .describe("Amount of FBTC (e.g. '0.1')")
    .refine((v) => /^\d+(\.\d+)?$/.test(v), "Amount must be a numeric string")
    .refine((v) => parseFloat(v) > 0, "Amount must be positive")
    .refine((v) => parseFloat(v) < 1000, "Amount must be under 1000 BTC"),
);

const fbtcAmountOrMaxField = z.preprocess(
  coerceAmount,
  z
    .string()
    .describe(
      "Amount of FBTC (e.g. '0.1'), or 'max' for the full aFBTC balance. " +
        "Warning: withdraw max while debt remains may revert if collateral would become insufficient.",
    )
    .refine(
      (v) => v.toLowerCase() === "max" || /^\d+(\.\d+)?$/.test(v),
      "Amount must be a numeric string or 'max'",
    )
    .refine((v) => {
      if (v.toLowerCase() === "max") return true;
      const n = parseFloat(v);
      return n > 0 && n < 1000;
    }, "Amount must be positive and under 1000 (or max)"),
);

const stablecoinAmountField = z.preprocess(
  coerceAmount,
  z
    .string()
    .describe("Amount of stablecoin (e.g. '100')")
    .refine((v) => /^\d+(\.\d+)?$/.test(v), "Amount must be a numeric string")
    .refine((v) => parseFloat(v) > 0, "Amount must be positive")
    .refine(
      (v) => parseFloat(v) < 10_000_000,
      "Amount must be under 10000000",
    ),
);

const stablecoinAmountOrMaxField = z.preprocess(
  coerceAmount,
  z
    .string()
    .describe(
      "Amount of stablecoin (e.g. '100'), or 'max' to repay the full variable debt " +
        "(exact debt + 1% approve buffer; rejected if debt is zero).",
    )
    .refine(
      (v) => v.toLowerCase() === "max" || /^\d+(\.\d+)?$/.test(v),
      "Amount must be a numeric string or 'max'",
    )
    .refine((v) => {
      if (v.toLowerCase() === "max") return true;
      const n = parseFloat(v);
      return n > 0 && n < 10_000_000;
    }, "Amount must be positive and under 10000000 (or max)"),
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

export const GetAfbtcBalanceSchema = z.object({
  address: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid EVM address")
    .optional()
    .describe(
      "EVM address to check aFBTC balance for. If omitted, uses the connected wallet address.",
    ),
  networkId: networkIdField,
});

export const GetAaveFbtcReserveSchema = z.object({
  networkId: networkIdField,
});

export const GetAaveUserAccountSchema = z.object({
  address: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid EVM address")
    .optional()
    .describe(
      "EVM address to read Aave account data for. If omitted, uses the connected wallet address.",
    ),
  networkId: networkIdField,
});

export const SupplyFbtcToAaveSchema = z.object({
  amount: fbtcAmountField.describe(
    "Amount of FBTC to supply to Aave V3 (e.g. '0.1')",
  ),
  networkId: networkIdField,
});

export const WithdrawFbtcFromAaveSchema = z.object({
  amount: fbtcAmountOrMaxField,
  networkId: networkIdField,
});

export const BorrowStablecoinFromAaveSchema = z.object({
  asset: stablecoinAssetField,
  amount: stablecoinAmountField,
  networkId: networkIdField,
});

export const RepayStablecoinToAaveSchema = z.object({
  asset: stablecoinAssetField,
  amount: stablecoinAmountOrMaxField,
  networkId: networkIdField,
});
