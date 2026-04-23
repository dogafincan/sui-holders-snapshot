import { describe, expect, it } from "vite-plus/test";

import {
  buildSnapshotCsv,
  formatUnits,
  normalizeCoinType,
  snapshotInputSchema,
  type SnapshotResult,
} from "@/lib/sui-snapshot";

const ADDRESS_A = `0x${"1".padStart(64, "0")}`;

describe("sui snapshot helpers", () => {
  it("normalizes coin types", () => {
    expect(normalizeCoinType("0x2::sui::SUI")).toBe(`0x${"2".padStart(64, "0")}::sui::SUI`);
  });

  it("formats decimal unit strings", () => {
    expect(formatUnits(12_345n, 2)).toBe("123.45");
    expect(formatUnits(5n, 0)).toBe("5");
  });

  it("validates the holder snapshot input", () => {
    expect(
      snapshotInputSchema.parse({
        coinAddress: "0x2::sui::SUI",
      }),
    ).toEqual({
      coinAddress: `0x${"2".padStart(64, "0")}::sui::SUI`,
    });
  });

  it("builds the canonical holder csv output", () => {
    const snapshot: SnapshotResult = {
      meta: {
        endpoint: "https://graphql.mainnet.sui.io/graphql",
        coinAddress: normalizeCoinType("0x2::sui::SUI"),
        decimals: 2,
        holderCount: 1,
        totalBalance: "5",
      },
      rows: [
        {
          rank: 1,
          address: ADDRESS_A,
          balance: "5",
          rawBalance: "500",
        },
      ],
    };

    expect(buildSnapshotCsv(snapshot)).toBe(`rank,address,balance\n1,${ADDRESS_A},5\n`);
  });
});
