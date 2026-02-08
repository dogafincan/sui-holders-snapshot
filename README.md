# Sui Token Holder Snapshot

This repo contains a script that takes a holder snapshot for a Sui coin address and outputs:

- A CSV list of holders and balances.

The script queries Sui GraphQL and aggregates all live `Coin<T>` objects by owner address.

## Requirements

- Node.js 18+ (uses built-in `fetch`)

## Quick Start

```bash
node holders-snapshot.js 0x2::sui::SUI
```

## Usage

```bash
node holders-snapshot.js <PACKAGE::MODULE::TOKEN>
```

Important:

- Pass the coin address (for example `0x2::sui::SUI`).
- The endpoint is fixed to `https://graphql.mainnet.sui.io/graphql`.
- The output is always written to `holders.csv` in your current directory.

## Output Format

CSV columns:

- `rank`
- `address`
- `balance` (formatted using on-chain coin decimals)

## Notes

- This script snapshots live state while paging through results. If transfers occur during the run, the snapshot can drift slightly.
- For strict point-in-time accounting at an exact checkpoint, run your own indexer over checkpoints.
