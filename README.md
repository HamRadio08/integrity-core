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
npm run dev       # http://127.0.0.1:43173
```

`Mark to market` on the desk pulls a fresh Coinbase/Gecko spot and reseals. It does not fabricate bars.

## Forensic guarantees

- Hash-chained records; each gate evaluation has its own digest
- Replay of sealed bars + config + prior link reproduces the record digest
- No look-ahead: indicators at bar *i* use only closes `0..i`
- Kill attribution is the first `FAIL`
- Role-contract bands flag live drift without calling a drifted book "tampered"

The design contract (7 / 49 / 18 / 18 / 4) is the intended sequential shape. A live liquid book can sit slightly outside those bands; that is a watch, not a broken seal.
