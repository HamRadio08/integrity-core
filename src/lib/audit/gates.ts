import { STACK_CONFIG } from "./config";
import { round } from "./hash";
import { adxLast, emaSeries, last, sma } from "./indicators";
import type {
  Bar,
  Candidate,
  GateEvaluation,
  GateEvidence,
  GateId,
  GateStatus,
  MetricValue,
  StackConfig,
} from "./types";

export interface GateContext {
  candidate: Candidate;
  bars: Bar[];
  config: StackConfig;
  closes: number[];
  volumes: number[];
  fastEma: number[];
  slowEma: number[];
}

export interface GateResult {
  status: Exclude<GateStatus, "SKIP">;
  params: Record<string, MetricValue>;
  evidence: GateEvidence;
}

/**
 * Emit a metric only if it is a real number; otherwise `null`, meaning "not computed".
 *
 * `null` is already this codebase's convention for an unevaluable metric — accel_gate
 * returns `{ roc: null, priorRoc: null, accel: null }` when its window is longer than the
 * sealed history. This makes the other gates agree with it.
 *
 * Why it matters: a gate can decide FAIL correctly and still put a NaN in its evidence.
 * evaluateTrendSep does exactly that — `!Number.isFinite(sepPct)` sets the right status,
 * but the NaN went into metrics regardless. That NaN then reaches the seal, where
 * canonicalize() throws NonFiniteSealError and takes down the entire run. Measured on a
 * zero-bar candidate: trend_sep emitted sepPct=NaN, tier_reject emitted adv=NaN, and
 * evaluateCandidate threw instead of returning a record.
 *
 * This does NOT relax the seal. A non-finite a gate failed to normalize still throws —
 * that guarantee is the whole point. This stops gates from producing them, so the throw
 * is reserved for genuinely broken arithmetic instead of a candidate with no bars.
 */
function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

export function buildContext(
  candidate: Candidate,
  config: StackConfig = STACK_CONFIG,
): GateContext {
  const bars = candidate.bars;
  const closes = bars.map((bar) => bar.close);
  const volumes = bars.map((bar) => bar.volume);
  return {
    candidate,
    bars,
    config,
    closes,
    volumes,
    fastEma: emaSeries(closes, config.trendSep.emaFast),
    slowEma: emaSeries(closes, config.trendSep.emaSlow),
  };
}

export function evaluateTrendSep(ctx: GateContext): GateResult {
  const { emaFast, emaSlow, minSepPct, requireUptrend } = ctx.config.trendSep;
  const close = last(ctx.closes);
  const fast = last(ctx.fastEma);
  const slow = last(ctx.slowEma);
  const sepPct = close === 0 ? 0 : (fast - slow) / close;
  const absSep = Math.abs(sepPct);
  const prevFast = ctx.fastEma.at(-2) ?? fast;
  const prevSlow = ctx.slowEma.at(-2) ?? slow;
  const crossed = Math.sign(fast - slow) !== Math.sign(prevFast - prevSlow) && prevFast !== prevSlow;

  let status: Exclude<GateStatus, "SKIP"> = "PASS";
  let reason = `Fast EMA ${emaFast} leads slow EMA ${emaSlow} by ${(absSep * 100).toFixed(2)}%.`;

  if (!Number.isFinite(sepPct) || close <= 0) {
    status = "FAIL";
    reason = "Trend separation is undefined: price or EMA series is not finite.";
  } else if (absSep < minSepPct) {
    status = "FAIL";
    reason = `EMAs are tangled: |fast-slow|/close is ${(absSep * 100).toFixed(2)}% (need ≥ ${(minSepPct * 100).toFixed(2)}%).`;
  } else if (requireUptrend && sepPct <= 0) {
    status = "FAIL";
    reason = "Stack is long-only. Slow EMA is above fast EMA — no uptrend regime.";
  } else if (crossed) {
    status = "FAIL";
    reason = "EMAs crossed on the as-of bar. Regime is not yet separated.";
  }

  return {
    status,
    params: { emaFast, emaSlow, minSepPct, requireUptrend },
    evidence: {
      metrics: {
        close: round(close, 4),
        emaFast: round(fast),
        emaSlow: round(slow),
        sepPct: finiteOrNull(round(sepPct)),
        absSepPct: finiteOrNull(round(absSep)),
        crossed,
        barsUsed: ctx.bars.length,
      },
      reason,
    },
  };
}

export function evaluateAdx(ctx: GateContext): GateResult {
  const { period, minAdx } = ctx.config.adx;
  const point = adxLast(ctx.bars, period);

  if (!point) {
    return {
      status: "FAIL",
      params: { period, minAdx },
      evidence: {
        metrics: { adx: null, barsUsed: ctx.bars.length },
        reason: `ADX(${period}) needs more bars than ${ctx.bars.length}.`,
      },
    };
  }

  const status = point.adx >= minAdx ? "PASS" : "FAIL";
  return {
    status,
    params: { period, minAdx },
    evidence: {
      metrics: {
        adx: point.adx,
        plusDI: point.plusDI,
        minusDI: point.minusDI,
        dx: point.dx,
        barsUsed: ctx.bars.length,
      },
      reason:
        status === "PASS"
          ? `ADX ${point.adx.toFixed(1)} is at or above ${minAdx}. Directional strength confirmed.`
          : `ADX ${point.adx.toFixed(1)} is below ${minAdx}. Slope without strength.`,
    },
  };
}

