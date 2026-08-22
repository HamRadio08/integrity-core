import { contractFor, gateOrder, ROLE_CONTRACTS } from "./config";
import { digestBars, digestConfig, replayRecord } from "./engine";
import { digestOf, GENESIS } from "./hash";
import type {
  AuditRun,
  Bar,
  Candidate,
  CandidateRecord,
  FunnelRow,
  GateId,
  IntegrityCheck,
  IntegrityReport,
  StackConfig,
} from "./types";
import { GATE_IDS } from "./types";

function finiteMetrics(record: CandidateRecord): boolean {
  return record.evaluations.every((evaluation) =>
    Object.values(evaluation.evidence.metrics).every((value) => {
      if (typeof value !== "number") return true;
      return Number.isFinite(value);
    }),
  );
}

function sequentialOk(record: CandidateRecord): boolean {
  let failed = false;
  let firstFail: GateId | null = null;
  for (const evaluation of record.evaluations) {
    if (!failed) {
      if (evaluation.status === "SKIP") return false;
      if (evaluation.status === "FAIL") {
        failed = true;
        firstFail = evaluation.gateId;
      }
    } else if (evaluation.status !== "SKIP") {
      return false;
    }
  }
  if (record.killGate !== firstFail) return false;
  if (record.outcome !== (firstFail ? "KILLED" : "PASSED")) return false;
  return true;
}

export function buildFunnel(records: CandidateRecord[]): FunnelRow[] {
  const total = records.length || 1;
  return ROLE_CONTRACTS.map((contract) => {
    const count = records.filter((record) => record.killGate === contract.gateId).length;
    const share = count / total;
    return {
      gateId: contract.gateId,
      label: contract.label,
      count,
      share,
      role: contract.role,
      targetShare: contract.targetShare,
      band: contract.band,
      inBand: share >= contract.band[0] && share <= contract.band[1],
    };
  });
}

export function attestRun(input: {
  records: CandidateRecord[];
  config: StackConfig;
  seed: number;
  startedAt: string;
  genesisDigest?: string;
}): Pick<
  AuditRun,
  | "runId"
  | "configDigest"
  | "genesisDigest"
  | "chainHead"
  | "attestationDigest"
  | "candidateCount"
  | "passedCount"
  | "killedCount"
> {
  const genesisDigest = input.genesisDigest ?? GENESIS;
  const configDigest = digestConfig(input.config);
  const chainHead = input.records.at(-1)?.recordDigest ?? genesisDigest;
  const candidateCount = input.records.length;
  const passedCount = input.records.filter((record) => record.outcome === "PASSED").length;
  const killedCount = candidateCount - passedCount;
  const funnelCounts = Object.fromEntries(
    GATE_IDS.map((gateId) => [
      gateId,
      input.records.filter((record) => record.killGate === gateId).length,
    ]),
  );

  const runId = digestOf({
    protocol: "stack-attestation/v1",
    seed: input.seed,
    startedAt: input.startedAt,
    configDigest,
  }).slice(0, 16);

  const attestationDigest = digestOf({
    protocol: "stack-attestation/v1",
    runId,
    seed: input.seed,
    configDigest,
    genesisDigest,
    chainHead,
    candidateCount,
    passedCount,
    killedCount,
    funnelCounts,
  });

  return {
    runId,
    configDigest,
    genesisDigest,
    chainHead,
    attestationDigest,
    candidateCount,
    passedCount,
    killedCount,
  };
}

