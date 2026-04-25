import { createServerFn } from "@tanstack/react-start";

import { snapshotPageBatchInputSchema } from "@/lib/sui-snapshot";
import { fetchSuiHolderSnapshotBatch } from "@/lib/sui-snapshot.server";

export const runSnapshotBatch = createServerFn({ method: "POST" })
  .inputValidator(snapshotPageBatchInputSchema)
  .handler(async ({ data }) => {
    return fetchSuiHolderSnapshotBatch(data);
  });
