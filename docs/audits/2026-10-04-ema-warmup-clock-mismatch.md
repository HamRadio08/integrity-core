# EMA warm-up clock mismatch — 2026-10-04

**Subject:** the trend engine's post-restart entry window, not the gate stack. `trend_strategy.py`
warms every `TrendTracker` from 63 fifteen-minute Coinbase candles and then feeds 5-second ticks
through the same EMA recursion. This pass asks one question: *for how long after a restart is the
entry floor compared against a spread the floor was never tuned for, and does the real code act on
it?*

**Scope:** `HamRadio08/ai-trading-agents` at `main` `5c2b744f` — `TrendTracker.__init__`,
`TrendTracker.update()`, `TrendStrategy._seed_symbol_fast()`, `indicators.ema`,
`momentum_monitor.py`, `decision_log.py`, and the startup ordering in `dashboard_server.py`.

**Method:** two hermetic instruments plus a read-only box census that could not be run from
here.

1. `decay.py` — a pure-math replica of the seed and the tick recursion. No imports from the
   stack. Reproduces the spread tick by tick.
2. `real_path.py` — constructs the stack's own `TrendTracker`, seeds it *exactly* as
   `_seed_symbol_fast` does (closes appended to `prices`, `prev_fast`/`prev_slow` and the
   incremental cache computed by `indicators.ema` over that list), then calls the real
   `update()` with flat 5-second ticks and captures the spread at the point where the decision
   log reads it. Gates that need the box (positioning, HTF alignment, whale veto, tier rescue,
   V3 lifecycle, resistance) are switched off in the harness and restored; ADX is run both
   ways. Every number below from this instrument is **code-confirmed**.
3. `box_restart_xn.py` — the census the operator runs on antonio. Everything it would report
   is **UNMEASURED** in this document.

**Provenance note:** the memory record (`HamRadio08/claude-memory`) was reached through the
GitHub API, not cloned. Code search over that repository returned no results with the index
marked incomplete, so the tree was listed and three records read in full:
`project_trend_following.md` (Donchian shadow sleeve, a different engine),
`project_momentum_monitor.md` (quotes a 0.028 % floor that predates the 2026-09-08 fee
correction; the live floor is 0.168 %), and `reference_log_routing.md` (`print()` lands in
`server.log`, `logger.*` in `logs/trading.log`). None records this defect. "No prior record" is
bounded to those three files and the tree listing.

---

## Findings

| # | | Finding | Status |
|---|---|---|---|
| W1 | 🟡 | The entry precondition `curr_spread > min_move` is evaluated on the 15-minute seed clock for the first 4–28 ticks after a restart. The real `update()` emits **BUY on tick 1** whenever the seeded spread clears the floor | **Open — box x/n pending** |
| W2 | 🟡 | Pullback entry is a no-op on the restart tick: `_pullback_pending` goes `True` then `False` inside tick 1 because price sits above the stale 2-hour fast EMA | **Open — pre-existing, wider than restarts** |
| W3 | 🟡 | With **zero drift** and 0.3 %/bar noise, **9 of 30** seeded replicates clear the floor on tick 1. The floor was sized for the 5-second clock; the 15-minute clock carries roughly 13× the spread scale | Measured offline; box share UNMEASURED |
| W4 | 🟡 | The decision-log flush counter advances once per 30-tick reporting window, so `DECISION_LOG_FLUSH_TICKS = 30` means 75 minutes, not "~2.5 min". The 1000-record buffer cap is what actually decides whether the momentum monitor can see a restart window | Observed, not fixed here |
| W5 | 🟢 | Restart-adjacent alert pairs and `trend_ema` BUY fills: **no number is quoted.** The box files were out of reach; the census script prints the integers | UNMEASURED — command handed to the operator |

---

## W1 — the seed clock

`_seed_symbol_fast` fetches `max(slow_span*3, 63) = 63` candles at `granularity: 900`, appends
the closes to `tracker.prices`, and sets

```python
tracker.prev_fast = _ema(price_list, tracker.fast_span)   # alpha 2/9  over 15m bars  ≈ 2 h
tracker.prev_slow = _ema(price_list, tracker.slow_span)   # alpha 2/22 over 15m bars  ≈ 5.25 h
tracker._ema_fast_cached = tracker.prev_fast
tracker._ema_slow_cached = tracker.prev_slow
```

