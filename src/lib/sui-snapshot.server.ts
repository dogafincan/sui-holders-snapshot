import {
  addDecimalAmounts,
  buildSnapshotResult,
  compactCoinType,
  normalizeDecimalAmount,
  normalizeSuiAddress,
  type SnapshotBalanceRow,
  type SnapshotPageBatchInput,
  type SnapshotPageBatchResult,
  type SnapshotResult,
} from "@/lib/sui-snapshot";

const BLOCKBERRY_HOLDERS_ENDPOINT = "https://api.blockberry.one/sui/v1/coins";
const BLOCKBERRY_API_KEY_ENV = "BLOCKBERRY_API_KEY";
const REQUEST_TIMEOUT_MS = 45_000;
const PAGE_SIZE = 100;
const PAGES_PER_BATCH = 20;
const MAX_RATE_LIMIT_RETRIES = 3;
const DEFAULT_RATE_LIMIT_RETRY_MS = 1_500;

interface CloudflareEnv {
  BLOCKBERRY_API_KEY?: string;
}

interface BlockberryHolder {
  holderAddress?: string | null;
  amount?: number | string | null;
}

interface BlockberryPage {
  content?: BlockberryHolder[] | null;
  last?: boolean | null;
  numberOfElements?: number | null;
}

async function resolveBlockberryApiKey() {
  try {
    const cloudflare = (await import("cloudflare:workers")) as {
      env?: CloudflareEnv;
    };

    const configured = cloudflare.env?.BLOCKBERRY_API_KEY?.trim();
    if (configured) {
      return configured;
    }
  } catch {
    // Tests and non-Worker tooling resolve secrets through process.env below.
  }

  const configured = process.env.BLOCKBERRY_API_KEY?.trim();
  if (configured) {
    return configured;
  }

  throw new Error(
    `Missing ${BLOCKBERRY_API_KEY_ENV}. Set it in .dev.vars for local development and as a Cloudflare Worker secret for deployed runs.`,
  );
}

function buildBlockberryHoldersUrl(coinType: string, page: number) {
  const url = new URL(
    `${BLOCKBERRY_HOLDERS_ENDPOINT}/${encodeURIComponent(compactCoinType(coinType))}/holders`,
  );

  url.searchParams.set("page", String(page));
  url.searchParams.set("size", String(PAGE_SIZE));
  url.searchParams.set("orderBy", "DESC");
  url.searchParams.set("sortBy", "AMOUNT");

  return url;
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timeout = globalThis.setTimeout(resolve, ms);

    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(new DOMException("The operation was aborted.", "AbortError"));
      },
      { once: true },
    );
  });
}

function readRetryDelayMs(response: Response, attempt: number) {
  const retryAfter = response.headers.get("retry-after")?.trim();

  if (retryAfter) {
    const retryAfterSeconds = Number(retryAfter);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
      return retryAfterSeconds * 1_000;
    }

    const retryAfterDate = Date.parse(retryAfter);
    if (Number.isFinite(retryAfterDate)) {
      return Math.max(retryAfterDate - Date.now(), 0);
    }
  }

  return DEFAULT_RATE_LIMIT_RETRY_MS * 2 ** attempt;
}

async function fetchBlockberryPage(
  apiKey: string,
  coinType: string,
  page: number,
  signal: AbortSignal,
) {
  const url = buildBlockberryHoldersUrl(coinType, page);

  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "x-api-key": apiKey,
      },
      signal,
    });

    if (response.status === 429) {
      if (attempt === MAX_RATE_LIMIT_RETRIES) {
        throw new Error("Blockberry rate limited the snapshot request. Wait a minute and retry.");
      }

      await sleep(readRetryDelayMs(response, attempt), signal);
      continue;
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error(`Blockberry rejected the request. Check ${BLOCKBERRY_API_KEY_ENV}.`);
      }

      throw new Error(`Blockberry holders request failed with HTTP ${response.status}.`);
    }

    const payload = (await response.json()) as BlockberryPage;

    if (!Array.isArray(payload.content)) {
      throw new Error("Missing content in Blockberry holders response.");
    }

    return {
      holders: payload.content,
      last: payload.last === true || payload.numberOfElements === 0 || payload.content.length === 0,
    };
  }

  throw new Error("Blockberry holders request failed before returning data.");
}

function readHolderBalance(holder: BlockberryHolder) {
  if (holder.amount === undefined || holder.amount === null) {
    throw new Error("Encountered a Blockberry holder without an amount.");
  }

  return normalizeDecimalAmount(String(holder.amount));
}

export async function fetchSuiHolderSnapshotBatch(
  input: SnapshotPageBatchInput,
): Promise<SnapshotPageBatchResult> {
  const apiKey = await resolveBlockberryApiKey();
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const balances = new Map<string, string>();
    let page = input.startPage;
    let pagesFetched = 0;
    let holdersFetched = 0;
    let reachedLastPage = false;

    while (pagesFetched < PAGES_PER_BATCH) {
      const snapshotPage = await fetchBlockberryPage(
        apiKey,
        input.coinAddress,
        page,
        controller.signal,
      );

      for (const holder of snapshotPage.holders) {
        if (!holder.holderAddress) {
          throw new Error("Encountered a Blockberry holder without an address.");
        }

        const address = normalizeSuiAddress(holder.holderAddress);
        const balance = readHolderBalance(holder);
        balances.set(address, addDecimalAmounts(balances.get(address) ?? "0", balance));
      }

      holdersFetched += snapshotPage.holders.length;
      pagesFetched += 1;

      if (snapshotPage.last) {
        reachedLastPage = true;
        break;
      }

      page += 1;
    }

    return {
      meta: {
        endpoint: BLOCKBERRY_HOLDERS_ENDPOINT,
        coinAddress: input.coinAddress,
      },
      balances: Array.from(balances.entries()).map(([address, balance]) => ({ address, balance })),
      startPage: input.startPage,
      nextPage: reachedLastPage ? null : page,
      pagesFetched,
      holdersFetched,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Snapshot request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds.`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchSuiHolderSnapshot(
  input: Omit<SnapshotPageBatchInput, "startPage">,
): Promise<SnapshotResult> {
  const balances: SnapshotBalanceRow[] = [];
  let startPage = 0;

  while (true) {
    const batch = await fetchSuiHolderSnapshotBatch({
      ...input,
      startPage,
    });

    balances.push(...batch.balances);

    if (batch.nextPage === null) {
      return buildSnapshotResult({
        endpoint: batch.meta.endpoint,
        coinAddress: input.coinAddress,
        balances,
      });
    }

    startPage = batch.nextPage;
  }
}
