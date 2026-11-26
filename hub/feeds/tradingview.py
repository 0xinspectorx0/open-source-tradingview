"""TradingView market data via the public guest (read-only) WebSocket.

WARNING -- NOT OFFICIAL: TradingView has no free public data API. This plugin
talks to TradingView's *unofficial* guest WebSocket (the one the website itself
uses) with an "unauthorized_user_token" session -- no account, read-only. This
may violate TradingView's Terms of Service, the data is licensed and not for
redistribution, and the protocol can change without notice. It is OFF by default;
enable it only for your own personal, self-hosted use and at your own risk.

Why this exists: it is the realistic free source for Borsa Istanbul VIOP futures
and for a broad set of forex pairs / global symbols that the project's exchange
feeds do not cover. For everything else, prefer the official exchange feeds
(Deriv, Bybit, Binance, Coinbase, Kraken, OKX) and the BIST plugin.
"""
import asyncio
import json
import random
import re
import string
import time

try:
    import websockets
except ImportError:  # websockets is a project dependency; this is just defensive
    websockets = None

from .base import bar

MANIFEST = {
    "id": "tradingview", "name": "TradingView (misafir, ücretsiz)", "short": "TV",
    "needs": "none", "official": False, "default_on": False,
    "markets": "VIOP, forex pariteleri ve küresel semboller (TradingView misafir oturumu)",
    "terms": "https://www.tradingview.com/",
    "notice": "TradingView'in RESMİ API'si değildir; misafir (guest) WebSocket ile okuma-only çekilir. "
              "TradingView kullanım koşullarına aykırı olabilir ve veri lisanslıdır; yalnızca kişisel, "
              "kendi sunucunuzda kullanın. Varsayılan KAPALI; siz açarsınız.",
}

PREFIX = "TV_"
TF = {"M1": "1", "M5": "5", "M15": "15", "M30": "30", "H1": "60", "H4": "240", "D1": "1D"}

# Curated, useful symbols. Add any TradingView symbol id here and it will work.
# group drives UI grouping: futures | forex | index | crypto | commodity
SYMS = [
    # --- BIST VIOP (vadeli işlem) ---
    ("BIST:XU030D", "BIST 30 Vadeli (XU030)", "futures"),
    ("BIST:XU100D", "BIST 100 Vadeli (XU100)", "futures"),
    ("BIST:USDTRYD", "USD/TRY Vadeli", "futures"),
    ("BIST:EURTRYD", "EUR/TRY Vadeli", "futures"),
    ("BIST:XAUTRY", "Gram Altın (TRY) Vadeli", "futures"),
    ("BIST:XAUSD", "Ons Altın Vadeli", "futures"),
    ("BIST:THYAO1!", "THYAO Vadeli", "futures"),
    ("BIST:GARAN1!", "Garanti Vadeli", "futures"),
    ("BIST:ASELS1!", "Aselsan Vadeli", "futures"),
    ("BIST:EREGL1!", "Ereğli Vadeli", "futures"),
    # --- Forex pariteleri ---
    ("FX:EURUSD", "EUR/USD", "forex"),
    ("FX:GBPUSD", "GBP/USD", "forex"),
    ("FX:USDJPY", "USD/JPY", "forex"),
    ("FX:USDTRY", "USD/TRY", "forex"),
    ("FX:EURTRY", "EUR/TRY", "forex"),
    ("FX:GBPTRY", "GBP/TRY", "forex"),
    ("FX:AUDUSD", "AUD/USD", "forex"),
    ("FX:USDCHF", "USD/CHF", "forex"),
    ("FX:USDCAD", "USD/CAD", "forex"),
    # --- Endeksler ---
    ("BIST:XU100", "BIST 100", "index"),
    ("BIST:XU030", "BIST 30", "index"),
    ("TVC:SPX", "S&P 500", "index"),
    ("TVC:NDX", "Nasdaq 100", "index"),
    ("TVC:DAX", "DAX", "index"),
    ("TVC:UK100", "FTSE 100", "index"),
    # --- Emtia ---
    ("TVC:GOLD", "Altın (ons)", "commodity"),
    ("TVC:SILVER", "Gümüş", "commodity"),
    ("TVC:USOIL", "Ham Petrol (WTI)", "commodity"),
    # --- Kripto ---
    ("BINANCE:BTCUSDT", "Bitcoin", "crypto"),
    ("BINANCE:ETHUSDT", "Ethereum", "crypto"),
]


