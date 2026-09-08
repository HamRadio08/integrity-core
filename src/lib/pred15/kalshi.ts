/**
 * Public Kalshi market-data client for KXBTC15M.
 * No orders. A signed key is optional and unused in v1 — public GETs are enough
 * for floor_strike + yes bid/ask when Kalshi is reachable.
 */

export const KALSHI_SERIES = "KXBTC15M";

export interface KalshiQuote {
  source: "kalshi-public";
  available: boolean;
  ticker: string | null;
  eventTicker: string | null;
  strike: number | null;
  yesBid: number | null;
  yesAsk: number | null;
  closeTime: string | null;
  status: string | null;
  error: string | null;
}

type KalshiMarket = {
  ticker?: string;
  event_ticker?: string;
  status?: string;
  close_time?: string;
  floor_strike?: number | string | null;
  cap_strike?: number | string | null;
  strike_price?: number | string | null;
  custom_strike?: { price?: number | string } | null;
  yes_bid_dollars?: string | number | null;
  yes_ask_dollars?: string | number | null;
  last_price_dollars?: string | number | null;
  yes_bid?: number | null;
  yes_ask?: number | null;
  title?: string;
  yes_sub_title?: string;
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function asNumber(value: unknown): number | null {
  if (finite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function dollars(value: unknown): number | null {
  const n = asNumber(value);
  if (n == null) return null;
  if (n > 1 && n <= 100) return n / 100;
  return n;
}

export function extractStrike(market: KalshiMarket): number | null {
  for (const candidate of [market.floor_strike, market.strike_price, market.custom_strike?.price, market.cap_strike]) {
    const n = asNumber(candidate);
    if (n != null && n > 1000) return n;
  }
  const hay = `${market.yes_sub_title ?? ""} ${market.title ?? ""}`;
  const match = hay.replace(/,/g, "").match(/\$?\s*(\d{4,}(?:\.\d+)?)/);
  if (match) {
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > 1000) return n;
  }
  return null;
}

export function parseKalshiMarkets(payload: unknown): KalshiQuote {
  const markets = (payload as { markets?: KalshiMarket[] })?.markets ?? [];
  const open = markets.find((row) => row.status === "open") ?? markets[0];
  if (!open) {
    return {
      source: "kalshi-public",
      available: false,
      ticker: null,
      eventTicker: null,
      strike: null,
      yesBid: null,
      yesAsk: null,
      closeTime: null,
      status: null,
      error: "No KXBTC15M markets in payload.",
    };
  }
  const yesBid = dollars(open.yes_bid_dollars) ?? (finite(open.yes_bid) ? open.yes_bid / 100 : null);
  const yesAsk = dollars(open.yes_ask_dollars) ?? (finite(open.yes_ask) ? open.yes_ask / 100 : dollars(open.last_price_dollars));
  return {
    source: "kalshi-public",
    available: true,
    ticker: open.ticker ?? null,
    eventTicker: open.event_ticker ?? null,
    strike: extractStrike(open),
    yesBid,
    yesAsk,
    closeTime: open.close_time ?? null,
    status: open.status ?? null,
    error: null,
  };
}

export function kalshiBase(): string {
  return (process.env.KALSHI_API_BASE?.trim() || "https://external-api.kalshi.com/trade-api/v2").replace(/\/$/, "");
}

export async function fetchKalshiBtc15m(fetcher: typeof fetch = fetch): Promise<KalshiQuote> {
  const url = `${kalshiBase()}/markets?series_ticker=${KALSHI_SERIES}&status=open&limit=20`;
  try {
    const response = await fetcher(url, {
      cache: "no-store",
      headers: { Accept: "application/json", "User-Agent": "integrity-core-pred15/1.0" },
    });
    if (!response.ok) {
      return emptyQuote(`${response.status} ${url}`);
    }
    return parseKalshiMarkets(await response.json());
  } catch (error) {
    return emptyQuote(error instanceof Error ? error.message : "Kalshi fetch failed.");
  }
}

function emptyQuote(error: string): KalshiQuote {
  return {
    source: "kalshi-public",
    available: false,
    ticker: null,
    eventTicker: null,
    strike: null,
    yesBid: null,
    yesAsk: null,
    closeTime: null,
    status: null,
    error,
  };
}

/** Signed-key hook. v1 never sends orders; presence is reported only. */
export function kalshiKeyReady(): boolean {
  return Boolean(process.env.KALSHI_API_KEY_ID?.trim() && process.env.KALSHI_PRIVATE_KEY_PATH?.trim());
}
