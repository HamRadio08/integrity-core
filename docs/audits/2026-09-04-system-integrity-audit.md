# System integrity audit — 2026-09-04

**Subject:** the verifier, not the stack. `verifyIntegrity` is the only thing standing between a
sealed book and a believed one, so this pass asks a single question: *when the desk reports a
check as `pass`, did that check actually happen?*

**Scope:** `src/lib/audit/{invariants,hash,engine,guard,verify-payload}.ts` and the
`/api/audit/*` handlers, against the committed tape (`data/live-tape.json`, 117 records, sealed
2026-08-22).

**Method:** adversarial probes constructed against the live demo bundle, run through
`verifyIntegrity` directly (the same call `POST /api/audit/verify` makes). Every finding below is
**code-confirmed** — reproduced from probe output, not inferred from reading. Nothing here is
screenshot-inferred or hypothesised.

**Provenance note:** this audit supersedes the 2026-08-28 Cursor Cloud run of the same name,
which terminated `Unable To Complete Request`. That run's only recorded output was a stale
destructive `Remove-Item …\integrity-core -Recurse -Force`, already flagged do-not-run. **That
flag stands. This audit emits no cleanup commands and deletes nothing.** GitHub `main` remains
the single source of truth; the Cursor Origin copy of this repo is stale and was not consulted.

---

## Findings

| # | | Finding | Status |
|---|---|---|---|
| A1 | 🔴 | `attestation` reported **`pass`** when the payload submitted no attestation digest — printing back a digest the verifier had just computed from the caller's own input | **Fixed** |
| A2 | 🔴 | The chain root is caller-supplied. A book resealed from **any** genesis verified fully green | **Fixed** |
| A3 | 🟡 | An **empty** record set verified fully green — every check true for want of anything to test | **Fixed** |
| A4 | 🟡 | Sealed `record.index` was checked only by `replay`, which needs bars the API strips | **Fixed** |
| A5 | 🟡 | `POST /api/audit/verify` has **no caller** in the product | **Owned** |
| A6 | 🟢 | `ok: true` without bars means *internally consistent*, not *replayed* | By design; stated here |
| A7 | 🔴 | The run the desk **publishes** carries no bars, so nobody but the desk can replay it | **Fixed** |

---

## A1 — an unclaimed attestation was reported as a matched one 🔴

`verifyIntegrity` collapsed "no digest was claimed" into the pass branch:

```ts
if (input.expectedAttestation && input.expectedAttestation !== claimed.attestationDigest) { fail }
else { pass }   // ← reached when expectedAttestation is undefined
```

`validateVerifyPayload` does not require `run.attestationDigest`, so omitting it is a valid
request. The report then read:

```
attestation=pass  "Attestation df7dbb87b7e3 reseals from the live payload."
```

`df7dbb87b7e3` is the digest the verifier computed one line earlier **from the caller's own
payload**. Nothing was compared. This is the worst class of verifier defect: not a missed check,
but a fabricated one, rendered on the desk as a green row.

**Fix.** Three outcomes instead of two — `pass` / `fail` / `warn (nothing was compared)` — plus an
`attestation` row when `seed`/`startedAt` are absent, where previously the block was skipped and
the row silently did not exist. This mirrors how `replay` already models a missing input.

```
before  attestation=pass  "Attestation df7dbb87b7e3 reseals from the live payload."
after   attestation=warn  "No attestation digest was submitted, so nothing was compared.
                           The payload recomputes to df7dbb87b7e3 — a restatement of the
                           input, not a match against a claim."
```

---

## A2 — internal consistency was accepted as provenance 🔴

`GENESIS` is a public constant, and the verify route forwards the root straight out of the
request body:

```ts
genesisDigest: body.run.genesisDigest,   // src/app/api/audit/verify/route.ts
```