def symbols():
    return [{"ticker": f"{PREFIX}{tv}", "name": name, "group": grp, "key": tv}
            for tv, name, grp in SYMS]


def _tv_id(symbol):
    return symbol[len(PREFIX):] if symbol.startswith(PREFIX) else symbol


def _rand(n=12):
    return "".join(random.choice(string.ascii_lowercase) for _ in range(n))


def _header(s):
    return f"~m~{len(s)}~m~{s}"


async def _send(ws, func, params):
    await ws.send(_header(json.dumps({"m": func, "p": params}, separators=(",", ":"))))


async def _tv_history(tv_id, tf, limit, to_ms):
    if websockets is None:
        raise RuntimeError("websockets kütüphanesi yüklü değil")
    uri = "wss://data.tradingview.com/socket.io/websocket"
    interval = TF[tf]
    count = max(1, min(int(limit), 5000))
    cs = "cs_" + _rand()
    async with websockets.connect(uri, origin="https://www.tradingview.com") as ws:
        await _send(ws, "set_auth_token", ["unauthorized_user_token"])
        await _send(ws, "chart_create_session", [cs, ""])
        await _send(ws, "resolve_symbol", [cs, "s_" + tf,
                                           json.dumps({"symbol": tv_id, "adjustment": "splits"})])
        await _send(ws, "create_series", [cs, "s_" + tf, "s_" + tf, "s_" + tf, interval, count])
        bars = []
        deadline = time.time() + 25
        while time.time() < deadline:
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=6)
            except asyncio.TimeoutError:
                break
            if isinstance(raw, (bytes, bytearray)):
                raw = bytes(raw).decode("utf-8", "replace")
            if raw.startswith("~h~"):            # heartbeat -> echo back
                try:
                    await ws.send(raw)
                except Exception:
                    pass
                continue
            m = re.search(r"(\{.*\})\s*$", raw)
            if not m:
                continue
            try:
                obj = json.loads(m.group(1))
            except Exception:
                continue
            if obj.get("m") in ("series_load", "timescale_update") and obj.get("p"):
                payload = obj["p"][-1]
                v = payload.get("v") if isinstance(payload, dict) else None
                if not v:
                    continue
                for row in v:
                    if not isinstance(row, list) or len(row) < 6:
                        continue
                    try:
                        t = int(row[0]); o = float(row[1]); h = float(row[2])
                        l = float(row[3]); c = float(row[4])
                        vol = float(row[5]) if row[5] is not None else 0.0
                    except (TypeError, ValueError):
                        continue
                    if t > 10_000_000_000:        # ms -> s (TV sometimes sends ms)
                        t //= 1000
                    bars.append(bar(t, o, h, l, c, vol))
        bars.sort(key=lambda b: b["time"])
        if to_ms:
            bars = [b for b in bars if b["time"] < to_ms / 1000]
        return bars[-count:]


def history(symbol, tf, limit=1000, to_ms=None):
    # Called from a worker thread (asyncio.to_thread) by the hub, so asyncio.run
    # is safe here.
    return asyncio.run(_tv_history(_tv_id(symbol), tf, limit, to_ms))


def selftest():
    b = history(f"{PREFIX}BIST:XU030D", "D1", 3)
    return bool(b), f"{len(b)} candles, last close {b[-1]['close'] if b else '-'}"
