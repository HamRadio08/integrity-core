"""Pure-math replica of trend_strategy warm-up seeding + 5s tick decay. No AITA imports."""
import math
FAST, SLOW = 8, 21
AF, AS = 2/(FAST+1), 2/(SLOW+1)
RT, MULT = 0.0240, 0.07
MIN_MOVE = RT*MULT
BARS = max(SLOW*3, 63)

def ema(prices, span):
    if len(prices) < span: return prices[-1]
    a = 2/(span+1); r = prices[0]
    for p in prices[1:]: r = a*p + (1-a)*r
    return r

def seed(closes):
    return ema(closes, FAST), ema(closes, SLOW)

def decay(f, s, p, max_ticks=3000):
    """flat ticks at p; return per-tick spreads"""
    out=[]
    for n in range(1, max_ticks+1):
        f = AF*p + (1-AF)*f; s = AS*p + (1-AS)*s
        out.append((f-s)/s)
    return out

def series_linear(drift, bars=BARS, p0=100.0):
    return [p0*(1+drift*i/(bars-1)) for i in range(bars)]

def series_tail_ramp(drift, ramp_bars, bars=BARS, p0=100.0):
    flat = bars-ramp_bars
    return [p0]*flat + [p0*(1+drift*(i+1)/ramp_bars) for i in range(ramp_bars)]

def report(name, mk):
    print(f"\n== {name}  (min_move={MIN_MOVE:.5f} = {100*MIN_MOVE:.3f}%) ==")
    print(f"{'drift':>6} {'seed_spread':>11} {'tick1_spread':>12} {'peak':>8} {'ticks>floor':>11} {'secs':>6} {'ticks>0':>8}")
    for d in (0.005,0.01,0.02,0.04):
        c = mk(d); f,s = seed(c); p = c[-1]
        sp0 = (f-s)/s
        sp = decay(f,s,p)
        above = sum(1 for x in sp if x > MIN_MOVE)
        # first tick where it falls below and stays below
        last_above = max((i for i,x in enumerate(sp) if x > MIN_MOVE), default=-1)+1
        pos = max((i for i,x in enumerate(sp) if x > 0), default=-1)+1
        print(f"{100*d:5.1f}% {100*sp0:10.3f}% {100*sp[0]:11.3f}% {100*max(sp):7.3f}% {last_above:11d} {5*last_above:6d} {pos:8d}")

report("linear drift over the full 63-bar seed window (15.75h)", series_linear)
report("ramp over the LAST 21 bars (5.25h), flat before", lambda d: series_tail_ramp(d,21))
report("ramp over the LAST 8 bars (2h), flat before", lambda d: series_tail_ramp(d,8))
# half-lives
print("\nseed-weight half-life: fast %.2f ticks, slow %.2f ticks" % (math.log(2)/-math.log(1-AF), math.log(2)/-math.log(1-AS)))
