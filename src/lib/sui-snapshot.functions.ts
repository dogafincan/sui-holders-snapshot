import { createServerFn } from "@tanstack/react-start"

import { snapshotInputSchema } from "@/lib/sui-snapshot"
import { fetchSuiHolderSnapshot } from "@/lib/sui-snapshot.server"

export const runSnapshot = createServerFn({ method: "POST" })
  .inputValidator(snapshotInputSchema)
  .handler(async ({ data }) => {
    return fetchSuiHolderSnapshot(data)
  })