`verifyIntegrity` then defaults it (`input.genesisDigest ?? GENESIS`) and validates the chain
against whatever arrived. Probe: reseal all 117 records from `sha256("attacker/genesis")`, seed
`999`, `startedAt` 2020-01-01, recompute the attestation over the forged book, submit.

```
before  ok=true  tamper=false  chain=pass  replay=pass  attestation=pass
```

A wholly fabricated run, rooted nowhere, graded green on every check. The chain math was never
wrong — it was answering a different question than the desk was reporting.

**Fix.** New `genesis-root` check, `fail` when the root is not the protocol genesis, counted as a
tamper signal. Every honest producer in this system already seals against that one constant
(`sealUniverse` defaults to it; `run.ts` passes it explicitly), so this closes the hole without
narrowing any real caller.

```
after   ok=false  tamper=true  genesis-root=fail  chain=pass  attestation=pass
```

Note what stays `pass`: the forged chain is internally flawless. **Only the root gives it away** —
which is exactly why the check has to exist as its own row.

> **Standing limit, unchanged:** these digests are unsigned. `genesis-root` establishes that a
> payload claims to be a `stack-attestation/v1` run; it cannot establish that *this desk* produced
> it. Cryptographic provenance would need a signing key, which this system does not have. The
> honest reading of a green `/api/audit/verify` is still **"this book is self-consistent and
> protocol-rooted"** — not "this is the desk's run."

---

## A3 — an empty book verified green 🟡

`{ "run": { "records": [], "config": {…} } }` returned `ok: true` with every check passing,
including `hash-chain: "All 0 records reseal to their claimed digest."` The only signal was a
`role-contract` **warn** (all funnel shares 0, outside band), and `warn` does not clear `ok`.

**Fix.** New `book-populated` check, `fail` on zero records. The vacuous checks below it still
report `pass` — that is honest, and the new row says why it does not add up to a verified run.

```
before  ok=true     (all checks pass)
after   ok=false    book-populated=fail, hash-chain=pass
```

---

## A4 — sealed position was invisible on the payload the API hands out 🟡

`index` is sealed **inside** the record body, so a book whose positions were rewritten and then
re-linked reseals cleanly and `hash-chain` cannot see it. `replay` can — it feeds `record.index`
back into `sealRecord` — but replay needs bars, and `publicRun` strips `barsByCandidate` from
everything `GET /api/audit` returns. So on the exact payload shape that round-trips through the
API, position was checked by nothing.

Probe: rewrite every `index` to `0`, re-link the chain, submit without bars.

```
before  ok=true   chain=pass  replay=warn  (rewrite unseen)
after   ok=false  record-position=fail  chain=pass  replay=warn
```

**Fix.** New `record-position` check comparing each record's sealed `index` against its position
in the submitted order. Costs one pass over the array, needs no bars, and counts as a tamper
signal.

---

## A5 — `/api/audit/verify` had no caller 🟡 → owned

Grep across `src/` found no client. The dashboard called `refresh`, `scan`, `tamper`, `live`,
`paper`, `candidate/[id]`, and `health` — never `verify`. It was nonetheless a public POST
accepting 8 MB and replaying up to 10,000 records × 10,000 bars per request.

**Resolution (operator decision, 2026-09-04): give it a caller, not a retirement.** The owner is
the desk itself, and the reason is not tidiness — it is evaluator independence. `run.integrity` is
computed inside `buildAttestedRun`, so the process that seals the book is also the process that
grades it. `/api/audit/verify` is the only path that re-grades a run from outside that process,
through the same public surface a third party would use.

The **Integrity** tab now carries a `Re-verify through the public API` control that POSTs to
`/api/audit/verify` **twice** and renders both verdicts side by side:

| Payload | Source | What it settles |
|---|---|---|
| Published run | `GET /api/audit` — 273 KB, bars stripped | chain, order, attribution, position, root, attestation. **Replay: warn.** |
| Receipt | `GET /api/audit/receipt` — 1.16 MB, bars attached | all of the above **plus replay: pass** |

