import { NextResponse } from "next/server";
import { gateRequest } from "@/lib/audit/guard";
import { buildCard, windowBounds } from "@/lib/pred15/sigma";
import { fetchKalshiBtc15m, kalshiKeyReady, type KalshiQuote } from "@/lib/pred15/kalshi";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

async function fetchCoinbaseSpot(): Promise<{ usd: number; asOf: string } | { error: string }> {
  try {
    const response = await fetch("https://api.exchange.coinbase.com/products/BTC-USD/ticker", {
      cache: "no-store",
      headers: { "User-Agent": "integrity-core-pred15/1.0" },
    });
    if (!response.ok) return { error: `Coinbase ${response.status}` };
    const ticker = (await response.json()) as { price?: string; time?: string };
    const usd = Number(ticker.price);
    if (!Number.isFinite(usd) || usd <= 0) return { error: "Coinbase printed no last." };
    return { usd, asOf: typeof ticker.time === "string" ? ticker.time : new Date().toISOString() };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Coinbase fetch failed." };
  }
}

export async function GET(request: Request) {
  const gate = gateRequest(request, "pred15");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const url = new URL(request.url);
  const strikeParam = Number(url.searchParams.get("strike"));
  const venueParam = Number(url.searchParams.get("venueOver"));
  const sigmaLo = Number(url.searchParams.get("sigmaLo") ?? "0.50");
  const sigmaHi = Number(url.searchParams.get("sigmaHi") ?? "0.70");
  const secondsParam = Number(url.searchParams.get("secondsLeft"));

  const [spot, kalshi] = await Promise.all([fetchCoinbaseSpot(), fetchKalshiBtc15m()]);
  if ("error" in spot) {
    return NextResponse.json({ error: spot.error, kalshi }, { status: 502 });
  }

  const strike = finite(strikeParam) && strikeParam > 0 ? strikeParam : kalshi.strike;
  if (strike == null) {
    return NextResponse.json(
      {
        error: "No strike. Pass ?strike= or wait for Kalshi public GET.",
        spot: spot.usd,
        kalshi,
        kalshiKeyReady: kalshiKeyReady(),
      },
      { status: 422 },
    );
  }

  const venueOver = finite(venueParam)
    ? venueParam
    : finite(kalshi.yesAsk)
      ? kalshi.yesAsk
      : finite(kalshi.yesBid)
        ? kalshi.yesBid
        : null;

  const secondsLeft = finite(secondsParam) && secondsParam >= 0 ? secondsParam : windowBounds().remaining;
  const card = buildCard({
    spot: spot.usd,
    strike,
    secondsLeft,
    vol: { lo: Number.isFinite(sigmaLo) ? sigmaLo : 0.5, hi: Number.isFinite(sigmaHi) ? sigmaHi : 0.7 },
    venueOver,
  });

  return NextResponse.json(
    {
      mode: "paper-review",
      orders: false,
      proxy: card.proxy,
      oracle: card.oracle,
      spot: spot.usd,
      spotAsOf: spot.asOf,
      kalshi,
      kalshiKeyReady: kalshiKeyReady(),
      card,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export type Pred15Response = {
  mode: "paper-review";
  orders: false;
  card: ReturnType<typeof buildCard>;
  kalshi: KalshiQuote;
};
