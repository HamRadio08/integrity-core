import { gateOrder, STACK_CONFIG } from "./config";
import { digestOf, GENESIS, roundBar } from "./hash";
import {
  buildContext,
  GATE_EVALUATORS,
  skippedEvaluation,
} from "./gates";
import type {
  Bar,
  Candidate,
  CandidateRecord,
  GateEvaluation,
  StackConfig,
} from "./types";

export function digestBars(bars: Bar[]): string {
  return digestOf(bars.map(roundBar));
}

export function digestConfig(config: StackConfig): string {
  return digestOf(config);
}

function sealEvaluation(
  evaluation: Omit<GateEvaluation, "digest">,
): GateEvaluation {
  const digest = digestOf({
    gateId: evaluation.gateId,
    order: evaluation.order,
    status: evaluation.status,
    params: evaluation.params,
    evidence: evaluation.evidence,
  });
  return { ...evaluation, digest };
}

export function evaluateCandidate(
  candidate: Candidate,
  config: StackConfig = STACK_CONFIG,
): { evaluations: GateEvaluation[]; killGate: CandidateRecord["killGate"]; outcome: CandidateRecord["outcome"] } {
  const ctx = buildContext(candidate, config);
  const evaluations: GateEvaluation[] = [];
  let killGate: CandidateRecord["killGate"] = null;

  for (const [index, gateId] of gateOrder().entries()) {
    if (killGate) {
      evaluations.push(
        sealEvaluation(skippedEvaluation(gateId, index, killGate)),
      );
      continue;
    }

    const result = GATE_EVALUATORS[gateId](ctx);
    const sealed = sealEvaluation({
      gateId,
      order: index,
      status: result.status,
      params: result.params,
      evidence: result.evidence,
    });
    evaluations.push(sealed);
    if (result.status === "FAIL") killGate = gateId;
  }

  return {
    evaluations,
    killGate,
    outcome: killGate ? "KILLED" : "PASSED",
  };
}

export function sealRecord(input: {
  index: number;
  candidate: Candidate;
  config: StackConfig;
  prevDigest: string;
}): { record: CandidateRecord; bars: Bar[] } {
  const bars = input.candidate.bars.map(roundBar);
  const barsDigest = digestBars(bars);
  const configDigest = digestConfig(input.config);
  const { evaluations, killGate, outcome } = evaluateCandidate(
    { ...input.candidate, bars },
    input.config,
  );

  const body = {
    index: input.index,
    candidateId: input.candidate.id,
    symbol: input.candidate.symbol,
    name: input.candidate.name,
    sector: input.candidate.sector,
    market: input.candidate.market,
    tier: input.candidate.tier,
    asOf: input.candidate.asOf,
    origin: input.candidate.origin,
    intendedKill: input.candidate.intendedKill ?? null,
    last: input.candidate.last,
    chg5d: input.candidate.chg5d,
    chg20d: input.candidate.chg20d,
    barsDigest,
    configDigest,
    evaluations,
    outcome,
    killGate,
    prevDigest: input.prevDigest,
  };

  const record: CandidateRecord = {
    ...body,
    recordDigest: digestOf(body),
  };

  return { record, bars };
}

export function sealUniverse(
  candidates: Candidate[],
  config: StackConfig = STACK_CONFIG,
  genesis = GENESIS,
): { records: CandidateRecord[]; barsByCandidate: Record<string, Bar[]> } {
  const records: CandidateRecord[] = [];
  const barsByCandidate: Record<string, Bar[]> = {};
  let prevDigest = genesis;

  candidates.forEach((candidate, index) => {
    const sealed = sealRecord({ index, candidate, config, prevDigest });
    records.push(sealed.record);
    barsByCandidate[candidate.id] = sealed.bars;
    prevDigest = sealed.record.recordDigest;
  });

  return { records, barsByCandidate };
}

export function replayRecord(
  candidate: Candidate,
  config: StackConfig,
  prevDigest: string,
  index: number,
): string {
  return sealRecord({ index, candidate, config, prevDigest }).record.recordDigest;
}
