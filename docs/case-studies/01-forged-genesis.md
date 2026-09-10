# 01 — The verifier reported four checks it never performed

**System:** this repository (`integrity-core` / Stack Attestation)
**Found:** 2026-09-04 · **Closed:** [#18](https://github.com/HamRadio08/integrity-core/pull/18)
**Evidence class:** code-confirmed — every finding reproduced from probe output against the live
demo bundle, then re-verified over HTTP. Nothing here is inferred from reading.

Full record: [`docs/audits/2026-09-04-system-integrity-audit.md`](../audits/2026-09-04-system-integrity-audit.md)

---

## The question the audit asked

Not *"is the gate stack correct?"* — that is the desk's job and it was working. One narrower
question, aimed at the desk itself:

> When `verifyIntegrity` reports a check as `pass`, did that check actually happen?

`verifyIntegrity` is the only thing standing between a **sealed** book and a **believed** one. If
it can report a pass it did not earn, every green row downstream is decoration.

Answer: **four times, no.**

## What was wrong

| # | | Finding |
|---|---|---|
| A1 | 🔴 | `attestation` reported **`pass`** on a payload that submitted no attestation digest — printing back a digest the verifier had computed one line earlier *from the caller's own input*. Not a missed check. A **fabricated** one, rendered on the desk as a green row. |
| A2 | 🔴 | The chain root was caller-supplied (`genesisDigest: body.run.genesisDigest`). **117 records resealed from `sha256("attacker/genesis")` verified fully green** — chain, replay, and attestation all `pass`. |
| A3 | 🟡 | `records: []` returned `ok: true` with `hash-chain: "All 0 records reseal to their claimed digest."` Vacuous truth rendered as a guarantee. |
| A4 | 🟡 | A sealed `record.index` was read only by `replay` — and `replay` needs bars that the public payload strips. On the shape that actually round-trips the API, chain position was checked by **nothing**. |
| A5 | 🟡 | `POST /api/audit/verify` had no caller anywhere in the product. |
| A7 | 🔴 | The run the desk **publishes** carries no bars, so nobody outside the process could replay it. |

## The two that generalize

### ⭐ A2 — internal consistency is not provenance, and a hash chain cannot tell you which

The forged chain was **internally flawless**. Every link hashed to its successor. Replay
reproduced every digest. Attestation matched. It was a perfectly well-formed book that this desk
had never seen.

Only a check against the *protocol's own* genesis root gave it away.

The fix (`genesis-root`) is three lines. The lesson is not three lines: a chain proves that a
sequence has not been edited **since it was rooted**. It says nothing about who rooted it, or
whether the root is yours. Systems that treat chain-validity as authenticity are checking the
wrong property with real confidence.

The standing limit is now stated in `README.md` and [`docs/limitations.md`](../limitations.md):
these digests are **unsigned**. Green means *self-consistent and protocol-rooted*, not *this desk
produced it*.

### ⭐ A7 — the endpoint whose whole job was external verification could not be used externally

Measured on the round trip:

```
self-reported    integrity.ok: true  | replayMatched: true
independent      integrity.ok: true  | replayMatched: false   ← published payload, no bars
```

The verifier was behaving correctly and reporting honestly (`replay: warn`). The defect was
upstream: *"replay reproduces every digest"* — the headline forensic guarantee — was a claim the
desk could make and **no reader could test**.

A guarantee that only its author can check is a marketing claim wearing a hash.

## What shipped

- **`verifyIntegrity`** — `attestation` goes three-way (`pass` / `fail` / `warn-nothing-compared`,
  matching how `replay` already modeled a missing input). New `genesis-root`, `book-populated`,
  and `record-position` checks; the latter two count as tamper signals.
- **`GET /api/audit/receipt`** (new) — the dissemination surface. Emits the claim *and the
  evidence*: run + sealed bars, `schemaVersion: 1`, self-contained, POST-able straight back into
  `/api/audit/verify` for a full `replay: pass`. 1.16 MB against the committed tape versus 273 KB
  bars-free; both inside the 8 MB cap.
- **`src/lib/audit/verifier-adversarial.test.ts`** — the probes, kept as regression tests. Each
  one fails against the pre-fix verifier.

## Why this is the first case study

Every finding above is a **fail-open**: the system reported safety it had not established. That
is the failure mode the other two case studies share, found in three different systems by the
same question — *did the check actually run?*

A verifier that cannot be caught lying by its own author has not been audited. It has been
admired.
