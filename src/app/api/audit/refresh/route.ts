import { NextResponse } from "next/server";
import { gateRequest } from "@/lib/audit/guard";
import { GECKO_IDS } from "@/lib/audit/live";
import { DEMO_SEED, publicRun, replaceActiveBundle } from "@/lib/audit/run";
import { setSpotOverlay } from "@/lib/audit/market";
import { tickActivePaper } from "@/lib/paper";

export async function POST(request: Request) {
  const gate = gateRequest(request, "refresh");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  try {
    const [geckoRes, coinbaseRes] = await Promise.all([
      fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${GECKO_IDS}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`,
        { cache: "no-store", headers: { "User-Agent": "stack-attestation/1.0" } },
      ),
      fetch("https://api.exchange.coinbase.com/products/BTC-USD/ticker", {
        cache: "no-store",
        headers: { "User-Agent": "stack-attestation/1.0" },
      }),
    ]);
    const gecko = geckoRes.ok ? await geckoRes.json() : null;
    const coinbase = coinbaseRes.ok ? await coinbaseRes.json() : null;
    if (!gecko && !coinbase) {
      return NextResponse.json({ error: "Live venue refresh failed." }, { status: 502 });
    }
    const price = Number(coinbase?.price);
    setSpotOverlay({
      gecko: gecko ?? undefined,
      coinbase:
        Number.isFinite(price) && price > 0
          ? {
              price,
              time: String(coinbase.time ?? new Date().toISOString()),
              volume: Number(coinbase.volume) || 0,
              bid: Number(coinbase.bid) || price,
              ask: Number(coinbase.ask) || price,
            }
          : undefined,
    });
    const bundle = replaceActiveBundle(DEMO_SEED);
    tickActivePaper(bundle, { force: true });
    return NextResponse.json(publicRun(bundle));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Refresh failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