export function verifyIntegrity(input: {
  records: CandidateRecord[];
  config: StackConfig;
  barsByCandidate?: Record<string, Bar[]>;
  genesisDigest?: string;
  expectedConfigDigest?: string;
  expectedAttestation?: string;
  seed?: number;
  startedAt?: string;
}): IntegrityReport {
  const checks: IntegrityCheck[] = [];
  const genesisDigest = input.genesisDigest ?? GENESIS;
  const order = gateOrder();

  const chainBreaks: number[] = [];
  input.records.forEach((record, index) => {
    const expectedPrev = index === 0 ? genesisDigest : input.records[index - 1].recordDigest;
    if (record.prevDigest !== expectedPrev) chainBreaks.push(index);
    const { recordDigest, ...body } = record;
    if (digestOf(body) !== recordDigest) chainBreaks.push(index);
  });
  const uniqueBreaks = [...new Set(chainBreaks)];
  checks.push({
    id: "hash-chain",
    title: "Hash chain is contiguous and self-consistent",
    severity: uniqueBreaks.length === 0 ? "pass" : "fail",
    detail:
      uniqueBreaks.length === 0
        ? `All ${input.records.length} records reseal to their claimed digest and point at the prior link.`
        : `Chain break at record index ${uniqueBreaks.join(", ")}. Treat the run as contaminated.`,
  });

  const shortCircuitFails = input.records.filter((record) => !sequentialOk(record));
  checks.push({
    id: "short-circuit",
    title: "Sequential short-circuit and kill attribution",
    severity: shortCircuitFails.length === 0 ? "pass" : "fail",
    detail:
      shortCircuitFails.length === 0
        ? "Later gates are SKIP after the first FAIL. killGate is always that first FAIL."
        : `${shortCircuitFails.length} records ran a later gate after a fail, or mis-attributed the kill.`,
  });

  const orderFails = input.records.filter(
    (record) =>
      record.evaluations.length !== order.length ||
      record.evaluations.some((evaluation, index) => evaluation.gateId !== order[index] || evaluation.order !== index),
  );
  checks.push({
    id: "gate-order",
    title: "Declared gate order is the order that ran",
    severity: orderFails.length === 0 ? "pass" : "fail",
    detail:
      orderFails.length === 0
        ? `Every record evaluates ${order.join(" → ")}.`
        : `${orderFails.length} records executed gates out of spec order.`,
  });

  const nanFails = input.records.filter((record) => !finiteMetrics(record));
  checks.push({
    id: "finite-metrics",
    title: "No NaN or Inf leaked into sealed evidence",
    severity: nanFails.length === 0 ? "pass" : "fail",
    detail:
      nanFails.length === 0
        ? "Every sealed metric is finite or an explicit null."
        : `${nanFails.length} records contain non-finite evidence.`,
  });

  const configDigest = digestConfig(input.config);
  const configFails = input.records.filter((record) => record.configDigest !== configDigest);
  const expectedMismatch =
    input.expectedConfigDigest && input.expectedConfigDigest !== configDigest;
  checks.push({
    id: "config-binding",
    title: "Every record is bound to this run's config digest",
    severity: configFails.length === 0 && !expectedMismatch ? "pass" : "fail",
    detail: expectedMismatch
      ? "Supplied config does not match the digest the run claimed."
      : configFails.length === 0
        ? `Config ${configDigest.slice(0, 12)} is bound across the book.`
        : `${configFails.length} records were sealed under a different config.`,
  });

  let replayMatched = true;
  if (input.barsByCandidate) {
    const replayFails: string[] = [];
    for (const record of input.records) {
      const bars = input.barsByCandidate[record.candidateId];
      if (!bars) {
        replayFails.push(record.candidateId);
        continue;
      }
      if (digestBars(bars) !== record.barsDigest) {
        replayFails.push(record.candidateId);
        continue;
      }
      const candidate: Candidate = {
        id: record.candidateId,
        symbol: record.symbol,
        name: record.name,
        sector: record.sector,
        market: record.market,
        tier: record.tier as 1 | 2 | 3 | 4,
        asOf: record.asOf,
        origin: "live-tape",
        intendedKill: record.intendedKill,
        last: record.last,
        chg5d: record.chg5d,
        chg20d: record.chg20d,
        bars,
      };
      const replayed = replayRecord(candidate, input.config, record.prevDigest, record.index);
      if (replayed !== record.recordDigest) replayFails.push(record.candidateId);
    }
    replayMatched = replayFails.length === 0;
    checks.push({
      id: "replay",
      title: "Replay of sealed bars reproduces every record digest",
      severity: replayMatched ? "pass" : "fail",
      detail: replayMatched
        ? "Same bars + same config + same prior link mint the same digest. The stack is deterministic."
        : `Replay mismatch on ${replayFails.slice(0, 8).join(", ")}${replayFails.length > 8 ? "…" : ""}.`,
    });
  } else {
    checks.push({
      id: "replay",
      title: "Replay of sealed bars reproduces every record digest",
      severity: "warn",
      detail: "Bars were not supplied. Chain and attribution were checked; full replay is pending.",
    });
    replayMatched = false;
  }

  const funnel = buildFunnel(input.records);
  const bandFails = funnel.filter((row) => !row.inBand);
  const coarse = funnel.find((row) => row.gateId === "trend_sep");
  const laterMax = Math.max(
    ...funnel.filter((row) => row.gateId !== "trend_sep").map((row) => row.count),
  );
  const roleOrderOk = coarse ? coarse.count >= laterMax : false;
  const tier = funnel.find((row) => row.gateId === "tier_reject");
  const tierDominates = tier ? tier.share > 0.15 : false;

  const inverted = !roleOrderOk || tierDominates;
  const contractHeld = bandFails.length === 0 && !inverted;
  checks.push({
    id: "role-contract",
    title: "Kill shares still match each gate's intended role",
    severity: inverted ? "fail" : bandFails.length ? "warn" : "pass",
    detail: contractHeld
      ? "trend_sep remains the coarse filter, tier_reject stays a quality screen, accel_gate stays last-mile."
      : [
          ...bandFails.map((row) => {
            const contract = contractFor(row.gateId);
            return `${row.gateId} share ${(row.share * 100).toFixed(1)}% is outside ${(contract.band[0] * 100).toFixed(0)}–${(contract.band[1] * 100).toFixed(0)}%.`;
          }),
          roleOrderOk ? null : "A later gate is killing more names than trend_sep — the stack is no longer coarse-to-fine.",
          tierDominates ? "tier_reject is wiping the book. Universe screen has taken over the strategy." : null,
          inverted ? null : "Seal is intact; this is live-tape drift against the design contract, not a broken chain.",
        ]
          .filter(Boolean)
          .join(" "),
  });

  if (input.seed !== undefined && input.startedAt) {
    const claimed = attestRun({
      records: input.records,
      config: input.config,
      seed: input.seed,
      startedAt: input.startedAt,
      genesisDigest,
    });
    if (input.expectedAttestation && input.expectedAttestation !== claimed.attestationDigest) {
      checks.push({
        id: "attestation",
        title: "Run attestation digest matches the sealed payload",
        severity: "fail",
        detail: "The attestation digest no longer matches counts, chain head, and config.",
      });
    } else {
      checks.push({
        id: "attestation",
        title: "Run attestation digest matches the sealed payload",
        severity: "pass",
        detail: `Attestation ${claimed.attestationDigest.slice(0, 12)} reseals from the live payload.`,
      });
    }
  }

  const tamperDetected = checks.some(
    (check) =>
      check.severity === "fail" &&
      (check.id === "hash-chain" || check.id === "replay" || check.id === "attestation"),
  );
  const ok = checks.every((check) => check.severity !== "fail");

  return {
    ok,
    tamperDetected,
    replayMatched,
    contractHeld,
    checks,
  };
}
