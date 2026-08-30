"use client";

import { ExternalLink, Filter, LoaderCircle, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatNumber, formatPct } from "@/lib/audit/format";
import type { CiRun, FutureQuote, LiveSpot } from "@/lib/audit/live";
import type { ContractWatch, GateId, MemeRung, PnlBucket, StrategyBucketId } from "@/lib/audit/types";
import { cn } from "@/lib/utils";

function signedPct(value: number | null, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const formatted = formatPct(value, digits);
  return value > 0 ? `+${formatted}` : formatted;
}

export function PnlPanel({
  buckets,
  onInspectBucket,
}: {
  buckets: PnlBucket[];
  onInspectBucket: (id: StrategyBucketId) => void;
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>PnL by strategy</CardTitle>
        <CardDescription>
          Equal-weight close-to-close returns from sealed venue bars, grouped by kill
          attribution. This desk does not hold positions — these are measured tape moves,
          not executed trading P&amp;L. Empty samples stay blank.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bucket</TableHead>
              <TableHead className="text-right">Names</TableHead>
              <TableHead className="text-right">Mean 5d</TableHead>
              <TableHead className="text-right">Median 5d</TableHead>
              <TableHead className="text-right">Mean 20d</TableHead>
              <TableHead className="text-right">5d breadth</TableHead>
              <TableHead className="text-right">Open</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {buckets.map((bucket) => (
              <TableRow key={bucket.id}>
                <TableCell className="font-medium">{bucket.label}</TableCell>
                <TableCell className="text-right font-mono">
                  {bucket.count}{" "}
                  <span className="text-muted-foreground">({formatPct(bucket.share, 0)})</span>
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right font-mono",
                    (bucket.meanChg5d ?? 0) > 0 && "text-emerald-400",
                    (bucket.meanChg5d ?? 0) < 0 && "text-rose-400",
                  )}
                >
                  {signedPct(bucket.meanChg5d, 2)}
                </TableCell>
                <TableCell className="text-right font-mono">{signedPct(bucket.medianChg5d, 2)}</TableCell>
                <TableCell className="text-right font-mono">{signedPct(bucket.meanChg20d, 1)}</TableCell>
                <TableCell className="text-right font-mono">
                  {bucket.breadth5d == null ? "—" : formatPct(bucket.breadth5d, 0)}
                  <span className="ml-1 text-muted-foreground">n={bucket.sample5d}</span>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onInspectBucket(bucket.id)}
                    disabled={bucket.count === 0}
                  >
                    <Filter />
                    Ledger
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function FuturesPanel({
  futures,
  fetchedAt,
  onRefresh,
  busy,
}: {
  futures: FutureQuote[] | null;
  fetchedAt: string | null;
  onRefresh: () => void;
  busy: boolean;
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Futures</CardTitle>
            <CardDescription>
              Live Yahoo front-month prints. A missing last is shown as a venue miss, never a
              made-up number.
            </CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={busy}>
            {busy ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
            Refresh futures
          </Button>
        </div>
        {fetchedAt ? (
          <p className="font-mono text-[11px] text-muted-foreground">
            pulled {fetchedAt} · source yahoo-finance chart
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="pt-4">
        {!futures ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" /> Loading venue futures…
          </p>
        ) : futures.length === 0 ? (
          <p className="text-sm text-muted-foreground">No futures prints on this pull.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contract</TableHead>
                <TableHead className="text-right">Last</TableHead>
                <TableHead className="text-right">Vs prior</TableHead>
                <TableHead className="hidden sm:table-cell">As of</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {futures.map((row) => (
                <TableRow key={row.yahoo}>
                  <TableCell>
                    <div className="font-medium">{row.yahoo}</div>
                    <div className="text-xs text-muted-foreground">{row.name}</div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {row.last == null
                      ? "—"
                      : row.last >= 1
                        ? formatNumber(row.last, 2)
                        : row.last.toPrecision(4)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-mono",
                      (row.changePct ?? 0) > 0 && "text-emerald-400",
                      (row.changePct ?? 0) < 0 && "text-rose-400",
                    )}
                  >
                    {row.error && row.last == null ? (
                      <span className="text-rose-400">{row.error}</span>
                    ) : (
                      signedPct(row.changePct, 2)
                    )}
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs text-muted-foreground sm:table-cell">
                    {row.asOf ? row.asOf.replace("T", " ").slice(0, 19) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function ciSeverity(run: CiRun | null): "pass" | "warn" | "fail" {
  if (!run) return "warn";
  if (run.status !== "completed") return "warn";
  if (run.conclusion === "success") return "pass";
  if (run.conclusion === "failure" || run.conclusion === "timed_out") return "fail";
  return "warn";
}

export function WatchLanesPanel({
  watches,
  ci,
  onFilterGate,
  onRefreshLive,
  onMarkToMarket,
  busy,
}: {
  watches: ContractWatch[];
  ci: { runs: CiRun[]; latest: CiRun | null; error: string | null; fetchedAt: string | null };
  onFilterGate: (gateId: GateId) => void;
  onRefreshLive: () => void;
  onMarkToMarket: () => void;
  busy: boolean;
}) {
  const latest = ci.latest;
  const latestSeverity = ciSeverity(latest);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>CI runner</CardTitle>
              <CardDescription>
                Latest GitHub Actions runs for this repo. Status is whatever the runner
                recorded — this panel does not reinterpret a red X.
              </CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={onRefreshLive} disabled={busy}>
              {busy ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
              Refresh CI
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          {ci.error ? <p className="text-sm text-destructive">{ci.error}</p> : null}
          {!latest && !ci.error ? (
            <p className="text-sm text-muted-foreground">No workflow runs returned on this pull.</p>
          ) : null}
          {latest ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
              <Badge
                variant={
                  latestSeverity === "fail" ? "destructive" : latestSeverity === "pass" ? "secondary" : "outline"
                }
              >
                {latest.conclusion ?? latest.status}
              </Badge>
              <div className="min-w-0">
                <div className="font-medium">{latest.name}</div>
                <div className="font-mono text-xs text-muted-foreground">
                  {latest.branch} · {latest.event} · {latest.updatedAt}
                </div>
              </div>
              <a
                href={latest.url}
                target="_blank"
                rel="noreferrer"
                className="ml-auto inline-flex h-7 items-center gap-1 rounded-lg border border-border px-2.5 text-[0.8rem] hover:bg-muted"
              >
                <ExternalLink className="size-3.5" />
                Open run
              </a>
            </div>
          ) : null}
          {ci.runs.length > 1 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Run</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ci.runs.slice(0, 8).map((run) => (
                  <TableRow key={run.id}>
                    <TableCell>
                      <div className="font-medium">{run.name}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">{run.updatedAt}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{run.branch}</TableCell>
                    <TableCell>
                      <Badge variant={ciSeverity(run) === "fail" ? "destructive" : "outline"}>
                        {run.conclusion ?? run.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <a
                        href={run.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-7 items-center gap-1 rounded-lg border border-border px-2.5 text-[0.8rem] hover:bg-muted"
                      >
                        <ExternalLink className="size-3.5" />
                        Open
                      </a>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
          {ci.fetchedAt ? (
            <p className="font-mono text-[11px] text-muted-foreground">pulled {ci.fetchedAt}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Watch lanes</CardTitle>
          <CardDescription>
            Role-contract drift, integrity warnings, and tape freshness. A watch is not a
            broken seal. Failures stay failures.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          {watches.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open watches on this sealed book.</p>
          ) : (
            watches.map((watch) => (
              <div key={watch.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-start">
                <Badge variant={watch.severity === "fail" ? "destructive" : "outline"}>{watch.severity}</Badge>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{watch.title}</div>
                  <div className="text-sm text-muted-foreground">{watch.detail}</div>
                </div>
                {watch.gateId ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => onFilterGate(watch.gateId!)}>
                    <Filter />
                    Show kills
                  </Button>
                ) : watch.id === "tape-freshness" ? (
                  <Button type="button" size="sm" onClick={onMarkToMarket} disabled={busy}>
                    <RefreshCw />
                    Mark to market
                  </Button>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function MemeLadderPanel({
  rungs,
  spots,
  onInspect,
  onShowInLedger,
}: {
  rungs: MemeRung[];
  spots: LiveSpot[];
  onInspect: (id: string) => void;
  onShowInLedger: () => void;
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Meme position ladder</CardTitle>
            <CardDescription>
              Meme-sector names on the sealed book, ranked by measured 5d tape return. Live
              CoinGecko/Coinbase spots sit beside the sealed last — they do not rewrite the
              seal until you mark to market.
            </CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onShowInLedger} disabled={rungs.length === 0}>
            <Filter />
            Show in ledger
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {rungs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No meme-sector names on this sealed tape.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Sealed last</TableHead>
                <TableHead className="text-right">Live spot</TableHead>
                <TableHead className="text-right">5d</TableHead>
                <TableHead>Kill</TableHead>
                <TableHead className="text-right">Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rungs.map((rung) => {
                const live = spots.find((spot) => spot.symbol === rung.symbol);
                return (
                  <TableRow key={rung.candidateId}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{rung.rank}</TableCell>
                    <TableCell>
                      <div className="font-medium">{rung.symbol}</div>
                      <div className="text-xs text-muted-foreground">{rung.name}</div>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {rung.last >= 1 ? formatNumber(rung.last, 4) : rung.last.toPrecision(4)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {live
                        ? live.usd >= 1
                          ? formatNumber(live.usd, 4)
                          : live.usd.toPrecision(4)
                        : "—"}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-mono",
                        (rung.chg5d ?? 0) > 0 && "text-emerald-400",
                        (rung.chg5d ?? 0) < 0 && "text-rose-400",
                      )}
                    >
                      {signedPct(rung.chg5d, 1)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={rung.outcome === "PASSED" ? "secondary" : "outline"}>
                        {rung.killGate ?? "PASSED"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button type="button" size="sm" variant="outline" onClick={() => onInspect(rung.candidateId)}>
                        Inspect
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
