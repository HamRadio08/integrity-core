import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data", "live-tape.json");

type Spec = {
  yahoo: string;
  symbol: string;
  name: string;
  sector: string;
  market: "crypto" | "equity";
  tier: 1 | 2 | 3 | 4;
};

const UNIVERSE: Spec[] = [
  { yahoo: "BTC-USD", symbol: "BTC", name: "Bitcoin", sector: "Crypto", market: "crypto", tier: 1 },
  { yahoo: "ETH-USD", symbol: "ETH", name: "Ethereum", sector: "Crypto", market: "crypto", tier: 1 },
  { yahoo: "SOL-USD", symbol: "SOL", name: "Solana", sector: "Crypto", market: "crypto", tier: 2 },
  { yahoo: "BNB-USD", symbol: "BNB", name: "BNB", sector: "Crypto", market: "crypto", tier: 2 },
  { yahoo: "XRP-USD", symbol: "XRP", name: "XRP", sector: "Crypto", market: "crypto", tier: 2 },
  { yahoo: "DOGE-USD", symbol: "DOGE", name: "Dogecoin", sector: "Meme", market: "crypto", tier: 4 },
  { yahoo: "ADA-USD", symbol: "ADA", name: "Cardano", sector: "Crypto", market: "crypto", tier: 3 },
  { yahoo: "AVAX-USD", symbol: "AVAX", name: "Avalanche", sector: "Crypto", market: "crypto", tier: 3 },
  { yahoo: "LINK-USD", symbol: "LINK", name: "Chainlink", sector: "Crypto", market: "crypto", tier: 2 },
  { yahoo: "DOT-USD", symbol: "DOT", name: "Polkadot", sector: "Crypto", market: "crypto", tier: 3 },
  { yahoo: "LTC-USD", symbol: "LTC", name: "Litecoin", sector: "Crypto", market: "crypto", tier: 2 },
  { yahoo: "BCH-USD", symbol: "BCH", name: "Bitcoin Cash", sector: "Crypto", market: "crypto", tier: 3 },
  { yahoo: "AAVE-USD", symbol: "AAVE", name: "Aave", sector: "DeFi", market: "crypto", tier: 3 },
  { yahoo: "NEAR-USD", symbol: "NEAR", name: "NEAR Protocol", sector: "Crypto", market: "crypto", tier: 3 },
  { yahoo: "ATOM-USD", symbol: "ATOM", name: "Cosmos", sector: "Crypto", market: "crypto", tier: 3 },
  { yahoo: "FIL-USD", symbol: "FIL", name: "Filecoin", sector: "Crypto", market: "crypto", tier: 3 },
  { yahoo: "SHIB-USD", symbol: "SHIB", name: "Shiba Inu", sector: "Meme", market: "crypto", tier: 4 },
  { yahoo: "WIF-USD", symbol: "WIF", name: "dogwifhat", sector: "Meme", market: "crypto", tier: 4 },
  { yahoo: "AAPL", symbol: "AAPL", name: "Apple", sector: "Technology", market: "equity", tier: 1 },
  { yahoo: "MSFT", symbol: "MSFT", name: "Microsoft", sector: "Technology", market: "equity", tier: 1 },
  { yahoo: "NVDA", symbol: "NVDA", name: "NVIDIA", sector: "Semiconductors", market: "equity", tier: 1 },
  { yahoo: "GOOGL", symbol: "GOOGL", name: "Alphabet", sector: "Technology", market: "equity", tier: 1 },
  { yahoo: "AMZN", symbol: "AMZN", name: "Amazon", sector: "Consumer", market: "equity", tier: 1 },
  { yahoo: "META", symbol: "META", name: "Meta Platforms", sector: "Technology", market: "equity", tier: 1 },
  { yahoo: "TSLA", symbol: "TSLA", name: "Tesla", sector: "Consumer", market: "equity", tier: 1 },
  { yahoo: "AVGO", symbol: "AVGO", name: "Broadcom", sector: "Semiconductors", market: "equity", tier: 1 },
  { yahoo: "BRK-B", symbol: "BRK.B", name: "Berkshire Hathaway", sector: "Financials", market: "equity", tier: 1 },
  { yahoo: "JPM", symbol: "JPM", name: "JPMorgan Chase", sector: "Financials", market: "equity", tier: 1 },
  { yahoo: "V", symbol: "V", name: "Visa", sector: "Financials", market: "equity", tier: 1 },
  { yahoo: "MA", symbol: "MA", name: "Mastercard", sector: "Financials", market: "equity", tier: 1 },
  { yahoo: "ORCL", symbol: "ORCL", name: "Oracle", sector: "Technology", market: "equity", tier: 1 },
  { yahoo: "UNH", symbol: "UNH", name: "UnitedHealth", sector: "Healthcare", market: "equity", tier: 1 },
  { yahoo: "XOM", symbol: "XOM", name: "Exxon Mobil", sector: "Energy", market: "equity", tier: 1 },
  { yahoo: "LLY", symbol: "LLY", name: "Eli Lilly", sector: "Healthcare", market: "equity", tier: 1 },
  { yahoo: "JNJ", symbol: "JNJ", name: "Johnson & Johnson", sector: "Healthcare", market: "equity", tier: 1 },
  { yahoo: "WMT", symbol: "WMT", name: "Walmart", sector: "Consumer", market: "equity", tier: 1 },
  { yahoo: "PG", symbol: "PG", name: "Procter & Gamble", sector: "Consumer", market: "equity", tier: 1 },
  { yahoo: "HD", symbol: "HD", name: "Home Depot", sector: "Consumer", market: "equity", tier: 1 },
  { yahoo: "COST", symbol: "COST", name: "Costco", sector: "Consumer", market: "equity", tier: 1 },
  { yahoo: "BAC", symbol: "BAC", name: "Bank of America", sector: "Financials", market: "equity", tier: 1 },
  { yahoo: "KO", symbol: "KO", name: "Coca-Cola", sector: "Consumer", market: "equity", tier: 1 },
  { yahoo: "PEP", symbol: "PEP", name: "PepsiCo", sector: "Consumer", market: "equity", tier: 1 },
  { yahoo: "CSCO", symbol: "CSCO", name: "Cisco", sector: "Technology", market: "equity", tier: 1 },
  { yahoo: "ABBV", symbol: "ABBV", name: "AbbVie", sector: "Healthcare", market: "equity", tier: 1 },
  { yahoo: "CRM", symbol: "CRM", name: "Salesforce", sector: "Software", market: "equity", tier: 1 },
  { yahoo: "AMD", symbol: "AMD", name: "Advanced Micro Devices", sector: "Semiconductors", market: "equity", tier: 1 },
  { yahoo: "NFLX", symbol: "NFLX", name: "Netflix", sector: "Consumer", market: "equity", tier: 1 },
  { yahoo: "DIS", symbol: "DIS", name: "Walt Disney", sector: "Consumer", market: "equity", tier: 1 },
  { yahoo: "ADBE", symbol: "ADBE", name: "Adobe", sector: "Software", market: "equity", tier: 1 },
  { yahoo: "QCOM", symbol: "QCOM", name: "Qualcomm", sector: "Semiconductors", market: "equity", tier: 1 },
  { yahoo: "CAT", symbol: "CAT", name: "Caterpillar", sector: "Industrials", market: "equity", tier: 1 },
  { yahoo: "GE", symbol: "GE", name: "GE Aerospace", sector: "Industrials", market: "equity", tier: 1 },
  { yahoo: "IBM", symbol: "IBM", name: "IBM", sector: "Technology", market: "equity", tier: 1 },
  { yahoo: "NOW", symbol: "NOW", name: "ServiceNow", sector: "Software", market: "equity", tier: 1 },
  { yahoo: "LIN", symbol: "LIN", name: "Linde", sector: "Materials", market: "equity", tier: 1 },
  { yahoo: "RTX", symbol: "RTX", name: "RTX", sector: "Industrials", market: "equity", tier: 1 },
  { yahoo: "ISRG", symbol: "ISRG", name: "Intuitive Surgical", sector: "Healthcare", market: "equity", tier: 1 },
  { yahoo: "INTU", symbol: "INTU", name: "Intuit", sector: "Software", market: "equity", tier: 1 },
  { yahoo: "AMAT", symbol: "AMAT", name: "Applied Materials", sector: "Semiconductors", market: "equity", tier: 1 },
  { yahoo: "UBER", symbol: "UBER", name: "Uber", sector: "Consumer", market: "equity", tier: 1 },
  { yahoo: "BKNG", symbol: "BKNG", name: "Booking Holdings", sector: "Consumer", market: "equity", tier: 1 },
  { yahoo: "TMO", symbol: "TMO", name: "Thermo Fisher", sector: "Healthcare", market: "equity", tier: 1 },
  { yahoo: "LOW", symbol: "LOW", name: "Lowe's", sector: "Consumer", market: "equity", tier: 1 },
  { yahoo: "PFE", symbol: "PFE", name: "Pfizer", sector: "Healthcare", market: "equity", tier: 2 },
  { yahoo: "HON", symbol: "HON", name: "Honeywell", sector: "Industrials", market: "equity", tier: 1 },
  { yahoo: "BLK", symbol: "BLK", name: "BlackRock", sector: "Financials", market: "equity", tier: 1 },
  { yahoo: "NEE", symbol: "NEE", name: "NextEra Energy", sector: "Energy", market: "equity", tier: 1 },
  { yahoo: "SYK", symbol: "SYK", name: "Stryker", sector: "Healthcare", market: "equity", tier: 1 },
  { yahoo: "GILD", symbol: "GILD", name: "Gilead", sector: "Healthcare", market: "equity", tier: 1 },
  { yahoo: "ADP", symbol: "ADP", name: "ADP", sector: "Industrials", market: "equity", tier: 1 },
  { yahoo: "C", symbol: "C", name: "Citigroup", sector: "Financials", market: "equity", tier: 1 },
  { yahoo: "GS", symbol: "GS", name: "Goldman Sachs", sector: "Financials", market: "equity", tier: 1 },
  { yahoo: "MS", symbol: "MS", name: "Morgan Stanley", sector: "Financials", market: "equity", tier: 1 },
  { yahoo: "AXP", symbol: "AXP", name: "American Express", sector: "Financials", market: "equity", tier: 1 },
  { yahoo: "SCHW", symbol: "SCHW", name: "Charles Schwab", sector: "Financials", market: "equity", tier: 1 },
  { yahoo: "BA", symbol: "BA", name: "Boeing", sector: "Industrials", market: "equity", tier: 2 },
  { yahoo: "INTC", symbol: "INTC", name: "Intel", sector: "Semiconductors", market: "equity", tier: 2 },
  { yahoo: "MU", symbol: "MU", name: "Micron", sector: "Semiconductors", market: "equity", tier: 1 },
  { yahoo: "AMGN", symbol: "AMGN", name: "Amgen", sector: "Healthcare", market: "equity", tier: 1 },
  { yahoo: "SBUX", symbol: "SBUX", name: "Starbucks", sector: "Consumer", market: "equity", tier: 2 },
  { yahoo: "MDLZ", symbol: "MDLZ", name: "Mondelez", sector: "Consumer", market: "equity", tier: 1 },
  { yahoo: "DE", symbol: "DE", name: "Deere", sector: "Industrials", market: "equity", tier: 1 },
  { yahoo: "LMT", symbol: "LMT", name: "Lockheed Martin", sector: "Industrials", market: "equity", tier: 1 },
  { yahoo: "UPS", symbol: "UPS", name: "United Parcel Service", sector: "Industrials", market: "equity", tier: 2 },
  { yahoo: "MDT", symbol: "MDT", name: "Medtronic", sector: "Healthcare", market: "equity", tier: 1 },
  { yahoo: "CVX", symbol: "CVX", name: "Chevron", sector: "Energy", market: "equity", tier: 1 },
  { yahoo: "COP", symbol: "COP", name: "ConocoPhillips", sector: "Energy", market: "equity", tier: 1 },
  { yahoo: "PM", symbol: "PM", name: "Philip Morris", sector: "Consumer", market: "equity", tier: 1 },
  { yahoo: "CMCSA", symbol: "CMCSA", name: "Comcast", sector: "Consumer", market: "equity", tier: 1 },
  { yahoo: "T", symbol: "T", name: "AT&T", sector: "Communications", market: "equity", tier: 2 },
  { yahoo: "VZ", symbol: "VZ", name: "Verizon", sector: "Communications", market: "equity", tier: 2 },
  { yahoo: "NKE", symbol: "NKE", name: "Nike", sector: "Consumer", market: "equity", tier: 2 },
  { yahoo: "TMUS", symbol: "TMUS", name: "T-Mobile", sector: "Communications", market: "equity", tier: 1 },
  { yahoo: "PLTR", symbol: "PLTR", name: "Palantir", sector: "Software", market: "equity", tier: 2 },
  { yahoo: "SHOP", symbol: "SHOP", name: "Shopify", sector: "Software", market: "equity", tier: 2 },
  { yahoo: "SMCI", symbol: "SMCI", name: "Super Micro Computer", sector: "Technology", market: "equity", tier: 3 },
  { yahoo: "COIN", symbol: "COIN", name: "Coinbase", sector: "Financials", market: "equity", tier: 2 },
  { yahoo: "MSTR", symbol: "MSTR", name: "MicroStrategy", sector: "Software", market: "equity", tier: 2 },
  { yahoo: "HOOD", symbol: "HOOD", name: "Robinhood", sector: "Financials", market: "equity", tier: 3 },
  { yahoo: "SOFI", symbol: "SOFI", name: "SoFi", sector: "Financials", market: "equity", tier: 3 },
  { yahoo: "RIVN", symbol: "RIVN", name: "Rivian", sector: "Consumer", market: "equity", tier: 3 },
  { yahoo: "LCID", symbol: "LCID", name: "Lucid", sector: "Consumer", market: "equity", tier: 4 },
  { yahoo: "SNAP", symbol: "SNAP", name: "Snap", sector: "Technology", market: "equity", tier: 3 },
  { yahoo: "RBLX", symbol: "RBLX", name: "Roblox", sector: "Technology", market: "equity", tier: 3 },
  { yahoo: "DKNG", symbol: "DKNG", name: "DraftKings", sector: "Consumer", market: "equity", tier: 3 },
  { yahoo: "MARA", symbol: "MARA", name: "Marathon Digital", sector: "Crypto Equity", market: "equity", tier: 3 },
  { yahoo: "RIOT", symbol: "RIOT", name: "Riot Platforms", sector: "Crypto Equity", market: "equity", tier: 3 },
  { yahoo: "CLSK", symbol: "CLSK", name: "CleanSpark", sector: "Crypto Equity", market: "equity", tier: 3 },
  { yahoo: "IREN", symbol: "IREN", name: "Iris Energy", sector: "Crypto Equity", market: "equity", tier: 3 },
  { yahoo: "GLD", symbol: "GLD", name: "SPDR Gold", sector: "Commodities", market: "equity", tier: 1 },
  { yahoo: "SLV", symbol: "SLV", name: "iShares Silver", sector: "Commodities", market: "equity", tier: 2 },
  { yahoo: "USO", symbol: "USO", name: "United States Oil", sector: "Commodities", market: "equity", tier: 3 },
  { yahoo: "SPY", symbol: "SPY", name: "SPDR S&P 500", sector: "Index", market: "equity", tier: 1 },
  { yahoo: "QQQ", symbol: "QQQ", name: "Invesco QQQ", sector: "Index", market: "equity", tier: 1 },
  { yahoo: "IWM", symbol: "IWM", name: "iShares Russell 2000", sector: "Index", market: "equity", tier: 1 },
  { yahoo: "TLT", symbol: "TLT", name: "iShares 20+ Year Treasury", sector: "Rates", market: "equity", tier: 1 },
  { yahoo: "HYG", symbol: "HYG", name: "iShares High Yield Corp", sector: "Credit", market: "equity", tier: 2 },
];

