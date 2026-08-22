import { NextResponse } from "next/server";
import { verifyIntegrity } from "@/lib/audit/invariants";
import type { AuditRun, Bar } from "@/lib/audit/types";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    run: AuditRun;
    barsByCandidate?: Record<string, Bar[]>;
  };
  if (!body?.run?.records || !body.run.config) {
    return NextResponse.json({ error: "Missing sealed run payload." }, { status: 400 });
  }
  const report = verifyIntegrity({
    records: body.run.records,
    config: body.run.config,
    barsByCandidate: body.barsByCandidate,
    genesisDigest: body.run.genesisDigest,
    expectedConfigDigest: body.run.configDigest,
    expectedAttestation: body.run.attestationDigest,
    seed: body.run.seed,
    startedAt: body.run.startedAt,
  });
  return NextResponse.json({ ok: report.ok, report });
}
