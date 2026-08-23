import { describe, expect, it } from "vitest";
import { STACK_CONFIG } from "./config";
import { buildContext, evaluateTier } from "./gates";
import type { Bar, Candidate, Market } from "./types";

// Yahoo reports equity volume as a share count but crypto volume already in USD.
// evaluateTier must not multiply crypto volume by close, or ADV is off by a factor of
// `close` -- inflating it above $1 and shrinking it below $1.
describe("tier_reject ADV respects per-market volume units", () => {
  const bars = (close: number, volume: number): Bar[] =>
    Array.from({ length: 20 }, (_, i) => ({
      ts: `2026-08-${String(i + 1).padStart(2, "0")}`,
      open: close,
      high: close,
      low: close,
      close,
      volume,
    }));

  const candidate = (market: Market, close: number, volume: number): Candidate => ({
    id: `adv-${market}-${close}`,
    symbol: "TEST",
    name: "Test",
    sector: "Test",
    market,
    tier: 1,
    asOf: "2026-08-22",
    origin: "live-tape",
    last: close,
    chg5d: null,
    chg20d: null,
    bars: bars(close, volume),
  });

  const advOf = (c: Candidate) =>
    evaluateTier(buildContext(c, STACK_CONFIG)).evidence.metrics.adv as number;

  it("takes crypto volume as dollars already", () => {
    // BTC-shaped: $78,534 close, $69.1B daily dollar volume.
    expect(advOf(candidate("crypto", 78_534, 6.91e10))).toBeCloseTo(6.91e10, -6);
  });

  it("converts equity share volume to dollars", () => {
    // AAPL-shaped: $309.35 close, 42.2M shares.
    expect(advOf(candidate("equity", 309.35, 4.222e7))).toBeCloseTo(309.35 * 4.222e7, -6);
  });

  it("does not false-FAIL a liquid sub-$1 coin", () => {
    // SHIB-shaped: $0.000006 close against ~$83.4M real dollar volume. The old
    // close * volume form read this as ~$415 and killed it on the liquidity floor.
    const shib = candidate("crypto", 6.03e-6, 8.34e7);
    const result = evaluateTier(buildContext(shib, STACK_CONFIG));
    expect(result.evidence.metrics.adv).toBeGreaterThan(STACK_CONFIG.tierReject.minAdv);
    expect(result.status).toBe("PASS");
  });
});