type Bar = {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

async function getJson(url: string) {
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; stack-attestation/1.0)" },
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

function mapBars(
  result: {
    timestamp?: number[];
    indicators?: { quote: Array<Record<string, Array<number | null>>> };
  },
  iso = false,
): Bar[] {
  const timestamps = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0];
  if (!quote) return [];
  const bars: Bar[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const open = quote.open[i];
    const high = quote.high[i];
    const low = quote.low[i];
    const close = quote.close[i];
    const volume = quote.volume[i] ?? 0;
    if ([open, high, low, close].some((value) => value == null || !Number.isFinite(Number(value)))) {
      continue;
    }
    if ((close as number) <= 0) continue;
    bars.push({
      ts: iso
        ? new Date(timestamps[i] * 1000).toISOString()
        : new Date(timestamps[i] * 1000).toISOString().slice(0, 10),
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: Number(volume) || 0,
    });
  }
  return bars;
}

async function fetchChart(symbol: string, interval: string, range: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includePrePost=false`;
  const data = await getJson(url);
  return data.chart.result?.[0] ?? null;
}

async function fetchSpot() {
  try {
    const gecko = await getJson(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true",
    );
    const coinbase = await getJson("https://api.exchange.coinbase.com/products/BTC-USD/ticker");
    return {
      gecko,
      coinbase: {
        price: Number(coinbase.price),
        time: coinbase.time as string,
        volume: Number(coinbase.volume),
        bid: Number(coinbase.bid),
        ask: Number(coinbase.ask),
      },
    };
  } catch (error) {
    console.warn("spot overlay failed", error);
    return null;
  }
}

async function main() {
  const assets: Array<Record<string, unknown>> = [];

  for (const spec of UNIVERSE) {
    try {
      const result = await fetchChart(spec.yahoo, "1d", "6mo");
      if (!result) {
        console.log("SKIP", spec.symbol);
        continue;
      }
      const bars = mapBars(result).slice(-90);
      if (bars.length < 60) {
        console.log("SHORT", spec.symbol, bars.length);
        continue;
      }
      const meta = result.meta ?? {};
      assets.push({
        ...spec,
        regularMarketPrice: meta.regularMarketPrice ?? bars.at(-1)?.close,
        regularMarketDayHigh: meta.regularMarketDayHigh ?? null,
        regularMarketDayLow: meta.regularMarketDayLow ?? null,
        fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
        fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
        bars,
      });
      console.log("OK", spec.symbol.padEnd(6), Number(bars.at(-1)?.close).toFixed(4));
    } catch (error) {
      console.log("FAIL", spec.symbol, error instanceof Error ? error.message : error);
    }
    await new Promise((resolve) => setTimeout(resolve, 70));
  }

  let btcHourly: Bar[] = [];
  try {
    const hourly = await fetchChart("BTC-USD", "1h", "14d");
    if (hourly) btcHourly = mapBars(hourly, true);
  } catch (error) {
    console.log("hourly failed", error);
  }

  const tape = {
    fetchedAt: new Date().toISOString(),
    source: "yahoo-finance + coinbase + coingecko",
    note: "Venue tape only. No synthetic OHLC.",
    spot: await fetchSpot(),
    assets,
    btcHourly,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(tape));
  console.log(
    "wrote",
    OUT,
    "assets",
    assets.length,
    "hourly",
    btcHourly.length,
    "bytes",
    Buffer.byteLength(JSON.stringify(tape)),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
