"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  LoaderCircle,
  RefreshCw,
  Shield,
  ShieldAlert,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatNumber, formatPct, formatShare, shortHash } from "@/lib/audit/format";
import type {
  AuditRun,
  Bar,
  CandidateRecord,
  GateEvaluation,
  GateId,
  IntegrityReport,
} from "@/lib/audit/types";
import { cn } from "@/lib/utils";

const GATE_COLORS: Record<GateId, string> = {
  trend_sep: "bg-sky-400",
  adx: "bg-amber-400",
  volume_confirm: "bg-violet-400",
  tier_reject: "bg-rose-400",
  accel_gate: "bg-emerald-400",
};

export function Dashboard({ initial }: { initial: AuditRun }) {
  const [run, setRun] = useState(initial);
  const [query, setQuery] = useState("");
  const [market, setMarket] = useState<"all" | "crypto" | "equity">("all");
  const [busy, setBusy] = useState<"refresh" | "reshuffle" | "tamper" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tamper, setTamper] = useState<IntegrityReport | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ record: CandidateRecord; bars: Bar[] } | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return run.records.filter((record) => {
      if (market !== "all" && record.market !== market) return false;
      const hay = `${record.symbol} ${record.name} ${record.sector} ${record.killGate ?? "passed"}`.toLowerCase();
      return hay.includes(query.trim().toLowerCase());
    });
  }, [run.records, market, query]);

  async function loadRun(path: string, init?: RequestInit) {
    const response = await fetch(path, init);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Request failed.");
    return payload;
  }

  async function refreshTape() {
    setBusy("refresh");
    setError(null);
    try {
      setRun(await loadRun("/api/audit/refresh", { method: "POST" }));
      setTamper(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed.");
    } finally {
      setBusy(null);
    }
  }

  async function reshuffle() {
    setBusy("reshuffle");
    setError(null);
    try {
      setRun(await loadRun("/api/audit/scan", { method: "POST", body: JSON.stringify({ seed: run.seed }) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reseal failed.");
    } finally {
      setBusy(null);
    }
  }

  async function injectTamper(mode: "kill-reason" | "bars") {
    setBusy("tamper");
    setError(null);
    try {
      const payload = await loadRun("/api/audit/tamper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      setTamper(payload.report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tamper lab failed.");
    } finally {
      setBusy(null);
    }
  }

  async function openCandidate(id: string) {
    setOpenId(id);
    setDetail(null);
    setDetailError(null);
    try {
      const payload = await loadRun(`/api/audit/candidate/${id}`);
      setDetail(payload);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Could not load sealed bars.");
    }
  }

  const pump = run.featured?.pump;
  const integrityOk = run.integrity.ok && !tamper;

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,oklch(0.22_0.02_80),transparent_32%)]">
      <header className="border-b border-border/80 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="font-mono text-[11px] tracking-[0.22em] text-muted-foreground uppercase">
              stack-attestation / v1 · seq-5
            </p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Sequential stack desk</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Every name is forced through trend → strength → participation → universe → acceleration.
              The desk reseals venue tape, replays the stack, and checks that each gate still occupies
              the role it was given. No synthetic OHLC.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={integrityOk ? "secondary" : "destructive"} className="h-7 px-3">
              {integrityOk ? (
                <CheckCircle2 data-icon="inline-start" />
              ) : (
                <ShieldAlert data-icon="inline-start" />
              )}
              {integrityOk ? "Attested" : "Contaminated"}
            </Badge>
            <Button variant="outline" size="sm" onClick={reshuffle} disabled={busy !== null}>
              {busy === "reshuffle" ? <LoaderCircle className="animate-spin" /> : <Shield />}
              Reseal book
            </Button>
            <Button size="sm" onClick={refreshTape} disabled={busy !== null}>
              {busy === "refresh" ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
              Mark to market
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
        {error ? (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>Venue request failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {pump ? <PumpCard run={run} onInspect={() => openCandidate("C-BTC-1D")} /> : null}

        <section className="grid gap-4 md:grid-cols-4">
          <Stat label="Names on tape" value={String(run.candidateCount)} hint={`${run.killedCount} killed · ${run.passedCount} cleared`} />
          <Stat
            label="BTC spot"
            value={pump ? `$${formatNumber(pump.last, 0)}` : "—"}
            hint={run.tape.spotTime ? `Coinbase ${run.tape.spotTime.slice(11, 19)} UTC` : run.tape.source}
          />
          <Stat
            label="Chain head"
            value={shortHash(run.chainHead)}
            hint={`run ${run.runId}`}
            mono
          />
          <Stat
            label="Contract"
            value={run.integrity.contractHeld ? "Holding" : "Drift"}
            hint={run.integrity.contractHeld ? "Kill shares still match intended roles." : "Live book has left a design band."}
          />
        </section>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>Kill chain</CardTitle>
            <CardDescription>
              First fail is the only fail. Later gates are SKIP, never rewritten. Shares are of the live book, not a synthetic fill.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex h-3 overflow-hidden rounded-full bg-muted">
              {run.funnel.map((row) => (
                <div
                  key={row.gateId}
                  className={cn(GATE_COLORS[row.gateId], "h-full")}
                  style={{ width: `${row.share * 100}%` }}
                  title={`${row.label} ${formatShare(row.share)}`}
                />
              ))}
              <div
                className="h-full bg-foreground/30"
                style={{ width: `${(run.passedCount / Math.max(run.candidateCount, 1)) * 100}%` }}
              />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Gate</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                  <TableHead className="hidden sm:table-cell">Role in a sequential stack</TableHead>
                  <TableHead className="text-right">Contract</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {run.funnel.map((row) => (
                  <TableRow key={row.gateId}>
                    <TableCell className="font-mono text-xs">
                      <span className={cn("mr-2 inline-block size-2 rounded-full", GATE_COLORS[row.gateId])} />
                      {row.label}
                    </TableCell>
                    <TableCell className="text-right font-mono">{row.count}</TableCell>
                    <TableCell className="text-right font-mono">{formatShare(row.share)}</TableCell>
                    <TableCell className="hidden max-w-xl text-muted-foreground sm:table-cell">
                      {row.role}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={row.inBand ? "secondary" : "destructive"}>
                        {row.inBand ? "in band" : "off"} {formatShare(row.targetShare)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Tabs defaultValue="ledger">
          <TabsList variant="line" className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="ledger">Ledger</TabsTrigger>
            <TabsTrigger value="integrity">Integrity</TabsTrigger>
            <TabsTrigger value="tamper">Tamper lab</TabsTrigger>
          </TabsList>

          <TabsContent value="ledger" className="space-y-4 pt-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter symbol, sector, or kill gate"
                className="sm:max-w-sm"
              />
              <div className="flex gap-2">
                {(["all", "crypto", "equity"] as const).map((value) => (
                  <Button
                    key={value}
                    size="sm"
                    variant={market === value ? "default" : "outline"}
                    onClick={() => setMarket(value)}
                  >
                    {value}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground sm:ml-auto">
                {filtered.length === 0
                  ? "No names match this filter."
                  : `${filtered.length} sealed records`}
              </p>
            </div>
            {filtered.length === 0 ? (
              <div className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                Nothing in the live book matches. Clear the filter or reseal the tape.
              </div>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="text-right">Last</TableHead>
                      <TableHead className="text-right">5d</TableHead>
                      <TableHead>Kill</TableHead>
                      <TableHead className="hidden md:table-cell">First-fail evidence</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((record) => {
                      const fail = record.evaluations.find((row) => row.status === "FAIL");
                      return (
                        <TableRow
                          key={record.candidateId}
                          className="cursor-pointer"
                          onClick={() => openCandidate(record.candidateId)}
                        >
                          <TableCell>
                            <div className="font-medium">{record.symbol}</div>
                            <div className="text-xs text-muted-foreground">
                              {record.name} · {record.market}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {record.last >= 1 ? formatNumber(record.last, 2) : record.last.toPrecision(4)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {record.chg5d == null ? "—" : formatPct(record.chg5d, 1)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={record.outcome === "PASSED" ? "secondary" : "outline"}>
                              {record.killGate ?? "PASSED"}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden max-w-md truncate text-muted-foreground md:table-cell">
                            {fail?.evidence.reason ?? "Cleared all five gates."}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="integrity" className="pt-4">
            <div className="grid gap-3">
              {run.integrity.checks.map((check) => (
                <Alert key={check.id} variant={check.severity === "fail" ? "destructive" : "default"}>
                  {check.severity === "fail" ? <AlertTriangle /> : <CheckCircle2 />}
                  <AlertTitle className="flex items-center gap-2">
                    {check.title}
                    <Badge variant={check.severity === "fail" ? "destructive" : "secondary"}>
                      {check.severity}
                    </Badge>
                  </AlertTitle>
                  <AlertDescription>{check.detail}</AlertDescription>
                </Alert>
              ))}
              <p className="font-mono text-xs text-muted-foreground">
                tape {run.tape.source} · fetched {run.tape.fetchedAt} · attestation{" "}
                {shortHash(run.attestationDigest, 16)}
              </p>
            </div>
          </TabsContent>

          <TabsContent value="tamper" className="space-y-4 pt-4">
            <Card>
              <CardHeader>
                <CardTitle>Break the seal on purpose</CardTitle>
                <CardDescription>
                  These mutations do not write the book. They prove the workflow notices when someone
                  rewrites a kill reason or edits a last print after attestation.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => injectTamper("kill-reason")} disabled={busy !== null}>
                  Overwrite a kill reason
                </Button>
                <Button variant="outline" onClick={() => injectTamper("bars")} disabled={busy !== null}>
                  Mutate a last close
                </Button>
                <Button variant="ghost" onClick={() => setTamper(null)}>
                  Clear
                </Button>
              </CardContent>
            </Card>
            {busy === "tamper" ? (
              <p className="text-sm text-muted-foreground">Replaying the contaminated payload…</p>
            ) : null}
            {tamper ? (
              <Alert variant="destructive">
                <ShieldAlert />
                <AlertTitle>Chain rejected the mutation</AlertTitle>
                <AlertDescription>
                  {tamper.checks
                    .filter((check) => check.severity === "fail")
                    .map((check) => check.detail)
                    .join(" ")}
                </AlertDescription>
              </Alert>
            ) : (
              <div className="rounded-xl border border-dashed px-4 py-8 text-sm text-muted-foreground">
                No contamination injected. The live run is still self-consistent.
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      <Sheet open={openId !== null} onOpenChange={(open) => !open && setOpenId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{detail?.record.symbol ?? openId}</SheetTitle>
            <SheetDescription>
              Sealed walkthrough. Metrics are taken only from bars at or before the as-of print.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-8">
            {detailError ? <p className="text-sm text-destructive">{detailError}</p> : null}
            {!detail && !detailError ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" /> Loading sealed bars…
              </p>
            ) : null}
            {detail ? <Inspector record={detail.record} bars={detail.bars} /> : null}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  mono,
}: {
  label: string;
  value: string;
  hint: string;
  mono?: boolean;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription className="font-mono text-[11px] tracking-[0.16em] uppercase">
          {label}
        </CardDescription>
        <CardTitle className={cn("text-xl", mono && "font-mono text-base")}>{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{hint}</CardContent>
    </Card>
  );
}

function PumpCard({ run, onInspect }: { run: AuditRun; onInspect: () => void }) {
  const featured = run.featured!;
  const pump = featured.pump;
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
              Live tape · Bitcoin pump
            </p>
            <CardTitle className="mt-1 text-2xl">
              BTC ${formatNumber(pump.last, 0)} · {pump.cleared75k ? "through $75,000" : "below $75,000"}
            </CardTitle>
            <CardDescription className="mt-2 max-w-2xl">
              From ${formatNumber(pump.weekAgo, 0)} a week ago to ${formatNumber(pump.last, 0)} now
              ({formatPct(pump.weekReturn, 1)}). The 14-day trough was ${formatNumber(pump.trough14d, 0)}
              ; the high printed ${formatNumber(pump.peak14d, 0)}. Giveback from that high is{" "}
              {formatPct(pump.givebackFromPeak, 2)}. The stack is scoring the marked-to-market daily
              bar, not a cartoon series.
            </CardDescription>
          </div>
          <Button variant="outline" onClick={onInspect}>
            <Activity />
            Open BTC seal
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 pt-4 md:grid-cols-2">
        <GateStrip title="Daily book (binding)" record={featured.daily} />
        <GateStrip
          title="Hourly pump window"
          record={featured.hourly}
          note={featured.hourlyNote}
        />
      </CardContent>
    </Card>
  );
}

function GateStrip({
  title,
  record,
  note,
}: {
  title: string;
  record: CandidateRecord | null;
  note?: string | null;
}) {
  if (!record) {
    return (
      <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
        Hourly window is not on this tape.
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        <Badge variant={record.outcome === "PASSED" ? "secondary" : "outline"}>
          {record.killGate ?? "PASSED"}
        </Badge>
      </div>
      <div className="grid grid-cols-5 gap-1">
        {record.evaluations.map((evaluation) => (
          <div key={evaluation.gateId} className="rounded-md bg-muted px-1 py-2 text-center">
            <div className="font-mono text-[10px] text-muted-foreground">{evaluation.gateId.split("_")[0]}</div>
            <div
              className={cn(
                "font-mono text-xs",
                evaluation.status === "PASS" && "text-emerald-400",
                evaluation.status === "FAIL" && "text-rose-400",
                evaluation.status === "SKIP" && "text-muted-foreground",
              )}
            >
              {evaluation.status}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {record.evaluations.find((row) => row.status === "FAIL")?.evidence.reason ??
          "Cleared the full sequential stack on venue tape."}
      </p>
      {note ? <p className="text-xs text-amber-400">{note}</p> : null}
    </div>
  );
}

function Inspector({ record, bars }: { record: CandidateRecord; bars: Bar[] }) {
  return (
    <div className="space-y-4">
      <Sparkline bars={bars} />
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Meta label="As of" value={record.asOf} />
        <Meta label="Tier" value={String(record.tier)} />
        <Meta label="Last" value={String(record.last)} />
        <Meta label="Bars" value={String(bars.length)} />
        <Meta label="Record" value={shortHash(record.recordDigest)} />
        <Meta label="Bars digest" value={shortHash(record.barsDigest)} />
      </div>
      <Separator />
      <div className="space-y-3">
        {record.evaluations.map((evaluation) => (
          <GateBlock key={evaluation.gateId} evaluation={evaluation} />
        ))}
      </div>
    </div>
  );
}

function GateBlock({ evaluation }: { evaluation: GateEvaluation }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-xs">{evaluation.gateId}</p>
        <Badge
          variant={
            evaluation.status === "FAIL"
              ? "destructive"
              : evaluation.status === "PASS"
                ? "secondary"
                : "outline"
          }
        >
          {evaluation.status}
        </Badge>
      </div>
      <p className="mt-1 text-sm">{evaluation.evidence.reason}</p>
      <pre className="mt-2 overflow-x-auto font-mono text-[11px] text-muted-foreground">
        {JSON.stringify(evaluation.evidence.metrics, null, 2)}
      </pre>
      <p className="mt-1 font-mono text-[10px] text-muted-foreground">
        eval {shortHash(evaluation.digest)}
      </p>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="font-mono">{value}</div>
    </div>
  );
}

function Sparkline({ bars }: { bars: Bar[] }) {
  const width = 480;
  const height = 96;
  const closes = bars.map((bar) => bar.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const points = closes
    .map((close, index) => {
      const x = (index / Math.max(closes.length - 1, 1)) * width;
      const y = height - ((close - min) / (max - min || 1)) * (height - 8) - 4;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-24 w-full text-foreground">
      <polyline fill="none" stroke="currentColor" strokeWidth="2" points={points} />
    </svg>
  );
}
