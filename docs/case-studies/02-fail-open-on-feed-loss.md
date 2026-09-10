# 02 — A safety feature that was enabled, error-free, and dead for its entire life

**System:** the author's private trading stack (mechanism described; no strategy parameters,
universe, or credentials appear here)
**Found:** 2026-06-18 · **Evidence class:** code-confirmed
**Canonical name in the internal record:** the Arkham incident — the standing reference for
fail-open on data loss.

---

## The shape

A stop-loss modifier consumed a third-party on-chain analytics feed to widen or tighten exits
around large-holder activity. Its call site looked like this:

```python
try:
    return self._whale_stop_multiplier(symbol)
except (ImportError, Exception):
    return 1.0          # ← no log
```

`1.0` is the identity multiplier. When the feed was reachable, the feature worked. When the feed
went down, **every call silently returned "no adjustment"** and the system carried on.

By every cheap signal an operator checks, the feature was healthy:

- its flag was `True`
- the module imported fine
- no exception ever surfaced
- no error appeared in any log

It had produced **zero effect for its entire enabled life**.

## Why this is worse than not having the feature

The operator believed whale-aware stops were protecting the book. That belief changed behavior:
no backup control was added, and the risk the feature was meant to cover was booked as covered.

**A silent neutral return is indistinguishable from a healthy path.** The failure does not
present as a failure; it presents as calm.

Two other features in the same audit had the same shape. Three independent dead features, one
session.

## The two root causes, both cheap to make

**1. Swallow-to-neutral.** `except: return <identity_value>` — `return 1.0`, `return {}`,
`return None` — with no warning emitted. The remedy is not "catch fewer exceptions"; it is
**guard *and* log at the call site**. A fallback path that does not announce itself is a fallback
path nobody will ever audit.

**2. Empty-as-all-clear.** A consumer reads an empty collection and treats it as a passing
verdict rather than as *no data*. The remedy is a **data-presence guard before any "looks safe"
conclusion**: absence must resolve to `UNKNOWN`, never to `PASS`.

Both are one line to write and invisible until something goes looking.

## What actually fixed it

Not the three patches. The patches close three instances; the class stays open.

What closed the class was a **feature-health guard**: a standing check that asks, for every
feature claiming to be live, *did it produce output?* — a row, a non-neutral return, a non-empty
snapshot — and routes a negative answer to the existing operator alerter.

`flag == True` is necessary. It is not sufficient. **When asked to verify that a feature is live,
verify that it produced output.**

## Where this lands in the public repo

`integrity-core` inherits the rule directly, in two places:

- **`replay` degrades to `warn`, never to `pass`, when bars are absent** — the audited shape of
  "absence must not read as success." A missing input produces a named, non-clearing state, not
  a quiet identity value. See [`docs/limitations.md` §2](../limitations.md).
- **`book-populated`** — an empty record set is *refused*, not passed for want of anything to
  test. That check exists because of finding A3 in
  [case study 01](01-forged-genesis.md), which is this same failure class reached independently.

Three systems. One question. Same answer.
