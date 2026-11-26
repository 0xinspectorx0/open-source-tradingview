// Mirror the shell-owned indicator ledger to all live cells. A logical ID is stable
// even when the active cell changes; Vela's individual indicator IDs are per chart.
window.TradeXIndicatorSync = function (workspace, notify) {
  const groups = new Map(), hooked = new WeakSet(), previous = new Map(), dormant = new Map(), known = new WeakMap();
  let serial = 0, muted = 0, baseline = null;
  const cells = () => workspace.cells();
  const same = (a,b) => JSON.stringify(a || {}) === JSON.stringify(b || {});
  const quiet = fn => { muted++; try { return fn(); } finally { muted--; } };
  function find(chart, id) {
    for (const group of groups.values()) { const h = group.handles.get(chart); if (h && h.id === id) return group; }
    return null;
  }
  function baseSnapshot(h) { return {present:true,visible:h.visible !== false,inputs:h.inputValues(),props:h.propValues ? h.propValues() : {}}; }
  function applyBaseline(value) {
    if (!value || typeof value.present !== 'boolean') return;
    baseline = JSON.parse(JSON.stringify(value));
    quiet(() => { for (const c of cells()) try {
      if (c.chart.indicators().some(h => h.nativeType === 'volume' && find(c.chart,h.id))) continue;
      let h = c.chart.indicators().find(h => h.nativeType === 'volume');
      if (!value.present) { if (h) h.remove(); continue; }
      if (!h) h = c.chart.addNativeIndicator('volume', {inputs:value.inputs || {}});
      if (value.inputs && !same(h.inputValues(),value.inputs)) h.setInputs(value.inputs);
      if (value.props && h.setProps && !same(h.propValues && h.propValues(),value.props)) h.setProps(value.props);
      if (h.visible !== (value.visible !== false)) h.setVisible(value.visible !== false);
      if (known.has(c.chart)) known.get(c.chart).set(h.id,'volume');
    } catch (e) { console.warn('volume sync',e); } });
  }
  function baselineChanged(value) { applyBaseline(value); notify({evt:'ind:baseline',baseline:value}); }
  function attach(chart) {
    if (hooked.has(chart)) return; hooked.add(chart); known.set(chart,new Map());
    const remember = () => { for (const h of chart.indicators()) if (h.nativeType === 'volume') known.get(chart).set(h.id,'volume'); };
    remember();
    chart.on('indicator:added', () => {
      remember(); if (muted) return;
      const h = chart.indicators().find(x => x.nativeType === 'volume' && !find(chart,x.id));
      if (h && !baseline) baseline = baseSnapshot(h);
      else if (h && baseline) applyBaseline(baseline);
    });
    chart.on('indicator:inputs', ev => {
      if (muted) return;
      const g = find(chart, ev.id);
      if (!g) { const h = chart.indicators().find(x => x.id === ev.id && x.nativeType === 'volume'); if (h) baselineChanged(baseSnapshot(h)); return; }
      const h = g.handles.get(chart), inputs = h.inputValues(), props = h.propValues ? h.propValues() : {};
      g.inputs = inputs; g.props = props;
      quiet(() => { for (const peer of g.handles.values()) if (peer !== h) try {
        if (peer.setInputs && !same(peer.inputValues(), inputs)) peer.setInputs(inputs);
        if (peer.setProps && !same(peer.propValues && peer.propValues(), props)) peer.setProps(props);
      } catch (e) { console.warn('indicator sync',e); } });
      notify({evt:'ind:inputs', id:g.id, inputs, props});
    });
    chart.on('indicator:removed', ev => {
      if (muted) return;
      const g = find(chart, ev.id);
      if (!g) { if (known.get(chart).get(ev.id) === 'volume') { known.get(chart).delete(ev.id); baselineChanged({present:false}); } return; }
      groups.delete(g.id); quiet(() => { for (const [c,h] of g.handles) if (c !== chart) try { h.remove(); } catch (e) { console.warn('indicator sync',e); } });
      notify({evt:'ind:removed',id:g.id});
    });
    chart.on('indicator:visibility', ev => {
      if (muted) return;
      const g = find(chart, ev.id);
      if (!g) { const h = chart.indicators().find(x => x.id === ev.id && x.nativeType === 'volume'); if (h) baselineChanged(baseSnapshot(h)); return; }
      g.visible = ev.visible;
      quiet(() => { for (const [c,h] of g.handles) if (c !== chart && h.visible !== ev.visible) try { h.setVisible(ev.visible); } catch (e) { console.warn('indicator sync',e); } });
      notify({evt:'ind:visibility',id:g.id,visible:ev.visible});
    });
  }
  function addTo(g, chart, adopt) {
    let h;
    if (adopt && g.kind === 'native') {
      const taken = new Set([...groups.values()].map(x => x.handles.get(chart)).filter(Boolean));
      h = chart.indicators().find(x => x.nativeType === g.type && !taken.has(x));
    }
    if (!h) h = g.kind === 'native' ? chart.addNativeIndicator(g.type, g.inputs ? {inputs:g.inputs} : undefined)
      : chart.addIndicator(g.source, {inputs:g.inputs || {}, props:g.props || {}});
    if (!h || !h.id) throw new Error('İndikatör bu grafiğe eklenemedi.');
    g.handles.set(chart,h);
    if (adopt && g.inputs && h.setInputs) h.setInputs(g.inputs);
    if (g.props && Object.keys(g.props).length && h.setProps) h.setProps(g.props);
    if (g.visible === false && h.setVisible) h.setVisible(false);
    return h;
  }
  function add(kind, value, inputs, props, key) {
    if (key) for (const g of [...groups.values()]) if (g.key === key) remove(g.id);
    const active = workspace.chart, g = {id:'tx-sync-'+(++serial),key,kind,handles:new Map(),inputs:inputs || {},props:props || {},visible:true};
    if (kind === 'native') g.type = value; else g.source = value;
    let primary;
    try {
      attach(active); primary = addTo(g,active,false); groups.set(g.id,g);
      quiet(() => { for (const c of cells()) if (c.chart !== active) { attach(c.chart); try { addTo(g,c.chart,true); } catch (e) { console.warn('indicator sync',e); } } });
    } catch (e) { groups.delete(g.id); quiet(() => { for (const h of g.handles.values()) h.remove(); }); return {error:String(e.message || e)}; }
    return {group:g, primary};
  }
  function addNative(type, inputs, key, props) {
    const r = add('native',type,inputs,props,key); return r.error ? {ok:false,error:r.error} : {ok:true,id:r.group.id,title:r.primary.title};
  }
  async function addPine(source, inputs, props, key) {
    const r = add('pine',source,inputs,props,key); if (r.error) return {ok:false,error:r.error};
    const {group:g,primary:h} = r;
    return new Promise(resolve => {
      let settled = false;
      const timer = setTimeout(() => { settled = true; resolve({ok:true,id:g.id,pending:true,note:'no result within 15 s'}); },15000);
      h.on('ready', () => { clearTimeout(timer); settled = true; resolve({ok:true,id:g.id,title:h.title}); if (groups.has(g.id)) notify({evt:'ind:ready',id:g.id}); });
      h.on('error', ({error}) => { clearTimeout(timer); if (!settled) { settled = true; remove(g.id); resolve({ok:false,id:g.id,error:String(error && error.message || error)}); } });
    });
  }
  function remove(id) {
    const g = groups.get(id) || [...groups.values()].find(x => x.key === id); if (!g) return false;
    groups.delete(g.id); quiet(() => { for (const h of g.handles.values()) { try { h.remove(); } catch (_) {} } }); return true;
  }
  function hookCells() {
    const current = cells(), live = new Set(current.map(c=>c.chart));
    // Vela pools native indicators for closed slots. Remember which ones we owned,
    // so a removed indicator cannot reappear when that slot is reopened later.
    for (const [id,chart] of previous) if (!live.has(chart)) {
      dormant.set(id, [...groups.values()].filter(g => g.handles.has(chart)).map(g => ({key:g.key,id:g.id,kind:g.kind,type:g.type})));
      previous.delete(id);
    }
    for (const g of groups.values()) for (const chart of g.handles.keys()) if (!live.has(chart)) g.handles.delete(chart);
    for (const c of current) {
      attach(c.chart);
      if (!baseline) { const h = c.chart.indicators().find(h => h.nativeType === 'volume' && !find(c.chart,h.id)); if (h) baseline = baseSnapshot(h); }
      if (previous.get(c.id) !== c.chart && dormant.has(c.id)) {
        const old = dormant.get(c.id); dormant.delete(c.id);
        quiet(() => { for (const entry of old) {
          if (entry.kind !== 'native' || [...groups.values()].some(g => entry.key ? g.key === entry.key : g.id === entry.id)) continue;
          const h = c.chart.indicators().find(h => h.nativeType === entry.type); if (h) h.remove();
        }});
      }
      previous.set(c.id,c.chart);
      quiet(() => { for (const g of groups.values()) if (!g.handles.has(c.chart)) try { addTo(g,c.chart,true); } catch (e) { console.warn('indicator sync',e); } });
    }
    if (baseline) applyBaseline(baseline);
  }
  function update(key, inputs, props) {
    const g = [...groups.values()].find(x => x.key === key); if (!g) return;
    g.inputs = inputs || {}; g.props = props || {};
    quiet(() => { for (const h of g.handles.values()) try {
      if (h.setInputs && !same(h.inputValues(),g.inputs)) h.setInputs(g.inputs);
      if (h.setProps && !same(h.propValues && h.propValues(),g.props)) h.setProps(g.props);
    } catch (e) { console.warn('indicator sync',e); } });
  }
  function clear() { for (const id of [...groups.keys()]) remove(id); }
  const activeHandle = id => groups.get(id)?.handles.get(workspace.chart);
  return {addNative,addPine,remove,hookCells,clear,update,activeHandle,applyBaseline,baseline:() => baseline && JSON.parse(JSON.stringify(baseline))};
};
