export const GATE_IDS = [
  "trend_sep",
  "adx",
  "volume_confirm",
  "tier_reject",
  "accel_gate",
] as const;

export type GateId = (typeof GATE_IDS)[number];

export type GateStatus = "PASS" | "FAIL" | "SKIP";

export type Outcome = "PASSED" | "KILLED";

export type CheckSeverity = "pass" | "warn" | "fail";

export type MetricValue = number | string | boolean | null;

export interface Bar {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Market = "crypto" | "equity";

export interface Candidate {
  id: string;
  symbol: string;
  name: string;
  sector: string;
  market: Market;
  tier: 1 | 2 | 3 | 4;
  asOf: string;
  origin: "live-tape";
  intendedKill?: GateId | "PASSED" | null;
  last: number;
  chg5d: number | null;
  chg20d: number | null;
  bars: Bar[];
}

export interface TrendSepParams {
  emaFast: number;
  emaSlow: number;
  minSepPct: number;
  requireUptrend: boolean;
}

export interface AdxParams {
  period: number;
  minAdx: number;
}

export interface VolumeParams {
  lookback: number;
  minRatio: number;
}

export interface TierParams {
  maxTier: number;
  minAdv: number;
}

export interface AccelParams {
  lookback: number;
  minRoc: number;
  minAccel: number;
}

export interface StackConfig {
  version: string;
  barCount: number;
  trendSep: TrendSepParams;
  adx: AdxParams;
  volumeConfirm: VolumeParams;
  tierReject: TierParams;
  accelGate: AccelParams;
}

export interface RoleContract {
  gateId: GateId;
  label: string;
  targetShare: number;
  band: readonly [number, number];
  role: string;
}

export interface GateEvidence {
  metrics: Record<string, MetricValue>;
  reason: string;
}

export interface GateEvaluation {
  gateId: GateId;
  order: number;
  status: GateStatus;
  params: Record<string, MetricValue>;
  evidence: GateEvidence;
  digest: string;
}

export interface CandidateRecord {
  index: number;
  candidateId: string;
  symbol: string;
  name: string;
  sector: string;
  market: Market;
  tier: number;
  asOf: string;
  origin: "live-tape";
  intendedKill: GateId | "PASSED" | null;
  last: number;
  chg5d: number | null;
  chg20d: number | null;
  barsDigest: string;
  configDigest: string;
  evaluations: GateEvaluation[];
  outcome: Outcome;
  killGate: GateId | null;
  recordDigest: string;
  prevDigest: string;
}

export interface FunnelRow {
  gateId: GateId;
  label: string;
  count: number;
  share: number;
  role: string;
  targetShare: number;
  band: readonly [number, number];
  inBand: boolean;
}

export interface IntegrityCheck {
  id: string;
  title: string;
  severity: CheckSeverity;
  detail: string;
}

export interface IntegrityReport {
  ok: boolean;
  tamperDetected: boolean;
  replayMatched: boolean;
  contractHeld: boolean;
  checks: IntegrityCheck[];
}

export interface TapeInfo {
  fetchedAt: string;
  source: string;
  note: string;
  spotBtc: number | null;
  spotTime: string | null;
}

export interface PumpWindow {
  symbol: "BTC";
  last: number;
  asOf: string;
  dayHigh: number;
  dayLow: number;
  weekAgo: number;
  weekReturn: number;
  trough14d: number;
  peak14d: number;
  drawupFromTrough: number;
  givebackFromPeak: number;
  cleared75k: boolean;
}

export interface FeaturedCase {
  daily: CandidateRecord;
  hourly: CandidateRecord | null;
  hourlyNote: string | null;
  pump: PumpWindow;
}

export interface AuditRun {
  runId: string;
  protocol: "stack-attestation/v1";
  startedAt: string;
  seed: number;
  config: StackConfig;
  configDigest: string;
  genesisDigest: string;
  chainHead: string;
  attestationDigest: string;
  candidateCount: number;
  passedCount: number;
  killedCount: number;
  tape: TapeInfo;
  featured: FeaturedCase | null;
  funnel: FunnelRow[];
  records: CandidateRecord[];
  integrity: IntegrityReport;
}

export interface AuditBundle extends AuditRun {
  barsByCandidate: Record<string, Bar[]>;
}

export interface VerifyRequest {
  run: AuditRun;
  barsByCandidate?: Record<string, Bar[]>;
}

export interface VerifyResponse {
  ok: boolean;
  report: IntegrityReport;
}
