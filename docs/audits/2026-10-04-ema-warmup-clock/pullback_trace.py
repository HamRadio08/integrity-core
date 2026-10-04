"""Trace _pullback_pending transitions inside tick 1 after a box-style seed (W2 in the audit).

Run:  PYTHONPATH=<ai-trading-agents checkout> python pullback_trace.py
"""
import os, sys
os.environ.setdefault("DASHBOARD_PASSWORD", "hermetic-not-a-real-password")
import settings as _s, trend_strategy as ts
for k,v in dict(POSITIONING_ENABLED=False, TREND_HTF_ALIGNMENT=False, WHALE_WEAK_TREND_VETO=False,
             TREND_HTF_TIER_RESCUE_ENABLED=False, LIFECYCLE_V3_ENABLED=False, TREND_RESISTANCE_ENABLED=False,
             DECISION_LOG_ENABLED=False, GATE_AUDIT_ENABLED=False, COUNTERFACTUAL_ENABLED=False,
             TREND_VOLUME_CONFIRM_V2=False, TREND_PULLBACK_ENTRY=True, COOLDOWN_PROBE_ENABLED=False).items(): setattr(_s,k,v)
ts._dl_snapshot = lambda *a, **k: None
ts._slow_hold_owns = lambda s: False; ts._regime_detector_ref=None; ts._htf_rescue_spread=lambda s: None
trace=[]
class T(ts.TrendTracker):
    @property
    def _pullback_pending(self): return self.__dict__.get("_pp", False)
    @_pullback_pending.setter
    def _pullback_pending(self, v): trace.append(("set", v, len(self.prices))); self.__dict__["_pp"]=v
BARS=63; closes=[100.0]*(BARS-8)+[100*(1+0.02*(i+1)/8) for i in range(8)]
tr=T("TESTUSD",8,21); tr._pullback_crossover_tick=0; tr._pullback_max_wait=360
for p in closes: tr.prices.append(p)
pl=list(tr.prices); tr.prev_fast=ts._ema(pl,8); tr.prev_slow=ts._ema(pl,21); tr._ema_fast_cached=tr.prev_fast; tr._ema_slow_cached=tr.prev_slow
print("seed fast=%.4f slow=%.4f last_close=%.4f  price>fast: %s" % (tr.prev_fast, tr.prev_slow, closes[-1], closes[-1] > tr.prev_fast))
sig=tr.update(closes[-1])
print("tick1 signal:", sig.action.value if sig else None, "| reason:", (sig.reason[:90] if sig else None))
print("pullback_pending transitions during tick 1:", trace)
