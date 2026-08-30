import { NextResponse } from "next/server";
import { gateRequest } from "@/lib/audit/guard";
import { fetchLiveDesk } from "@/lib/audit/live";
import { syncSealedBook } from "@/lib/audit/sync";
import { tickActivePaper } from "@/lib/paper";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const gate = gateRequest(request, "live");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  try {
    const desk = await fetchLiveDesk();
    const { bundle, run } = syncSealedBook(desk);
    tickActivePaper(bundle);
    return NextResponse.json(
      { ...desk, run },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Live desk failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
