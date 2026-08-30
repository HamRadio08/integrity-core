import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCiRuns, fetchFutureQuote, fetchLiveSpots, FUTURE_SPECS } from "./live";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("live venue readers", () => {
  it("maps a Yahoo futures chart into a last, prior close, and as-of — no invented print", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          chart: {
            result: [
              {
                meta: {
                  regularMarketPrice: 7722,
                  regularMarketTime: 1_787_950_799,
                  chartPreviousClose: 7700,
                  shortName: "E-Mini S&P 500 Sep 26",
                },
                indicators: { quote: [{ close: [7680, 7700, 7722] }] },
              },
            ],
          },
        }),
      })) as unknown as typeof fetch,
    );
    const quote = await fetchFutureQuote(FUTURE_SPECS[2]);
    expect(quote.yahoo).toBe("ES=F");
    expect(quote.last).toBe(7722);
    expect(quote.previousClose).toBe(7700);
    expect(quote.changePct).toBeCloseTo(7722 / 7700 - 1, 12);
    expect(quote.asOf).toBe(new Date(1_787_950_799 * 1000).toISOString());
    expect(quote.error).toBeNull();
  });

  it("records a venue failure instead of fabricating a futures last", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch,
    );
    const quote = await fetchFutureQuote(FUTURE_SPECS[0]);
    expect(quote.last).toBeNull();
    expect(quote.error).toBeTruthy();
  });

  it("prefers the Coinbase BTC print and only emits gecko spots that actually arrived", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () =>
          String(url).includes("coingecko")
            ? {
                bitcoin: { usd: 78_000, usd_24h_change: 1.2 },
                dogecoin: { usd: 0.08, usd_24h_change: -0.5 },
              }
            : { price: "78111.25", time: "2026-08-30T06:00:00Z", volume: "1", bid: "78111", ask: "78112" },
      })) as unknown as typeof fetch,
    );
    const { spots, errors } = await fetchLiveSpots();
    expect(errors).toEqual([]);
    const btc = spots.find((row) => row.symbol === "BTC");
    expect(btc?.usd).toBe(78111.25);
    expect(btc?.source).toBe("coinbase");
    expect(spots.find((row) => row.symbol === "DOGE")?.usd).toBe(0.08);
    expect(spots.find((row) => row.symbol === "ETH")).toBeUndefined();
  });

  it("maps GitHub Actions runs without inventing a conclusion", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          workflow_runs: [
            {
              id: 1,
              name: "CI",
              status: "completed",
              conclusion: "success",
              head_branch: "main",
              event: "push",
              html_url: "https://github.com/HamRadio08/integrity-core/actions/runs/1",
              updated_at: "2026-08-30T00:00:00Z",
            },
          ],
        }),
      })) as unknown as typeof fetch,
    );
    const { runs, error } = await fetchCiRuns();
    expect(error).toBeNull();
    expect(runs).toHaveLength(1);
    expect(runs[0]?.conclusion).toBe("success");
    expect(runs[0]?.url).toContain("/actions/runs/1");
  });
});
