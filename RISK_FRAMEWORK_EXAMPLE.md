# Risk Framework Example — Fail-Closed Principles

This is a worked example of a fail-closed integrity framework for a forensic attestation
system, written to be public-safe: the mechanisms are concrete, the thresholds are illustrative
rather than real. Where a real dependency is named (Coinbase, CoinGecko, Yahoo) it's because
naming a real stack makes the example legible — swap in your own data sources and it still
holds. Nothing here is a claim that a live deployment's actual bands or budgets match these
numbers; treat every value as a placeholder.

**Read this for the shape of the reasoning, not the specific values.** A forensic desk's whole
job is proving a record is honest; the interesting part is what it does when it *can't* prove
that — and the answer is always the same: it stops trusting the record, not the other way
around.

---

## The core principle: fail closed by default

Every guard in this framework answers one question: **"if I can't verify this, do I trust it or
reject it?"** The answer is always *reject*. A stale tape, an unreplayable digest, an
out-of-contract band, or a malformed request are all treated as reasons to withhold trust, never
as reasons to proceed on the assumption that things are probably fine. A forensic record that
can't defend itself under scrutiny isn't a record — it's an assertion.

## 1. Heartbeat logic (tape freshness)

The desk's "heartbeat" is the freshness of its mark-to-market tape, not a service ping — the
question is always *when was this book last resealed against a real print*.

- **Timestamp capture.** Every seal records the moment the tape was pulled and validated against
  its sources (e.g., Yahoo for OHLC, Coinbase/CoinGecko for spot mark-to-market) — not the
  moment a refresh was requested. A pull that returns malformed or partial data does not advance
  the seal's timestamp; a stale-but-error-free response is treated the same as no response.
- **Staleness thresholds.** A daily-binding screen tolerates a looser staleness window than an
  intraday zoom used to sanity-check a live pump — the threshold is sized to how fast a stale
  print would mislead the reader of that specific window, not one global constant.
- **Alert-on-silence.** Crossing the staleness window is a distinct, immediate signal — separate
  from and prior to any downstream attestation impact — so a stale tape is caught by the
  freshness check itself, not discovered later because a seal looked odd.

```
if now() - tape.last_sealed_at > tape.staleness_window:
    tape.mark_stale()          # attestation calls against this tape fail closed
    alerts.raise(STALE_TAPE, source=tape.source, age=now() - tape.last_sealed_at)
```

## 2. Hard stops

Hard stops here are request-boundary guards: checked before anything reaches the verification
logic, with no override path in the hot path.

- **Payload-size ceiling.** `/api/audit/verify`-class endpoints cap request bodies (e.g., an
  8 MB structural cap) before any parsing happens — an oversized or malformed payload is
  rejected at the boundary, never partially parsed in the hope it resolves to something valid.
- **Structural validation before verification.** A request must match the expected shape
  (required fields, types, digest format) before it's handed to the actual `verifyIntegrity`
  logic — a shape failure is a hard rejection, not a soft warning that verification proceeds
  anyway.
- **Origin isolation.** Cross-site requests are rejected via `Sec-Fetch-Site`/`Origin` checks at
  the boundary, and each endpoint carries a process-wide rate budget — a request from an
  unexpected origin, or one that exceeds budget, never reaches the attestation logic regardless
  of how well-formed its payload is.

## 3. Reconciliation rules

Reconciliation here is proving that a *replayed* record matches the *recorded* one — the
forensic-desk equivalent of matching internal state against an exchange.

- **Canonical form first.** Before any digest comparison, inputs (bars, config, prior chain
  link) are normalized to one canonical serialization — a record that's logically identical but
  differently formatted must still reproduce the same digest, or the hash function isn't doing
  its job. Skipping this step is the most common cause of false tamper flags.
- **Replay-mismatch detection.** Replaying sealed bars + config + the prior link and getting a
  digest that doesn't match the recorded one is the forensic equivalent of `UNBACKED` — the
  record claims a state that the inputs don't actually produce, which means either the record or
  its inputs were altered after the fact.
- **Role-drift detection.** A live book sitting outside its design-contract band (e.g., a gate's
  live pass-rate share drifting from its intended role) is the forensic equivalent of
  `QTY_DIVERGENT` — not proof of tampering, but a real divergence between the intended shape and
  the observed one that needs a look.
- **Fail closed, but distinguish severity.** A replay mismatch is treated as a hard integrity
  failure — the record can't be trusted until explained. A role-contract drift is treated as a
  watch, not an alarm — see the suppression hierarchy below for why those two get different
  responses even though both are "reconciliation didn't match expectation."

## 4. Suppression hierarchy

A forensic desk watching a live, liquid book will see normal statistical drift constantly — the
suppression hierarchy exists so that a real tamper signal isn't buried under routine noise, and
so routine noise doesn't get treated as a tamper signal by mistake.

1. **Tamper evidence propagates; band drift suppresses to a watch.** A failed replay (digest
   mismatch) is a first-class alert every time. A role-contract band drift on an otherwise
   healthy, live book is logged and tracked, not paged — "a live liquid book can sit slightly
   outside those bands; that is a watch, not a broken seal."
2. **Severity ordering is fixed, not situational.** A replay-mismatch (integrity failure)
   outranks a role-contract drift (design-shape watch), which outranks a request-boundary
   rejection rate-limit trip (operational noise, usually a misbehaving client). Nothing bumps
   this ordering at runtime.
3. **Watches have a time box.** A band drift that persists or worsens past a bounded window
   escalates on its own from "watch" to an active alert — suppression buys time to observe
   whether it's noise or a real shift, it never becomes permanent silence.
4. **Nothing is dropped, only demoted.** Every gate evaluation is still recorded and hash-chained
   regardless of severity; suppression changes what pages a human, never what's in the sealed
   record. A later audit can always reconstruct the full drift history alongside any tamper
   findings.

## Failure-mode catalog

Beyond the mechanisms above, these are failure classes worth naming explicitly:

- **Connector quota exhaustion.** A market-data source (e.g., a rate-limited quote provider)
  cuts off calls mid-session. Treated as a staleness event on that specific source the moment
  calls start failing — not only after the staleness window would eventually catch it — because
  a quota cutoff is often silent (empty or cached-looking responses) until call success is
  checked directly, not just wall-clock time since last attempt.
- **Reconnection loops.** A streaming or polling source that fails and retries repeatedly without
  ever stabilizing can look "fresh enough" to a naive heartbeat check (each retry briefly
  advances a timestamp) while never actually delivering a validated print. Guarded against by
  tracking retry count over a window, not just last-success time.
- **Threshold drift.** A design-contract band calibrated against one regime (e.g., a calmer
  liquidity environment) quietly stops describing the current one — the check still runs, but
  it's no longer discriminating the thing it was built to catch. Mitigated by periodically
  re-deriving bands from measured live behavior and alerting if a derived band moves more than a
  tolerance between recalculations, rather than trusting a band set once and left alone.

## What this doc is and isn't

This reads as "we thought rigorously about how attestation can fail" — because that's what it
is: a worked example of the reasoning behind a fail-closed forensic desk. It is not a claim that
a real deployment's guards, bands, and budgets are exactly this clean or exhaustive in practice.
Real systems accumulate edge cases and known-but-accepted gaps faster than any document tracks
them. That gap is normal and worth being upfront about with a technical reader — the value here
is showing the fail-closed habit of mind, not asserting a finished, gapless system.
