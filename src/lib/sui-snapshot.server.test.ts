import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { fetchSuiHolderSnapshotBatch } from "@/lib/sui-snapshot.server";
import { normalizeCoinType } from "@/lib/sui-snapshot";

const ADDRESS_A = `0x${"a".repeat(64)}`;
const ADDRESS_B = `0x${"b".repeat(64)}`;
const ADDRESS_C = `0x${"c".repeat(64)}`;
const ORIGINAL_API_KEY = process.env.BLOCKBERRY_API_KEY;
const HAD_ORIGINAL_API_KEY = Object.prototype.hasOwnProperty.call(
  process.env,
  "BLOCKBERRY_API_KEY",
);

function jsonResponse(payload: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json",
    },
    status: 200,
    ...init,
  });
}

function stubApiKey() {
  process.env.BLOCKBERRY_API_KEY = "test-api-key";
}

function restoreApiKey() {
  if (!HAD_ORIGINAL_API_KEY) {
    Reflect.deleteProperty(process.env, "BLOCKBERRY_API_KEY");
    return;
  }

  process.env.BLOCKBERRY_API_KEY = ORIGINAL_API_KEY;
}

describe("fetchSuiHolderSnapshotBatch", () => {
  const fetchMock = vi.fn<typeof fetch>();

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    restoreApiKey();
  });

  it("fetches Blockberry holder pages into balance rows", async () => {
    stubApiKey();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          content: [
            {
              holderAddress: ADDRESS_A,
              amount: 2.5,
            },
            {
              holderAddress: ADDRESS_B,
              amount: 1.25,
            },
          ],
          last: false,
          numberOfElements: 2,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          content: [
            {
              holderAddress: ADDRESS_A,
              amount: 0.75,
            },
            {
              holderAddress: ADDRESS_C,
              amount: 0.5,
            },
          ],
          last: true,
          numberOfElements: 2,
        }),
      );

    vi.stubGlobal("fetch", fetchMock);

    const batch = await fetchSuiHolderSnapshotBatch({
      coinAddress: normalizeCoinType("0x2::sui::SUI"),
      startPage: 0,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(batch).toEqual({
      meta: {
        endpoint: "https://api.blockberry.one/sui/v1/coins",
        coinAddress: normalizeCoinType("0x2::sui::SUI"),
      },
      balances: [
        {
          address: ADDRESS_A,
          balance: "3.25",
        },
        {
          address: ADDRESS_B,
          balance: "1.25",
        },
        {
          address: ADDRESS_C,
          balance: "0.5",
        },
      ],
      startPage: 0,
      nextPage: null,
      pagesFetched: 2,
      holdersFetched: 4,
    });
  });

  it("stops each batch below the Worker free subrequest limit", async () => {
    stubApiKey();

    for (let page = 0; page < 20; page += 1) {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          content: [
            {
              holderAddress: ADDRESS_A,
              amount: page + 1,
            },
          ],
          last: false,
          numberOfElements: 1,
        }),
      );
    }

    vi.stubGlobal("fetch", fetchMock);

    const batch = await fetchSuiHolderSnapshotBatch({
      coinAddress: normalizeCoinType("0x2::sui::SUI"),
      startPage: 10,
    });

    expect(fetchMock).toHaveBeenCalledTimes(20);
    expect(batch).toMatchObject({
      meta: {
        endpoint: "https://api.blockberry.one/sui/v1/coins",
        coinAddress: normalizeCoinType("0x2::sui::SUI"),
      },
      startPage: 10,
      nextPage: 30,
      pagesFetched: 20,
      holdersFetched: 20,
    });
  });

  it("can still assemble a full snapshot outside a Worker invocation", async () => {
    stubApiKey();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          content: [
            {
              holderAddress: ADDRESS_A,
              amount: 2.5,
            },
          ],
          last: false,
          numberOfElements: 1,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          content: [
            {
              holderAddress: ADDRESS_A,
              amount: 0.75,
            },
          ],
          last: true,
          numberOfElements: 1,
        }),
      );

    vi.stubGlobal("fetch", fetchMock);

    const batch = await fetchSuiHolderSnapshotBatch({
      coinAddress: normalizeCoinType("0x2::sui::SUI"),
      startPage: 0,
    });

    expect(batch.meta).toEqual({
      endpoint: "https://api.blockberry.one/sui/v1/coins",
      coinAddress: normalizeCoinType("0x2::sui::SUI"),
    });
    expect(batch.balances).toEqual([{ address: ADDRESS_A, balance: "3.25" }]);
  });

  it("sends the api key and compact coin type to Blockberry", async () => {
    stubApiKey();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        content: [],
        last: true,
        numberOfElements: 0,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchSuiHolderSnapshotBatch({
      coinAddress: normalizeCoinType("0x2::sui::SUI"),
      startPage: 0,
    });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBeDefined();
    const requestUrl =
      url instanceof URL ? url.toString() : url instanceof Request ? url.url : (url ?? "");

    expect(decodeURIComponent(requestUrl)).toContain("/0x2::sui::SUI/holders");
    expect(init?.headers).toMatchObject({
      "x-api-key": "test-api-key",
    });
  });

  it("requires a Blockberry api key", async () => {
    Reflect.deleteProperty(process.env, "BLOCKBERRY_API_KEY");
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchSuiHolderSnapshotBatch({
        coinAddress: normalizeCoinType("0x2::sui::SUI"),
        startPage: 0,
      }),
    ).rejects.toThrow("Missing BLOCKBERRY_API_KEY.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces malformed Blockberry payloads", async () => {
    stubApiKey();
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchSuiHolderSnapshotBatch({
        coinAddress: normalizeCoinType("0x2::sui::SUI"),
        startPage: 0,
      }),
    ).rejects.toThrow("Missing content in Blockberry holders response.");
  });

  it("retries Blockberry rate limits before failing the batch", async () => {
    stubApiKey();
    fetchMock
      .mockResolvedValueOnce(
        new Response("rate limited", {
          status: 429,
          headers: {
            "retry-after": "0",
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          content: [
            {
              holderAddress: ADDRESS_A,
              amount: 1,
            },
          ],
          last: true,
          numberOfElements: 1,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchSuiHolderSnapshotBatch({
        coinAddress: normalizeCoinType("0x2::sui::SUI"),
        startPage: 0,
      }),
    ).resolves.toMatchObject({
      balances: [{ address: ADDRESS_A, balance: "1" }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws on upstream non-200 responses", async () => {
    stubApiKey();
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchSuiHolderSnapshotBatch({
        coinAddress: normalizeCoinType("0x2::sui::SUI"),
        startPage: 0,
      }),
    ).rejects.toThrow("Blockberry holders request failed with HTTP 503.");
  });
});
