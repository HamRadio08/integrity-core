import { createHash } from "node:crypto";

/** Thrown when a payload carries a value that must never be sealed. */
export class NonFiniteSealError extends RangeError {
  constructor(value: number) {
    super(
      `refusing to seal a non-finite number (${
        Number.isNaN(value) ? "NaN" : value > 0 ? "Infinity" : "-Infinity"
      }): the computation that produced it broke, and hashing it would attest a broken result as a valid one.`,
    );
    this.name = "NonFiniteSealError";
  }
}

export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "number") {
    // Fail loud. Previously NaN/Infinity were emitted as bare tokens, which is (a) not
    // valid JSON and (b) a STABLE digest for a broken computation — so the chain verified
    // and the corruption rode through sealed. invariants.finiteMetrics already treats
    // non-finite as a violation; the seal must not disagree with it.
    if (!Number.isFinite(value)) throw new NonFiniteSealError(value);
    return JSON.stringify(value);
  }
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalize(obj[key])}`)
    .join(",")}}`;
}

export function sha256Hex(payload: string): string {
  return createHash("sha256").update(payload).digest("hex");
}

export function digestOf(value: unknown): string {
  return sha256Hex(canonicalize(value));
}

export function round(value: number, digits = 8): number {
  if (!Number.isFinite(value)) return value;
  const power = 10 ** digits;
  return Math.round(value * power) / power;
}

function priceDigits(price: number): number {
  if (price >= 1) return 4;
  if (price >= 0.01) return 6;
  return 10;
}

export function roundBar(bar: {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}) {
  const digits = priceDigits(Math.abs(bar.close) || 0);
  return {
    ts: bar.ts,
    open: round(bar.open, digits),
    high: round(bar.high, digits),
    low: round(bar.low, digits),
    close: round(bar.close, digits),
    volume: Math.max(0, Math.round(bar.volume)),
  };
}

export function shortDigest(hex: string, size = 12): string {
  return hex.slice(0, size);
}

export const GENESIS = sha256Hex("stack-attestation/v1:genesis");
