import { readFileSync } from "node:fs";
import { join } from "node:path";

import type {
  AuditEntry,
  CorrectionEntry,
  EvidenceLedger,
  GateEntry,
  Severity,
  Verdict,
} from "./types";

export const LEDGER_SCHEMA_VERSION = 1;

/** Point estimates are published rounded; allow the rounding, nothing more. */
const POINT_TOLERANCE = 5e-4;

const SEVERITIES: readonly Severity[] = ["critical", "warning", "ok"];
const VERDICTS: readonly Verdict[] = [
  "FAIL",
  "PASS",
  "KEEPER",
  "FIXED",
  "CLASS CLOSED",
  "OPEN",
];

export class LedgerError extends Error {
  constructor(message: string) {
    super(`evidence-ledger: ${message}`);
    this.name = "LedgerError";
  }
}

function fail(message: string): never {
  throw new LedgerError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown, where: string): string {
  if (typeof value !== "string" || value.length === 0) fail(`${where} must be a non-empty string`);
  return value;
}

function num(value: unknown, where: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${where} must be a finite number`);
  }
  return value;
}

function arr(value: unknown, where: string): unknown[] {
  if (!Array.isArray(value)) fail(`${where} must be an array`);
  return value;
}

/**
 * A published evidence row whose own arithmetic does not close is worse than no
 * row: it invites a reader to trust a number nobody checked. Every gate arm is
 * re-derived from its counts here, and the interval must contain the point it
 * claims to bound.
 */
function checkArm(arm: Record<string, unknown>, where: string) {
  const numerator = num(arm.numerator, `${where}.numerator`);
  const denominator = num(arm.denominator, `${where}.denominator`);
  const point = num(arm.point, `${where}.point`);
  const ci = arr(arm.ci95, `${where}.ci95`);

  if (denominator <= 0) fail(`${where}.denominator must be positive`);
  if (numerator < 0 || numerator > denominator) {
    fail(`${where}.numerator ${numerator} is not within [0, ${denominator}]`);
  }
  if (ci.length !== 2) fail(`${where}.ci95 must hold exactly two bounds`);

  const [lo, hi] = [num(ci[0], `${where}.ci95[0]`), num(ci[1], `${where}.ci95[1]`)];
  if (lo >= hi) fail(`${where}.ci95 bounds are not ordered: [${lo}, ${hi}]`);

  const derived = numerator / denominator;
  if (Math.abs(derived - point) > POINT_TOLERANCE) {
    fail(
      `${where}.point ${point} does not reproduce ${numerator}/${denominator} = ${derived.toFixed(6)}`,
    );
  }
  if (point < lo || point > hi) {
    fail(`${where}.point ${point} lies outside its own interval [${lo}, ${hi}]`);
  }
  if (!VERDICTS.includes(arm.verdict as Verdict)) {
    fail(`${where}.verdict ${String(arm.verdict)} is not a known verdict`);
  }
}

function checkGate(entry: unknown, index: number) {
  if (!isRecord(entry)) fail(`gates[${index}] must be an object`);
  const where = `gates[${index}]`;
  str(entry.id, `${where}.id`);
  str(entry.reopenCondition, `${where}.reopenCondition`);

  const gate = entry.gate;
  if (!isRecord(gate)) fail(`${where}.gate must be an object`);
  num(gate.threshold, `${where}.gate.threshold`);
  if (gate.direction !== "below" && gate.direction !== "above") {
    fail(`${where}.gate.direction must be "below" or "above"`);
  }

  const arms = arr(entry.arms, `${where}.arms`);
  if (arms.length === 0) fail(`${where}.arms is empty — a gate with no arm tests nothing`);
  arms.forEach((arm, i) => {
    if (!isRecord(arm)) fail(`${where}.arms[${i}] must be an object`);
    checkArm(arm, `${where}.arms[${i}]`);
  });
}

function checkCorrection(entry: unknown, index: number) {
  if (!isRecord(entry)) fail(`corrections[${index}] must be an object`);
  const where = `corrections[${index}]`;
  str(entry.id, `${where}.id`);
  str(entry.reopenCondition, `${where}.reopenCondition`);

  const before = entry.before;
  const after = entry.after;
  if (!isRecord(before) || !isRecord(after)) {
    fail(`${where} must carry before and after objects`);
  }
  const beforeValue = num(before.value, `${where}.before.value`);
  const afterValue = num(after.value, `${where}.after.value`);
  const factor = num(entry.factor, `${where}.factor`);

  if (afterValue <= 0) fail(`${where}.after.value must be positive`);
  const derived = beforeValue / afterValue;
  // The published factor is rounded to a readable figure; hold it to 1%.
  if (Math.abs(derived - factor) / factor > 0.01) {
    fail(
      `${where}.factor ${factor} does not reproduce ${beforeValue}/${afterValue} = ${derived.toFixed(1)}`,
    );
  }
}

function checkAudit(entry: unknown, index: number) {
  if (!isRecord(entry)) fail(`audits[${index}] must be an object`);
  const where = `audits[${index}]`;
  str(entry.id, `${where}.id`);
  str(entry.reopenCondition, `${where}.reopenCondition`);

  const findings = arr(entry.findings, `${where}.findings`);
  if (findings.length === 0) {
    fail(`${where}.findings is empty — an audit that found nothing must say so explicitly`);
  }
  findings.forEach((finding, i) => {
    if (!isRecord(finding)) fail(`${where}.findings[${i}] must be an object`);
    str(finding.ref, `${where}.findings[${i}].ref`);
    str(finding.summary, `${where}.findings[${i}].summary`);
    if (!SEVERITIES.includes(finding.severity as Severity)) {
      fail(`${where}.findings[${i}].severity ${String(finding.severity)} is not a known severity`);
    }
  });
  arr(entry.shipped, `${where}.shipped`);
}

/**
 * Parse and validate an evidence ledger. Throws {@link LedgerError} rather than
 * returning a partially-trusted object: a ledger that does not validate must not
 * render, because a half-rendered ledger reads exactly like a complete one.
 */
export function parseLedger(raw: unknown): EvidenceLedger {
  if (!isRecord(raw)) fail("payload must be an object");

  const schemaVersion = num(raw.schemaVersion, "schemaVersion");
  if (schemaVersion !== LEDGER_SCHEMA_VERSION) {
    fail(`unsupported schemaVersion ${schemaVersion} (reader handles ${LEDGER_SCHEMA_VERSION})`);
  }
  str(raw.generatedAt, "generatedAt");
  str(raw.note, "note");

  const gates = arr(raw.gates, "gates");
  const corrections = arr(raw.corrections, "corrections");
  const audits = arr(raw.audits, "audits");

  // book-populated, for the ledger: an empty ledger must refuse to render rather
  // than present "0 findings, all clear" as a result. See docs/case-studies/03.
  if (gates.length + corrections.length + audits.length === 0) {
    fail("ledger is empty — refusing to render an empty ledger as a clean one");
  }

  gates.forEach(checkGate);
  corrections.forEach(checkCorrection);
  audits.forEach(checkAudit);

  return {
    schemaVersion,
    generatedAt: raw.generatedAt as string,
    note: raw.note as string,
    gates: gates as GateEntry[],
    corrections: corrections as CorrectionEntry[],
    audits: audits as AuditEntry[],
  };
}

export function loadLedger(cwd = process.cwd()): EvidenceLedger {
  const raw = readFileSync(join(cwd, "data/evidence-ledger.json"), "utf8");
  return parseLedger(JSON.parse(raw));
}
