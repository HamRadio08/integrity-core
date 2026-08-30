import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bootToken,
  consumeRateLimit,
  isTamperEnabled,
  originVerdict,
  resetRateLimits,
  tokenMatches,
} from "@/lib/audit/guard";
import { validateVerifyPayload, VERIFY_MAX_BYTES } from "@/lib/audit/verify-payload";
import { getDemoBundle, publicRun, DEMO_SEED } from "@/lib/audit/run";
import { POST as tamperPost } from "./tamper/route";
import { POST as verifyPost } from "./verify/route";
import { POST as scanPost } from "./scan/route";
import { POST as refreshPost } from "./refresh/route";
import { GET as candidateGet } from "./candidate/[id]/route";
import { GET as liveGet } from "./live/route";
import { resetLiveCache } from "@/lib/audit/live";
import { GET as paperGet, POST as paperPost } from "./paper/route";
import { resetPaperBookForTests } from "@/lib/paper";

// Route handlers are imported directly (no HTTP server): they are plain async
// functions over the standard Request, and next/server resolves under the
// vitest node environment. Rate-limit buckets and env flags are process-wide,
// so every test resets them.

beforeEach(() => {
  resetRateLimits();
  resetPaperBookForTests();
  resetLiveCache();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const jsonPost = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://127.0.0.1:43173${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

describe("guard: originVerdict", () => {
  it("trusts Sec-Fetch-Site same-origin and none", () => {
    expect(originVerdict({ secFetchSite: "same-origin", origin: null, host: null })).toBe("same-origin");
    expect(originVerdict({ secFetchSite: "none", origin: null, host: null })).toBe("same-origin");
  });

  it("rejects cross-site and same-site fetch metadata", () => {
    expect(originVerdict({ secFetchSite: "cross-site", origin: null, host: null })).toBe("cross-site");
    expect(originVerdict({ secFetchSite: "same-site", origin: null, host: null })).toBe("cross-site");
  });

  it("falls back to Origin-vs-Host comparison", () => {
    expect(
      originVerdict({ secFetchSite: null, origin: "http://127.0.0.1:43173", host: "127.0.0.1:43173" }),
    ).toBe("same-origin");
    expect(
      originVerdict({ secFetchSite: null, origin: "https://evil.example", host: "127.0.0.1:43173" }),
    ).toBe("cross-site");
    expect(originVerdict({ secFetchSite: null, origin: "not a url", host: "127.0.0.1:43173" })).toBe(
      "cross-site",
    );
  });

  it("treats headerless (curl-style) requests as unproven", () => {
    expect(originVerdict({ secFetchSite: null, origin: null, host: "127.0.0.1:43173" })).toBe("unproven");
  });
});

describe("guard: tokenMatches", () => {
  it("accepts the exact token and rejects everything else", () => {
    expect(tokenMatches("sekret", "sekret")).toBe(true);
    expect(tokenMatches("sekret2", "sekret")).toBe(false);
    expect(tokenMatches("", "sekret")).toBe(false);
  });
});

describe("guard: consumeRateLimit", () => {
  it("enforces the refresh burst capacity and refills over time", () => {
    const t0 = 1_000_000;
    expect(consumeRateLimit("refresh", t0)).toBe(true);
    expect(consumeRateLimit("refresh", t0)).toBe(true);
    expect(consumeRateLimit("refresh", t0)).toBe(true);
    expect(consumeRateLimit("refresh", t0)).toBe(false);
    expect(consumeRateLimit("refresh", t0 + 60_000)).toBe(true);
  });
});

describe("guard: isTamperEnabled", () => {
  it("defaults on outside production and off in production, with env override", () => {
    expect(isTamperEnabled()).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(isTamperEnabled()).toBe(false);
    vi.stubEnv("AUDIT_TAMPER_ENABLED", "1");
    expect(isTamperEnabled()).toBe(true);
    vi.stubEnv("AUDIT_TAMPER_ENABLED", "0");
    vi.stubEnv("NODE_ENV", "development");
    expect(isTamperEnabled()).toBe(false);
  });
});

describe("verify-payload: validateVerifyPayload", () => {
  it("keeps the legacy error for a missing run", () => {
    for (const body of [null, {}, { run: null }, { run: { records: {} } }, { run: { records: [] } }]) {
      const verdict = validateVerifyPayload(body);
      expect(verdict.ok).toBe(false);
      if (!verdict.ok) expect(verdict.error).toBe("Missing sealed run payload.");
    }
  });

  it("rejects malformed records and evaluations", () => {
    const bad = validateVerifyPayload({ run: { records: [{ evaluations: "nope" }], config: {} } });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain("evaluations");
  });

  it("rejects non-finite numbers with the offending path", () => {
    const verdict = validateVerifyPayload({
      run: { records: [], config: { nested: { adx: Infinity } } },
    });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.error).toContain("run.config.nested.adx");
  });

  it("accepts a structurally sound payload", () => {
    expect(validateVerifyPayload({ run: { records: [], config: {} } }).ok).toBe(true);
  });
});

describe("POST /api/audit/tamper", () => {
  it("is refused when the tamper lab is disabled", async () => {
    vi.stubEnv("AUDIT_TAMPER_ENABLED", "0");
    const response = await tamperPost(jsonPost("/api/audit/tamper", { mode: "kill-reason" }));
    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.error).toContain("disabled");
  });

  it("is off by default in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await tamperPost(jsonPost("/api/audit/tamper", { mode: "kill-reason" }));
    expect(response.status).toBe(403);
  });

  it("replays a poisoned copy and reports the broken seal when enabled", async () => {
    vi.stubEnv("AUDIT_TAMPER_ENABLED", "1");
    const response = await tamperPost(
      jsonPost("/api/audit/tamper", { mode: "kill-reason" }, { "Content-Type": "application/json" }),
    );
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.mode).toBe("kill-reason");
    expect(payload.report.ok).toBe(false);
  });

  it("tolerates a bodyless request instead of crashing", async () => {
    vi.stubEnv("AUDIT_TAMPER_ENABLED", "1");
    const response = await tamperPost(
      new Request("http://127.0.0.1:43173/api/audit/tamper", { method: "POST" }),
    );
    expect(response.status).toBe(200);
  });
});

