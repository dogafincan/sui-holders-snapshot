import fs from "node:fs/promises";

const ENDPOINT = "https://graphql.mainnet.sui.io/graphql";
const CSV_PATH = "holders.csv";

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

async function postGraphQL(query, variables) {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

async function main() {
  const coinAddress = process.argv[2]?.trim();
  if (!coinAddress || process.argv.length !== 3) {
    throw new Error("Expected exactly one non-empty argument: <coin-address>");
  }

  const coinObjectType = `0x2::coin::Coin<${coinAddress}>`;
  const metadataPayload = await postGraphQL(COIN_METADATA_QUERY, {
    coinType: coinAddress,
  });
  const metadataDecimals = metadataPayload?.data?.coinMetadata?.decimals;
  const decimals =
    typeof metadataDecimals === "number" && Number.isInteger(metadataDecimals)
      ? metadataDecimals
      : 0;

  const balances = new Map();
  let cursor = null;

  while (true) {
    const payload = await postGraphQL(OBJECTS_QUERY, {
      type: coinObjectType,
      first: 50,
      after: cursor,
    });

    const connection = payload?.data?.objects;
    if (!connection) {
      throw new Error("Missing data.objects in GraphQL response");
    }

    for (const node of connection.nodes ?? []) {
      const address = node.owner.address.address;
      const rawBalance = BigInt(node.asMoveObject.contents.json.balance);
      balances.set(address, (balances.get(address) ?? 0n) + rawBalance);
    }

    if (!connection.pageInfo?.hasNextPage) {
      break;
    }

    cursor = connection.pageInfo.endCursor;
  }

  const rows = Array.from(balances.entries())
    .map(([address, rawBalance]) => ({ address, rawBalance }))
    .sort((a, b) => {
      if (a.rawBalance === b.rawBalance) return 0;
      return a.rawBalance > b.rawBalance ? -1 : 1;
    });

  const lines = ["rank,address,balance"];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const raw = row.rawBalance;

    let formatted;
    if (decimals <= 0) {
      formatted = raw.toString();
    } else {
      const s = raw.toString().padStart(decimals + 1, "0");
      const integerPart = s.slice(0, -decimals);
      const fractionalPart = s.slice(-decimals).replace(/0+$/, "");
      formatted = fractionalPart ? `${integerPart}.${fractionalPart}` : integerPart;
    }

    lines.push(`${i + 1},${row.address},${formatted}`);
  }

  await fs.writeFile(CSV_PATH, `${lines.join("\n")}\n`, "utf8");
  console.log(`Wrote CSV: ${CSV_PATH}`);
}

main().catch((error) => {
  console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
