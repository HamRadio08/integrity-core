import { describe, expect, it } from "vitest";
import { overlayFromLiveSpots } from "./live";
import { setSpotOverlay } from "./market";
import { DEMO_SEED, getDemoBundle, replaceActiveBundle } from "./run";
import { applyLiveOverlay, resealFromOverlay } from "./sync";
import { buildPnlByStrategy, mean } from "./derived";

describe("venue overlay reseals the means the dashboard reads", () => {
  it("maps live spots onto the tape overlay without inventing a print", () => {
    const overlay = overlayFromLiveSpots([
      { id: "coinbase-btc", symbol: "BTC", usd: 80_000, change24h: 0.01, source: "coinbase", asOf: "2026-08-30T12:00:00Z" },
      { id: "gecko-dogecoin", symbol: "DOGE", usd: 0.09, change24h: null, source: "coingecko", asOf: "2026-08-30T12:00:00Z" },
    ]);
    expect(overlay?.coinbase?.price).toBe(80_000);
    expect(overlay?.gecko.bitcoin?.usd).toBe(80_000);
    expect(overlay?.gecko.dogecoin?.usd).toBe(0.09);
    expect(overlayFromLiveSpots([])).toBeNull();
  });

  it("rebuilds book-mean 5d from the marked last, not the stale file print", () => {
    setSpotOverlay(null);
    const before = replaceActiveBundle(DEMO_SEED);
    const btcBefore = before.records.find((row) => row.symbol === "BTC");
    expect(btcBefore).toBeTruthy();

    applyLiveOverlay({
      spots: [
        {
          id: "coinbase-btc",
          symbol: "BTC",
          usd: 90_000,
          change24h: 0,
          source: "coinbase",
          asOf: "2026-08-30T12:00:00Z",
        },
      ],
    });
    const after = resealFromOverlay(DEMO_SEED).bundle;
    const btcAfter = after.records.find((row) => row.symbol === "BTC");
    expect(btcAfter?.last).toBe(90_000);
    expect(btcAfter?.last).not.toBe(btcBefore?.last);

    const book = after.desk.pnlByStrategy.find((row) => row.id === "BOOK");
    const sample = after.records
      .map((row) => row.chg5d)
      .filter((value): value is number => typeof value === "number");
    expect(book?.meanChg5d).toBeCloseTo(mean(sample) ?? 0, 12);
    expect(book?.meanChg5d).toBe(buildPnlByStrategy(after.records).find((row) => row.id === "BOOK")?.meanChg5d);
    expect(after.desk.measuredAt).toBe("2026-08-30T12:00:00Z");

    setSpotOverlay(null);
    replaceActiveBundle(DEMO_SEED);
    expect(getDemoBundle().tape.spotBtc).toBeGreaterThan(0);
  });
});
