import { healthPayload } from "@/lib/box/host";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(healthPayload(), { headers: { "Cache-Control": "no-store" } });
}
