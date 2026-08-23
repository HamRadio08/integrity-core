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
    expect(result.evidence.metrics.adv).toBeGreaterThan(STACK_CONFIG.tierReject.minAdv.crypto);
    expect(result.status).toBe("PASS");
  });
});

// One floor cannot serve both universes, so tierReject.minAdv is keyed by market. Each
// candidate must be judged against ITS OWN market's floor, and the resolved scalar - not
// the map - is what gets sealed, so the evidence payload shape does not change.
describe("tier_reject applies the floor for the candidate's own market", () => {
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
    id: `floor-${market}`,
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

  // Floors far enough apart that reading the wrong one inverts the verdict.
  const split = {
    ...STACK_CONFIG,
    tierReject: { ...STACK_CONFIG.tierReject, minAdv: { crypto: 1e9, equity: 1e6 } },
  };

  it("fails a coin under the crypto floor that would clear the equity one", () => {
    // Crypto volume is already USD, so this is $10M ADV: over equity's $1M, under crypto's $1B.
    const result = evaluateTier(buildContext(candidate("crypto", 10, 1e7), split));
    expect(result.status).toBe("FAIL");
    expect(result.evidence.reason).toContain("below");
  });

  it("passes a stock over the equity floor that would fail the crypto one", () => {
    // Equity volume is a share count, so 1e7 shares at $10 is $100M ADV against a $1M floor.
    const result = evaluateTier(buildContext(candidate("equity", 10, 1e7), split));
    expect(result.status).toBe("PASS");
  });

  it("seals the resolved scalar floor, never the map", () => {
    const result = evaluateTier(buildContext(candidate("crypto", 10, 1e7), split));
    expect(result.params.minAdv).toBe(1e9);
    expect(typeof result.params.minAdv).toBe("number");
  });
});

// The shipped floors are a universe-drift tripwire, not a size-vs-liquidity screen: they
// must stay silent on the thinnest names actually in the universe while still catching an
// asset an order of magnitude thinner. These pin both ends of that headroom, so a later
// edit that arms the floors too tight (false-killing real names) or too loose (back to
// inert) fails here rather than silently changing what the gate means.
describe("shipped ADV floors behave as a universe-drift tripwire", () => {
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
    id: `tripwire-${market}-${volume}`,
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

  const statusOf = (c: Candidate) => evaluateTier(buildContext(c, STACK_CONFIG)).status;

  it("stays silent on the thinnest names currently in the universe", () => {
    // ATOM-shaped: $27.0M ADV, the thinnest coin on the tape. Crypto volume is USD.
    expect(statusOf(candidate("crypto", 1.57, 2.7e7))).toBe("PASS");
    // LCID-shaped: $79.0M ADV, the thinnest equity. 14.3M shares at $5.51.
    expect(statusOf(candidate("equity", 5.51, 1.434e7))).toBe("PASS");
  });

  it("fires on an asset an order of magnitude thinner", () => {
    // $1M of crypto volume, against the $5M floor.
    expect(statusOf(candidate("crypto", 1.57, 1e6))).toBe("FAIL");
    // 400k shares at $5.51 is ~$2.2M, against the $10M equity floor.
    expect(statusOf(candidate("equity", 5.51, 4e5))).toBe("FAIL");
  });
});
