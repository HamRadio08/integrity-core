import { NextResponse } from "next/server";
import { gateRequest } from "@/lib/audit/guard";
import { publicRun, replaceActiveBundle } from "@/lib/audit/run";

export async function POST(request: Request) {
  const gate = gateRequest(request, "scan");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const body = (await request.json().catch(() => ({}))) as { seed?: number };
  const seed = Number.isFinite(body.seed) ? Number(body.seed) : Date.now() % 1_000_000_000;
  try {
    const bundle = replaceActiveBundle(seed);
    return NextResponse.json(publicRun(bundle));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scan failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
