export type Severity = "critical" | "warning" | "ok";

export type Verdict =
  | "FAIL"
  | "PASS"
  | "KEEPER"
  | "FIXED"
  | "CLASS CLOSED"
  | "OPEN";

export type GateArm = {
  label: string;
  numerator: number;
  denominator: number;
  point: number;
  ci95: [number, number];
  verdict: Verdict;
};

export type GateEntry = {
  id: string;
  title: string;
  system: string;
  preregisteredAt: string | null;
  measuredAt: string;
  question: string;
  gate: {
    statistic: string;
    threshold: number;
    /** Which side of `threshold` clears the gate. */
    direction: "below" | "above";
    label: string;
  };
  arms: GateArm[];
  ciMethod: string;
  nEffective: number;
  runnerErrors: number;
  verdict: Verdict;
  consequence: string;
  lesson: string;
  reopenCondition: string;
  caseStudy: string | null;
};

export type CorrectionEntry = {
  id: string;
  title: string;
  system: string;
  measuredAt: string;
  question: string;
  before: { label: string; value: number };
  after: { label: string; value: number };
  factor: number;
  shareBefore: number;
  shareAfter: number;
  sample: { n: number; days: number };
  verdict: Verdict;
  lesson: string;
  reopenCondition: string;
  caseStudy: string | null;
};

export type AuditFinding = {
  ref: string;
  severity: Severity;
  summary: string;
  status: string;
};

export type AuditEntry = {
  id: string;
  title: string;
  system: string;
  measuredAt: string;
  method: string;
  headline: string;
  findings: AuditFinding[];
  shipped: string[];
  verdict: Verdict;
  reopenCondition: string;
  caseStudy: string | null;
  link: string | null;
};

export type EvidenceLedger = {
  schemaVersion: number;
  generatedAt: string;
  note: string;
  gates: GateEntry[];
  corrections: CorrectionEntry[];
  audits: AuditEntry[];
};
