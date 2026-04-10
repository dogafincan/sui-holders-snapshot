import { startTransition, useState, type FormEvent } from "react"
import {
  Coins,
  Database,
  Download,
  LoaderCircle,
  PackageSearch,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from "lucide-react"
import { toast } from "sonner"

import { HoldersTable } from "@/components/holders-table"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import {
  toErrorMessage,
  type SnapshotInput,
  type SnapshotResult,
} from "@/lib/sui-snapshot"
import {
  buildSnapshotDownload,
  buildSnapshotInputFromForm,
} from "@/components/snapshot-workbench.helpers"

type RunSnapshot = (payload: { data: SnapshotInput }) => Promise<SnapshotResult>

function formatInteger(value: number) {
  return new Intl.NumberFormat("en-US").format(value)
}

function endpointHost(endpoint: string) {
  try {
    return new URL(endpoint).hostname
  } catch {
    return endpoint
  }
}

function downloadSnapshot(snapshot: SnapshotResult) {
  const download = buildSnapshotDownload(snapshot)
  const blob = new Blob([download.csv], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")

  anchor.href = url
  anchor.download = download.filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string
  value: string
  hint: string
  icon: typeof WalletCards
}) {
  return (
    <Card className="border-border/70 bg-background/90">
      <CardHeader className="border-b border-border/60">
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardDescription>{label}</CardDescription>
            <CardTitle className="mt-1 text-2xl tabular-nums">{value}</CardTitle>
          </div>
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  )
}

function ResultsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Skeleton className="h-32 rounded-3xl" />
        <Skeleton className="h-32 rounded-3xl" />
        <Skeleton className="h-32 rounded-3xl" />
        <Skeleton className="h-32 rounded-3xl" />
      </div>
      <Skeleton className="h-[28rem] rounded-3xl" />
    </div>
  )
}

