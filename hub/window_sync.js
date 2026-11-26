// Live synchronization is scoped to the same origin AND saved layout. Other layouts,
// markets and unrelated browser data are deliberately not replaced.
(() => {
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel('tradex-layout-live-v1');
  const sender = (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
  let joined = '', seq = 0, queued = [], applying = false, revision = 0;
  const seen = new Map();
  const id = () => window.layoutsCurrentId && window.layoutsCurrentId();
  const allowed = () => window.layoutsSyncAllowed && window.layoutsSyncAllowed();
  const send = (type, value, target) => {
    const layout = id(); if (!layout || !allowed()) return;
    try { channel.postMessage({layout, sender, seq:++seq, type, value, target}); } catch (e) { console.warn('window sync',e); }
  };
  const indicators = () => INDS.map(x => { const c = {...x}; for (const k of ['err','pending','wait','notes','convFrom']) delete c[k]; return c; });
  async function snapshot(target, expected) {
    const started = revision;
    try {
      const result = await ask('doc:get', {}, 6000);
      if (!result.ok || !result.doc || id() !== expected || !allowed() || revision !== started) return;
      const book = {...(result.doc.drawBook || {})};
      // Empty drawings are meaningful (they must erase stale peers for this market).
      const vela = result.doc.vela, activeChart = vela && Array.isArray(vela.charts) && (vela.charts.find(c => c.id === vela.activeCellId) || vela.charts[0]);
      const active = String((activeChart && activeChart.symbol) || st.ticker || '').replace(/^lab:/,'');
      if (active && !book[active]) book[active] = {version:1,drawings:[]};
      send('snapshot',{indicators:indicators(),drawings:book,baseline:result.doc.baseline},target);
    } catch (e) { console.warn('window sync snapshot',e); }
  }
  function validIndicators(x) { return Array.isArray(x) && x.every(v => v && typeof v === 'object' && typeof v.key === 'string'); }
  function applyDrawings(symbol, doc) {
    if (typeof symbol !== 'string' || !symbol || !doc || !Array.isArray(doc.drawings)) return;
    const frame = document.getElementById('frame').contentWindow;
    if (frame) frame.postMessage({cmd:'drawings:sync',symbol,doc},location.origin);
    if (window.layoutsDirty) window.layoutsDirty();
  }
  function applyBaseline(value) {
    if (!value || typeof value.present !== 'boolean') return;
    const frame = document.getElementById('frame').contentWindow;
    if (frame) frame.postMessage({cmd:'indicators:baseline',baseline:value},location.origin);
    if (window.layoutsDirty) window.layoutsDirty();
  }
  function receive(m) {
    if (!m || m.sender === sender || m.layout !== id() || (m.target && m.target !== sender) || typeof m.seq !== 'number') return;
    const last = seen.get(m.sender) || 0; if (m.seq <= last) return;
    seen.set(m.sender,m.seq);
    if (!allowed()) { queued.push(m); if (queued.length > 100) queued.shift(); return; }
    apply(m);
  }
  function apply(m) {
    if (m.layout !== id()) return;
    if (m.type === 'hello') { snapshot(m.sender,m.layout); return; }
    revision++; applying = true;
    try {
      if (m.type === 'indicators' && validIndicators(m.value)) applySyncedIndicators(m.value);
      if (m.type === 'drawings' && m.value) applyDrawings(m.value.symbol,m.value.doc);
      if (m.type === 'baseline') applyBaseline(m.value);
      if (m.type === 'snapshot' && m.value) {
        if (validIndicators(m.value.indicators)) applySyncedIndicators(m.value.indicators);
        applyBaseline(m.value.baseline);
        if (m.value.drawings && typeof m.value.drawings === 'object') for (const [symbol,doc] of Object.entries(m.value.drawings)) applyDrawings(symbol,doc);
      }
    } finally { applying = false; }
  }
  channel.onmessage = event => receive(event.data);
  window.TradeXSync = { indicatorsChanged() { if (!applying) { revision++; send('indicators',indicators()); } } };
  window.addEventListener('message', e => {
    const f = document.getElementById('frame');
    if (e.origin !== location.origin || !f || e.source !== f.contentWindow || !e.data) return;
    if (e.data.evt === 'drawings:changed') { revision++; send('drawings',{symbol:e.data.symbol,doc:e.data.doc}); }
    if (e.data.evt === 'ind:baseline') { revision++; send('baseline',e.data.baseline); }
  });
  const timer = setInterval(() => {
    if (!allowed() || !id()) return;
    if (joined !== id()) { joined = id(); queued = []; seen.clear(); send('hello'); }
    const pending = queued; queued = []; for (const m of pending) apply(m);
  }, 1000);
  window.addEventListener('pagehide', () => { clearInterval(timer); channel.close(); });
})();
