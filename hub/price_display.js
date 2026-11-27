// Display-only price precision. Never round or change feed bars, tick sizes or Pine inputs.
window.TradeXPriceDisplay = (() => {
  const MAX_DECIMALS = 7, SAMPLE_BARS = 30, MAX_SYMBOLS = 500;
  const bare = ticker => String(ticker || '').replace(/^lab:/i, '');
  function decimalsOf(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) return null;
    const [mantissa, exponent = '0'] = Math.abs(value).toString().toLowerCase().split('e');
    const fraction = (mantissa.split('.')[1] || '').length;
    return Math.max(0, Math.min(MAX_DECIMALS, fraction - Number(exponent)));
  }
  function create(symbols) {
    // The catalogue's digits are authoritative when present. Other feeds often omit
    // precision: infer it from recent OHLC values without changing the underlying data.
    const inferred = new Map(), installed = new WeakSet(), formatters = new Map();
    let indexedSymbols, byTicker = new Map();
    function observe(ticker, bars, reset = false) {
      const id = bare(ticker); if (!id || !Array.isArray(bars)) return;
      let digits = reset ? null : (inferred.get(id) ?? null);
      for (const bar of bars.slice(-SAMPLE_BARS)) for (const field of ['open','high','low','close']) {
        const n = decimalsOf(bar && bar[field]); if (n !== null) digits = digits === null ? n : Math.max(digits,n);
      }
      if (digits === null) { if (reset) inferred.delete(id); return; }
      inferred.delete(id); inferred.set(id,digits);
      if (inferred.size > MAX_SYMBOLS) inferred.delete(inferred.keys().next().value);
    }
    function precision(ticker) {
      const id = bare(ticker), list = symbols();
      if (list !== indexedSymbols) {
        indexedSymbols = list; byTicker = new Map();
        for (const row of Array.isArray(list) ? list : []) if (row && !byTicker.has(row.ticker)) byTicker.set(row.ticker,row);
      }
      const row = byTicker.get(id), n = row && row.digits;
      if ((typeof n === 'number' || (typeof n === 'string' && n.trim() !== '')) && Number.isInteger(Number(n)) && Number(n) >= 0 && Number(n) <= 20) return Math.min(MAX_DECIMALS, Number(n));
      return inferred.has(id) ? inferred.get(id) : null;
    }
    function format(value, ctx, chart) {
      if (!ctx) return String(value);
      if (ctx.mode !== 'price' || !['priceAxis','lastPrice','crosshair'].includes(ctx.surface) || !Number.isFinite(value)) return ctx.fallback();
      const original = Number.isFinite(ctx.decimals) ? Math.max(0, Math.trunc(ctx.decimals)) : 2;
      let digits = Math.min(MAX_DECIMALS, original);
      if (ctx.surface === 'lastPrice') {
        let symbol; try { symbol = chart.market && chart.market.symbol; } catch (_) {}
        const actual = precision(symbol); if (actual !== null) digits = actual;
      }
      if (digits === original) return ctx.fallback();
      let numbering = 'latn'; try { numbering = chart.i18n.numberingSystem || 'latn'; } catch (_) {}
      const locale = ctx.locale || 'en', key = `${locale}|${numbering}|${digits}|${!!ctx.grouping}`;
      let formatter = formatters.get(key);
      if (!formatter) {
        try { formatter = new Intl.NumberFormat(locale, {numberingSystem:numbering, useGrouping:!!ctx.grouping, minimumFractionDigits:digits, maximumFractionDigits:digits}); }
        catch (_) { formatter = new Intl.NumberFormat('en', {useGrouping:!!ctx.grouping, minimumFractionDigits:digits, maximumFractionDigits:digits}); }
        if (formatters.size >= 100) formatters.clear();
        formatters.set(key,formatter);
      }
      return formatter.format(value).replace(/[\u200e\u200f\u061c]/g, '');
    }
    function install(chart) {
      if (!chart || installed.has(chart) || typeof chart.setLocale !== 'function') return;
      chart.setLocale({formatters:{price:(value,ctx) => format(value,ctx,chart)}});
      installed.add(chart);
    }
    return {observe, precision, format, install};
  }
  return {create, decimalsOf, MAX_DECIMALS};
})();
