// Weekly/monthly candles from the source's daily bars. UTC calendar buckets: Monday and month start.
// These are derived candles, not exchange-native weekly/monthly bars; session boundaries follow the daily feed.
(function () {
  const DAY = 86400;
  function start(time, tf) {
    const d = new Date(time * 1000);
    if (tf === 'MN1') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000;
    if (tf === 'W1') {
      const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000;
      return midnight - ((d.getUTCDay() + 6) % 7) * DAY;
    }
    throw new Error('Unsupported period');
  }
  function aggregate(bars, tf) {
    const unique = new Map();
    for (const b of bars) {
      if (!Number.isFinite(b.time) || !['open','high','low','close'].every(k => Number.isFinite(b[k]))) continue;
      unique.set(b.time, b);
    }
    const result = [];
    for (const b of [...unique.values()].sort((a,b) => a.time - b.time)) {
      const time = start(b.time, tf), last = result[result.length - 1], volume = Number.isFinite(b.volume) ? b.volume : 0;
      if (!last || last.time !== time) result.push({time, open:b.open, high:b.high, low:b.low, close:b.close, volume});
      else { last.high = Math.max(last.high,b.high); last.low = Math.min(last.low,b.low); last.close = b.close; last.volume += volume; }
    }
    return result;
  }
  async function history(fetchDaily, tf, toMs, limit) {
    const wanted = Math.max(1, Math.min(500, Math.floor(Number(limit) || 1000))), all = new Map();
    let end = toMs, previous = Infinity, exhausted = false;
    for (let page=0; page<5; page++) {
      const bars = await fetchDaily(end, 1000);
      if (!Array.isArray(bars) || !bars.length) { exhausted = true; break; }
      for (const b of bars) if (!toMs || b.time * 1000 <= toMs) all.set(b.time, b);
      const valid = [...all.values()];
      if (aggregate(valid, tf).length > wanted) break; // one extra period prevents cutting the oldest returned candle
      const oldest = Math.min(...bars.map(b => b.time).filter(Number.isFinite));
      if (!Number.isFinite(oldest) || oldest >= previous) { exhausted = true; break; }
      previous = oldest; end = oldest * 1000 - 1;
    }
    const result = aggregate([...all.values()], tf);
    // If our page budget ran out in the middle of a period, defer that oldest period to the next page.
    if (!exhausted && result.length <= wanted && result.length > 1) result.shift();
    return result.slice(-wanted);
  }
  window.TradeXPeriods = {start, aggregate, history};
})();
