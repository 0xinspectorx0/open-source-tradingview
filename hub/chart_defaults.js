// A chart default contains presentation only, never market, drawings or indicators.
window.TradeXChartDefaults = (() => {
  const KEY = 'chartHubChartDefaults';
  const fields = ['priceStyle', 'watermark', 'replayWatermark', 'indicatorTitles', 'indicatorValues', 'statuslineParts', 'rendererConfig'];
  function read() {
    try { const value = JSON.parse(localStorage.getItem(KEY)); return value && value.version === 1 && value.chart && typeof value.chart === 'object' ? value : null; }
    catch (_) { return null; }
  }
  function save(ws) {
    const state = ws.getState(), chart = state.charts.find(c => c.id === state.activeCellId) || state.charts[0];
    if (!chart || !chart.rendererConfig) throw new Error('Grafik ayarları okunamadı.');
    const copy = {}; for (const key of fields) if (chart[key] !== undefined) copy[key] = chart[key];
    localStorage.setItem(KEY, JSON.stringify({version:1, chart:copy, timezone:state.timezone}));
  }
  function applyCell(cell) {
    const d = read(); if (!d || !cell || !cell.chart) return;
    const c = d.chart;
    if (c.priceStyle && cell.setPriceStyle) cell.setPriceStyle(c.priceStyle);
    if (c.rendererConfig) cell.chart.renderer.applyConfig(c.rendererConfig);
    if (typeof c.watermark === 'boolean' && cell.setWatermarkVisible) cell.setWatermarkVisible(c.watermark);
    if (typeof c.replayWatermark === 'boolean' && cell.setReplayWatermarkVisible) cell.setReplayWatermarkVisible(c.replayWatermark);
    if (typeof c.indicatorTitles === 'boolean' && cell.setIndicatorTitlesVisible) cell.setIndicatorTitlesVisible(c.indicatorTitles);
    if (typeof c.indicatorValues === 'boolean' && cell.setIndicatorValuesVisible) cell.setIndicatorValuesVisible(c.indicatorValues);
    if (c.statuslineParts && cell.setStatuslinePart) for (const [key,value] of Object.entries(c.statuslineParts)) if (typeof value === 'boolean') cell.setStatuslinePart(key,value);
  }
  function applyInitial(ws) {
    const d = read(); if (!d) return;
    try { if (d.timezone && ws.setTimezone) ws.setTimezone(d.timezone); for (const c of ws.cells()) applyCell(c); }
    catch (e) { console.warn('chart defaults', e); }
  }
  return {save, applyCell, applyInitial};
})();
