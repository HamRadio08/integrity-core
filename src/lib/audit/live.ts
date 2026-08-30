export const GECKO_IDS = "bitcoin,ethereum,solana,dogecoin,shiba-inu,dogwifcoin";

export const FUTURE_SPECS = [
  { yahoo: "BTC=F", symbol: "BTC", name: "Bitcoin futures" },
  { yahoo: "ETH=F", symbol: "ETH", name: "Ether futures" },
  { yahoo: "ES=F", symbol: "ES", name: "E-mini S&P 500" },
  { yahoo: "NQ=F", symbol: "NQ", name: "E-mini Nasdaq 100" },
  { yahoo: "YM=F", symbol: "YM", name: "E-mini Dow" },
  { yahoo: "RTY=F", symbol: "RTY", name: "E-mini Russell 2000" },
  { yahoo: "CL=F", symbol: "CL", name: "WTI crude" },
  { yahoo: "GC=F", symbol: "GC", name: "Gold" },
  { yahoo: "SI=F", symbol: "SI", name: "Silver" },
  { yahoo: "ZN=F", symbol: "ZN", name: "10-year T-note" },
] as const;

export const SPOT_SYMBOLS = [
  { gecko: "bitcoin", symbol: "BTC" },
  { gecko: "ethereum", symbol: "ETH" },
  { gecko: "solana", symbol: "SOL" },
  { gecko: "dogecoin", symbol: "DOGE" },
  { gecko: "shiba-inu", symbol: "SHIB" },
  { gecko: "dogwifcoin", symbol: "WIF" },
] as const;

export interface FutureQuote {
  yahoo: string;
  symbol: string;
  name: string;
  last: number | null;
  previousClose: number | null;
  changePct: number | null;
  asOf: string | null;
  source: "yahoo-finance";
  error: string | null;
}

export interface CiRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  branch: string;
  event: string;
  url: string;
  updatedAt: string;
}

export interface LiveSpot {
  id: string;
  symbol: string;
  usd: number;
  change24h: number | null;
  source: string;
  asOf: string;
}

export interface LiveDesk {
  fetchedAt: string;
  futures: FutureQuote[];
  ci: { source: string; runs: CiRun[]; latest: CiRun | null; error: string | null };
  spots: LiveSpot[];
  errors: string[];
}

const UA = { "User-Agent": "Mozilla/5.0 (compatible; stack-attestation/1.0)" };

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

async function getJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { ...UA, ...headers },
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

export async function fetchFutureQuote(spec: (typeof FUTURE_SPECS)[number]): Promise<FutureQuote> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(spec.yahoo)}?interval=1d&range=5d&includePrePost=false`;
  try {
    const data = (await getJson(url)) as {
      chart?: {
        result?: Array<{
          meta?: {
            regularMarketPrice?: number;
            regularMarketTime?: number;
            chartPreviousClose?: number;
            shortName?: string;
          };
          indicators?: { quote?: Array<{ close?: Array<number | null> }> };
        }>;
      };
    };
    const result = data.chart?.result?.[0];
    if (!result) throw new Error("empty chart");
    const meta = result.meta ?? {};
    const closes = (result.indicators?.quote?.[0]?.close ?? []).filter(finite);
    const last = finite(meta.regularMarketPrice) ? meta.regularMarketPrice : (closes.at(-1) ?? null);
    const previousClose = finite(meta.chartPreviousClose)
      ? meta.chartPreviousClose
      : closes.length >= 2
        ? closes[closes.length - 2]
        : null;
    const changePct = last != null && previousClose != null && previousClose > 0 ? last / previousClose - 1 : null;
    const asOf = finite(meta.regularMarketTime) ? new Date(meta.regularMarketTime * 1000).toISOString() : null;
    return {
      yahoo: spec.yahoo,
      symbol: spec.symbol,
      name: meta.shortName ?? spec.name,
      last,
      previousClose,
      changePct,
      asOf,
      source: "yahoo-finance",
      error: last == null ? "Venue printed no last." : null,
    };
  } catch (error) {
    return {
      yahoo: spec.yahoo,
      symbol: spec.symbol,
      name: spec.name,
      last: null,
      previousClose: null,
      changePct: null,
      asOf: null,
      source: "yahoo-finance",
      error: error instanceof Error ? error.message : "Yahoo futures fetch failed.",
    };
  }
}

export async function fetchFutures(): Promise<FutureQuote[]> {
  return Promise.all(FUTURE_SPECS.map((spec) => fetchFutureQuote(spec)));
}

export async function fetchCiRuns(
  repo = "HamRadio08/integrity-core",
): Promise<{ runs: CiRun[]; error: string | null }> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  const token = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const data = (await getJson(`https://api.github.com/repos/${repo}/actions/runs?per_page=8`, headers)) as {
      workflow_runs?: Array<{
        id: number;
        name: string | null;
        status: string;
        conclusion: string | null;
        head_branch: string | null;
        event: string;
        html_url: string;
        updated_at: string;
      }>;
    };
    const runs = (data.workflow_runs ?? []).map((run) => ({
      id: run.id,
      name: run.name ?? "workflow",
      status: run.status,
      conclusion: run.conclusion,
      branch: run.head_branch ?? "",
      event: run.event,
      url: run.html_url,
      updatedAt: run.updated_at,
    }));
    return { runs, error: null };
  } catch (error) {
    return { runs: [], error: error instanceof Error ? error.message : "GitHub Actions fetch failed." };
  }
}

