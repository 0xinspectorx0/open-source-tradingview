"""Order-flow numbers for any chart symbol: one engine for the TradeX, agents and scripts.

Step 1 (2026-11-12): delta per candle with its intrabar high and low (TradingView's Volume Delta / CVD candle rules).

Two sources, chosen per symbol (2026-11-12):
  real       Binance USD-M futures 1-minute klines. Field 9 = taker buy volume = buyers who crossed the spread.
             Exchange truth, not a guess. Only for symbols Binance futures lists (crypto, gold, silver, platinum,
             palladium, copper, natural gas). Units: the coin or ounces.
  estimated  The chart's own candles at a lower timeframe. A lower bar that closes above its open counts as buying,
             below as selling; a flat bar copies the previous close direction (TradingView's default method).
             Units: the feed's volume (MT5 = tick count, not lots).

Use from Python (agents):
    import orderflow_api as ofa
    rows = ofa.delta("RMT_XAUUSD", "M5", start_s, end_s, source="auto", history=<fn>)   # history only for estimated
or over HTTP while the hub server runs:  GET http://localhost:8770/api/orderflow/delta?symbol=RMT_XAUUSD&tf=M5&from=<s>&to=<s>&source=auto
Each row: t (bar open, UTC seconds), buy, sell, delta, hi, lo (running delta extremes inside the bar, 0 = bar open), n (lower bars used).
"""
import json, threading, time, urllib.request

TF_SEC = {"M1": 60, "M5": 300, "M15": 900, "M30": 1800, "H1": 3600, "H4": 14400, "D1": 86400}
# Lower timeframe used inside each chart bar (like TradingView's automatic intrabar timeframe).
INTRABAR = {"M1": "M1", "M5": "M1", "M15": "M1", "M30": "M5", "H1": "M5", "H4": "M15", "D1": "H1"}
BINANCE_TF = {"M1": "1m", "M5": "5m", "M15": "15m", "M30": "30m", "H1": "1h", "H4": "4h", "D1": "1d"}
MAX_ROWS = 20000                      # lower bars per request; older chart bars beyond this get no delta
FAPI = "https://fapi.binance.com/fapi/v1"
RENAME = {"XCU": "COPPER", "XNG": "NATGAS"}  # MT5 name -> Binance futures base

_futures = {"set": set(), "at": 0.0}
_cache = {}          # (source, symbol, itf) -> {t: (buy, sell, close_sign)}
_lock = threading.Lock()


def futures_symbols():
    """Binance USD-M futures symbols that are trading (refreshed every 6 h)."""
    if time.time() - _futures["at"] > 6 * 3600:
        try:
            d = json.loads(urllib.request.urlopen(FAPI + "/exchangeInfo", timeout=20).read())
            _futures["set"] = {s["symbol"] for s in d["symbols"] if s.get("status") == "TRADING"}
            _futures["at"] = time.time()
        except Exception:
            _futures["at"] = time.time() - 6 * 3600 + 300  # retry in 5 min
    return _futures["set"]


def real_symbol(ticker):
    """Chart ticker -> Binance futures symbol with real buyer/seller data, or None.
    RMT_XAUUSD -> XAUUSDT, RMT_BTCUSD -> BTCUSDT, BYBIT_BTCUSDT -> BTCUSDT, BTCUSD (binance feed) -> BTCUSDT."""
    t = ticker.upper().split(":")[-1]
    for p in ("RMT_", "BYBIT_S_", "BYBIT_I_", "BYBIT_"):
        if t.startswith(p):
            t = t[len(p):]
            break
    if t.endswith((".MARK", ".INDEX")) or t.startswith("FRX"):
        return None
    if t.endswith("USD247"):
        t = t[:-3]
    if t.endswith("USDT"):
        base = t[:-4]
    elif t.endswith("USD"):
        base = t[:-3]
    else:
        return None
    base = RENAME.get(base, base)
    s = base + "USDT"
    return s if s in futures_symbols() else None


