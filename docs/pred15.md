# PRED15 — 15-minute BTC review tab

Human cockpit for Coinbase Predict / Kalshi `KXBTC15M`. **No live orders. Does not write the attested chain.**

## What shipped

- Dashboard tab `PRED15`
- `GET /api/pred15/card` — Coinbase last (proxy) + optional Kalshi public book + strip
- Math in `src/lib/pred15/sigma.ts` (z, cash-or-nothing Φ, fee band, SETTLE_WATCH)
- Kalshi client in `src/lib/pred15/kalshi.ts` — **public GET only**

## Kalshi

Market-data GETs do not need a key:

```
GET https://external-api.kalshi.com/trade-api/v2/markets?series_ticker=KXBTC15M&status=open
```

If that is blocked, type strike + venue Over % from the Coinbase screen.

To be ready later (still read-only):

1. Create a Kalshi account → Profile → API Keys
2. Save Key ID + PEM off-repo (`*.pem` is gitignored)
3. Set `KALSHI_API_KEY_ID` and `KALSHI_PRIVATE_KEY_PATH` on the host
4. Optional `KALSHI_API_BASE` (default production Trade API)

v1 reports `kalshiKeyReady` and **never signs an order**.

## Contract

- Default strip is `NO_BET`
- Coinbase last ≠ BRTI 60s average
- Compare Φ to the **fill**, not just the button
- `TRADING_MODE=live` stays refused
