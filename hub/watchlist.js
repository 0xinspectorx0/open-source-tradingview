// Watchlist stores exact provider + ticker, not just the merged instrument key.
// Quotes are periodic D1 candles (delayed where the source is delayed), not an order book.
const WATCH_KEY = 'chartHubWatchlist', WATCH_MAX = 40;
let watchSeq = 0, watchQuotes = new Map();
function watchItems() {
  try {
    const rows = JSON.parse(localStorage.getItem(WATCH_KEY) || '[]');
    return Array.isArray(rows) ? rows.filter(x => x && typeof x.key === 'string' && typeof x.broker === 'string' && typeof x.ticker === 'string').slice(0, WATCH_MAX) : [];
  } catch (_) { return []; }
}
function saveWatch(items) { try { localStorage.setItem(WATCH_KEY, JSON.stringify(items.slice(0, WATCH_MAX))); } catch (_) {} }
function addWatch(item) {
  if (!item || !item.key || !item.broker || !item.ticker) return;
  const rows = watchItems();
  if (!rows.some(x => x.ticker === item.ticker && x.broker === item.broker)) {
    if (rows.length >= WATCH_MAX) { alert(`İzleme listesi en fazla ${WATCH_MAX} sembol içerebilir.`); return; }
    rows.push({ key: item.key, ticker: item.ticker, broker: item.broker }); saveWatch(rows);
  }
  if (openPanel === 'watchlist') renderWatchlist();
}
function markWatchlist() {
  document.querySelectorAll('.watch-row').forEach(row => row.classList.toggle('active', row.dataset.ticker === st.ticker && row.dataset.broker === st.broker));
}
function renderWatchlist() {
  const d = $('dock'), rows = watchItems();
  d.innerHTML = '';
  const head = document.createElement('div'); head.className = 'watch-head';
  const title = document.createElement('strong'); title.textContent = 'İzleme listesi';
  const buttons = document.createElement('span');
  const current = document.createElement('button'); current.textContent = '+ Grafik'; current.title = 'Açık grafiği ekle';
  current.onclick = () => addWatch({ key: st.key, ticker: st.ticker, broker: st.broker });
  const search = document.createElement('button'); search.textContent = '+ Ara'; search.title = 'Sembol ara ve ekle'; search.style.marginLeft = '4px';
  search.onclick = () => { if (window.openSymDlg) window.openSymDlg('', addWatch); };
  buttons.append(current, search); head.append(title, buttons); d.appendChild(head);
  const note = document.createElement('div'); note.className = 'watch-note'; note.textContent = 'Son günlük mum · yaklaşık 60 sn aralıkla güncellenir. Kaynağa göre gecikmeli olabilir.'; d.appendChild(note);
  if (!rows.length) { const empty = document.createElement('div'); empty.className = 'watch-empty'; empty.textContent = 'Henüz sembol yok. Açık grafiği ekleyin veya arayın.'; d.appendChild(empty); }
  rows.forEach(item => {
    const row = document.createElement('div'); row.className = 'watch-row'; row.dataset.ticker = item.ticker; row.dataset.broker = item.broker;
    const button = document.createElement('button'); button.className = 'watch-open'; button.title = 'Grafikte aç';
    const identity = document.createElement('span'), name = document.createElement('b'), source = document.createElement('small');
    name.textContent = TradeXMarketName(item.ticker, item.broker);
    source.textContent = ((DATA.brokers.find(b => b.id === item.broker) || {}).name || TradeXMarketSource(item.ticker, item.broker));
    identity.append(name, source);
    const price = document.createElement('span'); price.className = 'watch-price';
    const value = document.createElement('b'), change = document.createElement('small');
    const q = watchQuotes.get(item.broker + '\0' + item.ticker);
    value.textContent = q ? q.price : '—'; change.textContent = q ? q.change : '—';
    if (q && q.direction) change.style.color = q.direction > 0 ? 'var(--ok)' : 'var(--bad)';
    price.append(value, change); button.append(identity, price);
    button.onclick = () => {
      const i = inst(item.key), options = i && i.brokers[item.broker];
      if (!options || !options.some(o => o.ticker === item.ticker)) { price.title = 'Sembol veya kaynak artık mevcut değil'; return; }
      Object.assign(st, { key: item.key, broker: item.broker, ticker: item.ticker }); push();
    };
    const remove = document.createElement('button'); remove.className = 'watch-remove'; remove.textContent = '×'; remove.title = 'Listeden çıkar'; remove.setAttribute('aria-label', `${name.textContent} listeden çıkar`);
    remove.onclick = () => { saveWatch(watchItems().filter(x => x.ticker !== item.ticker || x.broker !== item.broker)); watchQuotes.delete(item.broker + '\0' + item.ticker); renderWatchlist(); };
    row.append(button, remove); d.appendChild(row);
  });
  markWatchlist(); refreshWatchlist();
}
async function refreshWatchlist() {
  const seq = ++watchSeq;
  for (const item of watchItems()) {
    if (seq !== watchSeq || openPanel !== 'watchlist') return;
    const id = item.broker + '\0' + item.ticker;
    try {
      const query = new URLSearchParams({ symbol: item.ticker, source: item.broker, tf: 'D1', limit: '2' });
      const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 12000);
      let response;
      try { response = await fetch('/api/bars?' + query, { signal: abort.signal }); } finally { clearTimeout(timer); }
      const bars = await response.json();
      const number = value => value === null || value === undefined || value === '' ? NaN : Number(value);
      if (!response.ok || !Array.isArray(bars) || !bars.length || !Number.isFinite(number(bars[bars.length - 1].close))) throw new Error('no data');
      const close = number(bars[bars.length - 1].close), prev = bars.length > 1 ? number(bars[bars.length - 2].close) : NaN;
      const pct = Number.isFinite(prev) && prev !== 0 ? (close / prev - 1) * 100 : NaN;
      watchQuotes.set(id, { price: close.toLocaleString(undefined, { maximumFractionDigits: 8 }), change: Number.isFinite(pct) ? `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%` : '—', direction: Math.sign(pct) || 0 });
    } catch (_) { watchQuotes.delete(id); }
    if (seq !== watchSeq || openPanel !== 'watchlist') return;
    const row = [...document.querySelectorAll('.watch-row')].find(r => r.dataset.ticker === item.ticker && r.dataset.broker === item.broker);
    if (row) {
      const q = watchQuotes.get(id), b = row.querySelector('.watch-price b'), small = row.querySelector('.watch-price small');
      b.textContent = q ? q.price : '—'; small.textContent = q ? q.change : '—';
      small.style.color = q && q.direction ? (q.direction > 0 ? 'var(--ok)' : 'var(--bad)') : '';
      row.querySelector('.watch-price').title = q ? '' : 'Veri alınamadı';
    }
  }
}
setInterval(() => { if (openPanel === 'watchlist') refreshWatchlist(); }, 60000);
