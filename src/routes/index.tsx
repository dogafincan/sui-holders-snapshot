import { createFileRoute } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"

import { SnapshotWorkbench } from "@/components/snapshot-workbench"
import { runSnapshot } from "@/lib/sui-snapshot.functions"

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        title: "Sui Holders Snapshot",
      },
      {
        name: "description",
        content:
          "Run Sui token holder snapshots, model proportional airdrops, and export ranked CSV results from a Cloudflare Worker.",
      },
    ],
  }),
  component: IndexRoute,
})

function IndexRoute() {
  const runSnapshotFn = useServerFn(runSnapshot)

  return <SnapshotWorkbench runSnapshot={runSnapshotFn} />
}
