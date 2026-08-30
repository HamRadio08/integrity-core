import { NextResponse } from "next/server";
import { fetchLiveDesk } from "@/lib/audit/live";
import { getActiveBundle, publicRun } from "@/lib/audit/run";
import { syncSealedBook } from "@/lib/audit/sync";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const live = await fetchLiveDesk();
    const { run } = syncSealedBook(live);
    return NextResponse.json(run, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json(publicRun(getActiveBundle()), { headers: { "Cache-Control": "no-store" } });
  }
}