export async function fetchLiveSpots(): Promise<{ spots: LiveSpot[]; coinbaseAsOf: string | null; errors: string[] }> {
  const errors: string[] = [];
  const now = new Date().toISOString();
  let gecko: Record<string, { usd?: number; usd_24h_change?: number }> = {};
  let coinbaseAsOf: string | null = null;
  let coinbasePrice: number | null = null;

  const geckoUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${GECKO_IDS}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`;
  const geckoResult = await Promise.allSettled([
    getJson(geckoUrl),
    getJson("https://api.exchange.coinbase.com/products/BTC-USD/ticker"),
  ]);

  if (geckoResult[0].status === "fulfilled") {
    gecko = geckoResult[0].value as typeof gecko;
  } else {
    errors.push(`CoinGecko: ${geckoResult[0].reason instanceof Error ? geckoResult[0].reason.message : "failed"}`);
  }

  if (geckoResult[1].status === "fulfilled") {
    const ticker = geckoResult[1].value as { price?: string; time?: string };
    const price = Number(ticker.price);
    if (finite(price) && price > 0) coinbasePrice = price;
    coinbaseAsOf = typeof ticker.time === "string" ? ticker.time : now;
  } else {
    errors.push(`Coinbase: ${geckoResult[1].reason instanceof Error ? geckoResult[1].reason.message : "failed"}`);
  }

  const spots: LiveSpot[] = [];
  for (const spec of SPOT_SYMBOLS) {
    if (spec.symbol === "BTC" && coinbasePrice != null) {
      spots.push({
        id: "coinbase-btc",
        symbol: "BTC",
        usd: coinbasePrice,
        change24h: finite(gecko.bitcoin?.usd_24h_change) ? gecko.bitcoin.usd_24h_change / 100 : null,
        source: "coinbase",
        asOf: coinbaseAsOf ?? now,
      });
      continue;
    }
    const row = gecko[spec.gecko];
    if (!row || !finite(row.usd) || row.usd <= 0) continue;
    spots.push({
      id: `gecko-${spec.gecko}`,
      symbol: spec.symbol,
      usd: row.usd,
      change24h: finite(row.usd_24h_change) ? row.usd_24h_change / 100 : null,
      source: "coingecko",
      asOf: now,
    });
  }
  return { spots, coinbaseAsOf, errors };
}

export async function fetchLiveDesk(): Promise<LiveDesk> {
  const fetchedAt = new Date().toISOString();
  const [futures, ci, spots] = await Promise.all([fetchFutures(), fetchCiRuns(), fetchLiveSpots()]);
  const errors = [...spots.errors];
  if (ci.error) errors.push(`CI: ${ci.error}`);
  const missingFutures = futures.filter((row) => row.last == null).length;
  if (missingFutures === futures.length) errors.push("Yahoo returned no futures prints.");
  return {
    fetchedAt,
    futures,
    ci: {
      source: "github-actions",
      runs: ci.runs,
      latest: ci.runs[0] ?? null,
      error: ci.error,
    },
    spots: spots.spots,
    errors,
  };
}
