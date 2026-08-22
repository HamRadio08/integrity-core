import { describe, expect, it } from "vitest";
import { STACK_CONFIG } from "./config";
import { digestBars, evaluateCandidate, sealRecord } from "./engine";
import { emaSeries } from "./indicators";
import { canonicalize, digestOf, GENESIS, NonFiniteSealError } from "./hash";
import { GATE_EVALUATORS, buildContext } from "./gates";
import { buildLiveUniverse, evaluateLive, loadTape } from "./market";
import type { Bar, Candidate } from "./types";

describe("degenerate input never produces a non-finite metric", () => {
  // Swept across ALL gates rather than the two that were found by hand. Spot-checking
  // divisions is what let this through: gates.ts:54 and :161 look guarded (`close === 0`,
  // `Math.min(20, bars.length)`) and are — against zero, not against `undefined`.
  const withBars = (symbol: string, bars: Bar[]): Candidate => ({
    id: `degenerate-${symbol}`,
    symbol,
    name: symbol,
    sector: "Test",
    market: "crypto",
    tier: 1,
    asOf: "2026-08-22",
    origin: "live-tape",
    last: 0,
    chg5d: null,
    chg20d: null,
    bars,
  });

  const DEGENERATE: Array<[string, Candidate]> = [["zero bars", withBars("EMPTY", [])]];

  for (const [label, candidate] of DEGENERATE) {
    it(`every gate emits finite-or-null metrics on ${label}`, () => {
      const ctx = buildContext(candidate, STACK_CONFIG);
      for (const [gateId, evaluate] of Object.entries(GATE_EVALUATORS)) {
        const result = evaluate(ctx);
        for (const [key, value] of Object.entries(result.evidence.metrics)) {
          if (typeof value === "number") {
            expect(
              Number.isFinite(value),
              `${gateId}.${key} is ${value}; emit null for an uncomputable metric`,
            ).toBe(true);
          }
        }
      }
    });

    it(`evaluateCandidate seals ${label} instead of throwing`, () => {
      // Regression: trend_sep emitted sepPct=NaN and tier_reject emitted adv=NaN, so the
      // seal (correctly) refused and the whole run died on one bad candidate. A candidate
      // with no history is a FAIL, not a crash.
      expect(() => evaluateCandidate(candidate, STACK_CONFIG)).not.toThrow();
      const res = evaluateCandidate(candidate, STACK_CONFIG);
      expect(res.outcome).toBe("KILLED");
      expect(res.killGate).toBe("trend_sep"); // first gate fails; the rest are SKIP
    });
  }
});

describe("live tape", () => {
  it("only carries venue prints, with BTC through 75,000", () => {
    const tape = loadTape();
    expect(tape.assets.length).toBeGreaterThan(50);
    expect(tape.note.toLowerCase()).toContain("no synthetic");
    const btc = tape.assets.find((asset) => asset.symbol === "BTC");
    expect(btc).toBeTruthy();
    expect(btc!.bars.at(-1)!.close).toBeGreaterThan(75_000);
    expect(tape.spot?.coinbase?.price ?? tape.spot?.gecko?.bitcoin?.usd).toBeGreaterThan(75_000);
  });

  it("short-circuits on a real name that dies at the first gate", () => {
    const universe = buildLiveUniverse(20260822);
    const tangled = universe.find((candidate) => evaluateCandidate(candidate).killGate === "trend_sep");
    expect(tangled).toBeTruthy();
    const result = evaluateCandidate(tangled!);
    expect(result.evaluations.map((row) => row.status)).toEqual([
      "FAIL",
      "SKIP",
      "SKIP",
      "SKIP",
      "SKIP",
    ]);
  });

  it("marks BTC to the live Coinbase/Gecko print before sealing", () => {
    const { candidate, evaluations, outcome } = evaluateLive("BTC");
    expect(candidate.last).toBeGreaterThan(75_000);
    expect(candidate.origin).toBe("live-tape");
    expect(evaluations).toHaveLength(5);
    expect(["PASSED", "KILLED"]).toContain(outcome);
  });
});

describe("indicators", () => {
  it("computes EMA at bar i using only closes[0..i]", () => {
    const tape = loadTape();
    const btc = tape.assets.find((asset) => asset.symbol === "BTC")!;
    const values = btc.bars.map((bar) => bar.close);
    const full = emaSeries(values, 12);
    for (let i = 0; i < values.length; i++) {
      const prefix = emaSeries(values.slice(0, i + 1), 12);
      expect(prefix[i]).toBeCloseTo(full[i], 10);
    }
  });
});

describe("sealing", () => {
  it("reseals a live name to the same digest", () => {
    const { candidate } = evaluateLive("BTC");
    const a = sealRecord({ index: 0, candidate, config: STACK_CONFIG, prevDigest: GENESIS });
    const b = sealRecord({ index: 0, candidate, config: STACK_CONFIG, prevDigest: GENESIS });
    expect(a.record.recordDigest).toBe(b.record.recordDigest);
    expect(a.record.barsDigest).toBe(digestBars(candidate.bars));
  });

  it("canonical JSON is key-order invariant", () => {
    expect(digestOf({ b: 1, a: 2 })).toBe(digestOf({ a: 2, b: 1 }));
  });

  it("refuses to seal a non-finite number instead of hashing it", () => {
    // Regression: these used to canonicalize to the bare tokens NaN / Infinity, which is
    // invalid JSON AND a stable digest — a broken computation sealed as a valid record.
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(() => digestOf({ close: bad })).toThrow(NonFiniteSealError);
      expect(() => canonicalize(bad)).toThrow(NonFiniteSealError);
    }
    // Nested and array positions are covered by the same recursion.
    expect(() => digestOf({ metrics: { adx: NaN } })).toThrow(NonFiniteSealError);
    expect(() => digestOf([1, 2, Infinity])).toThrow(NonFiniteSealError);
  });

  it("still seals every finite value, including the awkward ones", () => {
    for (const ok of [0, -0, 1e-12, -1.5, Number.MAX_SAFE_INTEGER]) {
      expect(() => digestOf({ close: ok })).not.toThrow();
    }
    // Canonical output stays parseable JSON for finite payloads.
    expect(JSON.parse(canonicalize({ b: 1, a: [2, 3] }))).toEqual({ a: [2, 3], b: 1 });
  });
});
