import { describe, expect, it } from "vitest";
import { buildCard, decideStrip } from "./sigma";

const quiet = { lo: 0.45, hi: 0.5 };

describe("pred15 strip", () => {
  it("grades the first Coinbase ATM/cheap-Under window as NO_BET", () => {
    const card = buildCard({
      spot: 78_375.83,
      strike: 78_458.46,
      secondsLeft: 3 * 60 + 51,
      vol: quiet,
      venueOver: 0.08,
    });
    expect(card.strip).toBe("NO_BET");
    expect(card.settleBand).toBe(false);
  });

  it("grades a 61/40 coin-flip as NO_BET", () => {
    const card = buildCard({
      spot: 78_472.2,
      strike: 78_451.89,
      secondsLeft: 4 * 60 + 27,
      vol: quiet,
      venueOver: 0.61,
    });
    expect(card.strip).toBe("NO_BET");
  });

  it("switches to SETTLE_WATCH inside 60s", () => {
    const card = buildCard({
      spot: 78_472.2,
      strike: 78_451.89,
      secondsLeft: 45,
      vol: quiet,
      venueOver: 0.8,
    });
    expect(card.strip).toBe("SETTLE_WATCH");
  });

  it("fires FIGHT_OVER on an 8c wing when model mid is >= 30%", () => {
    const card = buildCard({
      spot: 78_526.38,
      strike: 78_581.31,
      secondsLeft: 6 * 60 + 54,
      vol: { lo: 0.5, hi: 0.7 },
      venueOver: 0.08,
    });
    expect(card.strip).toBe("FIGHT_OVER");
    expect(card.pOverLo).toBeGreaterThan(0.3);
  });

  it("keeps 16:15 open Under at 70c as NO_BET", () => {
    const card = buildCard({
      spot: 78_519.56,
      strike: 78_581.31,
      secondsLeft: 13 * 60 + 14,
      vol: { lo: 0.5, hi: 0.7 },
      venueOver: 0.32,
    });
    expect(card.strip).toBe("NO_BET");
  });

  it("does not invent ALIGN without a venue quote", () => {
    const { strip } = decideStrip({
      secondsLeft: 400,
      pLo: 0.6,
      pHi: 0.7,
      venueOver: null,
      zMid: 0.8,
    });
    expect(strip).toBe("NO_BET");
  });
});