Both sizes are measured against the committed tape and sit inside the 8 MB cap. Showing only the
second would overstate what a reader can confirm; showing only the first would hide that the desk
can close the gap. The pair is the honest statement.

---

## A7 — the desk published a run nobody else could replay 🔴

Surfaced while wiring A5. `publicRun` strips `barsByCandidate` from **every** response, so the run
a reader gets from `GET /api/audit` cannot answer the replay question — the headline forensic
guarantee in the README. Measured on the round-trip:

```
self-reported   integrity.ok: true | replayMatched: true
independent     integrity.ok: true | replayMatched: false   ← published payload, no bars
```

The verifier was behaving correctly and reporting honestly (`replay: warn`, per A6). The defect
was upstream: **the one endpoint whose entire job is letting someone else check the work was
unanswerable in full by anyone outside the process.** "Replay reproduces every digest" was a claim
the desk could make and no reader could test.

**Fix.** New `GET /api/audit/receipt` — the dissemination surface. It emits the claim *and the
evidence behind it*:

```json
{
  "schemaVersion": 1,
  "protocol": "stack-attestation/v1",
  "issuedAt": "…",
  "verifyWith": "POST { run, barsByCandidate } to /api/audit/verify",
  "note": "run.integrity is the desk's own claim … recompute the verdict from the evidence.",
  "run": { … },
  "barsByCandidate": { … }
}
```

Self-contained and POST-able straight back into `/api/audit/verify` for a full `replay: pass`.
Same request-boundary guards as every other route, on the tightest read budget on the desk
(capacity 3, 6/min) because it is ~4× the size of any other response. It reads the active bundle;
it seals nothing and writes nothing.

Regression coverage asserts all three legs: every sealed record ships its bars, the receipt
round-trips to `replay: pass`, and the bars-free published run still lands on `replay: warn` —
the gap is documented in a test rather than left to be rediscovered.

---

## A6 — what `ok: true` means without bars 🟢

Unchanged, and correct as designed — recorded so it is not mistaken for a defect later.
`replay` degrades to **`warn`** when no bars are supplied, and a warn does not clear `ok`. So a
bars-free payload can return `ok: true` having verified the chain, order, attribution, position,
root, and attestation — but **not** that the sealed bars reproduce the digests. The `replay` row
says so in its own text. Read the row, not the boolean.

---

## Checked and found sound 🟢

Probed or read end-to-end, no defect found:

- `hash-chain` — contiguity and self-reseal across 117 records; a NaN-poisoned record is *reported*, not thrown on.
- `canonicalize` / `NonFiniteSealError` — refuses to seal non-finite numbers rather than minting a stable digest for a broken computation.
- `short-circuit`, `gate-order`, `finite-metrics`, `config-binding` — all fire correctly on the poisoned books already covered by `invariants.test.ts`.
- `replay` — a one-bar close mutation is caught.
- `guard.ts` — `Sec-Fetch-Site`/`Origin` verdicts, constant-time token compare, unforgeable per-process boot token, per-endpoint token buckets.
- `verify-payload.ts` — boundary validation stops every crash vector it documents; the 8 MB cap is enforced on the *stream*, not just `Content-Length`.

## Regression coverage

`src/lib/audit/verifier-adversarial.test.ts` — 7 tests. Each is the probe that found the finding,
inverted into an assertion, including a guard that the desk's own honest call stays fully green.

`src/app/api/audit/routes.test.ts` — 5 added for the receipt surface (shape, full-replay
round-trip, the documented bars-free gap, guard parity, and its own rate budget).

Full gate at time of writing: `vitest` 96/96, `tsc --noEmit` clean, `eslint --max-warnings 0`
clean, `npm run attest` green on the committed tape (the `role-contract` warn on
`volume_confirm` at 24.8% vs a 12–24% band is pre-existing live-tape drift, not a seal defect).
