import { NextResponse } from "next/server";
import { gateRequest } from "@/lib/audit/guard";
import { getActiveBundle, publicRun } from "@/lib/audit/run";
import type { AttestationReceipt } from "@/lib/audit/types";

// The dissemination surface.
//
// Every other read route hands out `publicRun`, which strips `barsByCandidate` — so the run the
// desk publishes cannot be replayed by anyone holding it. The chain verifies, attribution
// verifies, but "replay of sealed bars reproduces every record digest" — the headline forensic
// guarantee — degrades to a warn for every reader except the desk itself. That made
// /api/audit/verify unanswerable in full by an outside caller, which is a strange property for
// the one endpoint whose entire job is letting someone else check the work.
//
// This route emits the evidence with the claim: run + sealed bars, self-contained, POST-able
// straight back into /api/audit/verify (~1.2 MB against the committed tape, well inside the
// 8 MB cap). It is a read of the active bundle — it seals nothing and writes nothing.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = gateRequest(request, "receipt");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const bundle = getActiveBundle();
  const receipt: AttestationReceipt = {
    schemaVersion: 1,
    protocol: "stack-attestation/v1",
    issuedAt: new Date().toISOString(),
    verifyWith: "POST { run, barsByCandidate } to /api/audit/verify",
    note:
      "run.integrity is the desk's own claim, computed by the process that sealed the book. " +
      "run.records and barsByCandidate are the evidence. Recompute the verdict from the evidence.",
    run: publicRun(bundle),
    barsByCandidate: bundle.barsByCandidate,
  };
  return NextResponse.json(receipt, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="attestation-${bundle.runId}.json"`,
    },
  });
}
