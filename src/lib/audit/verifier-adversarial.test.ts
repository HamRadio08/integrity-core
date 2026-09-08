import { describe, expect, it } from "vitest";
import { STACK_CONFIG } from "./config";
import { digestOf, sha256Hex } from "./hash";
import { attestRun, verifyIntegrity } from "./invariants";
import { getDemoBundle } from "./run";
import type { CandidateRecord } from "./types";

// Adversarial probes against the verifier itself.
//
// Every test below started as a payload that verifyIntegrity graded GREEN while proving
// nothing (2026-09-04 system integrity audit). The invariants that catch them are cheap; what
// was expensive was that the report SAID the check had happened. A verifier that reports a
// pass it did not earn is worse than one that reports nothing, because the desk renders it.
//
// `reseal` is the attacker's tool, not the desk's: it takes a book, optionally rewrites sealed
// fields, and re-links the whole chain so that every digest is internally perfect again. That
// is the shape these checks have to survive — the naive "does it hash to what it claims?"
// question answers YES on all of it.
function reseal(
  records: CandidateRecord[],
  genesis: string,
  mutate?: (record: CandidateRecord, index: number) => Partial<CandidateRecord>,
): CandidateRecord[] {
  let prev = genesis;
  return records.map((record, index) => {
    const { recordDigest: _drop, ...body } = record;
    const next = { ...body, ...(mutate?.(record, index) ?? {}), prevDigest: prev };
    const sealed = { ...next, recordDigest: digestOf(next) } as CandidateRecord;
    prev = sealed.recordDigest;
    return sealed;
  });
}

const severityOf = (report: ReturnType<typeof verifyIntegrity>, id: string) =>
  report.checks.find((check) => check.id === id)?.severity;

describe("verifier: the honest path is unchanged", () => {
  it("still grades the desk's own complete call fully green", () => {
    const bundle = getDemoBundle();
    const report = verifyIntegrity({
      records: bundle.records,
      config: bundle.config,
      barsByCandidate: bundle.barsByCandidate,
      genesisDigest: bundle.genesisDigest,
      expectedConfigDigest: bundle.configDigest,
      expectedAttestation: bundle.attestationDigest,
      seed: bundle.seed,
      startedAt: bundle.startedAt,
    });
    expect(report.ok).toBe(true);
    expect(report.tamperDetected).toBe(false);
    expect(severityOf(report, "genesis-root")).toBe("pass");
    expect(severityOf(report, "book-populated")).toBe("pass");
    expect(severityOf(report, "record-position")).toBe("pass");
    expect(severityOf(report, "attestation")).toBe("pass");
  });
});

describe("verifier: an unclaimed attestation is not a matched one", () => {
  it("warns rather than reporting a pass when no attestation digest was submitted", () => {
    // POST /api/audit/verify forwards run.attestationDigest, and validateVerifyPayload does not
    // require it. Omitting it used to yield "Attestation <x> reseals from the live payload" —
    // where <x> was a digest the verifier had just computed from the caller's own input.
    const bundle = getDemoBundle();
    const report = verifyIntegrity({
      records: bundle.records,
      config: bundle.config,
      barsByCandidate: bundle.barsByCandidate,
      genesisDigest: bundle.genesisDigest,
      seed: bundle.seed,
      startedAt: bundle.startedAt,
    });
    expect(severityOf(report, "attestation")).toBe("warn");
    expect(report.checks.find((check) => check.id === "attestation")?.detail).toContain(
      "nothing was compared",
    );
  });

  it("still fails a submitted attestation that does not match", () => {
    const bundle = getDemoBundle();
    const report = verifyIntegrity({
      records: bundle.records,
      config: bundle.config,
      barsByCandidate: bundle.barsByCandidate,
      genesisDigest: bundle.genesisDigest,
      expectedAttestation: sha256Hex("forged"),
      seed: bundle.seed,
      startedAt: bundle.startedAt,
    });
    expect(report.ok).toBe(false);
    expect(report.tamperDetected).toBe(true);
    expect(severityOf(report, "attestation")).toBe("fail");
  });

  it("emits an attestation row even when seed and startedAt are missing", () => {
    // Previously the whole block was skipped and the report simply had no attestation row —
    // a silent absence the desk cannot render and a reader cannot notice.
    const bundle = getDemoBundle();
    const report = verifyIntegrity({
      records: bundle.records,
      config: bundle.config,
      genesisDigest: bundle.genesisDigest,
    });
    expect(severityOf(report, "attestation")).toBe("warn");
  });
});

