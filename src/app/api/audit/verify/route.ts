import { NextResponse } from "next/server";
import { gateRequest } from "@/lib/audit/guard";
import { validateVerifyPayload, VERIFY_MAX_BYTES } from "@/lib/audit/verify-payload";
import { verifyIntegrity } from "@/lib/audit/invariants";
import type { AuditRun, Bar } from "@/lib/audit/types";

export async function POST(request: Request) {
  const gate = gateRequest(request, "verify");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > VERIFY_MAX_BYTES) {
    return NextResponse.json(
      { error: `Payload exceeds ${VERIFY_MAX_BYTES} bytes.` },
      { status: 413 },
    );
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > VERIFY_MAX_BYTES) {
    return NextResponse.json(
      { error: `Payload exceeds ${VERIFY_MAX_BYTES} bytes.` },
      { status: 413 },
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Body is not valid JSON." }, { status: 400 });
  }
  const verdict = validateVerifyPayload(parsed);
  if (!verdict.ok) {
    return NextResponse.json({ error: verdict.error }, { status: 400 });
  }
  const body = parsed as { run: AuditRun; barsByCandidate?: Record<string, Bar[]> };
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
