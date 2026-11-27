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
    const inferred = new Map(), installed = new WeakSet(), formatters = new Map(), axisHooks = new WeakMap();
    let indexedSymbols, byTicker = new Map();
    function observe(ticker, bars, reset = false) {
      const id = bare(ticker); if (!id || !Array.isArray(bars)) return false;
      const before = precision(id);
      let digits = reset ? null : (inferred.get(id) ?? null);
      for (const bar of bars.slice(-SAMPLE_BARS)) for (const field of ['open','high','low','close']) {
        const n = decimalsOf(bar && bar[field]); if (n !== null) digits = digits === null ? n : Math.max(digits,n);
      }
      if (digits === null) { if (reset) inferred.delete(id); return before !== precision(id); }
      inferred.delete(id); inferred.set(id,digits);
      if (inferred.size > MAX_SYMBOLS) inferred.delete(inferred.keys().next().value);
      return before !== precision(id);
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
    function chartSymbol(chart) {
      try { return bare(chart.market && chart.market.symbol); } catch (_) { return ''; }
    }
    // When metadata is absent, match Vela's zoom-dependent axis precision.
    function adaptiveDigits(ctx) {
      const raw = (ctx.max - ctx.min) / Math.max(2, Math.min(16, Math.round(ctx.height / 50)));
      if (!(raw > 0) || !Number.isFinite(raw)) return 2;
      const mag = Math.pow(10, Math.floor(Math.log10(raw))), norm = raw / mag;
      const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
      const d = Math.max(0, Math.min(MAX_DECIMALS, -Math.floor(Math.log10(step)) + 1));
      return d === 0 ? 2 : d;
    }
    function axisTicks(ctx, chart) {
      // Leave study panes and percentage/indexed axes to Vela unchanged.
      if (!ctx || !ctx.pane || ctx.pane.kind !== 'price' || ctx.mode !== 'price') return null;
      const min = ctx.min, max = ctx.max, height = ctx.height;
      if (!Number.isFinite(min) || !Number.isFinite(max) || !(max > min) || !(height > 0)) return null;
      const digits = precision(chartSymbol(chart)) ?? adaptiveDigits(ctx);
      const quantum = Math.pow(10, -digits), span = max - min;
      const label = price => chart.i18n.format.price(price, {decimals:digits, mode:'price', surface:'priceAxis'});
      const snap = price => { const n = Number(price.toFixed(digits)); return n === 0 ? 0 : n; };
      if (ctx.log) {
        // Keep Vela's logarithmic ladder; snap it to representable levels and drop
        // duplicates/overlaps rather than drawing a line at a misleading price.
        if (!(min > 0) || !Array.isArray(ctx.defaults)) return null;
        const out = [], seen = new Set(); let lastY = null;
        for (const tick of ctx.defaults) {
          if (!tick || !Number.isFinite(tick.price)) continue;
          const price = snap(tick.price);
          if (price <= 0 || price < min || price > max || seen.has(price)) continue;
          const y = typeof ctx.priceToY === 'function' ? ctx.priceToY(price) : null;
          if (Number.isFinite(y) && lastY !== null && Math.abs(y - lastY) < Math.max(20, (ctx.fontSize || 12) * 1.5)) continue;
          out.push({price, label:label(price), ...(typeof tick.major === 'boolean' ? {major:tick.major} : {})});
          seen.add(price); if (Number.isFinite(y)) lastY = y;
        }
        return out;
      }
      const count = Math.max(2, Math.min(16, Math.round(height / 50)));
      // The minimum representable level is 10^-digits. At very large magnitudes
      // also respect JS number resolution so indexing always progresses.
      const target = Math.max(quantum, span / count, Math.max(Math.abs(min),Math.abs(max)) * Number.EPSILON * 8);
      const mag = Math.pow(10, Math.floor(Math.log10(target))), unit = target / mag;
      const step = (unit <= 1 + 1e-12 ? 1 : unit <= 2 + 1e-12 ? 2 : unit <= 5 + 1e-12 ? 5 : 10) * mag;
      if (!(step > 0) || !Number.isFinite(step)) return null;
      const first = Math.ceil(min / step - 1e-10), last = Math.floor(max / step + 1e-10);
      if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || last - first > 100) return null;
      const out = [], seen = new Set();
      for (let i = first; i <= last; i++) {
        const price = snap(i * step);
        if (price < min || price > max || seen.has(price)) continue;
        out.push({price, label:label(price)}); seen.add(price);
      }
      return out;
    }
    function format(value, ctx, chart) {
      if (!ctx) return String(value);
      if (ctx.mode !== 'price' || !['priceAxis','lastPrice','crosshair'].includes(ctx.surface) || !Number.isFinite(value)) return ctx.fallback();
      const original = Number.isFinite(ctx.decimals) ? Math.max(0, Math.trunc(ctx.decimals)) : 2;
      let digits = Math.min(MAX_DECIMALS, original);
      if (ctx.surface === 'lastPrice') {
        const actual = precision(chartSymbol(chart)); if (actual !== null) digits = actual;
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
    function refreshChart(chart) {
      const hook = axisHooks.get(chart), renderer = chart && chart.renderer;
      if (!hook || !renderer) return;
      // Setting the same hook invalidates Vela's per-pane cached ticks.
      if (typeof renderer.get === 'function' && renderer.get('priceAxisTicks') !== hook) return;
      renderer.set('priceAxisTicks', hook);
    }
    function refresh(workspace, ticker) {
      if (!workspace || typeof workspace.cells !== 'function') return;
      for (const cell of workspace.cells()) {
        const chart = cell && cell.chart;
        if (chart && chartSymbol(chart) === bare(ticker)) refreshChart(chart);
      }
    }
    function install(chart) {
      if (!chart || installed.has(chart) || typeof chart.setLocale !== 'function') return;
      chart.setLocale({formatters:{price:(value,ctx) => format(value,ctx,chart)}});
      const renderer = chart.renderer;
      if (renderer && typeof renderer.set === 'function' && (!renderer.supports || renderer.supports('priceAxisTicks'))) {
        const hook = ctx => axisTicks(ctx,chart);
        renderer.set('priceAxisTicks', hook); axisHooks.set(chart,hook);
        if (typeof chart.on === 'function') chart.on('market:changed', () => refreshChart(chart));
      }
      installed.add(chart);
    }
    return {observe, precision, format, install, axisTicks, refresh};
  }
  return {create, decimalsOf, MAX_DECIMALS};
})();
