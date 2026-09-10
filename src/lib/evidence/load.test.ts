import { describe, expect, it } from "vitest";

import { LEDGER_SCHEMA_VERSION, LedgerError, loadLedger, parseLedger } from "./load";

const ledger = loadLedger();

/** A deep clone the tests can corrupt without leaking into the next case. */
function draft() {
  return JSON.parse(JSON.stringify(ledger)) as Record<string, unknown>;
}

describe("shipped ledger", () => {
  it("loads and validates", () => {
    expect(ledger.schemaVersion).toBe(LEDGER_SCHEMA_VERSION);
  });

  it("is not vacuous — every section carries entries", () => {
    expect(ledger.gates.length).toBeGreaterThan(0);
    expect(ledger.corrections.length).toBeGreaterThan(0);
    expect(ledger.audits.length).toBeGreaterThan(0);
  });

  it("reproduces every gate arm from its own counts", () => {
    const arms = ledger.gates.flatMap((gate) => gate.arms);
    expect(arms.length).toBeGreaterThan(0);
    for (const arm of arms) {
      expect(arm.numerator / arm.denominator).toBeCloseTo(arm.point, 3);
      expect(arm.point).toBeGreaterThanOrEqual(arm.ci95[0]);
      expect(arm.point).toBeLessThanOrEqual(arm.ci95[1]);
    }
  });

  it("gives every closed entry the condition that would reopen it", () => {
    const entries = [...ledger.gates, ...ledger.corrections, ...ledger.audits];
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.reopenCondition.trim().length).toBeGreaterThan(0);
    }
  });

  it("states a verdict against the gate that every arm actually misses", () => {
    for (const gate of ledger.gates) {
      for (const arm of gate.arms) {
        const clears =
          gate.gate.direction === "below"
            ? arm.ci95[1] < gate.gate.threshold
            : arm.ci95[0] > gate.gate.threshold;
        expect(arm.verdict === "PASS").toBe(clears);
      }
    }
  });
});

describe("parseLedger refusals", () => {
  it("refuses an empty ledger rather than rendering it as a clean one", () => {
    const empty = { ...draft(), gates: [], corrections: [], audits: [] };
    expect(() => parseLedger(empty)).toThrow(LedgerError);
    expect(() => parseLedger(empty)).toThrow(/empty/);
  });

  it("refuses a schema version it does not handle", () => {
    expect(() => parseLedger({ ...draft(), schemaVersion: 99 })).toThrow(/schemaVersion/);
  });

  it("refuses a point estimate that does not reproduce its counts", () => {
    const bad = draft();
    const gates = bad.gates as Array<{ arms: Array<{ point: number }> }>;
    gates[0].arms[0].point = 0.5;
    expect(() => parseLedger(bad)).toThrow(/does not reproduce/);
  });

  it("refuses a point estimate outside its own interval", () => {
    const bad = draft();
    const gates = bad.gates as Array<{ arms: Array<{ ci95: [number, number] }> }>;
    const arm = gates[0].arms[0];
    arm.ci95 = [0.8, 0.9];
    expect(() => parseLedger(bad)).toThrow(/outside its own interval/);
  });

  it("refuses an interval whose bounds are not ordered", () => {
    const bad = draft();
    const gates = bad.gates as Array<{ arms: Array<{ ci95: [number, number] }> }>;
    const arm = gates[0].arms[0];
    arm.ci95 = [arm.ci95[1], arm.ci95[0]];
    expect(() => parseLedger(bad)).toThrow(/not ordered/);
  });

  it("refuses a gate with no arms", () => {
    const bad = draft();
    const gates = bad.gates as Array<{ arms: unknown[] }>;
    gates[0].arms = [];
    expect(() => parseLedger(bad)).toThrow(/tests nothing/);
  });

  it("refuses a correction factor that does not reproduce before/after", () => {
    const bad = draft();
    const corrections = bad.corrections as Array<{ factor: number }>;
    corrections[0].factor = 2;
    expect(() => parseLedger(bad)).toThrow(/does not reproduce/);
  });

  it("refuses an audit that reports no findings", () => {
    const bad = draft();
    const audits = bad.audits as Array<{ findings: unknown[] }>;
    audits[0].findings = [];
    expect(() => parseLedger(bad)).toThrow(/must say so explicitly/);
  });

  it("refuses an unknown severity", () => {
    const bad = draft();
    const audits = bad.audits as Array<{ findings: Array<{ severity: string }> }>;
    audits[0].findings[0].severity = "spicy";
    expect(() => parseLedger(bad)).toThrow(/not a known severity/);
  });

  it("refuses an entry missing its reopen condition", () => {
    const bad = draft();
    const audits = bad.audits as Array<Record<string, unknown>>;
    delete audits[0].reopenCondition;
    expect(() => parseLedger(bad)).toThrow(/reopenCondition/);
  });
});