`update()` then takes the O(1) branch — `fast = α·price + (1−α)·cached` — with the **same**
alphas on 5-second ticks. The seeded value's weight halves every 2.76 ticks in the fast EMA and
every 7.27 ticks in the slow one, so the spread `(fast − slow) / slow` decays on the slow EMA's
clock. The startup order bounds the race: `dashboard_server.py` joins the seed thread with a
60-second timeout before the tick loop starts (line 3165), so on a normal restart every tracker
enters the loop already seeded.

### Offline decay table (code-confirmed; `real_path_out.json`, sha256 `ad737022…`)

`min_move = TREND_ROUND_TRIP_COST_PCT × TREND_MIN_PROFIT_MULTIPLE = 0.0240 × 0.07 = 0.168 %`.
Flat ticks at the last close after the seed. "Ticks > floor" is the last tick on which the
spread still exceeds the floor; seconds at 5 s per tick. Both instruments agree to the printed
precision; the real-path tick-1 spread is shown.

Linear drift across the whole 63-bar window (15.75 h):

| drift | seed spread | tick-1 spread | ticks > floor | seconds | BUY on tick 1 (real code) |
|---|---|---|---|---|---|
| 0.5 % | 0.052 % | 0.051 % | 0 | 0 | no |
| 1.0 % | 0.103 % | 0.102 % | 0 | 0 | no |
| 2.0 % | 0.205 % | 0.201 % | 4 | 20 | **yes** |
| 4.0 % | 0.404 % | 0.396 % | 13 | 65 | **yes** |

