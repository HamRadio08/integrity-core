import { NextResponse } from "next/server";
import { gateRequest } from "@/lib/audit/guard";
import { DEMO_SEED, publicRun, replaceActiveBundle } from "@/lib/audit/run";
import { setSpotOverlay } from "@/lib/audit/market";

export async function POST(request: Request) {
  const gate = gateRequest(request, "refresh");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  try {
    const [geckoRes, coinbaseRes] = await Promise.all([
      fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true",
        { headers: { "User-Agent": "stack-attestation/1.0" } },
      ),
      fetch("https://api.exchange.coinbase.com/products/BTC-USD/ticker", {
        headers: { "User-Agent": "stack-attestation/1.0" },
      }),
    ]);
    if (!geckoRes.ok || !coinbaseRes.ok) {
      return NextResponse.json({ error: "Live venue refresh failed." }, { status: 502 });
    }
    const gecko = await geckoRes.json();
    const coinbase = await coinbaseRes.json();
    setSpotOverlay({
      gecko,
      coinbase: {
        price: Number(coinbase.price),
        time: String(coinbase.time),
        volume: Number(coinbase.volume),
        bid: Number(coinbase.bid),
        ask: Number(coinbase.ask),
      },
    });
    const bundle = replaceActiveBundle(DEMO_SEED);
    return NextResponse.json(publicRun(bundle));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Refresh failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
