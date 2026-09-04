# Stack Attestation

Forensic control desk for a sequential trading stack:

`tier_reject → trend_sep (EMA) → adx → volume_confirm → accel_gate`

The first fail is the only fail. Later gates are recorded as `SKIP`, hashed, and chained. The desk reseals venue tape and checks that each gate still occupies the role it was given.

The universe screen runs first. Liquidity and tier are properties of the *asset*, not of its current signal, so they are knowable before any indicator is computed. Sitting fourth, `tier_reject` only ever saw the 8 of 117 names that had already cleared three signal gates — 93% of the book was never liquidity-checked at all. Reordering is safe because the stack is a short-circuit AND-chain: a candidate passes iff it clears all five gates, whatever order they run in, so what moves is kill *attribution*, not *selection*. Same 5 names pass either way.

This repo does **not** invent OHLC. The book is 117 live names (crypto + liquid equities + a few crypto-beta stocks) plus a Coinbase/CoinGecko mark-to-market overlay. Bitcoin is scored on the real print — through $75,000, around $78.5k after a ~25% week.

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
