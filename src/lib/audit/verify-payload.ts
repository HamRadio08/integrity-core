// Boundary validation for POST /api/audit/verify — the one endpoint that
// accepts an arbitrary client-built payload and feeds it to verifyIntegrity.
// Everything here is pure; the route owns reading the body and mapping
// verdicts to HTTP statuses.
//
// Why each check exists (crash vectors in the unvalidated path):
//   - non-array records → forEach TypeError inside verifyIntegrity;
//   - null records / non-array evaluations → TypeError in sequentialOk /
//     finiteMetrics;
//   - non-finite numbers in config or bars → digestConfig / digestBars throw
//     NonFiniteSealError uncaught (hash.ts fails loud by design). JSON.parse
//     can never produce Infinity/NaN, but this module also guards direct
//     library callers, so finiteness is checked anyway.

// A legitimate full run+bars payload measures ~2-3 MB against the committed
// tape (data/live-tape.json is ~1.5 MB); 8 MB leaves honest headroom.
export const VERIFY_MAX_BYTES = 8 * 1024 * 1024;

// CPU bounds, not correctness bounds: verifyIntegrity replays every record.
const MAX_RECORDS = 10_000;
const MAX_BARS_PER_CANDIDATE = 10_000;

export type PayloadVerdict = { ok: true } | { ok: false; error: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findNonFinite(value: unknown, path: string): string | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? null : path;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const hit = findNonFinite(value[index], `${path}[${index}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      const hit = findNonFinite(child, `${path}.${key}`);
      if (hit) return hit;
    }
  }
  return null;
}

export function validateVerifyPayload(body: unknown): PayloadVerdict {
  if (!isPlainObject(body) || !isPlainObject(body.run)) {
    return { ok: false, error: "Missing sealed run payload." };
  }
  const run = body.run;
  if (!Array.isArray(run.records) || !isPlainObject(run.config)) {
    return { ok: false, error: "Missing sealed run payload." };
  }
  if (run.records.length > MAX_RECORDS) {
    return { ok: false, error: `run.records exceeds ${MAX_RECORDS} entries.` };
  }
  for (let index = 0; index < run.records.length; index += 1) {
    const record: unknown = run.records[index];
    if (!isPlainObject(record)) {
      return { ok: false, error: `run.records[${index}] is not a record object.` };
    }
    if (!Array.isArray(record.evaluations)) {
      return { ok: false, error: `run.records[${index}].evaluations must be an array.` };
    }
    for (let j = 0; j < record.evaluations.length; j += 1) {
      const evaluation: unknown = record.evaluations[j];
      if (!isPlainObject(evaluation)) {
        return { ok: false, error: `run.records[${index}].evaluations[${j}] is not an object.` };
      }
      // finiteMetrics dereferences evaluation.evidence.metrics unconditionally
      // (invariants.ts) — a missing/non-object evidence or metrics crashes
      // verifyIntegrity with an uncaught TypeError, exactly the class this
      // validator exists to stop at the boundary.
      if (!isPlainObject(evaluation.evidence) || !isPlainObject(evaluation.evidence.metrics)) {
        return {
          ok: false,
          error: `run.records[${index}].evaluations[${j}].evidence.metrics must be an object.`,
        };
      }
    }
    if (record.metrics !== undefined && !isPlainObject(record.metrics)) {
      return { ok: false, error: `run.records[${index}].metrics must be an object when present.` };
    }
  }
  const configHit = findNonFinite(run.config, "run.config");
  if (configHit) {
    return { ok: false, error: `Non-finite number at ${configHit}.` };
  }
  if (body.barsByCandidate !== undefined) {
    if (!isPlainObject(body.barsByCandidate)) {
      return { ok: false, error: "barsByCandidate must be an object mapping candidate ids to bars." };
    }
    for (const [candidateId, bars] of Object.entries(body.barsByCandidate)) {
      if (!Array.isArray(bars)) {
        return { ok: false, error: `barsByCandidate["${candidateId}"] must be an array.` };
      }
      if (bars.length > MAX_BARS_PER_CANDIDATE) {
        return {
          ok: false,
          error: `barsByCandidate["${candidateId}"] exceeds ${MAX_BARS_PER_CANDIDATE} bars.`,
        };
      }
      for (let index = 0; index < bars.length; index += 1) {
        const bar: unknown = bars[index];
        if (!isPlainObject(bar)) {
          return { ok: false, error: `barsByCandidate["${candidateId}"][${index}] is not a bar object.` };
        }
        const hit = findNonFinite(bar, `barsByCandidate["${candidateId}"][${index}]`);
        if (hit) {
          return { ok: false, error: `Non-finite number at ${hit}.` };
        }
      }
    }
  }
  return { ok: true };
}
