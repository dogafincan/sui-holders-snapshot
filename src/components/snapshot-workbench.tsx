import { startTransition, useState, type FormEvent } from "react"
import { Download, LoaderCircle, Sparkles } from "lucide-react"
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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
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

function SummaryCard({
  label,
  value,
  description,
}: {
  label: string
  value: string
  description: string
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tracking-tight tabular-nums">
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
}

function ResultsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="h-[28rem]" />
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
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-3">
        <Badge variant="outline" className="w-fit">
          Cloudflare Worker
        </Badge>
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">
            Sui holders snapshot
          </h1>
          <p className="max-w-3xl text-muted-foreground">
            Run a live holder snapshot, model a proportional airdrop, then export
            the same ranked rows to CSV.
          </p>
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <Card className="h-fit lg:sticky lg:top-6">
          <CardHeader>
            <CardTitle>Snapshot parameters</CardTitle>
            <CardDescription>
              Exclusions accept commas, spaces, or line breaks. Addresses are
              normalized before the request is sent.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="coin-address">Coin address</FieldLabel>
                  <FieldDescription>
                    Use the format <code>0xPACKAGE::MODULE::TOKEN</code>.
                  </FieldDescription>
                  <Input
                    id="coin-address"
                    value={coinAddress}
                    onChange={(event) => setCoinAddress(event.target.value)}
                    placeholder="0x2::sui::SUI"
                    autoComplete="off"
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="airdrop-amount">Airdrop amount</FieldLabel>
                  <FieldDescription>
                    Leave this empty to run a balance-only snapshot.
                  </FieldDescription>
                  <Input
                    id="airdrop-amount"
                    value={airdropAmount}
                    onChange={(event) => setAirdropAmount(event.target.value)}
                    placeholder="1000000"
                    autoComplete="off"
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="excluded-addresses">
                    Excluded addresses
                  </FieldLabel>
                  <FieldDescription>
                    Only used when airdrop mode is enabled.
                  </FieldDescription>
                  <Textarea
                    id="excluded-addresses"
                    value={excludedAddressText}
                    onChange={(event) => setExcludedAddressText(event.target.value)}
                    placeholder={"0x0000...\n0x1234..."}
                    className="min-h-32"
                  />
                </Field>
              </FieldGroup>

              {formError ? (
                <Alert variant="destructive">
                  <Sparkles />
                  <AlertTitle>Validation error</AlertTitle>
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              ) : null}

              {requestError ? (
                <Alert variant="destructive">
                  <Sparkles />
                  <AlertTitle>Snapshot failed</AlertTitle>
                  <AlertDescription>{requestError}</AlertDescription>
                </Alert>
              ) : null}

              <Button type="submit" size="lg" disabled={isSubmitting}>
                {isSubmitting ? (
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
                <SummaryCard
                  label="Holders"
                  value={formatInteger(snapshot.meta.holderCount)}
                  description="All live Coin<T> objects aggregated by owner address."
                />
                <SummaryCard
                  label="Total balance"
                  value={snapshot.meta.totalBalance}
                  description={`Coin decimals: ${snapshot.meta.decimals}`}
                />
                <SummaryCard
                  label="Eligible holders"
                  value={formatInteger(snapshot.meta.eligibleHolderCount)}
                  description={`${formatInteger(snapshot.meta.exclusionCount)} excluded address${snapshot.meta.exclusionCount === 1 ? "" : "es"}`}
                />
                <SummaryCard
                  label="Airdrop mode"
                  value={
                    snapshot.meta.airdropEnabled
                      ? snapshot.meta.totalAirdropAmount ?? "Enabled"
                      : "Off"
                  }
                  description={
                    snapshot.meta.airdropEnabled
                      ? "Proportional allocation with remainder assigned to the top eligible holder."
                      : "Balance-only snapshot with CSV export."
                  }
                />
              </div>

              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-wrap gap-2">
                        <Badge
                          variant={
                            snapshot.meta.airdropEnabled ? "default" : "secondary"
                          }
                        >
                          {snapshot.meta.airdropEnabled
                            ? "Airdrop allocation"
                            : "Holder snapshot"}
                        </Badge>
                        <Badge variant="outline">
                          {endpointHost(snapshot.meta.endpoint)}
                        </Badge>
                      </div>
                      <div className="flex flex-col gap-1">
                        <CardTitle>Snapshot results</CardTitle>
                        <CardDescription>
                          Filter, sort, paginate, and export the current response
                          without rerunning the Worker.
                        </CardDescription>
                      </div>
                    </div>

                    <Button type="button" variant="outline" onClick={handleDownload}>
                      <Download data-icon="inline-start" />
                      Download CSV
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                    <p>
                      <span className="font-medium text-foreground">Coin type:</span>{" "}
                      <code className="font-mono">{snapshot.meta.coinAddress}</code>
                    </p>
                    <p>
                      <span className="font-medium text-foreground">Endpoint:</span>{" "}
                      <code className="font-mono">{snapshot.meta.endpoint}</code>
                    </p>
                  </div>

                  <HoldersTable
                    rows={snapshot.rows}
                    showAirdrop={snapshot.meta.airdropEnabled}
                  />
                </CardContent>
              </Card>
            </>
          ) : isSubmitting ? (
            <ResultsSkeleton />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Ready to run</CardTitle>
                <CardDescription>
                  Start with <code>0x2::sui::SUI</code> to validate the pipeline, or
                  paste your own coin type to inspect another asset.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Normalize inputs</CardTitle>
                    <CardDescription>
                      Coin types and excluded addresses are canonicalized before the
                      Worker calls Sui GraphQL.
                    </CardDescription>
                  </CardHeader>
                </Card>
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Aggregate holders</CardTitle>
                    <CardDescription>
                      The Worker pages every live <code>Coin&lt;T&gt;</code> object and
                      sums balances by owner address.
                    </CardDescription>
                  </CardHeader>
                </Card>
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Explore the result</CardTitle>
                    <CardDescription>
                      Review the ranked table in the browser, then export the same
                      rows to CSV.
                    </CardDescription>
                  </CardHeader>
                </Card>
              </CardContent>
            </Card>
          )}
        </div>
      </section>
    </main>
  )
}
