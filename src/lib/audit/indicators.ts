import type { Bar } from "./types";
import { round } from "./hash";

export function emaSeries(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const alpha = 2 / (period + 1);
  const out = new Array<number>(values.length);
  out[0] = values[0];
  for (let i = 1; i < values.length; i++) {
    out[i] = values[i] * alpha + out[i - 1] * (1 - alpha);
  }
  return out;
}

export function sma(values: number[], period: number): number | null {
  if (values.length < period || period <= 0) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) {
    sum += values[i];
  }
  return sum / period;
}

export function trueRange(bar: Bar, prevClose: number): number {
  return Math.max(
    bar.high - bar.low,
    Math.abs(bar.high - prevClose),
    Math.abs(bar.low - prevClose),
  );
}

export interface AdxPoint {
  adx: number;
  plusDI: number;
  minusDI: number;
  dx: number;
}

export function adxLast(bars: Bar[], period: number): AdxPoint | null {
  if (bars.length < period + 2) return null;

  const plusDM: number[] = [];
  const minusDM: number[] = [];
  const tr: number[] = [];

  for (let i = 1; i < bars.length; i++) {
    const upMove = bars[i].high - bars[i - 1].high;
    const downMove = bars[i - 1].low - bars[i].low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    tr.push(trueRange(bars[i], bars[i - 1].close));
  }

  if (tr.length < period) return null;

  let atr = mean(tr.slice(0, period));
  let smPlus = mean(plusDM.slice(0, period));
  let smMinus = mean(minusDM.slice(0, period));

  const dxSeries: number[] = [];
  const first = directional(smPlus, smMinus, atr);
  dxSeries.push(first.dx);

  for (let i = period; i < tr.length; i++) {
    atr = (atr * (period - 1) + tr[i]) / period;
    smPlus = (smPlus * (period - 1) + plusDM[i]) / period;
    smMinus = (smMinus * (period - 1) + minusDM[i]) / period;
    dxSeries.push(directional(smPlus, smMinus, atr).dx);
  }

  if (dxSeries.length < period) return null;

  let adx = mean(dxSeries.slice(0, period));
  for (let i = period; i < dxSeries.length; i++) {
    adx = (adx * (period - 1) + dxSeries[i]) / period;
  }

  const last = directional(smPlus, smMinus, atr);
  return {
    adx: round(adx),
    plusDI: round(last.plusDI),
    minusDI: round(last.minusDI),
    dx: round(last.dx),
  };
}

function directional(smPlus: number, smMinus: number, atr: number) {
  const plusDI = atr === 0 ? 0 : (100 * smPlus) / atr;
  const minusDI = atr === 0 ? 0 : (100 * smMinus) / atr;
  const denom = plusDI + minusDI;
  const dx = denom === 0 ? 0 : (100 * Math.abs(plusDI - minusDI)) / denom;
  return { plusDI, minusDI, dx };
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function last<T>(values: T[]): T {
  return values[values.length - 1];
}
