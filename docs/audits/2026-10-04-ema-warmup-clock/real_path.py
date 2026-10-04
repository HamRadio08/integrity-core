"""Real-code replay of the post-restart warm-up window in trend_strategy.TrendTracker.

Seeds a tracker EXACTLY as TrendStrategy._seed_symbol_fast does (63 x 15m closes appended to
`prices`, prev_fast/prev_slow/_ema_*_cached from indicators.ema over that list), then feeds
flat 5-second ticks through the real TrendTracker.update() and records, per tick:
  curr_spread (captured from the decision_log snapshot call), _pullback_pending, emitted action.

Run:  PYTHONPATH=<ai-trading-agents checkout> python real_path.py
"""
import json, math, os, random, sys
os.environ.setdefault("DASHBOARD_PASSWORD", "hermetic-not-a-real-password")
import settings as _s
import trend_strategy as ts

FAST, SLOW = int(_s.TREND_FAST_SPAN), int(_s.TREND_SLOW_SPAN)
MIN_MOVE = float(_s.TREND_ROUND_TRIP_COST_PCT) * float(_s.TREND_MIN_PROFIT_MULTIPLE)
BARS = max(SLOW * 3, 63)        # _seed_symbol_fast target_bars
TICKS = 240                     # 20 min of 5s ticks

# Downstream gates that need the box (network, regime engine, positioning, arkham) are
# switched OFF so the measurement isolates the spread/pullback precondition. Everything
# else stays as checked-in settings.py says. Saved + restored.
QUIET = dict(POSITIONING_ENABLED=False, TREND_HTF_ALIGNMENT=False, WHALE_WEAK_TREND_VETO=False,
             TREND_HTF_TIER_RESCUE_ENABLED=False, LIFECYCLE_V3_ENABLED=False,
             TREND_RESISTANCE_ENABLED=False, DECISION_LOG_ENABLED=False, GATE_AUDIT_ENABLED=False,
             COUNTERFACTUAL_ENABLED=False, TREND_VOLUME_CONFIRM_V2=False, TREND_PULLBACK_ENTRY=True,
             TREND_EXCLUDE_STABLECOINS=False, COOLDOWN_PROBE_ENABLED=False)

_rec = {}
def _snap(symbol, **feats): _rec.update(feats)
ts._dl_snapshot = _snap
ts._slow_hold_owns = lambda s: False
ts._regime_detector_ref = None
ts._htf_rescue_spread = lambda s: None

def seed_like_box(tracker, closes):
    for p in closes:
        tracker.prices.append(p)
    pl = list(tracker.prices)
    tracker.prev_fast = ts._ema(pl, tracker.fast_span)
    tracker.prev_slow = ts._ema(pl, tracker.slow_span)
    tracker._ema_fast_cached = tracker.prev_fast
    tracker._ema_slow_cached = tracker.prev_slow

def linear(drift, p0=100.0):
    return [p0 * (1 + drift * i / (BARS - 1)) for i in range(BARS)]
def tail_ramp(drift, ramp, p0=100.0):
    return [p0] * (BARS - ramp) + [p0 * (1 + drift * (i + 1) / ramp) for i in range(ramp)]
def noisy(drift, rng, sigma=0.003, p0=100.0):
    out, lp = [], math.log(p0)
    per = drift / BARS
    for _ in range(BARS):
        lp += per + sigma * rng.gauss(0, 1)
        out.append(math.exp(lp))
    return out

def replay(closes, adx_on):
    saved = {k: getattr(_s, k, None) for k in list(QUIET) + ["TREND_ADX_ENABLED"]}
    for k, v in QUIET.items(): setattr(_s, k, v)
    _s.TREND_ADX_ENABLED = adx_on
    try:
        tr = ts.TrendTracker("TESTUSD", FAST, SLOW)
        seed_like_box(tr, closes)
        seed_spread = (tr.prev_fast - tr.prev_slow) / tr.prev_slow
        p = closes[-1]
        rows = []
        for n in range(1, TICKS + 1):
            _rec.clear()
            sig = tr.update(p)
            rows.append(dict(tick=n, spread=_rec.get("ema_spread"),
                             pending=bool(getattr(tr, "_pullback_pending", False)),
                             action=(sig.action.value if sig else None)))
        return seed_spread, rows
    finally:
        for k, v in saved.items():
            if v is None and not hasattr(_s, k): continue
            setattr(_s, k, v)