describe("POST /api/audit/verify", () => {
  it("rejects invalid JSON with 400 instead of crashing to 500", async () => {
    const response = await verifyPost(
      new Request("http://127.0.0.1:43173/api/audit/verify", { method: "POST", body: "not json" }),
    );
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe("Body is not valid JSON.");
  });

  it("rejects an oversized payload with 413", async () => {
    const oversized = `{"pad":"${"x".repeat(VERIFY_MAX_BYTES)}"}`;
    const response = await verifyPost(
      new Request("http://127.0.0.1:43173/api/audit/verify", { method: "POST", body: oversized }),
    );
    expect(response.status).toBe(413);
  });

  it("rejects a structurally invalid payload with 400", async () => {
    const response = await verifyPost(jsonPost("/api/audit/verify", { run: { records: {} } }));
    expect(response.status).toBe(400);
  });

  it("rejects an evaluation without evidence.metrics instead of crashing to 500", async () => {
    // finiteMetrics dereferences evaluation.evidence.metrics unconditionally —
    // this exact payload used to escape validation and TypeError inside
    // verifyIntegrity.
    const response = await verifyPost(
      jsonPost("/api/audit/verify", {
        run: {
          records: [{ evaluations: [{ gateId: "tier_reject", order: 0, status: "PASS" }] }],
          config: {},
        },
      }),
    );
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toContain("evidence.metrics");
  });

  it("rejects an oversized chunked body without buffering it whole", async () => {
    // No Content-Length header: a ReadableStream body exercises the capped
    // incremental reader, which must 413 as soon as the cap is crossed.
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent > VERIFY_MAX_BYTES) {
          controller.close();
          return;
        }
        sent += chunk.byteLength;
        controller.enqueue(chunk);
      },
    });
    const request = new Request("http://127.0.0.1:43173/api/audit/verify", {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    const response = await verifyPost(request);
    expect(response.status).toBe(413);
  });

  it("verifies the genuine sealed run end to end", async () => {
    const bundle = getDemoBundle();
    const response = await verifyPost(
      jsonPost("/api/audit/verify", {
        run: publicRun(bundle),
        barsByCandidate: bundle.barsByCandidate,
      }),
    );
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.ok).toBe(true);
  });
});

describe("POST /api/audit/scan", () => {
  it("rejects cross-site browser requests", async () => {
    const response = await scanPost(
      jsonPost("/api/audit/scan", { seed: DEMO_SEED }, { "sec-fetch-site": "cross-site" }),
    );
    expect(response.status).toBe(403);
  });

  it("reseals for same-origin browser requests", async () => {
    const response = await scanPost(
      jsonPost("/api/audit/scan", { seed: DEMO_SEED }, { "sec-fetch-site": "same-origin" }),
    );
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.seed).toBe(DEMO_SEED);
  });

  it("demands credentials from every caller when a token is configured", async () => {
    vi.stubEnv("AUDIT_API_TOKEN", "sekret");
    const denied = await scanPost(jsonPost("/api/audit/scan", { seed: DEMO_SEED }));
    expect(denied.status).toBe(403);
    // Forged fetch-metadata headers are NOT credentials — curl can send them.
    const forged = await scanPost(
      jsonPost("/api/audit/scan", { seed: DEMO_SEED }, { "sec-fetch-site": "same-origin" }),
    );
    expect(forged.status).toBe(403);
    const bearer = await scanPost(
      jsonPost("/api/audit/scan", { seed: DEMO_SEED }, { authorization: "Bearer sekret" }),
    );
    expect(bearer.status).toBe(200);
    // The dashboard authenticates with the render-embedded boot token.
    const viaBoot = await scanPost(
      jsonPost(
        "/api/audit/scan",
        { seed: DEMO_SEED },
        { "sec-fetch-site": "same-origin", "x-audit-boot": bootToken() },
      ),
    );
    expect(viaBoot.status).toBe(200);
  });

  it("returns 429 once the endpoint budget is exhausted", async () => {
    while (consumeRateLimit("scan")) {
      // drain the bucket without paying for reseals
    }
    const response = await scanPost(jsonPost("/api/audit/scan", { seed: DEMO_SEED }));
    expect(response.status).toBe(429);
  });
});

