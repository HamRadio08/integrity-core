import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimits } from "@/lib/audit/guard";
import { GET } from "./route";

beforeEach(() => {
  resetRateLimits();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/pred15/card", () => {
  it("rejects cross-site browser requests", async () => {
    const response = await GET(
      new Request("http://127.0.0.1:43173/api/pred15/card", { headers: { "sec-fetch-site": "cross-site" } }),
    );
    expect(response.status).toBe(403);
  });

  it("builds a paper card from Coinbase last + Kalshi public book", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const href = String(url);
        if (href.includes("coinbase")) {
          return {
            ok: true,
            json: async () => ({ price: "78526.38", time: "2026-09-08T20:24:00Z" }),
          };
        }
        if (href.includes("kalshi")) {
          return {
            ok: true,
            json: async () => ({
              markets: [
                {
                  ticker: "KXBTC15M-TEST",
                  status: "open",
                  floor_strike: 78581.31,
                  yes_bid_dollars: "0.0800",
                  yes_ask_dollars: "0.0800",
                  close_time: "2026-09-08T20:30:00Z",
                },
              ],
            }),
          };
        }
        return { ok: false, json: async () => ({}) };
      }) as unknown as typeof fetch,
    );

    const response = await GET(
      new Request("http://127.0.0.1:43173/api/pred15/card?secondsLeft=414&sigmaLo=0.5&sigmaHi=0.7"),
    );
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.mode).toBe("paper-review");
    expect(payload.orders).toBe(false);
    expect(payload.card.strip).toBe("FIGHT_OVER");
    expect(payload.kalshi.available).toBe(true);
    expect(payload.kalshi.strike).toBe(78581.31);
  });

  it("accepts a manual strike when Kalshi is down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const href = String(url);
        if (href.includes("coinbase")) {
          return { ok: true, json: async () => ({ price: "78472.20", time: "2026-09-08T19:00:00Z" }) };
        }
        return { ok: false, json: async () => ({}) };
      }) as unknown as typeof fetch,
    );
    const response = await GET(
      new Request(
        "http://127.0.0.1:43173/api/pred15/card?strike=78451.89&venueOver=0.61&secondsLeft=267",
      ),
    );
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.card.strip).toBe("NO_BET");
    expect(payload.kalshi.available).toBe(false);
  });
});
