#!/usr/bin/env python3
"""Read-only box census: restart-adjacent momentum alerts and trend entries.

Companion to docs/audits/2026-10-04-ema-warmup-clock-mismatch.md. Run it ON the box
(antonio) against the live ai-trading-agents checkout. It opens files for reading only,
writes nothing, imports nothing from the trading stack, and prints integer counts plus a
sha256 of its own JSON payload so the numbers can be quoted from a hashed artifact.

    python box_restart_xn.py --root C:\\Users\\JoseA\\ai-trading-agents

Restart markers, in order of preference (the report names which one was used):
  1. watchdog.log*          "<asctime> [INFO] Server started (PID n)"   (logger, local time)
  2. data/decision_log.jsonl*  a gap > --gap seconds between consecutive `ts` values
server.log* "[Trend] Seed complete" lines are print() output with no timestamp, so they are
counted as a cross-check of the restart count only (reference_log_routing: print -> server.log).

Counts reported (all integers, x out of n):
  * RETURN->DRY alert pairs in data/alert_history.jsonl, and how many pairs have the
    RETURN inside --pair-window seconds after a restart marker.
  * trend_ema BUY fills in data/paper_fills_append.jsonl inside --entry-window seconds
    after a restart marker, out of all trend_ema BUY fills.
  * decision_log `act` rows for a trend strategy inside --entry-window seconds after a
    restart, out of all such rows (on main 5c2b744 these are HTF-rescue acts only).
  * Per restart: of the first flushed decision_log row per symbol after the marker, how
    many carry features.ema_spread above the entry floor, and the median offset (seconds)
    of those first rows from the marker. This is the direct read of whether the 15m-clock
    seed spread ever reaches the log the momentum monitor polls.

The entry floor is read from settings.py by regex (TREND_ROUND_TRIP_COST_PCT and
TREND_MIN_PROFIT_MULTIPLE), never imported; if either is unreadable the floor is reported
as UNREADABLE and the per-symbol count is skipped rather than computed on a guess.
"""

from __future__ import annotations

import argparse
import glob
import hashlib
import json
import os
import re
import statistics
import sys
from datetime import datetime

RETURN_TITLE = "Momentum returning"
DRY_TITLE = "Momentum dried up"
WATCHDOG_RE = re.compile(r"^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})(?:,\d+)? \[INFO\] Server started \(PID \d+\)")


def _files(pattern: str) -> list[str]:
    return sorted(glob.glob(pattern))


def _iter_jsonl(paths: list[str]):
    for p in paths:
        try:
            with open(p, encoding="utf-8", errors="replace") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        yield json.loads(line)
                    except ValueError:
                        continue
        except OSError:
            continue


