import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

// Request-boundary guards for the /api/audit/* route handlers.
//
// Two layers, deliberately separated:
//   - pure decision helpers (originVerdict, tokenMatches) that take plain
//     values and return verdicts — unit-testable with no state;
//   - one process-wide token-bucket rate limiter. Module scope is the honest
//     design here: the server runs as a single Node process bound to
//     127.0.0.1 (package.json dev/start), and the Next 16 proxy.ts docs
//     forbid relying on shared module state inside a proxy file — so the
//     bucket lives in lib and is consumed inside each route handler.
//
// Env flags (optional, read at call time so tests can stub them):
//   AUDIT_TAMPER_ENABLED — "1"/"true" forces the tamper lab on, "0"/"false"
//     forces it off; unset falls back to NODE_ENV !== "production".
//   AUDIT_API_TOKEN — when set, callers that cannot prove browser
//     same-origin (curl, scripts) must send `Authorization: Bearer <token>`.

export type AuditEndpoint = "refresh" | "scan" | "tamper" | "verify";

export type OriginVerdict = "same-origin" | "cross-site" | "unproven";

export type GateResult = { ok: true } | { ok: false; status: 403 | 429; error: string };

export function isTamperEnabled(): boolean {
  const raw = process.env.AUDIT_TAMPER_ENABLED?.trim().toLowerCase();
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  return process.env.NODE_ENV !== "production";
}

// Browsers stamp Sec-Fetch-Site on every fetch; curl and scripts send neither
// it nor Origin. "unproven" is therefore "not a browser context" — allowed by
// default (loopback operator), but subject to the API token when one is set.
export function originVerdict(headers: {
  secFetchSite: string | null;
  origin: string | null;
  host: string | null;
}): OriginVerdict {
  const site = headers.secFetchSite?.trim().toLowerCase();
  if (site) {
    return site === "same-origin" || site === "none" ? "same-origin" : "cross-site";
  }
  if (headers.origin) {
    let originHost: string;
    try {
      originHost = new URL(headers.origin).host;
    } catch {
      return "cross-site";
    }
    return headers.host !== null && originHost === headers.host ? "same-origin" : "cross-site";
  }
  return "unproven";
}

export function tokenMatches(presented: string, expected: string): boolean {
  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

// Per-process session token: handed to the dashboard by the server render and
// echoed back as the x-audit-boot header on its API calls. Cross-site pages
// cannot read it (needs same-origin script access), and non-browser callers
// don't have it — so unlike fetch-metadata headers, it is not forgeable.
// Stored on globalThis because in `next dev` the page bundle and the
// route-handler bundles can hold separate instances of this module; globalThis
// is per-process and therefore shared.
const BOOT_TOKEN_KEY = "__stackAttestationBootToken";

export function bootToken(): string {
  const g = globalThis as unknown as Record<string, string | undefined>;
  g[BOOT_TOKEN_KEY] ??= randomUUID();
  return g[BOOT_TOKEN_KEY];
}

// Token buckets: capacity = burst, refillPerSecond = sustained rate.
// refresh is tightest — every hit burns two outbound venue calls and a full
// rebuild; tamper and verify each replay the whole run.
const BUDGETS: Record<AuditEndpoint, { capacity: number; refillPerSecond: number }> = {
  refresh: { capacity: 3, refillPerSecond: 3 / 60 },
  scan: { capacity: 10, refillPerSecond: 30 / 60 },
  tamper: { capacity: 6, refillPerSecond: 12 / 60 },
  verify: { capacity: 6, refillPerSecond: 12 / 60 },
};

const buckets = new Map<AuditEndpoint, { tokens: number; lastRefillMs: number }>();

export function consumeRateLimit(endpoint: AuditEndpoint, nowMs = Date.now()): boolean {
  const budget = BUDGETS[endpoint];
  const bucket = buckets.get(endpoint) ?? { tokens: budget.capacity, lastRefillMs: nowMs };
  const elapsedSeconds = Math.max(0, (nowMs - bucket.lastRefillMs) / 1000);
  bucket.tokens = Math.min(budget.capacity, bucket.tokens + elapsedSeconds * budget.refillPerSecond);
  bucket.lastRefillMs = nowMs;
  if (bucket.tokens < 1) {
    buckets.set(endpoint, bucket);
    return false;
  }
  bucket.tokens -= 1;
  buckets.set(endpoint, bucket);
  return true;
}

// Test hook: rate-limit state is process-wide by design.
export function resetRateLimits(): void {
  buckets.clear();
}

export function gateRequest(request: Request, endpoint: AuditEndpoint, nowMs = Date.now()): GateResult {
  const verdict = originVerdict({
    secFetchSite: request.headers.get("sec-fetch-site"),
    origin: request.headers.get("origin"),
    host: request.headers.get("host"),
  });
  if (verdict === "cross-site") {
    return { ok: false, status: 403, error: "Cross-site requests are not allowed." };
  }
  const expectedToken = process.env.AUDIT_API_TOKEN?.trim();
  if (expectedToken) {
    // Fetch-metadata and Origin headers are freely forgeable by non-browser
    // clients, so when a token is configured they are NOT credentials: every
    // caller must present either the configured bearer token or the boot
    // token the dashboard embeds from the server render. (The cross-site
    // check above still hard-blocks real browsers on hostile pages.)
    const auth = request.headers.get("authorization") ?? "";
    const presented = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
    const boot = request.headers.get("x-audit-boot") ?? "";
    const authorized =
      (presented !== "" && tokenMatches(presented, expectedToken)) ||
      (boot !== "" && tokenMatches(boot, bootToken()));
    if (!authorized) {
      return {
        ok: false,
        status: 403,
        error: "This deployment requires an API token (Authorization: Bearer).",
      };
    }
  }
  if (!consumeRateLimit(endpoint, nowMs)) {
    return { ok: false, status: 429, error: `Rate limit exceeded for ${endpoint}. Try again shortly.` };
  }
  return { ok: true };
}