export function SnapshotWorkbench({
  runSnapshot,
}: {
  runSnapshot: RunSnapshot
}) {
  const [coinAddress, setCoinAddress] = useState("0x2::sui::SUI")
  const [airdropAmount, setAirdropAmount] = useState("")
  const [excludedAddressText, setExcludedAddressText] = useState("")
  const [snapshot, setSnapshot] = useState<SnapshotResult | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isBusy = isSubmitting

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    setRequestError(null)

    let payload: SnapshotInput
    try {
      payload = buildSnapshotInputFromForm({
        coinAddress,
        airdropAmount,
        excludedAddressText,
      })
    } catch (error) {
      setFormError(toErrorMessage(error))
      return
    }

    setIsSubmitting(true)

    try {
      const nextSnapshot = await runSnapshot({ data: payload })
      startTransition(() => {
        setSnapshot(nextSnapshot)
      })
      toast.success(`Loaded ${formatInteger(nextSnapshot.meta.holderCount)} holders.`)
    } catch (error) {
      const message = toErrorMessage(error)
      startTransition(() => {
        setRequestError(message)
      })
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleDownload() {
    if (!snapshot) {
      return
    }

    downloadSnapshot(snapshot)
    toast.success("CSV download started.")
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <section className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-card/95 px-6 py-8 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.55)] sm:px-8">
        <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-[radial-gradient(circle_at_top_right,_rgba(44,122,123,0.18),_transparent_58%)] lg:block" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <Badge variant="secondary" className="mb-4">
              Stateless Cloudflare Worker
            </Badge>
            <h1 className="max-w-2xl text-4xl leading-none font-heading tracking-[-0.06em] text-foreground sm:text-5xl">
              Snapshot Sui token holders and model proportional airdrops in one run.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              Enter any Sui coin type, optionally exclude treasury or burn addresses,
              and get a ranked holder table plus a CSV export without storing anything
              on the server.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border/60 bg-background/80 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                Execution
              </p>
              <p className="mt-2 text-sm font-medium text-foreground">
                Direct request flow
              </p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/80 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                Output
              </p>
              <p className="mt-2 text-sm font-medium text-foreground">
                Full TanStack Table + CSV
              </p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/80 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                Infra
              </p>
              <p className="mt-2 text-sm font-medium text-foreground">
                TanStack Start on Workers
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <Card className="h-fit border-border/70 bg-card/95 xl:sticky xl:top-6">
          <CardHeader className="border-b border-border/60">
            <CardTitle className="text-2xl tracking-[-0.04em]">
              Snapshot parameters
            </CardTitle>
            <CardDescription>
              Exclusions accept commas, spaces, or line breaks. Inputs are normalized
              to canonical Sui addresses before the request is sent.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
              <div className="flex flex-col gap-2">
                <Label htmlFor="coin-address">Coin address</Label>
                <Input
                  id="coin-address"
                  value={coinAddress}
                  onChange={(event) => setCoinAddress(event.target.value)}
                  placeholder="0x2::sui::SUI"
                  autoComplete="off"
                />
                <p className="text-sm text-muted-foreground">
                  Format: <code>0xPACKAGE::MODULE::TOKEN</code>
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="airdrop-amount">Airdrop amount</Label>
                <Input
                  id="airdrop-amount"
                  value={airdropAmount}
                  onChange={(event) => setAirdropAmount(event.target.value)}
                  placeholder="1000000"
                  autoComplete="off"
                />
                <p className="text-sm text-muted-foreground">
                  Leave empty to run a pure holder snapshot with no allocation column.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="excluded-addresses">Excluded addresses</Label>
                <Textarea
                  id="excluded-addresses"
                  value={excludedAddressText}
                  onChange={(event) => setExcludedAddressText(event.target.value)}
                  placeholder={"0x0000...\n0x1234..."}
                  className="min-h-40"
                />
              </div>

              {formError ? (
                <Alert variant="destructive">
                  <Sparkles />
                  <AlertTitle>Validation error</AlertTitle>
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              ) : null}

              {requestError ? (
                <Alert variant="destructive">
                  <PackageSearch />
                  <AlertTitle>Snapshot failed</AlertTitle>
                  <AlertDescription>{requestError}</AlertDescription>
                </Alert>
              ) : null}

              <Button type="submit" size="lg" disabled={isBusy}>
                {isBusy ? (
                  <>
                    <LoaderCircle className="animate-spin" data-icon="inline-start" />
                    Running snapshot
                  </>
                ) : (
                  <>
                    <Sparkles data-icon="inline-start" />
                    Generate snapshot
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          {snapshot ? (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Holders"
                  value={formatInteger(snapshot.meta.holderCount)}
                  hint="All live Coin<T> objects aggregated by owner address."
                  icon={WalletCards}
                />
                <MetricCard
                  label="Total balance"
                  value={snapshot.meta.totalBalance}
                  hint={`Coin decimals: ${snapshot.meta.decimals}`}
                  icon={Coins}
                />
                <MetricCard
                  label="Eligible holders"
                  value={formatInteger(snapshot.meta.eligibleHolderCount)}
                  hint={`${formatInteger(snapshot.meta.exclusionCount)} excluded address${snapshot.meta.exclusionCount === 1 ? "" : "es"}`}
                  icon={ShieldCheck}
                />
                <MetricCard
                  label="Airdrop mode"
                  value={
                    snapshot.meta.airdropEnabled
                      ? snapshot.meta.totalAirdropAmount ?? "Enabled"
                      : "Off"
                  }
                  hint={
                    snapshot.meta.airdropEnabled
                      ? "Proportional allocation with remainder assigned to the top eligible holder."
                      : "Balance-only snapshot with CSV export."
                  }
                  icon={Database}
                />
              </div>

              <Card className="border-border/70 bg-card/95">
                <CardHeader className="border-b border-border/60">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">
                          {snapshot.meta.airdropEnabled ? "Airdrop allocation" : "Holder snapshot"}
                        </Badge>
                        <Badge variant="outline">
                          {endpointHost(snapshot.meta.endpoint)}
                        </Badge>
                      </div>
                      <CardTitle className="mt-3 text-2xl tracking-[-0.04em]">
                        Snapshot results
                      </CardTitle>
                      <CardDescription className="mt-2">
                        TanStack Table renders the full dataset client-side so you can
                        sort, filter, paginate, and export without rerunning the Worker.
                      </CardDescription>
                    </div>
                    <Button type="button" variant="outline" size="lg" onClick={handleDownload}>
                      <Download data-icon="inline-start" />
                      Download CSV
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    <span>
                      Coin type:{" "}
                      <code className="text-foreground">{snapshot.meta.coinAddress}</code>
                    </span>
                    <Separator orientation="vertical" className="hidden h-5 sm:block" />
                    <span>
                      Endpoint:{" "}
                      <code className="text-foreground">{snapshot.meta.endpoint}</code>
                    </span>
                  </div>
                  <HoldersTable
                    rows={snapshot.rows}
                    showAirdrop={snapshot.meta.airdropEnabled}
                  />
                </CardContent>
              </Card>
            </>
          ) : isBusy ? (
            <ResultsSkeleton />
          ) : (
            <Card className="border-border/70 bg-card/95">
              <CardHeader className="border-b border-border/60">
                <CardTitle className="text-2xl tracking-[-0.04em]">
                  Ready to run
                </CardTitle>
                <CardDescription>
                  Start with <code>0x2::sui::SUI</code> to validate the pipeline, or
                  paste your own coin type to inspect a different asset.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
                  <p className="text-sm font-medium text-foreground">
                    1. Normalize inputs
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Coin types and excluded addresses are canonicalized before the
                    Worker touches Sui GraphQL.
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
                  <p className="text-sm font-medium text-foreground">
                    2. Aggregate holders
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    The Worker pages every live <code>Coin&lt;T&gt;</code> object and
                    sums balances by owner address.
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
                  <p className="text-sm font-medium text-foreground">
                    3. Explore the result
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Review the ranked table in-browser, then export the same rows to CSV.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </section>
    </main>
  )
}
