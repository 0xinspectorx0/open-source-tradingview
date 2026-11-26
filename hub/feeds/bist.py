"""BIST (Borsa İstanbul) public market data via Yahoo Finance.

Yahoo Finance carries Borsa İstanbul equities under the ``<CODE>.IS`` ticker
(e.g. THYAO.IS, ASELS.IS, GARAN.IS). It needs no account and no API key, and it
is fetched server-side, so the desktop hub can read it without a browser/CORS
problem. Intraday bars (1m/5m/15m/30m/60m) cover the last ~60 days; daily bars
go back years. Prices are delayed reference prices, not a live order book.

This plugin is server-side only (the Vela/Lightweight/KLineChart engines and the
desktop hub). The web build uses a separate optional Cloudflare Pages Function
because Yahoo does not send CORS headers; see docs/WEB_BETA.md.
"""
import csv
import os
import re

from .base import get_json, bar, resample, TF_SEC
from ._bist_list import STOCKS as SNAPSHOT_STOCKS

MANIFEST = {
    "id": "bist", "name": "BIST (Borsa İstanbul)", "short": "BIS",
    "needs": "none", "official": False, "default_on": True,
    "markets": "Borsa İstanbul hisseleri (Yahoo Finance üzerinden)",
    "terms": "https://finance.yahoo.com/",
    "notice": "Veriler Yahoo Finance'den alınır; gecikmeli referans fiyatıdır, yatırım tavsiyesi değildir.",
}

PREFIX = "BIST_"
# Yahoo interval per TradeX timeframe. 4h has no direct interval, so it is built
# from 60m bars with base.resample.
YF = {"M1": "1m", "M5": "5m", "M15": "15m", "M30": "30m", "H1": "60m", "H4": "60m", "D1": "1d"}
# How many points Yahoo keeps for each interval (it rejects wider requests).
MAX_POINTS = {"1m": 10080, "5m": 17280, "15m": 5760, "30m": 2880, "60m": 2000, "1d": 365 * 5}

# Additional names not in the bundled 2023 snapshot. ticker, name.
STOCKS = [
    ("THYAO", "Türk Hava Yolları"), ("ASELS", "Aselsan"), ("GARAN", "Garanti BBVA"),
    ("KCHOL", "Koç Holding"), ("BIMAS", "BİM Mağazalar"), ("EREGL", "Ereğli Demir Çelik"),
    ("SISE", "Şişecam"), ("TUPRS", "Tüpraş"), ("FROTO", "Ford Otosan"), ("SAHOL", "Sabancı Holding"),
    ("AKBNK", "Akbank"), ("YKBNK", "Yapı Kredi"), ("ISCTR", "İş Bankası C"), ("VAKBN", "VakıfBank"),
    ("HALKB", "Halkbank"), ("TCELL", "Turkcell"), ("TTKOM", "Türk Telekom"), ("TKFEN", "Tekfen Holding"),
    ("ARCLK", "Arçelik"), ("TOASO", "Tofaş"), ("VESTL", "Vestel"), ("PETKM", "Petkim"),
    ("SASA", "Sasa Polyester"), ("KORDS", "Kordsa"), ("ENKAI", "Enka İnşaat"), ("TTRAK", "Türk Traktör"),
    ("AGHOL", "Anadolu Grubu Holding"), ("ANHYT", "Anadolu Efes"), ("CIMSA", "Çimsa"), ("DOHOL", "Doğan Holding"),
    ("EKGYO", "Emlak Konut GYO"), ("GUBRF", "Gübre Fabrikaları"), ("HEKTS", "Hektaş"), ("KONTR", "Kontrolmatik"),
    ("MPARK", "Mavi Giyim"), ("OTKAR", "Otokar"), ("PGSUS", "Pegasus Hava Taşımacılığı"), ("SOKM", "Şok Marketler"),
    ("TAVHL", "TAV Havalimanları"), ("TRGYO", "Torunlar GYO"), ("ULKER", "Ülker"), ("YKBNK", "Yapı Kredi Bankası"),
    ("ZOREN", "Zorlu Enerji"), ("ASTOR", "Astor Enerji"), ("KAYSE", "Kayseri Şeker"),
]

# --- BIST VIOP (vadeli işlem) ---
# NOT: Bu satırlar "legit / meşru" yolun parçasıdır ve Yahoo Finance üzerinden çekilmeye
# çalışılır. Ancak Yahoo'nun VIOP kapsamı TUTARSIZ/EKSİK olabilir ve tick'ler (XU030D.IS vb.)
# Yahoo'da bulunmayabilir; bu durumda ilgili grafik "veri yok" döndürür. Güvenilir VIOP
# verisi için tradingview.py (misafir oturum) eklentisine bakın. Tick'leri kendi makinenizde
# doğrulayın / düzeltin.
VIOP = [
    ("XU030D", "BIST 30 Vadeli"), ("XU100D", "BIST 100 Vadeli"),
    ("USDTRYD", "USD/TRY Vadeli"), ("EURTRYD", "EUR/TRY Vadeli"),
    ("XAUTRY", "Gram Altın (TRY) Vadeli"), ("XAUSD", "Ons Altın Vadeli"),
]


