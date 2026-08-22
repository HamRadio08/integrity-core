import { NextResponse } from "next/server";
import { getActiveBundle } from "@/lib/audit/run";
import { verifyIntegrity } from "@/lib/audit/invariants";
import type { CandidateRecord, GateId } from "@/lib/audit/types";

function overwriteKill(record: CandidateRecord): CandidateRecord {
  const fake: GateId = record.killGate === "trend_sep" ? "accel_gate" : "trend_sep";
  return { ...record, killGate: fake, outcome: "KILLED" };
}

export async function POST(request: Request) {
  const body = (await request.json()) as { candidateId?: string; mode?: string };
  const bundle = getActiveBundle();
  const target =
    bundle.records.find((record) => record.candidateId === body.candidateId) ??
    bundle.records.find((record) => record.killGate === "volume_confirm") ??
    bundle.records[0];

  if (body.mode === "bars") {
    const bars = bundle.barsByCandidate[target.candidateId].map((bar, index, all) =>
      index === all.length - 1 ? { ...bar, close: bar.close * 0.82, low: bar.close * 0.82 } : bar,
    );
    const report = verifyIntegrity({
      records: bundle.records,
      config: bundle.config,
      barsByCandidate: { ...bundle.barsByCandidate, [target.candidateId]: bars },
      genesisDigest: bundle.genesisDigest,
      expectedConfigDigest: bundle.configDigest,
      expectedAttestation: bundle.attestationDigest,
      seed: bundle.seed,
      startedAt: bundle.startedAt,
    });
    return NextResponse.json({
      mode: "bars",
      candidateId: target.candidateId,
      symbol: target.symbol,
      report,
    });
  }

  const poisoned = bundle.records.map((record) =>
    record.candidateId === target.candidateId ? overwriteKill(record) : record,
  );
  const report = verifyIntegrity({
    records: poisoned,
    config: bundle.config,
    barsByCandidate: bundle.barsByCandidate,
    genesisDigest: bundle.genesisDigest,
    expectedConfigDigest: bundle.configDigest,
    expectedAttestation: bundle.attestationDigest,
    seed: bundle.seed,
    startedAt: bundle.startedAt,
  });
  return NextResponse.json({
    mode: "kill-reason",
    candidateId: target.candidateId,
    symbol: target.symbol,
    originalKill: target.killGate,
    report,
  });
}
