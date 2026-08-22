import { describe, expect, it } from "vitest";
import { STACK_CONFIG } from "./config";
import { digestBars, evaluateCandidate, sealRecord } from "./engine";
import { emaSeries } from "./indicators";
import { digestOf, GENESIS } from "./hash";
import { buildLiveUniverse, evaluateLive, loadTape } from "./market";

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
});
