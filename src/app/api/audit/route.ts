import { NextResponse } from "next/server";
import { getActiveBundle, publicRun } from "@/lib/audit/run";

export async function GET() {
  const bundle = getActiveBundle();
  return NextResponse.json(publicRun(bundle));
}
