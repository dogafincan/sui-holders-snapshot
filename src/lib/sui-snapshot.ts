import { z } from "zod";

const SUI_ADDRESS_PATTERN = /^(?:0x)?([0-9a-fA-F]{1,64})$/;
const COIN_TYPE_PATTERN =
  /^(0x[0-9a-fA-F]{1,64})::([A-Za-z_][A-Za-z0-9_]*)::([A-Za-z_][A-Za-z0-9_]*)$/;

export interface SnapshotMeta {
  endpoint: string;
  coinAddress: string;
  decimals: number;
  holderCount: number;
  totalBalance: string;
}

export interface SnapshotRow {
  rank: number;
  address: string;
  balance: string;
  rawBalance: string;
}

export interface SnapshotResult {
  meta: SnapshotMeta;
  rows: SnapshotRow[];
}

export interface BalanceRow {
  address: string;
  rawBalance: bigint;
}

export function toErrorMessage(error: unknown) {
  if (error instanceof z.ZodError) {
    const issue = error.issues[0];
    return issue?.message ?? "The provided input is invalid.";
  }

  return error instanceof Error ? error.message : "An unexpected error occurred.";
}

export function normalizeSuiAddress(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(SUI_ADDRESS_PATTERN);

  if (!match) {
    throw new Error(`Invalid Sui address: ${value}`);
  }

  return `0x${match[1].toLowerCase().padStart(64, "0")}`;
}

export function normalizeCoinType(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(COIN_TYPE_PATTERN);

  if (!match) {
    throw new Error("Coin address must use the format 0xPACKAGE::MODULE::TOKEN.");
  }

  const [, packageAddress, moduleName, tokenName] = match;
  return `${normalizeSuiAddress(packageAddress)}::${moduleName}::${tokenName}`;
}

const coinTypeSchema = z
  .string()
  .trim()
  .min(1, "Coin address is required.")
  .superRefine((value, context) => {
    try {
      normalizeCoinType(value);
    } catch (error) {
      context.addIssue({
        code: "custom",
        message: toErrorMessage(error),
      });
    }
  })
  .transform((value) => normalizeCoinType(value));

export const snapshotInputSchema = z.object({
  coinAddress: coinTypeSchema,
});

export type SnapshotInput = z.infer<typeof snapshotInputSchema>;

export function formatUnits(raw: bigint, decimals: number) {
  if (decimals <= 0) {
    return raw.toString();
  }

  const text = raw.toString().padStart(decimals + 1, "0");
  const integerPart = text.slice(0, -decimals);
  const fractionalPart = text.slice(-decimals).replace(/0+$/, "");

  return fractionalPart ? `${integerPart}.${fractionalPart}` : integerPart;
}

export function buildSnapshotCsv(snapshot: SnapshotResult) {
  const lines = ["rank,address,balance"];

  for (const row of snapshot.rows) {
    lines.push(`${row.rank},${row.address},${row.balance}`);
  }

  return `${lines.join("\n")}\n`;
}
