// Declared execution order of the sequential stack. This is the order the engine runs
// (`gateOrder()` → `evaluateCandidate`) AND the order the `gate-order` invariant attests, so
// editing this array changes what the desk certifies.
//
// tier_reject leads. Liquidity and universe eligibility are properties of the ASSET, not of
// its current signal: they are knowable before any indicator is computed, and nothing
// upstream feeds them. Sitting fourth, tier_reject was only reached by candidates that had
// already cleared three signal gates — 8 of 117 on the committed tape, so 109 names (93%)
// were never liquidity-checked at all, and five of the six thinnest names on the tape died
// at trend_sep before the screen ever saw them (#7).
//
// Front-loading it is selection-neutral: the stack is a short-circuit AND-chain, so a
// candidate passes iff it passes all five gates, whatever order they run in. What moves is
// kill ATTRIBUTION, and with it the reach of the universe screen — 6.8% → 100% of the book.
export const GATE_IDS = [
  "tier_reject",
  "trend_sep",
  "adx",
  "volume_confirm",
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
  // Keyed by market: ADV is a dollar figure on both sides, but the crypto and equity
  // universes sit orders of magnitude apart, so one floor cannot serve both. evaluateTier
  // resolves this to the scalar for the candidate's own market before sealing, so the
  // evidence payload keeps carrying a plain number and the record shape is unchanged.
  minAdv: Record<Market, number>;
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

export type StrategyBucketId = GateId | "PASSED" | "BOOK";

export interface PnlBucket {
  id: StrategyBucketId;
  label: string;
  count: number;
  share: number;
  meanChg5d: number | null;
  medianChg5d: number | null;
  meanChg20d: number | null;
  breadth5d: number | null;
  sample5d: number;
}

export interface MemeRung {
  rank: number;
  candidateId: string;
  symbol: string;
  name: string;
  last: number;
  chg5d: number | null;
  chg20d: number | null;
  outcome: Outcome;
  killGate: GateId | null;
  reason: string | null;
}

export type FreshnessSeverity = "ok" | "watch" | "fail";

export interface Freshness {
  tapeFetchedAt: string;
  tapeAgeMs: number;
  spotTime: string | null;
  source: string;
  severity: FreshnessSeverity;
  detail: string;
}

export interface ContractWatch {
  id: string;
  title: string;
  severity: CheckSeverity;
  detail: string;
  gateId?: GateId;
}

export interface DeskSnapshot {
  measuredAt: string;
  freshness: Freshness;
  pnlByStrategy: PnlBucket[];
  memeLadder: MemeRung[];
  watches: ContractWatch[];
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
  desk: DeskSnapshot;
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
