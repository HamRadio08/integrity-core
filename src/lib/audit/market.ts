import { readFileSync } from "node:fs";
import { join } from "node:path";
import { STACK_CONFIG } from "./config";
import { evaluateCandidate, sealRecord } from "./engine";
import { GENESIS, roundBar } from "./hash";
import type { Bar, Candidate, CandidateRecord, Market, PumpWindow, TapeInfo } from "./types";

export interface TapeAsset {
  yahoo: string;
  symbol: string;
  name: string;
  sector: string;
  market: Market;
  tier: 1 | 2 | 3 | 4;
  regularMarketPrice?: number;
  regularMarketDayHigh?: number | null;
  regularMarketDayLow?: number | null;
  fiftyTwoWeekHigh?: number | null;
  fiftyTwoWeekLow?: number | null;
  bars: Bar[];
}

export interface LiveTape {
  fetchedAt: string;
  source: string;
  note: string;
  spot: {
    gecko?: Record<string, { usd: number; usd_24h_change?: number; usd_24h_vol?: number }>;
    coinbase?: { price: number; time: string; volume: number; bid: number; ask: number };
  } | null;
  assets: TapeAsset[];
  btcHourly: Bar[];
}

function change(bars: Bar[], lookback: number): number | null {
  if (bars.length <= lookback) return null;
  const prev = bars[bars.length - 1 - lookback].close;
  const last = bars[bars.length - 1].close;
  if (prev <= 0) return null;
  return last / prev - 1;
}

let spotOverlay: LiveTape["spot"] | null = null;

export function setSpotOverlay(spot: LiveTape["spot"]) {
  spotOverlay = spot;
}

export function loadTape(cwd = process.cwd()): LiveTape {
  const raw = readFileSync(join(cwd, "data/live-tape.json"), "utf8");
  const tape = JSON.parse(raw) as LiveTape;
  if (spotOverlay) tape.spot = spotOverlay;
  return tape;
}

export function markToMarket(bars: Bar[], spot: number, asOfDate: string): Bar[] {
  if (!Number.isFinite(spot) || spot <= 0 || bars.length === 0) return bars.map(roundBar);
  const next = bars.map(roundBar);
  const last = { ...next[next.length - 1] };
  if (last.ts === asOfDate || last.ts.startsWith(asOfDate)) {
    last.close = spot;
    last.high = Math.max(last.high, spot);
    last.low = Math.min(last.low, spot);
    next[next.length - 1] = roundBar(last);
  }
  return next;
}

export function tapeInfo(tape: LiveTape): TapeInfo {
  const spotBtc = tape.spot?.coinbase?.price ?? tape.spot?.gecko?.bitcoin?.usd ?? null;
  return {
    fetchedAt: tape.fetchedAt,
    source: tape.source,
    note: tape.note,
    spotBtc,
    spotTime: tape.spot?.coinbase?.time ?? tape.fetchedAt,
  };
}

function spotForSymbol(symbol: string, tape: LiveTape): number | null {
  const gecko = tape.spot?.gecko ?? {};
  const coinbase = tape.spot?.coinbase?.price;
  const fromGecko = (id: string) => {
    const usd = gecko[id]?.usd;
    return typeof usd === "number" && Number.isFinite(usd) && usd > 0 ? usd : null;
  };
  if (symbol === "BTC") return (typeof coinbase === "number" && coinbase > 0 ? coinbase : null) ?? fromGecko("bitcoin");
  if (symbol === "ETH") return fromGecko("ethereum");
  if (symbol === "SOL") return fromGecko("solana");
  if (symbol === "DOGE") return fromGecko("dogecoin");
  if (symbol === "SHIB") return fromGecko("shiba-inu");
  if (symbol === "WIF") return fromGecko("dogwifcoin");
  return null;
}

