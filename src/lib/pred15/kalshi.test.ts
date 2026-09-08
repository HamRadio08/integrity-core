import { describe, expect, it } from "vitest";
import { extractStrike, parseKalshiMarkets } from "./kalshi";

describe("kalshi public parse", () => {
  it("reads floor_strike and dollar bids from an open KXBTC15M market", () => {
    const quote = parseKalshiMarkets({
      markets: [
        {
          ticker: "KXBTC15M-26SEP081630-15",
          event_ticker: "KXBTC15M-26SEP081630",
          status: "open",
          close_time: "2026-09-08T20:30:00Z",
          floor_strike: 78581.31,
          yes_bid_dollars: "0.2200",
          yes_ask_dollars: "0.2400",
        },
      ],
    });
    expect(quote.available).toBe(true);
    expect(quote.strike).toBe(78581.31);
    expect(quote.yesBid).toBeCloseTo(0.22);
    expect(quote.yesAsk).toBeCloseTo(0.24);
  });

  it("falls back to subtitle dollars when strike fields are missing", () => {
    expect(extractStrike({ yes_sub_title: "Price to beat $78,581.31" })).toBeCloseTo(78581.31);
  });

  it("reports unavailable when the payload is empty", () => {
    const quote = parseKalshiMarkets({ markets: [] });
    expect(quote.available).toBe(false);
    expect(quote.strike).toBeNull();
  });
});
