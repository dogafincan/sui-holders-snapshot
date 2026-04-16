import { z } from "zod";

const SUI_ADDRESS_PATTERN = /^(?:0x)?([0-9a-fA-F]{1,64})$/;
const COIN_TYPE_PATTERN =
  /^(0x[0-9a-fA-F]{1,64})::([A-Za-z_][A-Za-z0-9_]*)::([A-Za-z_][A-Za-z0-9_]*)$/;
const DECIMAL_AMOUNT_PATTERN = /^[0-9]+(?:\.[0-9]+)?$/;

export interface SnapshotMeta {
  endpoint: string;
  coinAddress: string;
  decimals: number;
  holderCount: number;
  exclusionCount: number;
  eligibleHolderCount: number;
  airdropEnabled: boolean;
  totalBalance: string;
  totalAirdropAmount?: string;
}

export interface SnapshotRow {
  rank: number;
  address: string;
  balance: string;
  rawBalance: string;
  airdropAmount?: string;
  rawAirdropAmount?: string;
}

export interface SnapshotResult {
  meta: SnapshotMeta;
  rows: SnapshotRow[];
}

export interface BalanceRow {
  address: string;
  rawBalance: bigint;
}

function optionalText(value?: string | null) {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? undefined : trimmed;
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

export function parseExcludedAddressList(value: string) {
  return value
    .split(/[\s,]+/)
    .map((address) => address.trim())
    .filter(Boolean);
}

export function normalizeExcludedAddresses(addresses: readonly string[]) {
  const normalized = new Set<string>();

  for (const address of addresses) {
    const trimmed = address.trim();
    if (!trimmed) {
      continue;
    }

    normalized.add(normalizeSuiAddress(trimmed));
  }

  return Array.from(normalized);
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

const optionalAmountSchema = z
  .string()
  .optional()
  .transform((value) => optionalText(value))
  .superRefine((value, context) => {
    if (!value) {
      return;
    }

    if (!DECIMAL_AMOUNT_PATTERN.test(value)) {
      context.addIssue({
        code: "custom",
        message: "Airdrop amount must be a non-negative decimal number.",
      });
    }
  });

const excludedAddressesSchema = z
  .array(z.string())
  .optional()
  .default([])
  .superRefine((addresses, context) => {
    for (const address of addresses) {
      const trimmed = address.trim();
      if (!trimmed) {
        continue;
      }

      try {
        normalizeSuiAddress(trimmed);
      } catch (error) {
        context.addIssue({
          code: "custom",
          message: toErrorMessage(error),
        });
      }
    }
  })
  .transform((addresses) => normalizeExcludedAddresses(addresses));

export const snapshotInputSchema = z
  .object({
    coinAddress: coinTypeSchema,
    airdropAmount: optionalAmountSchema,
    excludedAddresses: excludedAddressesSchema,
  })
  .superRefine((value, context) => {
    if (value.excludedAddresses.length > 0 && !value.airdropAmount) {
      context.addIssue({
        code: "custom",
        message: "Excluded addresses can only be used when an airdrop amount is provided.",
        path: ["excludedAddresses"],
      });
    }
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

export function parseUnits(amount: string, decimals: number) {
  const normalizedAmount = amount.trim();

  if (!DECIMAL_AMOUNT_PATTERN.test(normalizedAmount)) {
    throw new Error(`Invalid airdrop amount: ${amount}`);
  }

  const [integerPart, fractionPart = ""] = normalizedAmount.split(".");
  if (fractionPart.length > decimals) {
    throw new Error(
      `Airdrop amount has too many decimal places (${fractionPart.length}); max is ${decimals}.`,
    );
  }

  const rawText = integerPart + (decimals > 0 ? fractionPart.padEnd(decimals, "0") : "");

  return BigInt(rawText);
}

export function buildSnapshotCsv(snapshot: SnapshotResult) {
  const header = snapshot.meta.airdropEnabled
    ? "rank,address,balance,airdrop_amount"
    : "rank,address,balance";

  const lines = [header];
  for (const row of snapshot.rows) {
    if (snapshot.meta.airdropEnabled) {
      lines.push(`${row.rank},${row.address},${row.balance},${row.airdropAmount ?? "0"}`);
      continue;
    }

    lines.push(`${row.rank},${row.address},${row.balance}`);
  }

  return `${lines.join("\n")}\n`;
}

export function allocateAirdropShares(
  rows: readonly BalanceRow[],
  totalAirdropRaw: bigint,
  excludedAddresses: ReadonlySet<string>,
) {
  const allocations = new Map<string, bigint>();
  const eligibleRows = rows.filter((row) => !excludedAddresses.has(row.address));
  const eligibleTotalRaw = eligibleRows.reduce((total, row) => total + row.rawBalance, 0n);

  if (eligibleTotalRaw === 0n) {
    throw new Error("No eligible holders remain after exclusions.");
  }

  let allocated = 0n;

  for (const row of rows) {
    if (excludedAddresses.has(row.address)) {
      allocations.set(row.address, 0n);
      continue;
    }

    const share = (totalAirdropRaw * row.rawBalance) / eligibleTotalRaw;
    allocations.set(row.address, share);
    allocated += share;
  }

  const remainder = totalAirdropRaw - allocated;
  if (remainder > 0n && eligibleRows.length > 0) {
    const firstEligibleAddress = eligibleRows[0].address;
    allocations.set(
      firstEligibleAddress,
      (allocations.get(firstEligibleAddress) ?? 0n) + remainder,
    );
  }

  return {
    allocations,
    eligibleHolderCount: eligibleRows.length,
  };
}
