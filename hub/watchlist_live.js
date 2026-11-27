// Daily-session percentage: latest price versus the previous completed daily close.
// Streaming updates never replace the baseline with the latest intraday price.
window.TradeXWatchlistLive = (() => {
  const MAX_STREAMS = 20;
  const desktopSources = new Set(['binance','bybit','deriv','arm','mt5']);
  const number = x => x === null || x === undefined || x === '' ? NaN : Number(x);
  function barValue(b) {
    const time = number(b && b.time), close = number(b && b.close);
    return Number.isFinite(time) && Number.isFinite(close) ? {time,close} : null;
  }
  function state() { return {day:null,last:null,prev:null,live:false,updatedAt:0,tradeAt:0,status:'Bekleniyor'}; }
  function history(q, bars, now = Date.now(), replaceLiveBefore = null) {
    const valid = new Map();
    for (const b of Array.isArray(bars) ? bars : []) { const p = barValue(b); if (p) valid.set(p.time,p); }
    const rows = [...valid.values()].sort((a,b)=>a.time-b.time); if (!rows.length) return false;
    const latest = rows[rows.length-1], prior = rows.length > 1 ? rows[rows.length-2] : null;
    if (q.day === null || latest.time > q.day) {
      q.day = latest.time; q.last = latest.close; q.prev = prior ? prior.close : null; q.live = false; q.tradeAt = 0; q.updatedAt = now;
    } else if (latest.time === q.day) {
      if (prior) q.prev = prior.close;
      if (!q.live || (replaceLiveBefore !== null && q.updatedAt <= replaceLiveBefore)) { q.last = latest.close; q.live = false; q.updatedAt = now; }
    } else if (q.prev === null) q.prev = latest.close;
    return true;
  }
  function bar(q, value, tradeAt = 0, now = Date.now()) {
    const next = barValue(value); if (!next) return false;
    const timestamp = number(tradeAt);
    if (q.day !== null && next.time < q.day) return false;
    if (q.day === next.time && Number.isFinite(timestamp) && timestamp > 0 && q.tradeAt && timestamp < q.tradeAt) return false;
    const rollover = q.day !== null && next.time > q.day;
    if (rollover) q.prev = q.last;
    q.day = next.time; q.last = next.close; q.live = true; q.updatedAt = now;
    if (Number.isFinite(timestamp) && timestamp > 0) q.tradeAt = timestamp; else if (rollover) q.tradeAt = 0;
    q.status = 'Canlı akış';
    return true;
  }
  const key = item => item.broker+'\0'+item.ticker;
  function create({web, feeds, EventSourceClass, onBar, onHistory, onStatus}) {
    let active = new Map(), es = null, generation = 0;
    const streamable = item => web ? !!(feeds && feeds[item.broker] && typeof feeds[item.broker].live === 'function') && item.broker !== 'bist'
      : desktopSources.has(item.broker) && /^[A-Za-z0-9_.!#-]{1,80}$/.test(item.ticker);
    function closeAll() {
      generation++;
      if (es) { es.close(); es = null; }
      for (const entry of active.values()) if (entry.stop) try { entry.stop(); } catch (_) {}
      active.clear();
    }
    function setTargets(rows) {
      const eligible = rows.filter(streamable), selected = eligible.slice(0,MAX_STREAMS), selectedIds = new Set(selected.map(key));
      for (const item of rows) if (!selectedIds.has(key(item))) onStatus(item, item.broker === 'bist' ? 'BIST gecikmeli, periyodik veri' : eligible.some(x=>key(x)===key(item)) ? 'Canlı bağlantı sınırı; periyodik veri' : 'Periyodik veri');
      if (web) {
        for (const [id, entry] of active) if (!selectedIds.has(id)) { try { entry.stop(); } catch (_) {} active.delete(id); }
        for (const item of selected) {
          const id = key(item); if (active.has(id)) continue;
          const entry = {item,stop:null}; active.set(id,entry); onStatus(item,'Canlı akış bekleniyor');
          try {
            entry.stop = feeds[item.broker].live(item.ticker,'D1', (b,ts) => { if (active.get(id) === entry) onBar(item,b,ts); },
              msg => { if (active.get(id) === entry) onStatus(item, msg ? 'Bağlantı yeniden deneniyor' : 'Canlı akış bekleniyor'); });
            if (typeof entry.stop !== 'function') throw new Error('no stop');
          } catch (_) { active.delete(id); onStatus(item,'Canlı akış kullanılamıyor; periyodik veri'); }
        }
        return;
      }
      const signature = selected.map(key).sort().join('\n'), previous = [...active.keys()].sort().join('\n');
      if (signature === previous) return;
      closeAll();
      for (const item of selected) { active.set(key(item),{item}); onStatus(item,'Canlı akış bekleniyor'); }
      if (!selected.length) return;
      if (!EventSourceClass) { for (const item of selected) onStatus(item,'Canlı akış kullanılamıyor; periyodik veri'); return; }
      const instance = ++generation, params = new URLSearchParams({symbols:JSON.stringify(selected.map(x=>({source:x.broker,symbol:x.ticker})))});
      try {
        es = new EventSourceClass('/api/watchlist/stream?' + params);
        es.onmessage = event => {
          if (instance !== generation) return;
          let m; try { m = JSON.parse(event.data); } catch (_) { return; }
          if (!m || typeof m !== 'object') return;
          const entry = active.get(m.source+'\0'+m.symbol); if (!entry) return;
          if (m.type === 'bar') onBar(entry.item,m.bar,m.trade_ms);
          else if (m.type === 'history') onHistory(entry.item,m.bars);
          else if (m.type === 'status' || m.type === 'error') onStatus(entry.item,'Bağlantı yeniden deneniyor');
        };
        es.onerror = () => { if (instance === generation) for (const entry of active.values()) onStatus(entry.item,'Bağlantı yeniden deneniyor'); };
      } catch (_) { es = null; for (const item of selected) onStatus(item,'Canlı akış kullanılamıyor; periyodik veri'); }
    }
    return {setTargets,close:closeAll,streamable,isActive:item => active.has(key(item))};
  }
  return {state,history,bar,create,MAX_STREAMS};
})();