describe("GET /api/health", () => {
  it("reports the desk is up without a gate", async () => {
    const { GET } = await import("../health/route");
    const response = await GET();
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.ok).toBe(true);
    expect(payload.protocol).toBe("stack-attestation/v1");
  });
});

describe("GET /api/audit/live", () => {
  it("rejects cross-site browser requests", async () => {
    const response = await liveGet(
      new Request("http://127.0.0.1:43173/api/audit/live", { headers: { "sec-fetch-site": "cross-site" } }),
    );
    expect(response.status).toBe(403);
  });

  it("returns measured futures, spots, and CI from stubbed venues", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const href = String(url);
        if (href.includes("coingecko")) {
          return { ok: true, json: async () => ({ bitcoin: { usd: 78_200, usd_24h_change: 1.1 } }) };
        }
        if (href.includes("coinbase")) {
          return {
            ok: true,
            json: async () => ({
              price: "78200.5",
              time: "2026-08-30T06:00:00Z",
              volume: "1",
              bid: "78199",
              ask: "78201",
            }),
          };
        }
        if (href.includes("api.github.com")) {
          return {
            ok: true,
            json: async () => ({
              workflow_runs: [
                {
                  id: 99,
                  name: "CI",
                  status: "completed",
                  conclusion: "success",
                  head_branch: "main",
                  event: "push",
                  html_url: "https://github.com/HamRadio08/integrity-core/actions/runs/99",
                  updated_at: "2026-08-30T05:00:00Z",
                },
              ],
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            chart: {
              result: [
                {
                  meta: {
                    regularMarketPrice: 100,
                    regularMarketTime: 1_787_950_799,
                    chartPreviousClose: 99,
                    shortName: "stub",
                  },
                  indicators: { quote: [{ close: [98, 99, 100] }] },
                },
              ],
            },
          }),
        };
      }) as unknown as typeof fetch,
    );
    const response = await liveGet(new Request("http://127.0.0.1:43173/api/audit/live"));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.spots[0].symbol).toBe("BTC");
    expect(payload.spots[0].usd).toBe(78200.5);
    expect(payload.ci.latest.conclusion).toBe("success");
    expect(payload.futures.every((row: { last: number | null }) => row.last === 100)).toBe(true);
  });
});

describe("GET/POST /api/audit/paper", () => {
  it("rejects cross-site browser requests", async () => {
    const response = await paperGet(
      new Request("http://127.0.0.1:43173/api/audit/paper", { headers: { "sec-fetch-site": "cross-site" } }),
    );
    expect(response.status).toBe(403);
  });

  it("ticks paper agents against the sealed book", async () => {
    const response = await paperPost(new Request("http://127.0.0.1:43173/api/audit/paper", { method: "POST" }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.mode).toBe("paper");
    expect(payload.venue).toBe("paper-ledger");
    expect(payload.fills.every((row: { venue: string }) => row.venue === "paper")).toBe(true);
    expect(payload.agents).toHaveLength(3);
    expect(payload.openPositions).toBeGreaterThan(0);
  });
});

describe("GET /api/audit/candidate/[id]", () => {
  it("returns the sealed record and bars for a featured candidate", async () => {
    const response = await candidateGet(new Request("http://127.0.0.1:43173/api/audit/candidate/C-BTC-1D"), {
      params: Promise.resolve({ id: "C-BTC-1D" }),
    });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.record.candidateId).toBe("C-BTC-1D");
    expect(Array.isArray(payload.bars)).toBe(true);
  });

  it("404s for an unknown candidate", async () => {
    const response = await candidateGet(new Request("http://127.0.0.1:43173/api/audit/candidate/NOPE"), {
      params: Promise.resolve({ id: "NOPE" }),
    });
    expect(response.status).toBe(404);
  });
});

// Refresh tests run last in this file: on success the handler mutates the
// module singletons (spot overlay + active bundle) that earlier tests read.
describe("POST /api/audit/refresh", () => {
  it("returns 502 when a venue rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch,
    );
    const response = await refreshPost(
      new Request("http://127.0.0.1:43173/api/audit/refresh", { method: "POST" }),
    );
    expect(response.status).toBe(502);
  });

  it("reseals from stubbed venue data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () =>
          String(url).includes("coingecko")
            ? { bitcoin: { usd: 80_000, usd_24h_change: 2.5, usd_24h_vol: 1_000_000 } }
            : { price: "80000", time: "2026-08-28T00:00:00Z", volume: "123", bid: "79990", ask: "80010" },
      })) as unknown as typeof fetch,
    );
    const response = await refreshPost(
      new Request("http://127.0.0.1:43173/api/audit/refresh", { method: "POST" }),
    );
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(Array.isArray(payload.records)).toBe(true);
  });
});