def _binance_rows(sym, itf, a, b):
    """Lower bars [a, b] (seconds) from Binance futures: {t: (buy, sell, sign, high, low, close)}."""
    out, start, step = {}, a * 1000, TF_SEC[itf] * 1000
    while start <= b * 1000:
        url = f"{FAPI}/klines?symbol={sym}&interval={BINANCE_TF[itf]}&startTime={start}&endTime={b * 1000}&limit=1500"
        rows = json.loads(urllib.request.urlopen(url, timeout=20).read())
        if not rows:
            break
        for k in rows:
            vol, tb = float(k[5]), float(k[9])
            out[k[0] // 1000] = (tb, vol - tb, 0, float(k[2]), float(k[3]), float(k[4]))
        start = rows[-1][0] + step
        if len(rows) < 1500:
            break
    return out


def _estimated_rows(history, ticker, itf, a, b):
    """Lower bars [a, b] from the chart's own feed, signed by candle direction: {t: (buy, sell, sign, high, low, close)}."""
    bars, to_ms = [], (b + TF_SEC[itf]) * 1000
    # Ask only for the bars needed (+1 before, for the direction of a flat first bar). A live refresh needs 2-3 bars;
    # asking 5000 every few seconds loaded the remote MT5 bridge and its link timed out (2026-11-12).
    need = int((b - a) // TF_SEC[itf]) + 3
    while True:
        chunk = history(ticker, itf, max(3, min(5000, need - len(bars))), to_ms)
        if not chunk:
            break
        bars = chunk + bars
        if chunk[0]["time"] <= a or len(chunk) < 50:
            break
        to_ms = (chunk[0]["time"] - TF_SEC[itf]) * 1000
        if len(bars) > MAX_ROWS:
            break
    seen, out, prev_close, sign = set(), {}, None, 0
    for x in sorted(bars, key=lambda x: x["time"]):
        if x["time"] in seen:
            continue
        seen.add(x["time"])
        o, c, v = x["open"], x["close"], float(x.get("volume") or 0)
        if c > o: sign = 1
        elif c < o: sign = -1
        elif prev_close is not None and c != prev_close: sign = 1 if c > prev_close else -1
        prev_close = c
        if a <= x["time"] <= b:
            buy, sell = (v, 0.0) if sign > 0 else (0.0, v) if sign < 0 else (0.0, 0.0)
            out[x["time"]] = (buy, sell, sign, x["high"], x["low"], c)
    return out


def _rows(source, ticker, itf, a, b, history):
    """Cached lower bars. Closed lower bars are kept; the last one is always re-read (it may still be forming)."""
    key = (source, ticker, itf)
    with _lock:
        have = _cache.setdefault(key, {})
        ts = sorted(have)
    sec = TF_SEC[itf]
    need = []
    if not ts or a < ts[0]:
        need.append((a, (ts[0] - sec) if ts and ts[0] - sec < b else b))
    if ts and b > ts[-1] - sec:
        need.append((max(a, ts[-1]), b))
    for lo, hi in need:
        if hi < lo:
            continue
        sym = real_symbol(ticker) if source == "real" else None
        got = _binance_rows(sym, itf, lo, hi) if source == "real" else _estimated_rows(history, ticker, itf, lo, hi)
        with _lock:
            have.update(got)
    with _lock:
        return {t: v for t, v in have.items() if a <= t <= b}


def pick_source(ticker, source="auto"):
    if source == "real":
        return "real" if real_symbol(ticker) else None
    if source == "estimated":
        return "estimated"
    return "real" if real_symbol(ticker) else "estimated"


def delta(ticker, tf, start_s, end_s, source="auto", history=None):
    """Delta per chart bar between start_s and end_s (bar open times, UTC seconds). Returns (rows, info)."""
    src = pick_source(ticker, source)
    if src is None:
        raise ValueError(f"no real buyer/seller data for {ticker}")
    if src == "estimated" and history is None:
        raise ValueError("estimated source needs the chart feed's history function")
    sec, itf = TF_SEC[tf], INTRABAR[tf]
    isec = TF_SEC[itf]
    start_s = max(int(start_s), int(end_s) - MAX_ROWS * isec)  # keep the newest bars when the range is too long
    if start_s % sec and tf != "D1":
        start_s += sec - start_s % sec  # whole bars only: a half-read first bar would show a wrong delta
    lower = _rows(src, ticker, itf, start_s, int(end_s) + sec - isec, history)
    out, cur = [], None
    for t in sorted(lower):
        bt = t - t % sec if tf != "D1" else t - t % 86400
        buy, sell = lower[t][0], lower[t][1]
        if cur is None or cur["t"] != bt:
            cur = {"t": bt, "buy": 0.0, "sell": 0.0, "delta": 0.0, "hi": 0.0, "lo": 0.0, "n": 0}
            out.append(cur)
        cur["buy"] += buy
        cur["sell"] += sell
        cur["delta"] += buy - sell
        cur["hi"], cur["lo"], cur["n"] = max(cur["hi"], cur["delta"]), min(cur["lo"], cur["delta"]), cur["n"] + 1
    for r in out:
        for k in ("buy", "sell", "delta", "hi", "lo"):
            r[k] = round(r[k], 6)
    unit = "base volume (coin / oz)" if src == "real" else "feed volume (MT5 = ticks)"
    info = {"source": src, "real_symbol": real_symbol(ticker), "intrabar": itf, "unit": unit,
            "method": "Binance taker buy volume" if src == "real" else "lower-bar direction (TradingView default)"}
    return out, info


# ---------------- Step 2: session volume profile (2026-11-12) ----------------
# Sessions in UTC, cut so they never overlap (gold/forex day rolls over at 22:00 UTC):
#   Asia 22:00-07:00, London 07:00-13:00, New York 13:00-22:00.  "day" = one profile per UTC day.
SESSIONS = (("Asia", 22, 7), ("London", 7, 13), ("New York", 13, 22))


def session_of(t, mode="sessions"):
    """(session start in UTC seconds, name) for a time in UTC seconds."""
    day = t - t % 86400
    if mode == "day":
        return day, "Day"
    if mode == "week":  # weeks start Monday 00:00 UTC (1970-01-01 was a Thursday)
        return day - ((day // 86400 + 3) % 7) * 86400, "Week"
    h = (t % 86400) // 3600
    if h >= 22:
        return day + 22 * 3600, "Asia"
    if h < 7:
        return day - 2 * 3600, "Asia"
    if h < 13:
        return day + 7 * 3600, "London"
    return day + 13 * 3600, "New York"


def _value_area(tot, poc, pct):
    """Value area: start at the POC row, add the bigger neighbour row until pct of the volume is inside."""
    total, lo, hi = sum(tot), poc, poc
    inside = tot[poc]
    while total and inside < pct * total and (lo > 0 or hi < len(tot) - 1):
        up = tot[hi + 1] if hi < len(tot) - 1 else -1
        dn = tot[lo - 1] if lo > 0 else -1
        if up >= dn:
            hi += 1; inside += up
        else:
            lo -= 1; inside += dn
    return lo, hi


def _histogram(bars, n_rows, row_size):
    """Spread each lower bar's buy and sell volume evenly over the rows its high-low range covers
    (TradingView's way for profiles built from bars). bars: [(buy, sell, high, low)]."""
    lo = min(b[3] for b in bars); hi = max(b[2] for b in bars)
    step = row_size if row_size > 0 else max((hi - lo) / n_rows, 1e-12)
    if row_size > 0:
        lo = lo - lo % step
    n = max(1, int((hi - lo) / step) + 1) if row_size > 0 else n_rows
    buy, sell = [0.0] * n, [0.0] * n
    for b_, s_, h, l in bars:
        i0 = min(n - 1, max(0, int((l - lo) / step))); i1 = min(n - 1, max(0, int((h - lo) / step)))
        if i1 == i0 or h <= l:
            buy[i0] += b_; sell[i0] += s_; continue
        for i in range(i0, i1 + 1):
            r_lo, r_hi = lo + i * step, lo + (i + 1) * step
            w = (min(h, r_hi) - max(l, r_lo)) / (h - l)
            if w > 0:
                buy[i] += b_ * w; sell[i] += s_ * w
    return lo, step, buy, sell


def _levels(lo, step, buy, sell, va_pct):
    tot = [x + y for x, y in zip(buy, sell)]
    poc = max(range(len(tot)), key=tot.__getitem__)
    a, b = _value_area(tot, poc, va_pct)
    return poc, lo + (poc + 0.5) * step, lo + (b + 1) * step, lo + a * step  # index, poc price, vah, val


def profile(ticker, tf, start_s, end_s, source="auto", history=None, mode="sessions", rows=24, row_size=0.0,
            va_pct=0.70, developing=True):
    """Volume profile per session between start_s and end_s, drawn on the CHART's prices.
    Real data (Binance) is shifted onto the chart's price minute by minute: shift = chart close - Binance close
    (median of the last 30 lower bars, past only), so the profile sits where price really traded on this chart."""
    src = pick_source(ticker, source)
    if src is None:
        raise ValueError(f"no real buyer/seller data for {ticker}")
    # A session must hold several candles: on H4 sessions become days, on D1 days become weeks.
    if tf == "H4" and mode == "sessions":
        mode = "day"
    elif tf == "D1" and mode in ("sessions", "day"):
        mode = "week"
    if history is None:
        raise ValueError("profile needs the chart feed's history function (for the chart's own prices)")
    sec, itf = TF_SEC[tf], INTRABAR[tf]
    isec = TF_SEC[itf]
    start_s = max(int(start_s), int(end_s) - MAX_ROWS * isec)
    s0 = session_of(start_s, mode)[0]
    if s0 < start_s:  # whole sessions only: a half-read first session would show a wrong profile
        t = start_s - start_s % 3600
        while session_of(t, mode)[0] == s0:
            t += 3600
        start_s = t
    end_i = int(end_s) + sec - isec
    chart = _rows("estimated", ticker, itf, start_s, end_i, history)
    lower = chart if src == "estimated" else _rows("real", ticker, itf, start_s, end_i, history)
    shift_note = None
    if src == "real":
        gaps, shifted = [], {}
        for t in sorted(lower):
            if t in chart:
                gaps.append(chart[t][5] - lower[t][5]); gaps = gaps[-30:]
            if not gaps:
                continue
            g = sorted(gaps)[len(gaps) // 2]
            b_, s_, sg, h, l, c = lower[t]
            shifted[t] = (b_, s_, sg, h + g, l + g, c + g)
        lower = shifted
        shift_note = "Binance prices shifted onto the chart price (median gap of the last 30 lower bars)"
    groups = {}
    for t in sorted(lower):
        groups.setdefault(session_of(t, mode), []).append(t)
    out = []
    for (s0, name), ts in sorted(groups.items()):
        bars = [(lower[t][0], lower[t][1], lower[t][3], lower[t][4]) for t in ts]
        lo, step, buy, sell = _histogram(bars, rows, row_size)
        poc_i, poc, vah, val = _levels(lo, step, buy, sell, va_pct)
        dev = []
        if developing:  # recomputed at each chart bar from that bar's data only (no look-ahead)
            j = 0
            for k, t in enumerate(ts):
                if k == len(ts) - 1 or (ts[k + 1] - ts[k + 1] % sec) != (t - t % sec):
                    sub = bars[:k + 1]
                    l2, st2, b2, s2 = _histogram(sub, rows, row_size)
                    _, p2, h2, v2 = _levels(l2, st2, b2, s2, va_pct)
                    dev.append([t - t % sec if tf != "D1" else t - t % 86400, round(p2, 6), round(h2, 6), round(v2, 6)])
        out.append({"start": s0, "name": name, "first": ts[0], "last": ts[-1] + isec, "lo": lo, "step": step,
                    "buy": [round(x, 4) for x in buy], "sell": [round(x, 4) for x in sell],
                    "poc_i": poc_i, "poc": poc, "vah": vah, "val": val,
                    "total": round(sum(buy) + sum(sell), 4), "delta": round(sum(buy) - sum(sell), 4), "dev": dev})
    unit = "base volume (coin / oz)" if src == "real" else "feed volume (MT5 = ticks)"
    info = {"source": src, "real_symbol": real_symbol(ticker), "intrabar": itf, "unit": unit, "mode": mode, "va_pct": va_pct,
            "method": ("Binance taker buy volume" if src == "real" else "lower-bar direction (TradingView default)") +
                      "; each lower bar's volume spread evenly over its high-low range", "shift": shift_note}
    return out, info


# ---------------- Step 3: footprint from every trade (2026-11-12) ----------------
# Real symbols: every Binance futures aggregated trade (exact aggressor side). Complete UTC days come from
# data.binance.vision daily files (cached as parquet by orderflow.py, in hub/.cache); today comes from the REST
# aggTrades list, filled newest-first by one background thread per symbol at a gentle pace (rate-limit safe).
# Estimated symbols: the chart's own 1-minute candles spread over their high-low range (coarse; labelled).
import sys as _sys, os as _os, datetime as _dt
# Daily trade files are big (BTCUSDT ~30 MB zipped per day, gold ~8 MB). Footprints use at most this many past days,
# plus today; older candles show no footprint (covered_from tells the chart). Stops a 1h/1D footprint from
# downloading weeks of files (2026-11-15).
MAX_PAST_DAYS = 2
REST_CALLS_PER_MIN = 40          # aggTrades weight 20 each: 800 of the 2400 Binance allows per minute
MAX_TODAY_HOURS = 24


def _utc_ms(d):
    return int(_dt.datetime(d.year, d.month, d.day, tzinfo=_dt.timezone.utc).timestamp() * 1000)


class _TradeStore:
    """Trades of one Binance symbol: daily files for past days, REST for today (background fill)."""

    def __init__(self, sym):
        self.sym, self.lock = sym, threading.Lock()
        self.days = {}                      # date -> (t_ms, price, qty, side) numpy arrays
        self.rest = []                      # (id, t_ms, price, qty, side), sorted by id
        self.floor_ms = None                # how far back the REST fill should reach
        self.thread = None
        self.last_used = time.time()

    def _rest(self, **kw):
        q = "&".join(f"{k}={v}" for k, v in kw.items())
        rows = json.loads(urllib.request.urlopen(f"{FAPI}/aggTrades?symbol={self.sym}&limit=1000&{q}", timeout=20).read())
        return [(r["a"], r["T"], float(r["p"]), float(r["q"]), -1 if r["m"] else 1) for r in rows]

    def _fill(self):
        """Background: keep up with new trades, then walk back toward floor_ms. Stops after 10 idle minutes."""
        pause = 60.0 / REST_CALLS_PER_MIN
        while time.time() - self.last_used < 600:
            try:
                with self.lock:
                    newest = self.rest[-1][0] if self.rest else None
                    oldest = self.rest[0] if self.rest else None
                    floor = self.floor_ms
                got = self._rest(fromId=newest + 1) if newest is not None else self._rest()
                with self.lock:
                    self.rest.extend(x for x in got if not self.rest or x[0] > self.rest[-1][0])
                if len(got) < 1000 and oldest is not None and floor is not None and oldest[1] > floor:
                    time.sleep(pause)
                    back = [x for x in self._rest(fromId=max(0, oldest[0] - 1000)) if x[0] < oldest[0]]
                    with self.lock:
                        self.rest[:0] = back
                time.sleep(pause if len(got) == 1000 or (oldest and floor and oldest[1] > floor) else 2.0)
            except Exception:
                time.sleep(10)
        self.thread = None

    def ensure(self, from_ms):
        self.last_used = time.time()
        floor = max(from_ms, int(time.time() * 1000) - MAX_TODAY_HOURS * 3600 * 1000)
        with self.lock:
            self.floor_ms = floor if self.floor_ms is None else min(self.floor_ms, floor)
        if self.thread is None:
            self.thread = threading.Thread(target=self._fill, daemon=True)
            self.thread.start()

    def day(self, d):
        if d not in self.days:
            import orderflow as _of
            import pandas as pd
            df = pd.read_parquet(_of.fetch_day(d, "aggTrades", self.sym))
            ms = ((df["ts"] - pd.Timestamp(0, tz="UTC")) // pd.Timedelta(milliseconds=1)).to_numpy().astype("int64")  # any pandas time unit
            self.days[d] = (ms, df["price"].to_numpy(), df["qty"].to_numpy(),
                            df["side"].to_numpy())
        return self.days[d]

    def trades(self, t0_ms, t1_ms):
        """(t_ms, price, qty, side) arrays for [t0, t1], plus the earliest time actually covered so far."""
        import numpy as np
        out, covered, rest_from = [], t1_ms, None
        today = _dt.datetime.now(_dt.timezone.utc).date()
        d = _dt.datetime.fromtimestamp(t0_ms / 1000, _dt.timezone.utc).date()
        d = max(d, today - _dt.timedelta(days=MAX_PAST_DAYS))
        t0_ms = max(t0_ms, _utc_ms(d))
        last = _dt.datetime.fromtimestamp(t1_ms / 1000, _dt.timezone.utc).date()
        while d <= last:
            if d < today and rest_from is None:
                try:
                    t, p, q, s = self.day(d)
                    k = (t >= t0_ms) & (t <= t1_ms)
                    out.append((t[k], p[k], q[k], s[k]))
                    covered = min(covered, max(t0_ms, _utc_ms(d)))
                except Exception:  # yesterday's file appears a few hours after midnight: REST covers it
                    rest_from = max(t0_ms, _utc_ms(d))
            elif rest_from is None:
                rest_from = max(t0_ms, _utc_ms(d))
            d += _dt.timedelta(days=1)
        if rest_from is not None:
            self.ensure(rest_from)
            with self.lock:
                r = [x for x in self.rest if rest_from <= x[1] <= t1_ms]
                first = self.rest[0][1] if self.rest else t1_ms
            if r:
                a = np.array(r)
                out.append((a[:, 1].astype("int64"), a[:, 2], a[:, 3], a[:, 4].astype("int8")))
            covered = max(rest_from, first) if not any(len(o[0]) for o in out[:-1]) else min(covered, max(rest_from, first))
        if not out:
            return (np.array([], "int64"), np.array([]), np.array([]), np.array([], "int8")), t1_ms
        return tuple(np.concatenate([o[i] for o in out]) for i in range(4)), covered


_stores = {}


def _store(sym):
    with _lock:
        if sym not in _stores:
            _stores[sym] = _TradeStore(sym)
        return _stores[sym]


def nice_step(x):
    """Round a row size to 1, 2, 2.5 or 5 x 10^k."""
    import math
    if x <= 0:
        return 1.0
    e = 10 ** math.floor(math.log10(x))
    for m in (1, 2, 2.5, 5, 10):
        if x <= m * e:
            return m * e
    return 10 * e


def footprint(ticker, tf, start_s, end_s, source="auto", history=None, row_size=0.0, chart_bars=None):
    """Buy and sell volume at each price row inside every chart candle in [start_s, end_s], on the CHART's prices.
    chart_bars: [(t_s, high, low)] of those candles (auto row size). Returns (candles, info).
    Each candle: t (open, UTC s), r0 (lowest row number; row price = r * row_size), buy[], sell[] from low to high."""
    import numpy as np
    src = pick_source(ticker, source)
    if src is None:
        raise ValueError(f"no real buyer/seller data for {ticker}")
    if history is None:
        raise ValueError("footprint needs the chart feed's history function")
    sec = TF_SEC[tf]
    start_s, end_s = int(start_s), int(end_s)
    if row_size <= 0:  # auto: about 7 rows in a typical candle (TradingView's auto uses a share of ATR, similar size)
        rng = sorted(h - l for _, h, l in (chart_bars or []) if h > l)
        row_size = nice_step(rng[len(rng) // 2] / 7) if rng else 1.0
    chart = _rows("estimated", ticker, "M1", start_s, end_s + sec - 60, history)
    candles, covered = {}, start_s * 1000
    bucket = (lambda x: x - x % sec) if tf != "D1" else (lambda x: x - x % 86400)
    if src == "real":
        (t, p, q, s), covered = _store(real_symbol(ticker)).trades(start_s * 1000, (end_s + sec) * 1000 - 1)
        if len(t):
            real1m = _rows("real", ticker, "M1", start_s, end_s + sec - 60, history)
            gaps, shift = [], {}
            for m in sorted(real1m):
                if m in chart:
                    gaps.append(chart[m][5] - real1m[m][5]); gaps = gaps[-30:]
                if gaps:
                    shift[m] = sorted(gaps)[len(gaps) // 2]
            known = sorted(shift)
            mins = (t // 60000) * 60
            if known:
                pos = np.clip(np.searchsorted(np.array(known), mins, side="right") - 1, 0, len(known) - 1)
                g = np.array([shift[k] for k in known])[pos]
            else:
                g = np.zeros(len(t))
            row = np.floor((p + g) / row_size + 1e-9).astype("int64")
            bt = bucket((t // 1000).astype("int64"))
            for side, col in ((1, 0), (-1, 1)):
                k = s == side
                key = bt[k] * 100_000_000 + (row[k] - row.min())
                u, inv = np.unique(key, return_inverse=True)
                vol = np.bincount(inv, weights=q[k])
                base = int(row.min())
                for kk, v in zip(u.tolist(), vol.tolist()):
                    c = candles.setdefault(kk // 100_000_000, {})
                    c.setdefault(kk % 100_000_000 + base, [0.0, 0.0])[col] += v
    else:
        for m, v in chart.items():
            buy, sell, _, h, l, _c = v
            bt = bucket(m)
            if not start_s <= bt <= end_s:
                continue
            c = candles.setdefault(bt, {})
            r0, r1 = int(np.floor(l / row_size + 1e-9)), int(np.floor(h / row_size + 1e-9))
            n = r1 - r0 + 1
            for r in range(r0, r1 + 1):
                x = c.setdefault(r, [0.0, 0.0]); x[0] += buy / n; x[1] += sell / n
    out = []
    for bt in sorted(candles):
        rows = candles[bt]
        lo, hi = min(rows), max(rows)
        out.append({"t": int(bt), "r0": lo, "buy": [round(rows.get(r, (0, 0))[0], 4) for r in range(lo, hi + 1)],
                    "sell": [round(rows.get(r, (0, 0))[1], 4) for r in range(lo, hi + 1)]})
    info = {"source": src, "real_symbol": real_symbol(ticker), "row_size": row_size,
            "unit": "base volume (coin / oz)" if src == "real" else "feed volume (MT5 = ticks)",
            "covered_from": int(covered // 1000),
            "method": "every Binance futures trade, shifted onto the chart price minute by minute" if src == "real"
                      else "chart 1-minute candles spread over their range (coarse estimate)"}
    return out, info