_CODE = re.compile(r"[A-Z0-9]{1,12}\Z")


def _extra_stocks():
    """Optional user-maintained CSV: code,name (in TRADEX_DATA or repo/data)."""
    data = os.environ.get("TRADEX_DATA") or os.path.join(os.path.dirname(__file__), "..", "..", "data")
    try:
        with open(os.path.join(data, "bist_symbols.csv"), encoding="utf-8-sig", newline="") as f:
            for row in csv.reader(f):
                if not row:
                    continue
                code = row[0].strip().upper().removesuffix(".IS")
                if not _CODE.fullmatch(code) or code == "SYMBOL" or code == "CODE":
                    continue
                name = row[1].strip() if len(row) > 1 else code
                yield code, (name or code)[:200]
    except (OSError, csv.Error, UnicodeError):
        return


def symbols():
    # Snapshot can contain delisted or renamed companies; it is not a promise of Yahoo coverage.
    stocks = dict(SNAPSHOT_STOCKS)
    for code, name in STOCKS:
        stocks.setdefault(code, name)
    stocks.update(_extra_stocks())
    eq = [{"ticker": f"{PREFIX}{c}", "name": f"{n} ({c}.IS)", "group": "stock", "key": f"{c}.IS"}
          for c, n in stocks.items()]
    vi = [{"ticker": f"{PREFIX}{c}", "name": f"{n} ({c})", "group": "futures", "key": f"{c}.IS"}
          for c, n in VIOP if c not in stocks]
    return eq + vi


def _yf_symbol(symbol):
    # Validate before incorporating the ticker into a URL.
    code = symbol[len(PREFIX):] if symbol.startswith(PREFIX) else symbol
    if not _CODE.fullmatch(code):
        raise ValueError("Invalid BIST symbol")
    return code + ".IS"


def _fetch(yf_symbol, interval, end, need):
    """Return oldest-first bars for one Yahoo interval ending at `end` (unix s)."""
    p1 = end - max(need, 1) * TF_SEC["M1"] * _per_bar_min(interval)
    p1 = max(p1, 0)
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/{yf_symbol}"
           f"?period1={int(p1)}&period2={int(end)}&interval={interval}&events=div%2Csplit")
    try:
        d = get_json(url)
    except Exception:
        # query1 occasionally rate-limits datacenter IPs; retry on query2.
        url = url.replace("query1", "query2")
        d = get_json(url)
    res = (d.get("chart") or {}).get("result")
    if not res:
        err = (d.get("chart") or {}).get("error") or {}
        raise RuntimeError(f"Yahoo: {err.get('description') or 'no data'}")
    r = res[0]
    ts = r.get("timestamp") or []
    q = (r.get("indicators") or {}).get("quote", [{}])[0]
    outs = []
    for i, t in enumerate(ts):
        try:
            o, h, l, c = q["open"][i], q["high"][i], q["low"][i], q["close"][i]
            v = q.get("volume", [0] * len(ts))[i] or 0
        except (TypeError, IndexError):
            continue
        if None in (o, h, l, c):
            continue
        outs.append(bar(t, o, h, l, c, v))
    return outs


def _per_bar_min(interval):
    return {"1m": 1, "5m": 5, "15m": 15, "30m": 30, "60m": 60, "1d": 1440}[interval]


def history(symbol, tf, limit=1000, to_ms=None):
    yf = YF[tf]
    end = int(to_ms / 1000) if to_ms else int(__import__("time").time())
    if tf == "H4":
        need = min(int(limit) * 4, MAX_POINTS["60m"])
        bars = _fetch(_yf_symbol(symbol), "60m", end, need)
        bars = resample(bars, "H1", "H4")
    else:
        need = min(int(limit), MAX_POINTS[yf])
        bars = _fetch(_yf_symbol(symbol), yf, end, need)
    # Scroll-back: drop the bar at/after the requested cutoff, keep older ones.
    if to_ms:
        bars = [b for b in bars if b["time"] < to_ms / 1000]
    return bars[-int(limit):] if limit else bars


def selftest():
    b = history(f"{PREFIX}THYAO", "D1", 3)
    return bool(b), f"{len(b)} candles, last close {b[-1]['close'] if b else '-'}"
