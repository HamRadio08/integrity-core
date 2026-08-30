import { NextResponse } from "next/server";
import { gateRequest } from "@/lib/audit/guard";
import { getActiveBundle } from "@/lib/audit/run";
import { tickActivePaper } from "@/lib/paper";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = gateRequest(request, "paper");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  try {
    const book = tickActivePaper(getActiveBundle());
    return NextResponse.json(book, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Paper book failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const gate = gateRequest(request, "paper");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  try {
    const book = tickActivePaper(getActiveBundle(), { force: true });
    return NextResponse.json(book, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Paper tick failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
