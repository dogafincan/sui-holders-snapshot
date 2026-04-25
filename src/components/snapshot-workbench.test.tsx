// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { SnapshotWorkbench } from "@/components/snapshot-workbench";
import { normalizeCoinType, type SnapshotPageBatchResult } from "@/lib/sui-snapshot";

const ADDRESS_A = `0x${"a".repeat(64)}`;

function snapshotBatch(overrides?: Partial<SnapshotPageBatchResult>): SnapshotPageBatchResult {
  return {
    meta: {
      endpoint: "https://graphql.mainnet.sui.io/graphql",
      coinAddress: normalizeCoinType("0x2::sui::SUI"),
    },
    balances: [{ address: ADDRESS_A, balance: "5" }],
    cursor: null,
    nextCursor: null,
    decimals: 0,
    pagesFetched: 1,
    objectsFetched: 1,
    ...overrides,
  };
}

describe("SnapshotWorkbench", () => {
  afterEach(() => {
    cleanup();
  });

  it("clears validation errors when the coin input changes", async () => {
    const runSnapshotBatch = vi.fn();
    render(<SnapshotWorkbench runSnapshotBatch={runSnapshotBatch} />);

    fireEvent.change(screen.getByLabelText("Coin address"), {
      target: { value: "not-a-coin" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate snapshot" }));

    expect(await screen.findByText("Validation error")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Coin address"), {
      target: { value: "0x2::sui::SUI" },
    });

    await waitFor(() => {
      expect(screen.queryByText("Validation error")).toBeNull();
    });
  });

  it("marks existing results stale when the coin input changes after a snapshot", async () => {
    const runSnapshotBatch = vi.fn().mockResolvedValue(snapshotBatch());
    render(<SnapshotWorkbench runSnapshotBatch={runSnapshotBatch} />);

    fireEvent.click(screen.getByRole("button", { name: "Generate snapshot" }));

    expect(await screen.findByText("Snapshot results")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Coin address"), {
      target: { value: "0x3::foo::BAR" },
    });

    expect(await screen.findByText("Input changed")).toBeTruthy();
    expect(screen.getByText("Generate a new snapshot to refresh these results.")).toBeTruthy();
  });

  it("can pause a multi-batch snapshot and offer to resume", async () => {
    const runSnapshotBatch = vi.fn().mockResolvedValueOnce(
      snapshotBatch({
        nextCursor: "cursor-1",
      }),
    );
    render(<SnapshotWorkbench runSnapshotBatch={runSnapshotBatch} />);

    fireEvent.click(screen.getByRole("button", { name: "Generate snapshot" }));

    expect(await screen.findByText("1 coin object scanned")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cancel snapshot" }));

    expect(await screen.findByText("Snapshot paused")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Resume snapshot" }).hasAttribute("disabled")).toBe(
      false,
    );
  });
});