def summarize(seed_spread, rows):
    above = [r["tick"] for r in rows if r["spread"] is not None and r["spread"] > MIN_MOVE]
    buys = [r["tick"] for r in rows if r["action"] == "BUY"]
    pend = [r["tick"] for r in rows if r["pending"]]
    return dict(seed_spread=round(seed_spread, 6),
                tick1_spread=round(rows[0]["spread"], 6) if rows[0]["spread"] is not None else None,
                ticks_above_floor=len(above), last_tick_above=(above[-1] if above else 0),
                first_pending_tick=(pend[0] if pend else None),
                first_buy_tick=(buys[0] if buys else None), buy_ticks=len(buys))

out = {"settings": dict(FAST=FAST, SLOW=SLOW, MIN_MOVE=MIN_MOVE, BARS=BARS, TICKS=TICKS,
                        ADX_ENABLED_checked_in=bool(getattr(_s, "TREND_ADX_ENABLED", False)),
                        PULLBACK_ENTRY_checked_in=bool(getattr(_s, "TREND_PULLBACK_ENTRY", True))),
       "deterministic": [], "noisy": []}
try:
    from adaptive_params import get_adaptive_adx_threshold
    out["settings"]["adx_min_default_regime"] = get_adaptive_adx_threshold("")
except Exception as e:
    out["settings"]["adx_min_default_regime"] = f"unavailable: {e!r}"

for shape, mk in (("linear63", linear), ("tail21", lambda d: tail_ramp(d, 21)), ("tail8", lambda d: tail_ramp(d, 8))):
    for d in (0.005, 0.01, 0.02, 0.04):
        for adx_on in (False, True):
            ss, rows = replay(mk(d), adx_on)
            s = summarize(ss, rows); s.update(shape=shape, drift=d, adx_on=adx_on)
            out["deterministic"].append(s)

# Noisy replicates: random-walk 15m closes with drift, sigma 0.3%/bar; fixed seed.
N = 30
for d in (0.0, 0.01, 0.02, 0.04):
    for adx_on in (False, True):
        rng = random.Random(20261004)
        t1_above = t1_buy = any_buy = 0
        for _ in range(N):
            ss, rows = replay(noisy(d, rng), adx_on)
            s = summarize(ss, rows)
            t1_above += int(rows[0]["spread"] is not None and rows[0]["spread"] > MIN_MOVE)
            t1_buy += int(s["first_buy_tick"] == 1)
            any_buy += int(s["first_buy_tick"] is not None)
        out["noisy"].append(dict(drift=d, adx_on=adx_on, n=N, tick1_above_floor=t1_above,
                                 tick1_buy=t1_buy, any_buy_in_20min=any_buy))

json.dump(out, open("real_path_out.json", "w"), indent=1)
print(json.dumps(out["settings"]))
print(f"{'shape':9}{'drift':>6}{'adx':>5}{'seed%':>8}{'t1%':>8}{'>floor':>7}{'last':>5}{'pend@':>6}{'buy@':>5}{'nbuy':>5}")
for s in out["deterministic"]:
    print(f"{s['shape']:9}{100*s['drift']:5.1f}%{str(s['adx_on']):>5}{100*s['seed_spread']:7.3f}%{100*(s['tick1_spread'] or 0):7.3f}%{s['ticks_above_floor']:7d}{s['last_tick_above']:5d}{str(s['first_pending_tick']):>6}{str(s['first_buy_tick']):>5}{s['buy_ticks']:5d}")
print("\nnoisy (sigma=0.3%/bar, 30 reps):")
for s in out["noisy"]:
    print(s)