def _to_epoch(v) -> float | None:
    """Epoch seconds from an epoch number or a local-time ISO string. None if unreadable."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip()
    try:
        return float(s)
    except ValueError:
        pass
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def restart_markers_watchdog(root: str) -> list[float]:
    out: list[float] = []
    for p in _files(os.path.join(root, "watchdog.log*")):
        try:
            with open(p, encoding="utf-8", errors="replace") as fh:
                for line in fh:
                    m = WATCHDOG_RE.match(line)
                    if m:
                        try:
                            out.append(datetime.strptime(m.group(1), "%Y-%m-%d %H:%M:%S").timestamp())
                        except ValueError:
                            continue
        except OSError:
            continue
    return sorted(set(out))


def restart_markers_gap(rows: list[dict], gap_s: float) -> list[float]:
    ts = sorted(t for t in (_to_epoch(r.get("ts")) for r in rows) if t is not None)
    out = []
    for a, b in zip(ts, ts[1:]):
        if b - a > gap_s:
            out.append(b)
    return out


def seed_complete_count(root: str) -> int:
    n = 0
    for p in _files(os.path.join(root, "server.log*")):
        try:
            with open(p, encoding="utf-8", errors="replace") as fh:
                n += sum(1 for line in fh if "[Trend] Seed complete" in line)
        except OSError:
            continue
    return n


def entry_floor(root: str) -> float | None:
    try:
        src = open(os.path.join(root, "settings.py"), encoding="utf-8", errors="replace").read()
    except OSError:
        return None
    vals = {}
    for name in ("TREND_ROUND_TRIP_COST_PCT", "TREND_MIN_PROFIT_MULTIPLE"):
        hits = re.findall(rf"^{name}\s*=\s*([0-9.]+)", src, re.M)
        if not hits:
            return None
        vals[name] = float(hits[-1])  # last assignment wins, as Python does
    f = vals["TREND_ROUND_TRIP_COST_PCT"] * vals["TREND_MIN_PROFIT_MULTIPLE"]
    return f if f > 0 else None


def nearest_restart_before(t: float, restarts: list[float]) -> float | None:
    best = None
    for r in restarts:
        if r <= t and (best is None or r > best):
            best = r
    return best


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=os.getcwd(), help="ai-trading-agents checkout (default: cwd)")
    ap.add_argument("--pair-window", type=float, default=600.0, help="RETURN within this many s after a restart")
    ap.add_argument("--entry-window", type=float, default=300.0, help="BUY within this many s after a restart")
    ap.add_argument("--gap", type=float, default=120.0, help="decision_log ts gap that marks a restart (fallback)")
    args = ap.parse_args()
    root = os.path.abspath(args.root)
    data = os.path.join(root, "data")

    dl_rows = list(_iter_jsonl(_files(os.path.join(data, "decision_log.jsonl*"))))
    alerts = list(_iter_jsonl(_files(os.path.join(data, "alert_history.jsonl*"))))
    fills = list(_iter_jsonl(_files(os.path.join(data, "paper_fills_append.jsonl*"))))

    wd = restart_markers_watchdog(root)
    gap = restart_markers_gap(dl_rows, args.gap)
    if wd:
        restarts, source = wd, "watchdog.log 'Server started' lines"
    else:
        restarts, source = gap, f"decision_log ts gaps > {args.gap:.0f}s (watchdog.log had no markers)"

    # --- RETURN -> DRY pairs ------------------------------------------------------------
    events = []
    for a in alerts:
        t = _to_epoch(a.get("ts"))
        title = str(a.get("title", ""))
        if t is None:
            continue
        if RETURN_TITLE in title:
            events.append((t, "R"))
        elif DRY_TITLE in title:
            events.append((t, "D"))
    events.sort()
    pairs = []
    open_return = None
    for t, kind in events:
        if kind == "R":
            open_return = t
        elif kind == "D" and open_return is not None:
            pairs.append((open_return, t))
            open_return = None
    pairs_near_restart = 0
    for r_ts, _d_ts in pairs:
        rs = nearest_restart_before(r_ts, restarts)
        if rs is not None and 0 <= r_ts - rs <= args.pair_window:
            pairs_near_restart += 1

    # --- trend BUY fills ------------------------------------------------------------------
    trend_buys = []
    for f in fills:
        if str(f.get("side", "")).upper() != "BUY":
            continue
        if str(f.get("strategy_id", "")) != "trend_ema":
            continue
        t = _to_epoch(f.get("timestamp"))
        if t is not None:
            trend_buys.append(t)
    buys_near_restart = sum(
        1
        for t in trend_buys
        if (rs := nearest_restart_before(t, restarts)) is not None and 0 <= t - rs <= args.entry_window
    )

    # --- decision_log act rows (trend strategies) ---------------------------------------
    acts = [
        _to_epoch(r.get("ts"))
        for r in dl_rows
        if r.get("decision") == "act" and "trend" in str(r.get("strategy", ""))
    ]
    acts = [t for t in acts if t is not None]
    acts_near_restart = sum(
        1
        for t in acts
        if (rs := nearest_restart_before(t, restarts)) is not None and 0 <= t - rs <= args.entry_window
    )

    # --- first flushed row per symbol after each restart ----------------------------------
    floor = entry_floor(root)
    per_restart = []
    if floor is not None and restarts:
        feature_rows = []
        for r in dl_rows:
            t = _to_epoch(r.get("ts"))
            feats = r.get("features") or {}
            sp = feats.get("ema_spread")
            sym = r.get("sym")
            if t is None or sp is None or not sym:
                continue
            feature_rows.append((t, str(sym), float(sp)))
        feature_rows.sort()
        for i, rs in enumerate(restarts):
            end = restarts[i + 1] if i + 1 < len(restarts) else float("inf")
            first: dict[str, tuple[float, float]] = {}
            for t, sym, sp in feature_rows:
                if t < rs or t >= end:
                    continue
                if sym not in first:
                    first[sym] = (t, sp)
            if not first:
                per_restart.append({"restart": rs, "symbols": 0, "above_floor": 0, "median_offset_s": None})
                continue
            offs = [t - rs for t, _ in first.values()]
            per_restart.append(
                {
                    "restart": rs,
                    "restart_local": datetime.fromtimestamp(rs).isoformat(timespec="seconds"),
                    "symbols": len(first),
                    "above_floor": sum(1 for _, sp in first.values() if sp > floor),
                    "median_offset_s": round(statistics.median(offs), 1),
                }
            )

    payload = {
        "root": root,
        "restart_marker_source": source,
        "restarts": len(restarts),
        "seed_complete_lines_in_server_log": seed_complete_count(root),
        "alert_pairs_return_to_dry": len(pairs),
        "alert_pairs_with_return_within_pair_window_of_restart": pairs_near_restart,
        "pair_window_s": args.pair_window,
        "trend_ema_buy_fills": len(trend_buys),
        "trend_ema_buy_fills_within_entry_window_of_restart": buys_near_restart,
        "decision_log_trend_act_rows": len(acts),
        "decision_log_trend_act_rows_within_entry_window_of_restart": acts_near_restart,
        "entry_window_s": args.entry_window,
        "entry_floor": floor if floor is not None else "UNREADABLE",
        "first_post_restart_rows_per_symbol": per_restart,
        "files_read": {
            "decision_log": len(_files(os.path.join(data, "decision_log.jsonl*"))),
            "alert_history": len(_files(os.path.join(data, "alert_history.jsonl*"))),
            "paper_fills_append": len(_files(os.path.join(data, "paper_fills_append.jsonl*"))),
            "watchdog_log": len(_files(os.path.join(root, "watchdog.log*"))),
            "server_log": len(_files(os.path.join(root, "server.log*"))),
        },
    }
    text = json.dumps(payload, indent=1, sort_keys=True)
    print(text)
    print("sha256:", hashlib.sha256(text.encode("utf-8")).hexdigest())
    return 0


if __name__ == "__main__":
    sys.exit(main())
