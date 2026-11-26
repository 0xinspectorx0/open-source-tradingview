// Portable TradeX settings backup. Only explicitly listed app preferences are exported:
// authentication/session tokens, credentials and unrelated browser storage are never read.
window.TradeXSettingsBackup = (() => {
  const KEYS = {
    chartHub:'object', chartHubTheme:'object', chartHubIndicators:'array', chartHubFavs:'array',
    chartHubScripts:'array', chartHubDraft:'object', chartHubWatchlist:'array',
    chartHubTimeframeFavorites:'array', tradexDrawFavs:'array', tradexFavBar:'object',
    tradexSymSearch:'object', tradexRecentSymbols:'array', chartHubLayoutAutosave:'flag', chartHubOrderflowV2:'flag'
  };
  const MAX_BYTES = 25 * 1024 * 1024, MAX_RECORDS = 500;
  const isObject = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  function safeTree(root) {
    const stack = [root]; let count = 0;
    while (stack.length) {
      const value = stack.pop();
      if (!value || typeof value !== 'object') continue;
      if (++count > 1000000) throw new Error('Yedek çok karmaşık.');
      for (const key of Object.keys(value)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') throw new Error('Yedekte geçersiz alan var.');
        stack.push(value[key]);
      }
    }
  }
  function validPref(key, value) {
    if (value === null) return true;
    if (typeof value !== 'string') return false;
    if (KEYS[key] === 'flag') return key === 'chartHubLayoutAutosave' ? /^(0|1)$/.test(value) : value === '1';
    try {
      const parsed = JSON.parse(value); safeTree(parsed);
      if (KEYS[key] !== 'array') return isObject(parsed);
      if (!Array.isArray(parsed)) return false;
      if (['chartHubTimeframeFavorites','tradexDrawFavs','tradexRecentSymbols'].includes(key)) return parsed.every(x => typeof x === 'string');
      return parsed.every(isObject);
    } catch (_) { return false; }
  }
  function validate(data) {
    if (!isObject(data) || data.format !== 'tradex-settings' || data.version !== 1 || !isObject(data.preferences) || !isObject(data.current) || !Array.isArray(data.layouts) || !Array.isArray(data.templates)) throw new Error('Geçersiz veya desteklenmeyen TradeX yedeği.');
    safeTree(data);
    if (data.layouts.length + data.templates.length > MAX_RECORDS) throw new Error('Yedekte çok fazla kayıt var.');
    const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
    for (const key of Object.keys(data.preferences)) if (!has(KEYS, key)) throw new Error('Yedekte bilinmeyen ayar var.');
    for (const key of Object.keys(KEYS)) if (!has(data.preferences, key) || !validPref(key, data.preferences[key])) throw new Error(`Geçersiz ayar: ${key}`);
    const c = data.current, doc = c.doc;
    if (typeof c.name !== 'string' || !(c.sourceId === null || typeof c.sourceId === 'string') || !isObject(doc) || !isObject(doc.hub) || !isObject(doc.theme) || !Array.isArray(doc.inds) || !isObject(doc.chart) || !isObject(doc.chart.vela) || !Array.isArray(doc.chart.vela.charts)) throw new Error('Etkin grafik kaydı geçersiz.');
    if (!['key','broker','ticker','tf'].every(k => typeof doc.hub[k] === 'string') || typeof doc.grid !== 'string' || !doc.inds.every(isObject)) throw new Error('Etkin grafik bilgileri geçersiz.');
    for (const [kind, records] of [['layouts',data.layouts],['templates',data.templates]]) {
      const ids = new Set();
      for (const r of records) {
        if (!isObject(r) || typeof r.id !== 'string' || !r.id || ids.has(r.id) || typeof r.name !== 'string' || typeof r.summary !== 'string' || !isObject(r.doc)) throw new Error(`Geçersiz ${kind} kaydı.`);
        if (kind === 'templates' && !Array.isArray(r.doc.inds)) throw new Error('Geçersiz şablon içeriği.');
        if (kind === 'layouts' && (!isObject(r.doc.hub) || !isObject(r.doc.theme) || !Array.isArray(r.doc.inds) || !(r.doc.chart === null || isObject(r.doc.chart)))) throw new Error('Geçersiz düzen içeriği.');
        ids.add(r.id);
      }
    }
    return data;
  }
  function parse(text) {
    if (typeof text !== 'string' || new Blob([text]).size > MAX_BYTES) throw new Error('Yedek 25 MB sınırını aşıyor.');
    let data; try { data = JSON.parse(text); } catch (_) { throw new Error('JSON dosyası okunamadı.'); }
    return validate(data);
  }
  function create({api, snapshot, currentId, currentName, storage}) {
    async function exportData() {
      const current = await snapshot();
      const preferences = {};
      for (const key of Object.keys(KEYS)) preferences[key] = storage.getItem(key);
      const list = await api('');
      if (!Array.isArray(list.layouts) || !Array.isArray(list.templates) || list.layouts.length + list.templates.length > MAX_RECORDS) throw new Error('Kayıt listesi geçersiz veya çok büyük.');
      async function records(kind) {
        if (!Array.isArray(list[kind])) throw new Error('Kayıt listesi alınamadı.');
        const result = [];
        for (const row of list[kind]) {
          const value = await api(`?kind=${kind}&id=${encodeURIComponent(row.id)}`);
          if (!value || !isObject(value.doc)) throw new Error('Kayıt okunamadı: ' + (row.name || row.id));
          result.push({id:String(row.id), name:String(value.name || row.name || ''), summary:String(value.summary || row.summary || ''), doc:value.doc});
        }
        return result;
      }
      const data = {format:'tradex-settings',version:1,createdAt:new Date().toISOString(),preferences,
        current:{sourceId:currentId() || null,name:currentName() || 'Düzenim',doc:current},
        layouts:await records('layouts'),templates:await records('templates')};
      const text = JSON.stringify(validate(data), null, 2);
      if (new Blob([text]).size > MAX_BYTES) throw new Error('Yedek 25 MB sınırını aşıyor.');
      return text;
    }
    async function importData(text) {
      const data = parse(text), created = [], prior = {};
      const localKeys = [...Object.keys(KEYS), 'chartHubLayoutId'];
      for (const key of localKeys) prior[key] = storage.getItem(key);
      let localTouched = false, activeId = null;
      try {
        for (const [kind, records] of [['layouts',data.layouts],['templates',data.templates]]) {
          for (const item of records) {
            const current = kind === 'layouts' && item.id === data.current.sourceId;
            const r = await api('/save', {kind, name:item.name, summary:item.summary, doc:item.doc});
            if (!r || typeof r.id !== 'string' || !r.id) throw new Error('Kayıt oluşturulamadı.');
            created.push({kind,id:r.id});
            // Keep the last saved layout as well as unsaved on-screen changes.
            if (current && JSON.stringify(item.doc) === JSON.stringify(data.current.doc)) activeId = r.id;
          }
        }
        if (!activeId) {
          const r = await api('/save', {kind:'layouts',name:data.current.name,summary:'',doc:data.current.doc});
          if (!r || typeof r.id !== 'string' || !r.id) throw new Error('Etkin düzen kaydedilemedi.');
          created.push({kind:'layouts',id:r.id}); activeId = r.id;
        }
        localTouched = true;
        for (const key of Object.keys(KEYS)) {
          const value = data.preferences[key];
          if (value === null) storage.removeItem(key); else storage.setItem(key, value);
        }
        // The in-memory chart can be newer than the last saved browser values.
        storage.setItem('chartHub', JSON.stringify(data.current.doc.hub));
        storage.setItem('chartHubTheme', JSON.stringify(data.current.doc.theme));
        storage.setItem('chartHubIndicators', JSON.stringify(data.current.doc.inds));
        storage.setItem('chartHubLayoutId', activeId);
        return {ok:true};
      } catch (err) {
        let rollbackFailed = false;
        if (localTouched) for (const key of localKeys) {
          try { if (prior[key] === null) storage.removeItem(key); else storage.setItem(key, prior[key]); }
          catch (_) { rollbackFailed = true; }
        }
        for (const item of created.reverse()) {
          try { const r = await api('/delete', item); if (!r || r.ok !== true) rollbackFailed = true; } catch (_) { rollbackFailed = true; }
        }
        throw new Error((err && err.message || 'Yükleme başarısız.') + (rollbackFailed ? ' Geri alma tamamlanamadı; kayıtlarınızı kontrol edin.' : ' Değişiklikler geri alındı.'));
      }
    }
    return {exportData, importData};
  }
  return {create, parse, MAX_BYTES};
})();
