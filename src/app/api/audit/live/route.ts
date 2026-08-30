import { NextResponse } from "next/server";
import { gateRequest } from "@/lib/audit/guard";
import { fetchLiveDesk } from "@/lib/audit/live";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = gateRequest(request, "live");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  try {
    const desk = await fetchLiveDesk();
    return NextResponse.json(desk, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Live desk failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