export function evaluateVolume(ctx: GateContext): GateResult {
  const { lookback, minRatio } = ctx.config.volumeConfirm;
  const lastVolume = last(ctx.volumes);
  const avg = sma(ctx.volumes, lookback);
  const ratio = avg && avg > 0 ? lastVolume / avg : 0;
  const status = avg !== null && ratio >= minRatio ? "PASS" : "FAIL";

  return {
    status,
    params: { lookback, minRatio },
    evidence: {
      metrics: {
        lastVolume,
        avgVolume: avg === null ? null : round(avg, 2),
        ratio: round(ratio),
        barsUsed: Math.min(lookback, ctx.volumes.length),
      },
      reason:
        avg === null
          ? `Volume confirmation needs ${lookback} bars.`
          : status === "PASS"
            ? `Volume ${lastVolume.toLocaleString()} is ${ratio.toFixed(2)}× the ${lookback}-bar average.`
            : `Quiet tape: volume ratio ${ratio.toFixed(2)}× is below ${minRatio.toFixed(2)}×.`,
    },
  };
}

export function evaluateTier(ctx: GateContext): GateResult {
  const { maxTier, minAdv } = ctx.config.tierReject;
  const lookback = Math.min(20, ctx.bars.length);
  const slice = ctx.bars.slice(-lookback);
  const adv = slice.reduce((sum, bar) => sum + bar.close * bar.volume, 0) / lookback;
  const tierOk = ctx.candidate.tier <= maxTier;
  const advOk = adv >= minAdv;
  const status = tierOk && advOk ? "PASS" : "FAIL";

  let reason: string;
  if (!tierOk) {
    reason = `Tier ${ctx.candidate.tier} is outside the tradable universe (max ${maxTier}).`;
  } else if (!advOk) {
    reason = `Average dollar volume $${Math.round(adv).toLocaleString()} is below $${minAdv.toLocaleString()}.`;
  } else {
    reason = `Tier ${ctx.candidate.tier} with ADV $${Math.round(adv).toLocaleString()} clears the quality screen.`;
  }

  return {
    status,
    params: { maxTier, minAdv },
    evidence: {
      metrics: {
        tier: ctx.candidate.tier,
        adv: finiteOrNull(round(adv, 2)),
        barsUsed: lookback,
      },
      reason,
    },
  };
}

export function evaluateAccel(ctx: GateContext): GateResult {
  const { lookback, minRoc, minAccel } = ctx.config.accelGate;
  const fast = ctx.fastEma;
  const i = fast.length - 1;
  const prev = i - lookback;
  const prev2 = i - lookback * 2;

  if (prev2 < 0 || fast[prev] === 0 || fast[prev2] === 0) {
    return {
      status: "FAIL",
      params: { lookback, minRoc, minAccel },
      evidence: {
        metrics: { roc: null, priorRoc: null, accel: null },
        reason: "Acceleration window is longer than the sealed bar history.",
      },
    };
  }

  const roc = fast[i] / fast[prev] - 1;
  const priorRoc = fast[prev] / fast[prev2] - 1;
  const accel = roc - priorRoc;
  const status = roc >= minRoc && accel >= minAccel ? "PASS" : "FAIL";

  return {
    status,
    params: { lookback, minRoc, minAccel },
    evidence: {
      metrics: {
        emaFastNow: round(fast[i]),
        emaFastLag: round(fast[prev]),
        roc: round(roc),
        priorRoc: round(priorRoc),
        accel: round(accel),
        barsUsed: lookback * 2,
      },
      reason:
        status === "PASS"
          ? `Fast EMA accelerating: ROC ${(roc * 100).toFixed(2)}% vs prior ${(priorRoc * 100).toFixed(2)}%.`
          : roc < minRoc
            ? `Last-mile ROC ${(roc * 100).toFixed(2)}% is below ${(minRoc * 100).toFixed(2)}%. Trend is flattening.`
            : `Momentum is decelerating: ROC ${(roc * 100).toFixed(2)}% vs prior ${(priorRoc * 100).toFixed(2)}%.`,
    },
  };
}

export const GATE_EVALUATORS: Record<GateId, (ctx: GateContext) => GateResult> = {
  trend_sep: evaluateTrendSep,
  adx: evaluateAdx,
  volume_confirm: evaluateVolume,
  tier_reject: evaluateTier,
  accel_gate: evaluateAccel,
};

export function skippedEvaluation(
  gateId: GateId,
  order: number,
  priorFail: GateId,
): Omit<GateEvaluation, "digest"> {
  return {
    gateId,
    order,
    status: "SKIP",
    params: {},
    evidence: {
      metrics: { skipped: true, priorFail },
      reason: `Not evaluated. Sequential stack already failed at ${priorFail}.`,
    },
  };
}
