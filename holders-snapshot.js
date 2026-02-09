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

function formatUnits(raw, decimals) {
  if (decimals <= 0) {
    return raw.toString();
  }

  const s = raw.toString().padStart(decimals + 1, "0");
  const integerPart = s.slice(0, -decimals);
  const fractionalPart = s.slice(-decimals).replace(/0+$/, "");
  return fractionalPart ? `${integerPart}.${fractionalPart}` : integerPart;
}

function parseUnits(amount, decimals) {
  const text = String(amount).trim();
  if (!/^[0-9]+(?:\.[0-9]+)?$/.test(text)) {
    throw new Error(`Invalid --airdrop amount: ${amount}`);
  }

  const [integerPart, fractionPart = ""] = text.split(".");
  if (fractionPart.length > decimals) {
    throw new Error(
      `--airdrop has too many decimal places (${fractionPart.length}), max is ${decimals}`
    );
  }

  const rawText =
    integerPart + (decimals > 0 ? fractionPart.padEnd(decimals, "0") : "");
  return BigInt(rawText);
}

function parseCliArgs(argv) {
  const coinAddress = argv[0]?.trim();
  if (!coinAddress || coinAddress.startsWith("--")) {
    throw new Error("Missing required coin address: <PACKAGE::MODULE::TOKEN>");
  }

  let airdropAmount = null;
  const excludedAddresses = new Set();

  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--airdrop") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --airdrop");
      }
      airdropAmount = value.trim();
      i += 1;
      continue;
    }

    if (arg === "--exclude") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --exclude");
      }
      for (const address of value.split(",")) {
        const normalized = address.trim().toLowerCase();
        if (normalized) {
          excludedAddresses.add(normalized);
        }
      }
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (excludedAddresses.size > 0 && airdropAmount === null) {
    throw new Error("--exclude can only be used together with --airdrop");
  }

  return { coinAddress, airdropAmount, excludedAddresses };
}

async function main() {
  const { coinAddress, airdropAmount, excludedAddresses } = parseCliArgs(
    process.argv.slice(2)
  );

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

  let airdropRawByAddress = null;
  if (airdropAmount !== null) {
    const totalAirdropRaw = parseUnits(airdropAmount, decimals);
    const eligibleRows = rows.filter(
      (row) => !excludedAddresses.has(row.address.toLowerCase())
    );
    const eligibleTotalRaw = eligibleRows.reduce(
      (acc, row) => acc + row.rawBalance,
      0n
    );

    if (eligibleTotalRaw === 0n) {
      throw new Error("No eligible holders for airdrop after exclusions");
    }

    airdropRawByAddress = new Map();
    let allocated = 0n;

    for (const row of rows) {
      if (excludedAddresses.has(row.address.toLowerCase())) {
        airdropRawByAddress.set(row.address, 0n);
        continue;
      }

      const share = (totalAirdropRaw * row.rawBalance) / eligibleTotalRaw;
      airdropRawByAddress.set(row.address, share);
      allocated += share;
    }

    const remainder = totalAirdropRaw - allocated;
    if (remainder > 0n && eligibleRows.length > 0) {
      const firstEligibleAddress = eligibleRows[0].address;
      airdropRawByAddress.set(
        firstEligibleAddress,
        (airdropRawByAddress.get(firstEligibleAddress) ?? 0n) + remainder
      );
    }
  }

  const lines =
    airdropRawByAddress === null
      ? ["rank,address,balance"]
      : ["rank,address,balance,airdrop_amount"];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const formattedBalance = formatUnits(row.rawBalance, decimals);

    if (airdropRawByAddress === null) {
      lines.push(`${i + 1},${row.address},${formattedBalance}`);
      continue;
    }

    const airdropRaw = airdropRawByAddress.get(row.address) ?? 0n;
    const formattedAirdrop = formatUnits(airdropRaw, decimals);
    lines.push(`${i + 1},${row.address},${formattedBalance},${formattedAirdrop}`);
  }

  await fs.writeFile(CSV_PATH, `${lines.join("\n")}\n`, "utf8");
  console.log(`Wrote CSV: ${CSV_PATH}`);
}

main().catch((error) => {
  console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
