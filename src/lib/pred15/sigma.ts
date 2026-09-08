/** PRED15 math. No I/O, no orders, no attested-chain writes. */

export const SECONDS_PER_YEAR = 31_557_600;
export const FEE_BAND_PP = 4;
export const SETTLE_BAND_S = 60;

export type Strip =
  | "NO_BET"
  | "ALIGN_OVER"
  | "ALIGN_UNDER"
  | "FIGHT_OVER"
  | "FIGHT_UNDER"
  | "SETTLE_WATCH";

export interface VolStub {
  lo: number;
  hi: number;
  realized?: number | null;
}

export interface Pred15Card {
  secondsLeft: number;
  settleBand: boolean;
  strike: number;
  spot: number;
  gap: number;
  sigmaLo: number;
  sigmaHi: number;
  zLo: number;
  zHi: number;
  pOverLo: number;
  pOverHi: number;
  venueOver: number | null;
  strip: Strip;
  reason: string;
  proxy: "coinbase-last";
  oracle: "brti-60s-average";
}

export function normCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-a * a));
  return sign * y;
}

export function windowBounds(now = new Date(), timeZone = "America/New_York"): {
  start: Date;
  end: Date;
  remaining: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const year = pick("year");
  const month = pick("month");
  const day = pick("day");
  const hour = pick("hour");
  const minute = pick("minute");
  const second = pick("second");
  const floorMin = Math.floor(minute / 15) * 15;
  const startUtcGuess = Date.UTC(year, month - 1, day, hour, floorMin, 0);
  // Interpret civil ET parts as an instant by offsetting the current TZ delta.
  const tzDelta = startUtcGuess - Date.UTC(year, month - 1, day, hour, floorMin, 0);
  void tzDelta;
  const asOffset = etOffsetMs(now, timeZone);
  const start = new Date(Date.UTC(year, month - 1, day, hour, floorMin, 0) - asOffset);
  const end = new Date(start.getTime() + 15 * 60 * 1000);
  const remaining = Math.max(0, (end.getTime() - now.getTime()) / 1000);
  return { start, end, remaining };
}

function etOffsetMs(now: Date, timeZone: string): number {
  const utc = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }));
  const zoned = new Date(now.toLocaleString("en-US", { timeZone }));
  return zoned.getTime() - utc.getTime();
}

export function tauYears(secondsLeft: number): number {
  return Math.max(secondsLeft, 0) / SECONDS_PER_YEAR;
}

export function logMoneyness(spot: number, strike: number): number {
  if (spot <= 0 || strike <= 0) throw new Error("spot and strike must be positive");
  return Math.log(spot / strike);
}

export function sigmaDistance(spot: number, strike: number, secondsLeft: number, sigma: number): number {
  const t = tauYears(secondsLeft);
  const denom = t > 0 && sigma > 0 ? sigma * Math.sqrt(t) : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(denom) || denom === 0) {
    const gap = spot - strike;
    if (gap > 0) return Number.POSITIVE_INFINITY;
    if (gap < 0) return Number.NEGATIVE_INFINITY;
    return 0;
  }
  return logMoneyness(spot, strike) / denom;
}

export function d2(spot: number, strike: number, secondsLeft: number, sigma: number, r = 0): number {
  const t = tauYears(secondsLeft);
  if (t <= 0 || sigma <= 0) return spot >= strike ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  return (logMoneyness(spot, strike) + (r - 0.5 * sigma * sigma) * t) / (sigma * Math.sqrt(t));
}

export function bsPOver(spot: number, strike: number, secondsLeft: number, sigma: number): number {
  if (secondsLeft <= 0) return spot >= strike ? 1 : 0;
  return normCdf(d2(spot, strike, secondsLeft, sigma));
}

