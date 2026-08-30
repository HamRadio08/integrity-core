import type { CheckSeverity, GateId, GateStatus } from "./types";

export function formatShare(share: number): string {
  return `${Math.round(share * 100)}%`;
}

export function formatPct(value: number, digits = 2): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatNumber(value: number, digits = 2): string {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

export function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${Math.round(value).toLocaleString()}`;
}

export function shortHash(hex: string, size = 12): string {
  return hex.slice(0, size);
}

export function statusLabel(status: GateStatus): string {
  if (status === "PASS") return "PASS";
  if (status === "FAIL") return "FAIL";
  return "SKIP";
}

export function gateTitle(gateId: GateId): string {
  const labels: Record<GateId, string> = {
    trend_sep: "trend_sep",
    adx: "adx",
    volume_confirm: "volume_confirm",
    tier_reject: "tier_reject",
    accel_gate: "accel_gate",
  };
  return labels[gateId];
}

export function severityLabel(severity: CheckSeverity): string {
  if (severity === "pass") return "HOLDING";
  if (severity === "warn") return "WATCH";
  return "BROKEN";
}

export function formatAge(ms: number): string {
  const abs = Math.max(0, ms);
  if (abs < 60_000) return `${Math.round(abs / 1000)}s`;
  if (abs < 3_600_000) return `${Math.round(abs / 60_000)}m`;
  if (abs < 86_400_000) return `${(abs / 3_600_000).toFixed(1)}h`;
  return `${(abs / 86_400_000).toFixed(1)}d`;
}