describe("verifier: an empty book is not a verified one", () => {
  it("refuses a payload with no records instead of passing every check vacuously", () => {
    const bundle = getDemoBundle();
    const report = verifyIntegrity({
      records: [],
      config: bundle.config,
      barsByCandidate: {},
      genesisDigest: bundle.genesisDigest,
      expectedConfigDigest: bundle.configDigest,
      expectedAttestation: attestRun({
        records: [],
        config: bundle.config,
        seed: bundle.seed,
        startedAt: bundle.startedAt,
        genesisDigest: bundle.genesisDigest,
      }).attestationDigest,
      seed: bundle.seed,
      startedAt: bundle.startedAt,
    });
    expect(report.ok).toBe(false);
    expect(severityOf(report, "book-populated")).toBe("fail");
    // The point of the finding: everything else was, and still is, vacuously true.
    expect(severityOf(report, "hash-chain")).toBe("pass");
  });
});

describe("verifier: internal consistency is not provenance", () => {
  it("refuses a book resealed from a root of the caller's choosing", () => {
    const bundle = getDemoBundle();
    const forgedGenesis = sha256Hex("attacker/genesis");
    const records = reseal(bundle.records, forgedGenesis);
    const attested = attestRun({
      records,
      config: STACK_CONFIG,
      seed: 999,
      startedAt: "2020-01-01T00:00:00Z",
      genesisDigest: forgedGenesis,
    });
    const report = verifyIntegrity({
      records,
      config: STACK_CONFIG,
      genesisDigest: forgedGenesis,
      expectedConfigDigest: attested.configDigest,
      expectedAttestation: attested.attestationDigest,
      seed: 999,
      startedAt: "2020-01-01T00:00:00Z",
    });
    expect(report.ok).toBe(false);
    expect(report.tamperDetected).toBe(true);
    expect(severityOf(report, "genesis-root")).toBe("fail");
    // The whole point: the forged chain is internally flawless. Only the root gives it away.
    expect(severityOf(report, "hash-chain")).toBe("pass");
    expect(severityOf(report, "attestation")).toBe("pass");
  });
});

describe("verifier: sealed position is checked without bars", () => {
  it("catches a re-indexed book on the bars-free payload the API actually hands out", () => {
    // publicRun strips barsByCandidate, so the run a client gets from GET /api/audit and can
    // POST back to /api/audit/verify has no bars — which means replay (the only thing that ever
    // read record.index) degrades to a warn and the rewrite goes unseen.
    const bundle = getDemoBundle();
    const records = reseal(bundle.records, bundle.genesisDigest, () => ({ index: 0 }));
    const attested = attestRun({
      records,
      config: bundle.config,
      seed: bundle.seed,
      startedAt: bundle.startedAt,
      genesisDigest: bundle.genesisDigest,
    });
    const report = verifyIntegrity({
      records,
      config: bundle.config,
      genesisDigest: bundle.genesisDigest,
      expectedConfigDigest: bundle.configDigest,
      expectedAttestation: attested.attestationDigest,
      seed: bundle.seed,
      startedAt: bundle.startedAt,
    });
    expect(report.ok).toBe(false);
    expect(report.tamperDetected).toBe(true);
    expect(severityOf(report, "record-position")).toBe("fail");
    expect(severityOf(report, "hash-chain")).toBe("pass");
    expect(severityOf(report, "replay")).toBe("warn");
  });
});
