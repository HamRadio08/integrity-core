import type { GateId, RoleContract, StackConfig } from "./types";
import { GATE_IDS } from "./types";

export const STACK_CONFIG: StackConfig = {
  version: "seq-5.1.0",
  barCount: 80,
  trendSep: {
    emaFast: 12,
    emaSlow: 26,
    minSepPct: 0.0075,
    requireUptrend: true,
  },
  adx: {
    period: 14,
    minAdx: 22,
  },
  volumeConfirm: {
    lookback: 20,
    minRatio: 1.18,
  },
  tierReject: {
    maxTier: 3,
    // Per-market liquidity floors. A single floor could not be right for both: ADV is a
    // dollar figure on each side, but the two universes sit three orders of magnitude
    // apart, so one number is either dead on one side or brutal on the other.
    //
    // Both values are the 2_000_000 this repo already carried, so this is a STRUCTURE
    // change with zero behaviour change. Read that as a knob installed unarmed, not as a
    // calibration: measured over the committed tape (20-bar ADV, correct units), the
    // screen is INERT on both sides today --
    //
    //   crypto  n=18   thinnest ATOM  $27.0M   median $186M   -> 0 below the floor
    //   equity  n=99   thinnest LCID  $79.0M   median $1.37B  -> 0 below the floor
    //
    // The thinnest asset in the whole universe clears the floor by 13x. tier_reject's
    // role contract targets a ~7% kill share; the ADV half contributes 0% of it, and
    // every tier_reject kill observed so far came from the maxTier check alone.
    //
    // Arming these is a trading decision, not a code one: a liquidity floor should come
    // from intended order size (the usual anchor is an order <= 1% of ADV), which this
    // repo does not model. Set them from that, not from a percentile of today's tape.
    minAdv: { crypto: 2_000_000, equity: 2_000_000 },
  },
  accelGate: {
    lookback: 5,
    minRoc: 0.006,
    minAccel: 0,
  },
};

export const ROLE_CONTRACTS: RoleContract[] = [
  {
    gateId: "trend_sep",
    label: "trend_sep (EMA)",
    targetShare: 0.49,
    band: [0.4, 0.58],
    role: "Coarse regime filter. Most candidates die here because EMAs are tangled / no real trend.",
  },
  {
    gateId: "adx",
    label: "adx",
    targetShare: 0.18,
    band: [0.12, 0.24],
    role: "Trend strength after the EMAs already look separated.",
  },
  {
    gateId: "volume_confirm",
    label: "volume_confirm",
    targetShare: 0.18,
    band: [0.12, 0.24],
    role: "Participation. Quiet bars still fail even when price has a slope.",
  },
  {
    gateId: "tier_reject",
    label: "tier_reject",
    targetShare: 0.07,
    band: [0.02, 0.12],
    role: "Universe / quality screen. Low is good: you are not wiping most of the book.",
  },
  {
    gateId: "accel_gate",
    label: "accel_gate",
    targetShare: 0.04,
    band: [0.01, 0.08],
    role: "Last-mile momentum. Low because almost everything already failed earlier.",
  },
];

export const TARGET_COUNTS: Record<GateId | "PASSED", number> = {
  trend_sep: 97,
  adx: 36,
  volume_confirm: 35,
  tier_reject: 13,
  accel_gate: 8,
  PASSED: 11,
};

export function contractFor(gateId: GateId): RoleContract {
  const found = ROLE_CONTRACTS.find((row) => row.gateId === gateId);
  if (!found) throw new Error(`Missing role contract for ${gateId}`);
  return found;
}

export function gateOrder(): GateId[] {
  return [...GATE_IDS];
}