Rise concentrated in the last 21 bars (the slow EMA's 5.25 h), flat before:

| drift | seed spread | tick-1 spread | ticks > floor | seconds | BUY on tick 1 |
|---|---|---|---|---|---|
| 0.5 % | 0.123 % | 0.122 % | 0 | 0 | no |
| 1.0 % | 0.245 % | 0.244 % | 8 | 40 | **yes** |
| 2.0 % | 0.486 % | 0.485 % | 16 | 80 | **yes** |
| 4.0 % | 0.962 % | 0.958 % | 23 | 115 | **yes** |

Rise concentrated in the last 8 bars (the fast EMA's 2 h), flat before:

| drift | seed spread | tick-1 spread | peak | ticks > floor | seconds | BUY on tick 1 |
|---|---|---|---|---|---|---|
| 0.5 % | 0.144 % | 0.155 % | 0.161 % | 0 | 0 | no |
| 1.0 % | 0.287 % | 0.310 % | 0.321 % | 13 | 65 | **yes** |
| 2.0 % | 0.572 % | 0.618 % | 0.639 % | 21 | 105 | **yes** |
| 4.0 % | 1.137 % | 1.227 % | 1.266 % | 28 | 140 | **yes** |

Three things the table settles:

- The spread can *rise* for a few ticks after the restart (last-8-bar rows): the fast EMA
  converges to the tick price in ~3 ticks while the slow one still lags, so the gap widens
  before it decays.
- The spread never goes negative under flat ticks (positive on all 3000 ticks in every row).
  `0 < curr_spread` therefore stays true for the entire decay, which is the direction test the
  HTF tier-rescue path uses. That path's magnitude comes from the hourly spread, but its sign
  is held open by the seed, not by any 5-second momentum. Not measured further here (rescue
  was off in the harness).
- BUY re-emits on every tick while the spread is above the floor (`position_side` is set only
  on fill), so one restart is as many signals as there are ticks above the floor.

The session note that framed this task quoted "+0.65 % holding ~2 minutes for a 2 % rise over
the prior ~5 h". The measured figure for that shape is 0.486 % holding 80 s; the 0.6 % / ~2 min
numbers belong to a 2 % rise concentrated in the prior 2 h (peak 0.639 %, 105 s). Same order,
different series shape — the table above is the record.

### Noisy replicates (code-confirmed, `real_path_out.json`)

Random-walk 15-minute closes, σ = 0.3 % per bar, fixed seed 20261004, 30 replicates per cell,
real `update()`. Counts are integers out of 30.

| drift over 63 bars | tick-1 spread > floor | BUY on tick 1, ADX off | BUY on tick 1, ADX on (checked-in) | any BUY in 20 min, ADX on |
|---|---|---|---|---|
| 0 % | 9 / 30 | 7 / 30 | 1 / 30 | 3 / 30 |
| 1 % | 11 / 30 | 9 / 30 | 3 / 30 | 6 / 30 |
| 2 % | 14 / 30 | 12 / 30 | 8 / 30 | 9 / 30 |
| 4 % | 19 / 30 | 16 / 30 | 12 / 30 | 13 / 30 |

Point estimates only; no interval is printed because the replicate model is a synthetic
series, not the tape, and an interval on it would describe the generator. The zero-drift row
is the clock argument in one line: with no trend at all, nearly a third of seeded trackers
present a spread above the floor on tick 1, because the floor is a 5-second quantity and the
seed is a 15-minute one. ADX on the checked-in setting (`TREND_ADX_ENABLED = True`, default
threshold 25) blocks most of those, not all — and ADX itself is computed on the same mixed
series (63 fifteen-minute closes plus the ticks), a second clock mix this pass did not open.

## W2 — pullback entry is satisfied in the same tick

Trace of `_pullback_pending` during tick 1 for the 2 %-over-8-bars shape
(`pullback_trace.py` in the audit directory; the transition list is the record):

```
seed fast=101.2422 slow=100.6663 last_close=102.0000  price>fast: True
tick1 signal: BUY | reason: EMA BUY: fast(8)=101.410584 > slow(21)=100.787517 (spread=0.0062, min=0.0017)
pullback_pending transitions during tick 1: [('set', True, 64), ('set', False, 64)]
```

The arm (`curr_spread > min_move and not _pullback_pending`) and the clear
(`_bouncing = price > fast`) are in the same `update()` call. Whenever price is above the fast
EMA at the moment the spread first clears the floor — which is what a bullish crossover looks
like — the wait never happens. This is a property of the block, not of restarts; restarts just
guarantee it (the stale 2-hour fast EMA sits below the current price in any uptrend).

## W3 and W4 — what the momentum monitor can see

`momentum_monitor.compute_breadth` keeps the **freshest** `features.ema_spread` per symbol
inside a 300 s window and counts symbols at or above the floor; a RETURN edge needs ≥ 8 of
them on 3 consecutive 30 s polls. Rows reach `data/decision_log.jsonl` only when the buffer
flushes.

`decision_tick()` is called from the dashboard's reporting block, which runs at tick 1 and
every 30 ticks (`dashboard_server.py` line 2472). `DecisionLog.tick()` increments once per
call and flushes every `DECISION_LOG_FLUSH_TICKS = 30` calls — 900 engine ticks, 75 minutes.
The comment on that setting says "~2.5 min at 5 s". In practice the 1000-record buffer cap
(`max_buffer`) flushes first: at roughly 23 tracked symbols and one reject row per symbol per
tick, that is ~40 ticks (~200 s) after the restart, by which point every shape in the table
above has decayed below the floor, and the latest row per symbol is a post-decay one.

So whether a restart can ever produce a 🟢 "Momentum returning" followed by 🔴 "Momentum
dried up" depends on the rows-per-tick rate on the box, which decides when the first flush
lands. That is exactly what the census reads directly: for each restart, the offset of the
first flushed row per symbol and how many of those rows are above the floor. Nothing is
claimed here about the alert history.

## W5 — the box census (UNMEASURED)

`box_restart_xn.py` reads, never writes, and imports nothing from the stack:

- restart markers from `watchdog.log*` (`… [INFO] Server started (PID n)`, a `logger` line
  with a timestamp), falling back to gaps > 120 s in `decision_log.jsonl` `ts`;
  `[Trend] Seed complete` lines in `server.log*` are `print()` output without a timestamp and
  are counted only as a cross-check;
- `data/alert_history.jsonl`: RETURN→DRY pairs, and pairs whose RETURN lands within 600 s
  after a restart;
- `data/paper_fills_append.jsonl`: `trend_ema` BUY fills within 300 s after a restart, out of
  all `trend_ema` BUY fills (timestamps accepted as ISO or epoch);
- `data/decision_log.jsonl*`: `decision == "act"` rows for a trend strategy within 300 s of a
  restart — on this HEAD `log_act` has a single caller, the HTF tier-rescue path, so these are
  rescue acts only; the fills store is the denominator that matters;
- per restart: of the first flushed row per symbol, how many carry `features.ema_spread`
  above the floor, and the median offset of those first rows from the marker.

It prints integers and a sha256 of its own JSON. It was exercised against a synthetic fixture
(two restarts, mixed ISO and epoch timestamps, four symbols) and reproduced every planted
count. Retention bounds it: `server.log` rotates on size and `decision_log.jsonl` by the
`jsonl_rotation` policy, so the denominators are whatever those files still hold, and the
report says how many files of each it read.

---

## Fee door

`scripts/viability_check.HURDLE = NLM_RT_COST_PCT + SLIPPAGE + BUFFER = 0.0240 + 0.0019 +
0.0003 = 2.62 %` per round trip at `main` `5c2b744f`. The entry floor is 0.07 × 2.40 % =
0.168 % of EMA spread, a minimum-move proxy, not a fee test; neither clock's spread is itself
a capture estimate. A restart-window entry has to clear the same 2.62 % as any other, and
nothing in the window makes that more likely: the signal it enters on is the prior 2–5 hours'
drift, which the steady-state engine would have rejected at the floor for most of that time.
Whether such entries lose is **UNMEASURED** until the census returns fills to join to PnL.

## Decision rule and the proposed change

**No action on the entry path from this document.** The box counts decide, by the rule the
ledger entry carries:

- Census reports **0** `trend_ema` BUY fills inside 300 s of a restart **and 0** first-row
  spreads above the floor across every retained restart → the entry half closes as
  alert-noise-only (and the alert half is then also bounded by the per-symbol first-row read).
- **Any nonzero** in either → the flag-OFF change below ships in its own PR on
  `ai-trading-agents`, with the kill-test.

**NEW PATH / UNVALIDATED — restart quarantine (default OFF).** Read as
`getattr(settings, "TREND_RESTART_QUARANTINE_ENABLED", False)`. When the seed path sets the
EMA cache from candles, it also sets `tracker._seed_quarantine_ticks = N`. Inside `update()`,
in the BUY branch only (`position_side is None`, so exits and stops are untouched), a tracker
with `_seed_quarantine_ticks > 0` decrements it, records a named reject
(`audit_reject(sym, "restart_quarantine", curr_spread, min_move, price)`) and returns `None`;
the pullback arm is skipped for those ticks so it cannot arm on the seed. Nothing is generated,
nothing is sized; this is suppress-only. `N` is derived, not tuned: the tick at which the
seeded slow EMA retains under 5 % weight, `ceil(ln 20 / ln(1 + 2/(slow_span+1))) = 32` ticks
(160 s), which covers every shape in the table (max 28). It does not touch `settings.py`,
`execution_policy.py`, `ev_validator.py` or `positioning_engine.py`; the flag flip is never in
the commit that adds the logic.

Kill-test, both halves required before anyone proposes flipping it:

1. Hermetic: `real_path.py` with the flag ON must emit **0** BUYs in ticks 1–32 for every row
   that emits on tick 1 today, **and** must still emit the BUY a genuine 5-second uptrend
   produces after tick 32 (a rising tick series instead of flat ticks). A quarantine that
   also swallows the real entry fails.
2. Box: with the flag ON for paper, the census's `trend_ema` BUY fills inside 300 s of a
   restart must read 0 / n′ while fills outside the window keep their prior count per restart.
   The reject counter `restart_quarantine` must be nonzero on every restart, or the flag is
   dead-but-believed-live.

An alternative — seeding the EMA cache from 5-second ticks only, leaving `prices` seeded for
ADX, regime and S/R — removes the mismatch instead of masking it, but `update()` reseeds the
cache from the whole `prices` list when the cache is `None`, so it needs a tick-aware seed and
is the larger change. Named, not proposed.

## What this document does not claim

- No restart-adjacent count. No rate. No interval on the box. W5 says why.
- No PnL for restart-window entries.
- No claim that PR #2730's 193 arms / 11 filled are this class: that read is an operator paste
  (hypothesis tier in the PR itself) with no restart attribution; its "live from the first
  post-deploy tick" refers to the probe stream, not to wasted arms. The census's restart
  markers can be joined to `data/cooldown_probe.jsonl` arms later; not done here.

## Reproduce

```
# pure math, no stack
python docs/audits/2026-10-04-ema-warmup-clock/decay.py

# real code path (needs an ai-trading-agents checkout at 5c2b744f)
PYTHONPATH=/path/to/ai-trading-agents python docs/audits/2026-10-04-ema-warmup-clock/real_path.py
PYTHONPATH=/path/to/ai-trading-agents python docs/audits/2026-10-04-ema-warmup-clock/pullback_trace.py
sha256sum docs/audits/2026-10-04-ema-warmup-clock/real_path_out.json   # ad737022…

# box census (antonio, read-only)
python docs\audits\2026-10-04-ema-warmup-clock\box_restart_xn.py --root C:\Users\JoseA\ai-trading-agents
```
