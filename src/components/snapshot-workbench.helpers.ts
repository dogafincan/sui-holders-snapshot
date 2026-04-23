import {
  buildSnapshotCsv,
  snapshotInputSchema,
  type SnapshotInput,
  type SnapshotResult,
} from "@/lib/sui-snapshot";

export interface SnapshotFormValues {
  coinAddress: string;
}

export function buildSnapshotInputFromForm(formValues: SnapshotFormValues): SnapshotInput {
  return snapshotInputSchema.parse({
    coinAddress: formValues.coinAddress,
  });
}

export function buildSnapshotDownload(snapshot: SnapshotResult) {
  const [packageAddress = "holders", moduleName = "snapshot", tokenName = "csv"] =
    snapshot.meta.coinAddress.split("::");
  const packageSuffix = packageAddress.replace(/^0x/, "").slice(-12);

  return {
    filename: `${packageSuffix || "holders"}-${moduleName}-${tokenName}-snapshot.csv`,
    csv: buildSnapshotCsv(snapshot),
  };
}
