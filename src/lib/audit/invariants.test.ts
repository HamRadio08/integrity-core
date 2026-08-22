import { describe, expect, it } from "vitest";
import { STACK_CONFIG } from "./config";
import { getDemoBundle } from "./run";
import { verifyIntegrity } from "./invariants";
import type { CandidateRecord, GateId } from "./types";

function misattribute(record: CandidateRecord): CandidateRecord {
  const fake: GateId = record.killGate === "trend_sep" ? "accel_gate" : "trend_sep";
  return { ...record, killGate: fake, outcome: "KILLED" };
}

describe("forensic invariants", () => {
  it("attests the live book: chain and replay hold on venue tape", () => {
    const bundle = getDemoBundle();
    expect(bundle.records.length).toBeGreaterThan(50);
    expect(bundle.tape.spotBtc).toBeGreaterThan(75_000);
    expect(bundle.featured?.pump.cleared75k).toBe(true);
    expect(bundle.integrity.ok).toBe(true);
    expect(bundle.integrity.replayMatched).toBe(true);
    expect(bundle.integrity.tamperDetected).toBe(false);
    expect(bundle.integrity.checks.find((check) => check.id === "hash-chain")?.severity).toBe("pass");
    expect(bundle.integrity.checks.find((check) => check.id === "short-circuit")?.severity).toBe(
      "pass",
    );
  });

  it("detects a post-seal kill-reason overwrite", () => {
    const bundle = getDemoBundle();
    const poisoned = bundle.records.map((record, index) =>
      index === 3 ? misattribute(record) : record,
    );
    const report = verifyIntegrity({
      records: poisoned,
      config: STACK_CONFIG,
      barsByCandidate: bundle.barsByCandidate,
      genesisDigest: bundle.genesisDigest,
      seed: bundle.seed,
      startedAt: bundle.startedAt,
      expectedAttestation: bundle.attestationDigest,
    });
    expect(report.ok).toBe(false);
    expect(report.tamperDetected).toBe(true);
    expect(report.checks.find((check) => check.id === "hash-chain")?.severity).toBe("fail");
  });

  it("detects a quiet last-print mutation on a live name", () => {
    const bundle = getDemoBundle();
    const target = bundle.records.find((record) => record.symbol === "BTC") ?? bundle.records[0];
    const bars = bundle.barsByCandidate[target.candidateId].map((bar, index, all) =>
      index === all.length - 1 ? { ...bar, close: bar.close * 0.5, low: bar.close * 0.5 } : bar,
    );
    const report = verifyIntegrity({
      records: bundle.records,
      config: STACK_CONFIG,
      barsByCandidate: { ...bundle.barsByCandidate, [target.candidateId]: bars },
      genesisDigest: bundle.genesisDigest,
      seed: bundle.seed,
      startedAt: bundle.startedAt,
      expectedAttestation: bundle.attestationDigest,
    });
    expect(report.ok).toBe(false);
    expect(report.checks.find((check) => check.id === "replay")?.severity).toBe("fail");
  });
});