export function assetToCandidate(asset: TapeAsset, index: number, barCount: number, tape: LiveTape): Candidate {
  let bars = asset.bars.slice(-barCount).map(roundBar);
  const asOf = bars.at(-1)?.ts ?? tape.fetchedAt.slice(0, 10);
  const spot = spotForSymbol(asset.symbol, tape);
  if (spot != null) bars = markToMarket(bars, spot, asOf);
  const last = bars.at(-1)?.close ?? 0;
  return {
    id: `C-${String(index + 1).padStart(3, "0")}`,
    symbol: asset.symbol,
    name: asset.name,
    sector: asset.sector,
    market: asset.market,
    tier: asset.tier,
    asOf,
    origin: "live-tape",
    last,
    chg5d: change(bars, 5),
    chg20d: change(bars, 20),
    bars,
  };
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildLiveUniverse(seed: number, barCount = STACK_CONFIG.barCount): Candidate[] {
  const tape = loadTape();
  const candidates = tape.assets
    .filter((asset) => asset.bars.length >= 60 && asset.bars.every((bar) => bar.close > 0))
    .map((asset, index) => assetToCandidate(asset, index, barCount, tape));

  const rng = mulberry32(seed);
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  return candidates.map((candidate, index) => ({
    ...candidate,
    id: `C-${String(index + 1).padStart(3, "0")}`,
  }));
}

export function btcHourlyCandidate(tape: LiveTape, barCount = STACK_CONFIG.barCount): Candidate | null {
  if (tape.btcHourly.length < barCount) return null;
  let bars = tape.btcHourly.slice(-barCount).map(roundBar);
  const asOf = bars.at(-1)?.ts ?? tape.fetchedAt;
  const spot = tape.spot?.coinbase?.price ?? tape.spot?.gecko?.bitcoin?.usd;
  if (spot) bars = markToMarket(bars, spot, asOf.slice(0, 10));
  return {
    id: "C-BTC-1H",
    symbol: "BTC",
    name: "Bitcoin (1h pump window)",
    sector: "Crypto",
    market: "crypto",
    tier: 1,
    asOf,
    origin: "live-tape",
    last: bars.at(-1)?.close ?? 0,
    chg5d: change(bars, 5),
    chg20d: change(bars, 24),
    bars,
  };
}

export function measurePump(tape: LiveTape): PumpWindow {
  const asset = tape.assets.find((item) => item.symbol === "BTC");
  const daily = asset ? assetToCandidate(asset, 0, STACK_CONFIG.barCount, tape) : null;
  const hourly = tape.btcHourly;
  const series = hourly.length ? hourly : daily?.bars ?? [];
  const last = tape.spot?.coinbase?.price ?? daily?.last ?? series.at(-1)?.close ?? 0;
  const window = series.slice(-14 * 24) ;
  const use = window.length ? window : series;
  const trough14d = use.reduce((min, bar) => Math.min(min, bar.low, bar.close), Number.POSITIVE_INFINITY);
  const peak14d = use.reduce((max, bar) => Math.max(max, bar.high, bar.close), 0);
  const weekAgo =
    hourly.find((bar) => bar.ts.startsWith(shiftDate(tape.fetchedAt.slice(0, 10), -7)))?.close ??
    daily?.bars.at(-8)?.close ??
    last;
  return {
    symbol: "BTC",
    last,
    asOf: tape.spot?.coinbase?.time ?? tape.fetchedAt,
    dayHigh: asset?.regularMarketDayHigh ?? peak14d,
    dayLow: asset?.regularMarketDayLow ?? trough14d,
    weekAgo,
    weekReturn: weekAgo > 0 ? last / weekAgo - 1 : 0,
    trough14d: Number.isFinite(trough14d) ? trough14d : last,
    peak14d,
    drawupFromTrough: trough14d > 0 ? last / trough14d - 1 : 0,
    givebackFromPeak: peak14d > 0 ? last / peak14d - 1 : 0,
    cleared75k: last > 75_000,
  };
}

function shiftDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function sealFeatured(tape: LiveTape): {
  daily: CandidateRecord;
  hourly: CandidateRecord | null;
  hourlyBars: Bar[] | null;
  dailyBars: Bar[];
} {
  const asset = tape.assets.find((item) => item.symbol === "BTC");
  if (!asset) throw new Error("BTC is missing from the live tape.");
  const dailyCandidate = {
    ...assetToCandidate(asset, 0, STACK_CONFIG.barCount, tape),
    id: "C-BTC-1D",
  };
  const daily = sealRecord({
    index: 0,
    candidate: dailyCandidate,
    config: STACK_CONFIG,
    prevDigest: GENESIS,
  });
  const hourlyCandidate = btcHourlyCandidate(tape);
  if (!hourlyCandidate) {
    return { daily: daily.record, hourly: null, hourlyBars: null, dailyBars: daily.bars };
  }
  const hourly = sealRecord({
    index: 0,
    candidate: hourlyCandidate,
    config: STACK_CONFIG,
    prevDigest: GENESIS,
  });
  return {
    daily: daily.record,
    hourly: hourly.record,
    hourlyBars: hourly.bars,
    dailyBars: daily.bars,
  };
}

export function evaluateLive(symbol: string): ReturnType<typeof evaluateCandidate> & { candidate: Candidate } {
  const tape = loadTape();
  const asset = tape.assets.find((item) => item.symbol === symbol);
  if (!asset) throw new Error(`${symbol} is not on the live tape.`);
  const candidate = assetToCandidate(asset, 0, STACK_CONFIG.barCount, tape);
  return { candidate, ...evaluateCandidate(candidate) };
}