export function decideStrip(input: {
  secondsLeft: number;
  pLo: number;
  pHi: number;
  venueOver: number | null;
  zMid: number;
}): { strip: Strip; reason: string } {
  const { secondsLeft, pLo, pHi, venueOver, zMid } = input;
  if (secondsLeft <= SETTLE_BAND_S) {
    return {
      strip: "SETTLE_WATCH",
      reason: "Last 60s is BRTI average, not last tick. Default no bet unless running mean is clearly through K.",
    };
  }

  const modelMid = 0.5 * (pLo + pHi);
  const leanOver = pLo >= 0.55;
  const leanUnder = pHi <= 0.45;
  const fee = FEE_BAND_PP / 100;

  if (venueOver == null) {
    if (Math.abs(zMid) < 0.5) return { strip: "NO_BET", reason: "No venue odds and |z|<0.5. Coin flip." };
    return { strip: "NO_BET", reason: "Lean on math only. Wait for venue price before ALIGN." };
  }

  const edgeVsHi = modelMid - venueOver;

  if (pLo - fee <= venueOver && venueOver <= pHi + fee) {
    if (Math.abs(zMid) >= 1.5 && venueOver <= 0.35 && leanUnder) {
      return { strip: "ALIGN_UNDER", reason: "Large under-gap and venue Under still not maxed." };
    }
    if (Math.abs(zMid) >= 1.5 && venueOver >= 0.65 && leanOver) {
      return { strip: "ALIGN_OVER", reason: "Large over-gap and venue Over still not maxed." };
    }
    return {
      strip: "NO_BET",
      reason: `Venue ${(venueOver * 100).toFixed(0)}% inside model band ${(pLo * 100).toFixed(0)}%–${(pHi * 100).toFixed(0)}% ± fee.`,
    };
  }

  if (edgeVsHi > fee && venueOver <= 0.25 && modelMid >= 0.3) {
    return {
      strip: "FIGHT_OVER",
      reason: "Venue Over is a wing vs model mid (>=30%). Lottery size only. Human-only.",
    };
  }
  if (-edgeVsHi > fee && venueOver >= 0.75) {
    return {
      strip: "FIGHT_UNDER",
      reason: "Venue Over is rich vs model mid. Do not chase Under in the 90s unless cheap.",
    };
  }
  if (edgeVsHi > fee && leanOver) {
    return { strip: "FIGHT_OVER", reason: "Model band above venue Over by more than fee. Still human-only." };
  }
  if (-edgeVsHi > fee && leanUnder) {
    return { strip: "FIGHT_UNDER", reason: "Model band below venue Over by more than fee. Still human-only." };
  }
  return {
    strip: "NO_BET",
    reason: `Disagreement exists but does not clear fee band (${FEE_BAND_PP.toFixed(0)} pp) with a stable lean.`,
  };
}

export function buildCard(input: {
  spot: number;
  strike: number;
  secondsLeft: number;
  vol: VolStub;
  venueOver?: number | null;
}): Pred15Card {
  const { spot, strike, secondsLeft, vol } = input;
  const venueOver = input.venueOver ?? null;
  const lo = Math.min(vol.lo, vol.hi);
  const hi = Math.max(vol.lo, vol.hi);
  const zLo = sigmaDistance(spot, strike, secondsLeft, hi);
  const zHi = sigmaDistance(spot, strike, secondsLeft, lo);
  let pLo = bsPOver(spot, strike, secondsLeft, hi);
  let pHi = bsPOver(spot, strike, secondsLeft, lo);
  if (pLo > pHi) [pLo, pHi] = [pHi, pLo];
  const zMid = 0.5 * (zLo + zHi);
  const { strip, reason } = decideStrip({
    secondsLeft,
    pLo,
    pHi,
    venueOver,
    zMid,
  });
  return {
    secondsLeft,
    settleBand: secondsLeft <= SETTLE_BAND_S,
    strike,
    spot,
    gap: spot - strike,
    sigmaLo: lo,
    sigmaHi: hi,
    zLo,
    zHi,
    pOverLo: pLo,
    pOverHi: pHi,
    venueOver,
    strip,
    reason,
    proxy: "coinbase-last",
    oracle: "brti-60s-average",
  };
}
