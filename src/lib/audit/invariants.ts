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

  // A chain is only worth as much as the root it hangs from. Every honest producer here seals
  // against the one protocol constant (`sealUniverse` defaults to it, run.ts passes it
  // explicitly), but POST /api/audit/verify forwards `run.genesisDigest` straight out of the
  // request body — so a caller could reseal a wholly fabricated book from a root of their own
  // and every check below would agree with it, green. Internal consistency is not provenance,
  // and this is the check that refuses to conflate them.
  const rootIsProtocol = genesisDigest === GENESIS;
  checks.push({
    id: "genesis-root",
    title: "Chain is rooted in the protocol genesis",
    severity: rootIsProtocol ? "pass" : "fail",
    detail: rootIsProtocol
      ? `Rooted at the stack-attestation/v1 genesis ${GENESIS.slice(0, 12)}.`
      : `Rooted at ${genesisDigest.slice(0, 12)}, not the protocol genesis ${GENESIS.slice(0, 12)}. A self-consistent chain grown from a caller-chosen root proves only that the payload agrees with itself.`,
  });

  // The other way a verifier lies is by vacuous truth: with no records every check below passes
  // for want of anything to test ("All 0 records reseal to their claimed digest") and an empty
  // payload comes back fully green.
  const bookPopulated = input.records.length > 0;
  checks.push({
    id: "book-populated",
    title: "There is a book to attest",
    severity: bookPopulated ? "pass" : "fail",
    detail: bookPopulated
      ? `${input.records.length} sealed records submitted for verification.`
      : "No records were submitted. Every check below is vacuously true; an empty payload is not a verified run.",
  });

  const chainBreaks: number[] = [];
  input.records.forEach((record, index) => {
    const expectedPrev = index === 0 ? genesisDigest : input.records[index - 1].recordDigest;
    if (record.prevDigest !== expectedPrev) chainBreaks.push(index);
    const { recordDigest, ...body } = record;
    // A stored record carrying a non-finite metric makes digestOf throw (NonFiniteSealError).
    // The verifier's job is to REPORT a contaminated record, never to die on one — a crash
    // here would take down the whole report and hide every other finding in the run.
    try {
      if (digestOf(body) !== recordDigest) chainBreaks.push(index);
    } catch {
      chainBreaks.push(index);
    }
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

  // `index` is sealed INSIDE the record body, so a book whose positions were rewritten and then
  // re-linked reseals cleanly and the chain check cannot see it. Replay can — it feeds
  // record.index back into sealRecord — but replay needs bars, and the run GET /api/audit hands
  // out has them stripped by publicRun. So on the payload shape that actually round-trips
  // through the API, position was checked by nothing. This is the bars-free positional check.
  const positionBreaks = input.records
    .map((record, index) => (record.index === index ? null : index))
    .filter((index): index is number => index !== null);
  checks.push({
    id: "record-position",
    title: "Sealed index matches position in the chain",
    severity: positionBreaks.length === 0 ? "pass" : "fail",
    detail:
      positionBreaks.length === 0
        ? "Every record's sealed index is its position in the submitted order."
        : `${positionBreaks.length} records carry a sealed index that is not their position (first at ${positionBreaks[0]}). The book was reordered or re-indexed after sealing.`,
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
  // trend_sep is the coarse regime filter and must stay the dominant screen. It no longer
  // runs first (tier_reject does), so this compares it against every OTHER gate rather than
  // against "later" ones — position in the stack is irrelevant to the claim being made.
  const coarse = funnel.find((row) => row.gateId === "trend_sep");
  const otherMax = Math.max(
    ...funnel.filter((row) => row.gateId !== "trend_sep").map((row) => row.count),
  );
  const roleOrderOk = coarse ? coarse.count >= otherMax : false;
  // Live only since tier_reject was front-loaded. Fourth in the stack its reach was bounded
  // by whatever survived three signal gates — 8 of 117 on the committed tape, a 6.8% ceiling
  // — so `share > 0.15` was unreachable by construction and this check could never fire.
  // Screening the whole book, tier_reject can now actually take the strategy over, and this
  // is the tripwire that says so.
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
          roleOrderOk ? null : "Another gate is killing more names than trend_sep — the coarse regime filter is no longer the dominant screen.",
          tierDominates ? "tier_reject is wiping the book. Universe screen has taken over the strategy." : null,
          inverted ? null : "Seal is intact; this is live-tape drift against the design contract, not a broken chain.",
        ]
          .filter(Boolean)
          .join(" "),
  });

  // Three outcomes, not two. The old shape collapsed "no digest was claimed" into the pass
  // branch, so a payload that simply omitted `attestationDigest` was told "Attestation <x>
  // reseals from the live payload" — a match against nothing, printing back a digest the
  // verifier had just computed from the caller's own input. `replay` already models the
  // missing-input case as a warn; attestation now agrees with it.
  const attestationTitle = "Run attestation digest matches the sealed payload";
  if (input.seed !== undefined && input.startedAt) {
    const claimed = attestRun({
      records: input.records,
      config: input.config,
      seed: input.seed,
      startedAt: input.startedAt,
      genesisDigest,
    });
    if (!input.expectedAttestation) {
      checks.push({
        id: "attestation",
        title: attestationTitle,
        severity: "warn",
        detail: `No attestation digest was submitted, so nothing was compared. The payload recomputes to ${claimed.attestationDigest.slice(0, 12)} — a restatement of the input, not a match against a claim.`,
      });
    } else if (input.expectedAttestation !== claimed.attestationDigest) {
      checks.push({
        id: "attestation",
        title: attestationTitle,
        severity: "fail",
        detail: "The attestation digest no longer matches counts, chain head, and config.",
      });
    } else {
      checks.push({
        id: "attestation",
        title: attestationTitle,
        severity: "pass",
        detail: `Attestation ${claimed.attestationDigest.slice(0, 12)} reseals from the live payload.`,
      });
    }
  } else {
    checks.push({
      id: "attestation",
      title: attestationTitle,
      severity: "warn",
      detail: "Payload carried no seed/startedAt, so the run attestation could not be recomputed at all.",
    });
  }

  const tamperDetected = checks.some(
    (check) =>
      check.severity === "fail" &&
      (check.id === "hash-chain" ||
        check.id === "replay" ||
        check.id === "attestation" ||
        check.id === "genesis-root" ||
        check.id === "record-position"),
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
