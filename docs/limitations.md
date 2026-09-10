# Limitations

Everything this desk cannot do, stated by the desk rather than discovered by the reader.

A forensic tool that oversells itself is the thing it exists to catch. What follows is the
standing list. It is maintained as a first-class document, not an appendix: if a guarantee
weakens, this file changes in the same commit.

---

## 1. The digests are unsigned

`GET /api/audit/verify` returning `ok: true` means:

> this book is **self-consistent** and **rooted in the protocol genesis**

It does **not** mean:

> this desk produced this book

There is no signing key. Anyone can construct a book that verifies green — the checks confirm
internal structure and a known root, not authorship. Cryptographic provenance requires a key the
system does not have and does not pretend to have.

This is not a bug that is queued for a fix. It is the boundary of what a hash chain alone can
tell you, and the reason `docs/case-studies/01-forged-genesis.md` exists.

## 2. `ok: true` without bars is not a replay

The replay guarantee — *sealed bars + config + prior link reproduce the record digest* — is only
tested when bars are present. Every read except `GET /api/audit/receipt` strips them.

When bars are absent, `replay` degrades to `warn`, and a `warn` does not clear `ok`. **Read the
`replay` row, not just the headline.** The receipt endpoint exists so that a reader who is not
this process can obtain the bars and run the replay themselves.

## 3. This is paper. There is no live order path.

Every fill carries `venue=paper`. `TRADING_MODE=live` is refused by the code, not by
configuration. The paper agents (`stack-long`, `stack-crypto`, `meme-cleared`) equal-weight names
that cleared the gate stack and sit in cash when none did.

- **No performance claim is made anywhere in this repository.** Not a Sharpe, not a win rate, not
  a return. The paper book demonstrates that the gate chain produces a decidable roster; it is
  not evidence that the roster makes money.
- The paper book here is **a different book** from any other paper or simulated book operated by
  the same author. Do not aggregate them.
- "PnL by strategy" on the desk is **equal-weight 5d/20d tape returns of sealed names, grouped by
  kill attribution.** It is a descriptive statistic about the tape. It is not executed trading
  P&L and must not be read as one.

## 4. The tape is real, and that makes it drift

`data/live-tape.json` holds real public marks — Yahoo, Coinbase, CoinGecko — for 117 names, not
synthetic OHLC. Two consequences:

- Re-running `npm run tape` changes the numbers. Tests are written as **structural invariants**
  rather than pinned values for exactly this reason; a test pinned to a sealed number breaks on
  market drift alone and teaches nothing.
- Hourly volume from the Yahoo feed is frequently empty. The desk shows `0.00×` and treats
  participation as **untrusted at 1h**, falling back to the daily volume screen. It does not
  fabricate the missing bar.

## 5. The design contract is a watch, not a proof

The `7 / 49 / 18 / 18 / 4` funnel shape is the *intended* sequential geometry. A live liquid book
can sit outside those bands for ordinary reasons. Drift flags a **watch**; it does not declare a
book tampered. Conflating the two would make the tamper signal useless within a week.

## 6. Coverage boundaries

- **`POST /api/audit/verify` has no in-product caller.** It is a dissemination surface for
  external checkers. That is deliberate (finding A5), but it means the endpoint's own regression
  risk is carried by tests rather than by daily use.
- The tamper lab is **off** under `NODE_ENV=production` unless `AUDIT_TAMPER_ENABLED` forces it.
- Rate budgets are **process-wide**, not per-caller. A multi-process deployment does not get a
  shared budget.
- `AUDIT_API_TOKEN` is optional. When unset, audit POSTs are unauthenticated. Same-origin request
  headers are never treated as credentials — they are forgeable by anything that is not a browser.

## 7. Authorship

**The code in this repository was written by AI agents — primarily Claude Code — to
specification.** The author does not hand-write it.

The claimed skill is specification, verification, governance, and honest evaluation of
AI-produced work: deciding what to build, defining what would falsify it, and catching the cases
where the machine reported a check it never performed. `docs/case-studies/` is the evidence for
that claim, and every case study in it is a failure found in this author's own systems.

## 8. What would change these statements

Per the standing rule that a closed item must carry the condition that reopens it:

| Limitation | What would lift it |
|---|---|
| Unsigned digests (§1) | A managed signing key + published public key, and a `signature` check in `verifyIntegrity` that fails closed when absent |
| Replay warn without bars (§2) | Nothing — this is correct behavior. It lifts only if bars become cheap enough to include in every read, and the 8 MB payload cap still holds |
| Paper only (§3) | Out of scope for this repository, permanently. The refusal of `TRADING_MODE=live` is a design commitment, not a milestone |
| Empty hourly volume (§4) | A venue feed that reports hourly participation reliably; until then the daily screen stays binding |
| No in-product `verify` caller (§6) | An external checker in CI that POSTs a published receipt back and fails the build on a non-green verdict |
