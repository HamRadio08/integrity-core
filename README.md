# Stack Attestation

Forensic control desk for a sequential trading stack:

`tier_reject → trend_sep (EMA) → adx → volume_confirm → accel_gate`

The first fail is the only fail. Later gates are recorded as `SKIP`, hashed, and chained. The desk reseals venue tape and checks that each gate still occupies the role it was given.

The universe screen runs first. Liquidity and tier are properties of the *asset*, not of its current signal, so they are knowable before any indicator is computed. Sitting fourth, `tier_reject` only ever saw the 8 of 117 names that had already cleared three signal gates — 93% of the book was never liquidity-checked at all. Reordering is safe because the stack is a short-circuit AND-chain: a candidate passes iff it clears all five gates, whatever order they run in, so what moves is kill *attribution*, not *selection*. Same 5 names pass either way.

This repo does **not** invent OHLC. The book is 117 live names (crypto + liquid equities + a few crypto-beta stocks) plus a Coinbase/CoinGecko mark-to-market overlay. Bitcoin is scored on the real print — through $75,000, around $78.5k after a ~25% week.

> **Start here if you are evaluating this repository.**
>
> | | |
> |---|---|
> | **What it proves** | that a five-gate chain was applied honestly, in order, to real venue tape — and that the record can be re-checked by someone who is not this process |
> | **What it does not prove** | authorship. The digests are **unsigned**: green means *self-consistent and protocol-rooted*, not *this desk produced it* |
> | **The most useful thing here** | [the audit where this desk's own verifier was caught reporting four checks it never performed](docs/case-studies/01-forged-genesis.md) — including a book resealed from a forged genesis that verified fully green |
> | **How to check me** | `GET /api/audit/receipt` returns the claim **and the evidence** — the sealed run plus the bars behind it. POST it straight back into `/api/audit/verify` and replay it yourself. See [Refute this desk](#refute-this-desk) |
> | **Evidence ledger** | the `/evidence` route (`npm run dev`), backed by [`data/evidence-ledger.json`](data/evidence-ledger.json) — every preregistered gate and adversarial audit, with the verdict and the condition that would reopen it. Most are failures |
> | **Limitations** | [`docs/limitations.md`](docs/limitations.md) — read before believing anything above |
> | **Trading claims** | none. Paper only; `TRADING_MODE=live` is refused in code |
> | **Authorship** | the code is written by AI agents to specification. See [Authorship](#authorship) |

## Case studies

Three systems, one question: *did the check actually run — and could its output have been
different?* Each of these is a failure found in the author's own work.

| | Case | What it turned out to be |
|---|---|---|
| 01 | [The verifier reported four checks it never performed](docs/case-studies/01-forged-genesis.md) | 117 records resealed from `sha256("attacker/genesis")` verified fully green. Internal consistency is not provenance, and a hash chain cannot tell you which one you have. |
| 02 | [A safety feature that was enabled, error-free, and dead](docs/case-studies/02-fail-open-on-feed-loss.md) | `except: return 1.0` with no log. Feed down ⇒ silently no adjustment, for the feature's entire life. A silent neutral return is indistinguishable from a healthy path. |
| 03 | [Silence is an alert, and so is a constant](docs/case-studies/03-silence-is-an-alert.md) | An alarm that could not fire, and a monitor that fired 31 identical rows out of 33. An output that cannot vary with the thing it observes is not evidence about that thing. |

## How the stack treated this BTC pump

As of the sealed tape (22 Aug 2026):

| Window | Last | trend_sep | adx | volume | What it means |
| --- | --- | --- | --- | --- | --- |
| Daily (binding) | ~$78,539 | PASS, 2.50% EMA gap | FAIL, ADX 21.0 vs 22 | skipped | The pump is a real uptrend, not tangled EMAs. Daily strength is still one point short because most of the 80-day window was the $62–66k grind. |
| Hourly (pump zoom) | same print | PASS, 1.50% gap | PASS, ADX 55.4 | FAIL, 0.00× | Intraday the impulse is unmistakable. Yahoo hourly volume is empty on this feed, so participation is not trusted at 1h. Daily volume remains the binding screen. |

The stack did **not** rubber-stamp the vertical. It let BTC through the coarse regime filter and stopped it at daily trend strength — exactly the sequential job those gates were given.

## Run locally

```bash
npm install
npm run tape      # refresh data/live-tape.json from Yahoo + Coinbase + CoinGecko
npm run attest    # seal the book and print the funnel + BTC walkthrough
npm test
npm run paper     # tick the paper book (loop; --once for a single pass)
npm run dev       # http://127.0.0.1:43173
PORT=43173 npm start   # production server on 0.0.0.0
```

## Live box (Alienware)

Production is the Alienware. It tracks `main`. This cloud agent cannot start a process on that machine.

On the Alienware, from this repo:

```powershell
# Windows (typical Alienware)
.\scripts\box-install.ps1
```

```bash
# Linux
chmod +x scripts/box-install.sh
./scripts/box-install.sh
```

That pulls `origin/main`, builds, binds `0.0.0.0:43173`, and keeps the box on `main` (logon + every 5 minutes on Windows; systemd + timer on Linux). One-shot without the scheduler:

```bash
npm run box -- --track-main
```

The header badge reads `Alienware · <sha>` only when `DESK_HOST=alienware`. `/api/health` reports the same host and sha. Open the desk at `http://<alienware-lan-or-tailscale>:43173/`.

Vercel / Render remain optional remote backups. They do not replace the box.

Tamper lab stays off when `NODE_ENV=production`. `npm start` binds `0.0.0.0` and honors `PORT`. `/api/health` is the uptime probe.

`Mark to market` on the desk pulls a fresh Coinbase/Gecko spot and reseals. It does not fabricate bars.

Paper agents (`stack-long`, `stack-crypto`, `meme-cleared`) tick on desk load, reseal, and `npm run paper`. They equal-weight long names that cleared the stack and sit in cash when none did. Every fill is `venue=paper`. There is no live order path — `TRADING_MODE=live` is refused.

**PRED15** is a separate review tab for 15-minute BTC Over/Under contracts (Coinbase Predict / Kalshi `KXBTC15M`). It grades clock, strike, z, Φ, and venue odds. Coinbase last is a proxy; settlement is BRTI's 60-second average. Default strip is `NO_BET`. Kalshi is an optional public GET — no API key required, and a signed key never places an order. See `docs/pred15.md`.

The desk also surfaces four measured lanes — none of them invent a number:

- **PnL by strategy** — equal-weight 5d/20d tape returns of sealed names, grouped by kill attribution (and the names that cleared the stack). This is not executed trading P&L.
- **Futures** — live Yahoo front-month prints (`BTC=F`, `ES=F`, …). A venue miss stays blank.
- **CI runner / watch lanes** — GitHub Actions for this repo plus role-contract and freshness watches from the sealed book.
- **Meme position ladder** — meme-sector names already on the tape (DOGE, SHIB, WIF), ranked by measured 5d return, with live spots shown beside the sealed last.

`Refresh live lanes` re-pulls futures, spots, and CI, then reseals the book from that overlay so PnL means, meme lasts, and paper marks stay on the same print the dashboard is showing. The ledger Inspect control is a real `<button>`, not a clickable row.

Production is fed only from `main`. Keep `main` current; a host tracking any other branch is behind by definition.

## API hardening

The `/api/audit/*` routes carry request-boundary guards (`src/lib/audit/guard.ts`):
cross-site browser requests are rejected via `Sec-Fetch-Site`/`Origin` checks, each
endpoint has a process-wide rate budget, and `/api/audit/verify` enforces an 8 MB
payload cap plus structural validation before anything reaches `verifyIntegrity`.

`GET /api/audit/receipt` is the dissemination surface: a self-contained attestation
receipt carrying the sealed run **and the bars behind it**, POST-able straight back into
`/api/audit/verify` for a full replay. Every other read strips bars, so the published run
alone can only be checked for consistency — the receipt is what makes the replay guarantee
testable by someone who is not this process. The desk exercises both paths itself from the
Integrity tab (`Re-verify through the public API`) and shows the two verdicts side by side.

Two optional env flags:

- `AUDIT_TAMPER_ENABLED` — the tamper lab (UI tab + `/api/audit/tamper`) runs only in
  development by default. Set `1`/`true` to force it on (e.g. a demo deployment) or
  `0`/`false` to force it off.
- `AUDIT_API_TOKEN` — when set, every audit POST requires credentials: scripted
  callers send `Authorization: Bearer <token>`, and the desk's own browser calls
  authenticate automatically via a per-process session token embedded at render.
  Same-origin request headers alone are never treated as credentials — they are
  forgeable by anything that is not a browser.

## Forensic guarantees

- Hash-chained records; each gate evaluation has its own digest
- Replay of sealed bars + config + prior link reproduces the record digest
- The chain must be rooted in the protocol genesis — a book resealed from a caller's own root is refused, not verified
- A record's sealed `index` must be its position in the chain, checked without bars
- An empty payload is refused rather than passing every check for want of anything to test
- No look-ahead: indicators at bar *i* use only closes `0..i`
- Kill attribution is the first `FAIL`
- Role-contract bands flag live drift without calling a drifted book "tampered"

What this deliberately does **not** prove: these digests are unsigned, so a green
`/api/audit/verify` means *this book is self-consistent and protocol-rooted* — not *this desk
produced it*. Read the `replay` row too: without bars it degrades to a warn, and a warn does not
clear `ok`. See `docs/audits/2026-09-04-system-integrity-audit.md`.

The design contract (7 / 49 / 18 / 18 / 4) is the intended sequential shape. A live liquid book can sit slightly outside those bands; that is a watch, not a broken seal.

Every limitation above is enumerated, with the condition that would lift each one, in
[`docs/limitations.md`](docs/limitations.md).

## Evidence ledger

`/evidence` renders every preregistered evaluation and adversarial audit behind this work:
the gate that was fixed before the measurement, the measurement, the verdict, and — per the
standing rule that a closed item must carry the condition that reopens it — what would bring
each verdict back.

Most entries are failures, including a preregistered model-promotion gate that both candidates
missed by more than an order of magnitude, and the discovery that the test population itself was
degenerate. A ledger that only records wins is a brochure.

The page reads `data/evidence-ledger.json`, which is validated at load: a point estimate that
does not reproduce its own counts, an interval that does not contain its point, an audit that
reports no findings, or an empty ledger all refuse to render rather than render as clean. That
check exists because of case study 03.

## Refute this desk

The forensic claim is *replay of sealed bars + config + prior link reproduces the record digest*.
Before 2026-09-04 that claim was untestable by anyone outside this process: every published read
stripped the bars, so an outside checker got `replay: warn` and could only confirm internal
consistency. A guarantee that only its author can check is a marketing claim wearing a hash.

`GET /api/audit/receipt` is the fix. It emits the run **and the evidence** — sealed bars included,
`schemaVersion: 1`, self-contained — and it POSTs straight back into `/api/audit/verify` for a full
`replay: pass`.

```bash
npm run build && PORT=43173 npm start          # or npm run dev

# 1. take the receipt: the claim plus the bars behind it
curl -s http://127.0.0.1:43173/api/audit/receipt > receipt.json

# 2. hand it back and make the desk prove the claim to you
curl -s -X POST http://127.0.0.1:43173/api/audit/verify \
  -H 'Content-Type: application/json' --data @receipt.json > verdict.json

# 3. read the row that matters, not just the headline
python3 -c "import json;r=json.load(open('verdict.json'))['report'];print('ok',r['ok'],'| replayMatched',r['replayMatched']);print([c for c in r['checks'] if c['id']=='replay'][0]['severity'])"
```

Against the committed tape that prints `ok True | replayMatched True` and `pass`, over 117 sealed
records from a 1.16 MB receipt (the bars-free run is 273 KB; the payload cap is 8 MB).

**Read `report.replayMatched` and the `replay` check's `severity`, not just `report.ok`.** Three
outcomes are meaningful:

| `replay` severity | It means |
|---|---|
| `pass` | every sealed digest was reproduced from the bars you were given |
| `warn` | you sent a payload with no bars — nothing was replayed, and `ok` is not cleared |
| `fail` | the bars and the digests disagree. That is a tamper signal |

This is the finding that produced the endpoint, measured on the round trip before it existed:

```
self-reported    integrity.ok: true  | replayMatched: true
independent      integrity.ok: true  | replayMatched: false   ← published payload, no bars
```

The desk runs both paths against itself from the Integrity tab (`Re-verify through the public API`)
and shows the two verdicts side by side, so a divergence between what it claims and what it can
prove is visible on the desk rather than only to whoever thought to check.

What this still does not give you is **provenance**: the digests are unsigned, so a green verdict
says the book is self-consistent and protocol-rooted, not that this desk produced it. The forged
chain in [case study 01](docs/case-studies/01-forged-genesis.md) was internally flawless.

## Authorship

**The code in this repository is written by AI agents — primarily Claude Code — to
specification. The author does not hand-write it.**

The claimed skill is specification, verification, governance, and honest evaluation of
AI-produced work: deciding what to build, defining what would falsify it, and catching the
cases where the machine reported a check it never performed. The case studies above are the
evidence for that claim, and every one of them is a failure found in the author's own systems.

Stated here rather than left to be discovered. A reader should never be able to catch what the
document could have said itself.
