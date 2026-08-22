import { NextResponse } from "next/server";
import { getActiveBundle } from "@/lib/audit/run";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const bundle = getActiveBundle();
  const record =
    bundle.records.find((item) => item.candidateId === id) ??
    (id === bundle.featured?.daily.candidateId ? bundle.featured.daily : null) ??
    (id === bundle.featured?.hourly?.candidateId ? bundle.featured.hourly : null);
  const bars = bundle.barsByCandidate[id];
  if (!record || !bars) {
    return NextResponse.json({ error: "Candidate not found in the sealed run." }, { status: 404 });
  }
  return NextResponse.json({ record, bars });
}
