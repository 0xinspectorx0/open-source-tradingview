// Watchlist stores exact provider + ticker, not just the merged instrument key.
// Quotes use the existing D1 stream and previous completed daily close; feeds can be delayed.
const WATCH_KEY = 'chartHubWatchlist', WATCH_MAX = 500;
let watchSeq = 0, watchQuotes = new Map(), watchAttempts = new Map(), watchPending = new Map(), watchRows = new Map();
let watchImportOpen = false, watchImportText = '', watchImportStatus = '', watchImportBusy = false;
function watchItems() {
  try {
    const rows = JSON.parse(localStorage.getItem(WATCH_KEY) || '[]');
    return Array.isArray(rows) ? rows.filter(x => x && typeof x.key === 'string' && typeof x.broker === 'string' && typeof x.ticker === 'string').slice(0, WATCH_MAX) : [];
  } catch (_) { return []; }
}
function saveWatch(items) { try { localStorage.setItem(WATCH_KEY, JSON.stringify(items.slice(0, WATCH_MAX))); return true; } catch (_) { return false; } }
function addWatch(item) {
  if (!item || !item.key || !item.broker || !item.ticker) return;
  const rows = watchItems();
  if (!rows.some(x => x.ticker === item.ticker && x.broker === item.broker)) {
    if (rows.length >= WATCH_MAX) { alert(`İzleme listesi en fazla ${WATCH_MAX} sembol içerebilir.`); return; }
    rows.push({ key: item.key, ticker: item.ticker, broker: item.broker });
    if (!saveWatch(rows)) { alert('İzleme listesi kaydedilemedi. Tarayıcı depolamasını kontrol edin.'); return; }
  }
  if (openPanel === 'watchlist') renderWatchlist();
}
function importWatchSymbols(text, filename) {
  if (!DATA.instruments.length) throw new Error('Sembol listesi henüz hazır değil. Lütfen tekrar deneyin.');
  const entries = TradeXWatchlistImport.parse(text, filename);
  const resolver = TradeXWatchlistImport.create(DATA, st, TradeXMarketName);
  const result = TradeXWatchlistImport.merge(entries, watchItems(), resolver, WATCH_MAX);
  if (result.added && !saveWatch(result.rows)) throw new Error('Liste kaydedilemedi. Tarayıcı depolamasını kontrol edin; hiçbir sembol eklenmedi.');
  const lines = [`${result.added} sembol eklendi.`, `${result.duplicates} tekrar atlandı.`];
  if (result.overflow) lines.push(`${result.overflow} sembol eklenemedi: liste sınırı ${WATCH_MAX}.`);
  if (result.errors.length) {
    lines.push(`${result.errors.length} sembol bulunamadı veya belirsiz:`);
    lines.push(...result.errors.slice(0,20));
    if (result.errors.length > 20) lines.push(`… ve ${result.errors.length - 20} diğer sembol.`);
  }
  watchImportStatus = lines.join('\n');
  return result;
}
function watchId(item) { return item.broker + '\0' + item.ticker; }
function watchQuote(item) {
  const id = watchId(item); if (!watchQuotes.has(id)) watchQuotes.set(id, TradeXWatchlistLive.state());
  return watchQuotes.get(id);
}
function paintWatchQuote(item) {
  const row = watchRows.get(watchId(item));
  if (!row || !row.isConnected) return;
  const q = watchQuote(item), price = row.querySelector('.watch-price b'), change = row.querySelector('.watch-price small'), status = row.querySelector('.watch-state');
  const pct = Number.isFinite(q.last) && Number.isFinite(q.prev) && q.prev !== 0 ? (q.last / q.prev - 1) * 100 : NaN;
  price.textContent = Number.isFinite(q.last) ? q.last.toLocaleString(undefined, {maximumFractionDigits:8}) : '—';
  change.textContent = Number.isFinite(pct) ? `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%` : '—';
  change.style.color = Number.isFinite(pct) && pct !== 0 ? (pct > 0 ? 'var(--ok)' : 'var(--bad)') : '';
  const stale = q.updatedAt && Date.now() - q.updatedAt > 120000;
  status.textContent = stale ? `${q.status} · güncelleme yok` : q.status;
  row.querySelector('.watch-price').title = q.updatedAt ? `Son veri: ${new Date(q.updatedAt).toLocaleTimeString()} · önceki günlük kapanışa göre değişim` : 'Veri bekleniyor';
}
const watchLive = TradeXWatchlistLive.create({
  web:!!window.TRADEX_WEB, feeds:window.TXWebFeeds && window.TXWebFeeds.feeds, EventSourceClass:window.EventSource,
  onBar(item, bar, timestamp) {
    const q = watchQuote(item), previousDay = q.day;
    if (!TradeXWatchlistLive.bar(q,bar,timestamp)) return;
    if (window.TRADEX_WEB && ['coinbase','kraken','okx'].includes(item.broker)) q.status = 'Periyodik veri';
    paintWatchQuote(item);
    if (previousDay !== null && q.day > previousDay) { watchAttempts.delete(watchId(item)); setTimeout(() => { if (openPanel === 'watchlist') refreshWatchlist(); }, 1000); }
  },
  onHistory(item,bars) { const q = watchQuote(item); if (TradeXWatchlistLive.history(q,bars)) paintWatchQuote(item); },
  onStatus(item,status) { const q = watchQuote(item); if (q.status !== status) { q.status = status; paintWatchQuote(item); } }
});
function stopWatchlistLive() {
  watchSeq++; watchLive.close();
  for (const entry of watchPending.values()) entry.abort();
  watchPending.clear();
}
function markWatchlist() {
  document.querySelectorAll('.watch-row').forEach(row => row.classList.toggle('active', row.dataset.ticker === st.ticker && row.dataset.broker === st.broker));
}
function renderWatchlist() {
  const d = $('dock'), rows = watchItems(), scrollTop = d.scrollTop;
  d.innerHTML = ''; watchRows.clear();
  const head = document.createElement('div'); head.className = 'watch-head';
  const title = document.createElement('strong'); title.textContent = 'İzleme listesi';
  const buttons = document.createElement('span');
  const current = document.createElement('button'); current.textContent = '+ Grafik'; current.title = 'Açık grafiği ekle';
  current.onclick = () => addWatch({ key: st.key, ticker: st.ticker, broker: st.broker });
  const search = document.createElement('button'); search.textContent = '+ Ara'; search.title = 'Sembol ara ve ekle'; search.style.marginLeft = '4px';
  search.onclick = () => { if (window.openSymDlg) window.openSymDlg('', addWatch); };
  buttons.append(current, search); head.append(title, buttons); d.appendChild(head);
  const section = document.createElement('details'); section.className = 'watch-import'; section.open = watchImportOpen;
  const summary = document.createElement('summary'); summary.textContent = 'Manuel / toplu ekle';
  const help = document.createElement('p'); help.textContent = `Sembolleri virgül veya satır ile ayırın (ör. BIST:THYAO, BIST:GARAN). TXT, CSV ve JSON desteklenir; mevcut liste korunur. En fazla ${WATCH_MAX} sembol.`;
  const text = document.createElement('textarea'); text.placeholder = 'Örn. BIST:THYAO, BIST:GARAN'; text.setAttribute('aria-label','Eklenecek semboller'); text.value = watchImportText;
  text.oninput = () => { watchImportText = text.value; };
  const actions = document.createElement('div'); actions.className = 'watch-actions';
  const add = document.createElement('button'); add.type = 'button'; add.textContent = 'Listeye ekle'; add.disabled = watchImportBusy;
  const upload = document.createElement('button'); upload.type = 'button'; upload.textContent = 'Dosyadan ekle'; upload.disabled = watchImportBusy;
  const file = document.createElement('input'); file.type = 'file'; file.accept = '.txt,.csv,.json,text/plain,text/csv,application/json'; file.hidden = true;
  const status = document.createElement('div'); status.className = 'watch-result'; status.setAttribute('role','status'); status.setAttribute('aria-live','polite'); status.textContent = watchImportStatus;
  section.ontoggle = () => { if (section.isConnected) watchImportOpen = section.open; };
  add.onclick = () => {
    watchImportOpen = section.open;
    try { const result = importWatchSymbols(text.value, 'manual.txt'); if (!result.errors.length && !result.overflow) watchImportText = ''; }
    catch (e) { watchImportStatus = e.message || String(e); }
    renderWatchlist();
  };
  upload.onclick = () => { watchImportOpen = section.open; file.click(); };
  file.onchange = async () => {
    const chosen = file.files && file.files[0]; if (!chosen || watchImportBusy) return;
    watchImportBusy = true; add.disabled = upload.disabled = true; status.textContent = 'Dosya okunuyor…';
    try {
      if (!/\.(txt|csv|json)$/i.test(chosen.name)) throw new Error('TXT, CSV veya JSON dosyası seçin.');
      if (chosen.size > TradeXWatchlistImport.MAX_BYTES) throw new Error('Dosya en fazla 1 MB olabilir.');
      const content = await chosen.text(); importWatchSymbols(content, chosen.name);
    } catch (e) { watchImportStatus = e.message || String(e); }
    finally { watchImportBusy = false; file.value = ''; if (openPanel === 'watchlist') renderWatchlist(); }
  };
  actions.append(add, upload, file); section.append(summary, help, text, actions, status); d.appendChild(section);
  const note = document.createElement('div'); note.className = 'watch-note'; note.textContent = 'Fiyat ve önceki günlük kapanışa göre değişim. Görünen ilk 20 uygun sembolde canlı akış; diğerleri periyodik. BIST verisi gecikmelidir.'; d.appendChild(note);
  if (!rows.length) { const empty = document.createElement('div'); empty.className = 'watch-empty'; empty.textContent = 'Henüz sembol yok. Açık grafiği ekleyin veya arayın.'; d.appendChild(empty); }
  rows.forEach(item => {
    const row = document.createElement('div'); row.className = 'watch-row'; row.dataset.ticker = item.ticker; row.dataset.broker = item.broker;
    const button = document.createElement('button'); button.className = 'watch-open'; button.title = 'Grafikte aç';
    const identity = document.createElement('span'), name = document.createElement('b'), source = document.createElement('small');
    name.textContent = TradeXMarketName(item.ticker, item.broker);
    source.textContent = ((DATA.brokers.find(b => b.id === item.broker) || {}).name || TradeXMarketSource(item.ticker, item.broker));
    const liveState = document.createElement('small'); liveState.className = 'watch-state';
    identity.append(name, source, liveState);
    const price = document.createElement('span'); price.className = 'watch-price';
    const value = document.createElement('b'), change = document.createElement('small');
    price.append(value, change); button.append(identity, price);
    button.onclick = () => {
      const i = inst(item.key), options = i && i.brokers[item.broker];
      if (!options || !options.some(o => o.ticker === item.ticker)) { price.title = 'Sembol veya kaynak artık mevcut değil'; return; }
      Object.assign(st, { key: item.key, broker: item.broker, ticker: item.ticker }); push();
    };
    const remove = document.createElement('button'); remove.className = 'watch-remove'; remove.textContent = '×'; remove.title = 'Listeden çıkar'; remove.setAttribute('aria-label', `${name.textContent} listeden çıkar`);
    remove.onclick = () => {
      if (!saveWatch(watchItems().filter(x => x.ticker !== item.ticker || x.broker !== item.broker))) { alert('İzleme listesi kaydedilemedi.'); return; }
      watchQuotes.delete(item.broker + '\0' + item.ticker); watchAttempts.delete(item.broker + '\0' + item.ticker); renderWatchlist();
    };
    row.append(button, remove); d.appendChild(row); watchRows.set(watchId(item), row); paintWatchQuote(item);
  });
  d.scrollTop = scrollTop; markWatchlist(); refreshWatchlist();
}
async function refreshWatchlist() {
  const seq = ++watchSeq, dock = $('dock');
  if (openPanel !== 'watchlist' || document.hidden) { stopWatchlistLive(); return; }
  const bounds = dock.getBoundingClientRect();
  const visible = new Set([...dock.querySelectorAll('.watch-row')].filter(row => {
    if (!bounds.height) return true; // non-visual test environments
    const box = row.getBoundingClientRect(); return box.bottom >= bounds.top && box.top <= bounds.bottom;
  }).map(row => row.dataset.broker + '\0' + row.dataset.ticker));
  const items = watchItems().filter(x => visible.has(watchId(x))).slice(0, 100);
  watchLive.setTargets(items);
  // Live streams supply the last price; periodic D1 snapshots supply/reconcile the
  // previous close. Poll-only feeds use a shorter interval; BIST remains delayed.
  let index = 0;
  async function worker() {
    while (index < items.length && seq === watchSeq && openPanel === 'watchlist') {
      const item = items[index++], id = watchId(item), q = watchQuote(item);
      const fallback = !watchLive.isActive(item) || /yeniden|kullanılamıyor/.test(q.status);
      const interval = item.broker === 'bist' || !fallback ? 60000 : 10000;
      if (watchPending.has(id) || watchPending.size >= 4 || Date.now() - (watchAttempts.get(id) || 0) < interval) { paintWatchQuote(item); continue; }
      const started = Date.now(), abort = new AbortController(); watchPending.set(id, abort);
      const timeout = setTimeout(() => abort.abort(), 12000);
      try {
        const query = new URLSearchParams({symbol:item.ticker,source:item.broker,tf:'D1',limit:'2'});
        const response = await fetch('/api/bars?' + query, {signal:abort.signal});
        const bars = await response.json();
        if (abort.signal.aborted || openPanel !== 'watchlist' || !watchRows.has(id)) continue;
        if (!response.ok || !TradeXWatchlistLive.history(q,bars,Date.now(),fallback ? started : null)) throw new Error('no data');
        if (q.status === 'Veri alınamadı') q.status = item.broker === 'bist' ? 'BIST gecikmeli, periyodik veri' : watchLive.isActive(item) ? 'Canlı akış bekleniyor' : 'Periyodik veri';
        watchAttempts.set(id,Date.now()); paintWatchQuote(item);
      } catch (_) {
        if (!abort.signal.aborted && openPanel === 'watchlist' && watchRows.has(id)) {
          watchAttempts.set(id,Date.now());
          if (q.last === null) q.status = 'Veri alınamadı';
          paintWatchQuote(item);
        }
      } finally {
        clearTimeout(timeout);
        if (watchPending.get(id) === abort) watchPending.delete(id);
        if (openPanel === 'watchlist' && !document.hidden) setTimeout(refreshWatchlist, 0);
      }
    }
  }
  await Promise.all(Array.from({length:Math.min(4,items.length)},worker));
}
let watchScrollTimer;
document.getElementById('dock').addEventListener('scroll', () => {
  if (openPanel !== 'watchlist') return;
  clearTimeout(watchScrollTimer); watchScrollTimer = setTimeout(refreshWatchlist, 150);
}, {passive:true});
setInterval(() => { if (openPanel === 'watchlist') refreshWatchlist(); }, 10000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopWatchlistLive(); else if (openPanel === 'watchlist') refreshWatchlist();
});
window.addEventListener('pagehide', stopWatchlistLive);
window.addEventListener('pageshow', () => { if (openPanel === 'watchlist') refreshWatchlist(); });
