# Case studies

Three systems. One question:

> **Did the check actually run — and could its output have been different?**

Each case below is a failure found in the author's own work, and each was found by asking that
question rather than by any monitor. They are ordered by how directly they can be verified from
this repository.

| | Case | System | Evidence |
|---|---|---|---|
| [01](01-forged-genesis.md) | The verifier reported four checks it never performed | this repository | Fully reproducible here — probes kept as regression tests in `src/lib/audit/verifier-adversarial.test.ts`; the full audit is in [`../audits/2026-09-04-system-integrity-audit.md`](../audits/2026-09-04-system-integrity-audit.md) |
| [02](02-fail-open-on-feed-loss.md) | A safety feature that was enabled, error-free, and dead for its entire life | private trading stack | Mechanism and measurements only. No strategy parameters, universe, or credentials |
| [03](03-silence-is-an-alert.md) | Silence is an alert, and so is a constant | private trading stack | Measured counts over 33.26 days across two repositories |

## The shared failure class

All three are **fail-opens**: the system reported safety it had not established.

- **01** — a check that reported `pass` without running, and a guarantee only its author could test.
- **02** — a fallback that returned the identity value silently, so a dead feature looked calm.
- **03** — a monitor that could not fire, and a monitor that fired the same row every time.

The remedies are the same shape in all three: **absence must resolve to `UNKNOWN`, never to
`PASS`**, and **an output that cannot vary with the thing it observes is not evidence about that
thing.**

## What they changed in this repository

| Rule | Where it lives now |
|---|---|
| An empty record set is refused, not passed | `book-populated` check in `verifyIntegrity` |
| A missing input degrades to a named `warn` that does not clear `ok` | `replay` and three-way `attestation` |
| A chain must be rooted in the protocol genesis, not the caller's | `genesis-root` check |
| A published claim must be testable by a non-author | `GET /api/audit/receipt` |
| Tests assert relationships, never one day's constants | `src/lib/audit/*.test.ts`, plus an explicit non-vacuousness check |
| A published evidence row must reproduce its own arithmetic | `src/lib/evidence/load.ts` |
| Every closed item carries the condition that reopens it | `reopenCondition`, required on every ledger entry |
