import {
  formatUnits,
  normalizeSuiAddress,
  type SnapshotInput,
  type SnapshotResult,
} from "@/lib/sui-snapshot";

const DEFAULT_ENDPOINT = "https://graphql.mainnet.sui.io/graphql";
const REQUEST_TIMEOUT_MS = 25_000;
const PAGE_SIZE = 50;

const OBJECTS_QUERY = `
query Snapshot($type: String!, $first: Int!, $after: String) {
  objects(first: $first, after: $after, filter: { type: $type }) {
    pageInfo {
      hasNextPage
      endCursor
    }
    nodes {
      owner {
        __typename
        ... on AddressOwner {
          address {
            address
          }
        }
        ... on ConsensusAddressOwner {
          address {
            address
          }
        }
      }
      asMoveObject {
        contents {
          json
        }
      }
    }
  }
}
`;

const COIN_METADATA_QUERY = `
query CoinMetadata($coinType: String!) {
  coinMetadata(coinType: $coinType) {
    decimals
  }
}
`;

interface GraphQLError {
  message?: string;
}

interface CoinMetadataResponse {
  coinMetadata?: {
    decimals?: number | null;
  } | null;
}

interface ObjectsResponse {
  objects?: {
    pageInfo?: {
      hasNextPage?: boolean | null;
      endCursor?: string | null;
    } | null;
    nodes?: Array<{
      owner?: {
        address?: {
          address?: string | null;
        } | null;
      } | null;
      asMoveObject?: {
        contents?: {
          json?: {
            balance?: string | number | null;
          } | null;
        } | null;
      } | null;
    }>;
  } | null;
}

interface GraphQLPayload<TData> {
  data?: TData;
  errors?: GraphQLError[];
}

async function resolveEndpoint() {
  try {
    const cloudflare = (await import("cloudflare:workers")) as {
      env?: {
        SUI_GRAPHQL_ENDPOINT?: string;
      };
    };

    const configured = cloudflare.env?.SUI_GRAPHQL_ENDPOINT?.trim();
    return configured || DEFAULT_ENDPOINT;
  } catch {
    return DEFAULT_ENDPOINT;
  }
}

async function postGraphQL<TData>(
  endpoint: string,
  query: string,
  variables: Record<string, unknown>,
  signal: AbortSignal,
) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Sui GraphQL request failed with HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as GraphQLPayload<TData>;
  if (payload.errors?.length) {
    const message =
      payload.errors.find((error) => error.message)?.message ??
      "Sui GraphQL returned an unknown error.";
    throw new Error(message);
  }

  if (!payload.data) {
    throw new Error("Missing data in GraphQL response.");
  }

  return payload.data;
}

function compareBigInt(a: bigint, b: bigint) {
  if (a === b) {
    return 0;
  }

  return a > b ? 1 : -1;
}

export async function fetchSuiHolderSnapshot(input: SnapshotInput): Promise<SnapshotResult> {
  const endpoint = await resolveEndpoint();
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const metadata = await postGraphQL<CoinMetadataResponse>(
      endpoint,
      COIN_METADATA_QUERY,
      {
        coinType: input.coinAddress,
      },
      controller.signal,
    );

    const decimals =
      typeof metadata.coinMetadata?.decimals === "number" &&
      Number.isInteger(metadata.coinMetadata.decimals)
        ? metadata.coinMetadata.decimals
        : 0;

    const balances = new Map<string, bigint>();
    let cursor: string | null = null;

    while (true) {
      const snapshotPage: ObjectsResponse = await postGraphQL<ObjectsResponse>(
        endpoint,
        OBJECTS_QUERY,
        {
          type: `0x2::coin::Coin<${input.coinAddress}>`,
          first: PAGE_SIZE,
          after: cursor,
        },
        controller.signal,
      );

      const connection: ObjectsResponse["objects"] = snapshotPage.objects;
      if (!connection) {
        throw new Error("Missing data.objects in GraphQL response.");
      }

      for (const node of connection.nodes ?? []) {
        const ownerAddress = node.owner?.address?.address;
        if (!ownerAddress) {
          throw new Error("Encountered a coin object without an address owner.");
        }

        const rawBalanceValue = node.asMoveObject?.contents?.json?.balance;
        if (rawBalanceValue === undefined || rawBalanceValue === null) {
          throw new Error("Encountered a coin object without a balance.");
        }

        const address = normalizeSuiAddress(ownerAddress);
        const rawBalance = BigInt(String(rawBalanceValue));
        balances.set(address, (balances.get(address) ?? 0n) + rawBalance);
      }

      if (!connection.pageInfo?.hasNextPage) {
        break;
      }

      cursor = connection.pageInfo.endCursor ?? null;
      if (!cursor) {
        throw new Error("Missing pageInfo.endCursor while more results remain.");
      }
    }

    const rows = Array.from(balances.entries())
      .map(([address, rawBalance]) => ({ address, rawBalance }))
      .sort((left, right) => {
        const balanceComparison = compareBigInt(left.rawBalance, right.rawBalance);
        if (balanceComparison !== 0) {
          return balanceComparison * -1;
        }

        return left.address.localeCompare(right.address);
      });

    const totalRawBalance = rows.reduce((total, row) => total + row.rawBalance, 0n);

    return {
      meta: {
        endpoint,
        coinAddress: input.coinAddress,
        decimals,
        holderCount: rows.length,
        totalBalance: formatUnits(totalRawBalance, decimals),
      },
      rows: rows.map((row, index) => ({
        rank: index + 1,
        address: row.address,
        balance: formatUnits(row.rawBalance, decimals),
        rawBalance: row.rawBalance.toString(),
      })),
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
