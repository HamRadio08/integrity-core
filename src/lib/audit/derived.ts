import { contractFor } from "./config";
import type {
  AuditRun,
  CandidateRecord,
  CheckSeverity,
  ContractWatch,
  DeskSnapshot,
  Freshness,
  FreshnessSeverity,
  FunnelRow,
  GateId,
  IntegrityReport,
  MemeRung,
  PnlBucket,
  StrategyBucketId,
  TapeInfo,
} from "./types";
import { GATE_IDS } from "./types";

export const TAPE_WATCH_MS = 36 * 60 * 60 * 1000;
export const TAPE_FAIL_MS = 72 * 60 * 60 * 1000;

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function returnsOf(records: CandidateRecord[], key: "chg5d" | "chg20d"): number[] {
  return records
    .map((record) => record[key])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function bucketFrom(id: StrategyBucketId, label: string, records: CandidateRecord[], total: number): PnlBucket {
  const chg5d = returnsOf(records, "chg5d");
  const chg20d = returnsOf(records, "chg20d");
  return {
    id,
    label,
    count: records.length,
    share: total === 0 ? 0 : records.length / total,
    meanChg5d: mean(chg5d),
    medianChg5d: median(chg5d),
    meanChg20d: mean(chg20d),
    breadth5d: chg5d.length === 0 ? null : chg5d.filter((value) => value > 0).length / chg5d.length,
    sample5d: chg5d.length,
  };
}

export function buildPnlByStrategy(records: CandidateRecord[]): PnlBucket[] {
  const total = records.length;
  const buckets: PnlBucket[] = [bucketFrom("BOOK", "Whole book", records, total)];
  buckets.push(
    bucketFrom(
      "PASSED",
      "PASSED (cleared stack)",
      records.filter((record) => record.outcome === "PASSED"),
      total,
    ),
  );
  for (const gateId of GATE_IDS) {
    buckets.push(
      bucketFrom(
        gateId,
        `${contractFor(gateId).label} kills`,
        records.filter((record) => record.killGate === gateId),
        total,
      ),
    );
  }
  return buckets;
}

export function buildMemeLadder(records: CandidateRecord[]): MemeRung[] {
  return records
    .filter((record) => record.sector.toLowerCase() === "meme")
    .slice()
    .sort((a, b) => (b.chg5d ?? Number.NEGATIVE_INFINITY) - (a.chg5d ?? Number.NEGATIVE_INFINITY))
    .map((record, index) => {
      const fail = record.evaluations.find((evaluation) => evaluation.status === "FAIL");
      return {
        rank: index + 1,
        candidateId: record.candidateId,
        symbol: record.symbol,
        name: record.name,
        last: record.last,
        chg5d: record.chg5d,
        chg20d: record.chg20d,
        outcome: record.outcome,
        killGate: record.killGate,
        reason: fail?.evidence.reason ?? (record.outcome === "PASSED" ? "Cleared all five gates." : null),
      };
    });
}

export function buildFreshness(tape: TapeInfo, nowMs = Date.now()): Freshness {
  const fetched = Date.parse(tape.fetchedAt);
  const tapeAgeMs = Number.isFinite(fetched) ? nowMs - fetched : Number.POSITIVE_INFINITY;
  let severity: FreshnessSeverity = "ok";
  if (tapeAgeMs > TAPE_FAIL_MS) severity = "fail";
  else if (tapeAgeMs > TAPE_WATCH_MS) severity = "watch";
  const hours = tapeAgeMs / 3_600_000;
  const age =
    Number.isFinite(hours) && hours < 1000
      ? `${hours.toFixed(1)}h since the last sealed Yahoo OHLC pull`
      : "tape fetch time is missing or unreadable";
  const detail =
    severity === "ok"
      ? `Tape is fresh (${age}). Spot overlay is ${tape.spotTime ?? "unset"}.`
      : severity === "watch"
        ? `Tape is aging (${age}). Daily bars can still bind; mark-to-market spots independently.`
        : `Tape is stale (${age}). Fail-closed: treat OHLC as historical until the book is resealed from venue tape.`;
  return {
    tapeFetchedAt: tape.fetchedAt,
    tapeAgeMs: Number.isFinite(tapeAgeMs) ? tapeAgeMs : Number.POSITIVE_INFINITY,
    spotTime: tape.spotTime,
    source: tape.source,
    severity,
    detail,
  };
}

export function buildWatches(input: {
  funnel: FunnelRow[];
  integrity: IntegrityReport;
  freshness: Freshness;
}): ContractWatch[] {
  const watches: ContractWatch[] = [];
  if (input.freshness.severity !== "ok") {
    watches.push({
      id: "tape-freshness",
      title: input.freshness.severity === "fail" ? "Stale tape" : "Aging tape",
      severity: input.freshness.severity === "fail" ? "fail" : "warn",
      detail: input.freshness.detail,
    });
  }
  for (const row of input.funnel) {
    if (row.inBand) continue;
    watches.push({
      id: `contract-${row.gateId}`,
      title: `${row.label} off contract`,
      severity: "warn",
      detail: `${row.label} is killing ${row.count} names (${(row.share * 100).toFixed(1)}%) vs band ${(row.band[0] * 100).toFixed(0)}–${(row.band[1] * 100).toFixed(0)}%. Watch, not a broken seal.`,
      gateId: row.gateId as GateId,
    });
  }
  for (const check of input.integrity.checks) {
    if (check.severity === "pass") continue;
    watches.push({
      id: `integrity-${check.id}`,
      title: check.title,
      severity: check.severity as CheckSeverity,
      detail: check.detail,
    });
  }
  return watches;
}

export function buildDesk(
  run: Pick<AuditRun, "records" | "funnel" | "tape" | "integrity">,
  nowMs = Date.now(),
): DeskSnapshot {
  const freshness = buildFreshness(run.tape, nowMs);
  return {
    measuredAt: run.tape.spotTime ?? run.tape.fetchedAt,
    freshness,
    pnlByStrategy: buildPnlByStrategy(run.records),
    memeLadder: buildMemeLadder(run.records),
    watches: buildWatches({ funnel: run.funnel, integrity: run.integrity, freshness }),
  };
}
