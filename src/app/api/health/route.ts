export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    {
      ok: true,
      service: "stack-attestation",
      protocol: "stack-attestation/v1",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
