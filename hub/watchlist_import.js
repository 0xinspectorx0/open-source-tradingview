// Parse and resolve imported symbols against the exact instruments the hub can open.
// Never guess an exchange/contract when there is more than one possible match.
window.TradeXWatchlistImport = (() => {
  const MAX_BYTES = 1024 * 1024, MAX_ENTRIES = 5000;
  const upper = x => String(x).trim().toUpperCase();
  function tokens(text) {
    const result = []; let field = '', quoted = false, endedQuote = false, started = false;
    text = text.replace(/^\uFEFF/, '');
    const finish = () => { const s = field.trim(); if (s) result.push(s); field = ''; started = false; endedQuote = false; };
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) { if (c === '"') { if (text[i+1] === '"') { field += '"'; i++; } else { quoted = false; endedQuote = true; } } else field += c; continue; }
      if (c === ',' || c === ';' || c === '\n' || c === '\r') { finish(); continue; }
      if (c === '"' && !field.trim() && !started) { quoted = true; started = true; continue; }
      if (endedQuote && !/\s/.test(c)) throw new Error('CSV dosyasında tırnak kullanımı geçersiz.');
      if (c === '"') throw new Error('CSV dosyasında tırnak kullanımı geçersiz.');
      field += c; if (!/\s/.test(c)) started = true;
    }
    if (quoted) throw new Error('CSV dosyasında kapanmamış tırnak var.');
    finish();
    if (result.length && ['SYMBOL','SYMBOLS','TICKER','SEMBOL','SEMBOLLER'].includes(upper(result[0]))) result.shift();
    return result;
  }
  function parse(text, filename = '') {
    if (typeof text !== 'string' || new Blob([text]).size > MAX_BYTES) throw new Error('Dosya en fazla 1 MB olabilir.');
    let rows;
    if (/\.json$/i.test(filename)) {
      let obj; try { obj = JSON.parse(text.replace(/^\uFEFF/, '')); } catch (_) { throw new Error('JSON dosyası okunamadı.'); }
      rows = Array.isArray(obj) ? obj : obj && (obj.symbols || obj.watchlist);
      if (!Array.isArray(rows) || !rows.every(x => typeof x === 'string' || (x && typeof x === 'object' && !Array.isArray(x) && typeof x.key === 'string' && typeof x.broker === 'string' && typeof x.ticker === 'string'))) throw new Error('JSON, sembol dizisi veya key/broker/ticker kayıtları içermeli.');
    } else rows = tokens(text);
    if (rows.length > MAX_ENTRIES) throw new Error('Bir seferde en fazla 5000 sembol okunabilir.');
    if (!rows.length) throw new Error('Dosyada veya girişte sembol bulunamadı.');
    return rows;
  }
  function create(data, current, displayName) {
    const raw = new Map(), names = new Map(), keys = new Map(), brokerAliases = new Map();
    const add = (map,k,value) => { if (!k) return; const key = upper(k); if (!map.has(key)) map.set(key,[]); map.get(key).push(value); };
    for (const broker of data.brokers || []) {
      for (const alias of [broker.id, broker.short]) if (alias) brokerAliases.set(upper(alias),broker.id);
    }
    for (const instrument of data.instruments || []) for (const [broker, options] of Object.entries(instrument.brokers || {})) {
      if (!Array.isArray(options)) continue;
      options.forEach((option,i) => {
        if (!option || typeof option.ticker !== 'string') return;
        const item = {key:instrument.key,broker,ticker:option.ticker};
        add(raw,option.ticker,item); add(names,displayName(option.ticker,broker),item);
        // Binance spot uses the legacy internal ticker BTCUSD for exchange BTCUSDT.
        // Index both spot and futures so an unqualified BTCUSDT is not guessed.
        if (broker === 'binance' && option.label === 'spot' && /USD$/i.test(option.ticker)) add(names,option.ticker + 'T',item);
        if (i === 0) add(keys,instrument.key,item);
      });
    }
    const unique = arr => [...new Map(arr.map(x => [x.broker+'\0'+x.ticker,x])).values()];
    function resolve(value) {
      if (typeof value !== 'string') {
        const choices = raw.get(upper(value.ticker)) || [];
        const match = choices.find(x => x.key === value.key && x.broker === value.broker && x.ticker === value.ticker);
        return match ? {item:match} : {error:`${value.broker}:${value.ticker} — kaynak veya sembol bulunamadı`};
      }
      const input = value.trim(); if (!input) return {error:'Boş sembol'};
      let broker = '', code = input;
      if (input.includes(':')) {
        const at = input.indexOf(':'); const source = upper(input.slice(0,at)); code = input.slice(at+1).trim();
        broker = brokerAliases.get(source) || '';
        if (!broker || !code || code.includes(':')) return {error:`${input} — kaynak veya sembol geçersiz`};
      }
      const u = upper(code), filter = list => unique((list || []).filter(x => !broker || x.broker === broker));
      // A source-qualified exact internal ticker is unambiguous; otherwise instrument
      // keys follow the hub's existing choice of first contract per source.
      let matches = broker ? filter(raw.get(u)) : [];
      if (!matches.length) matches = filter(keys.get(u));
      if (!matches.length) matches = filter(raw.get(u));
      if (!matches.length) matches = filter(names.get(u));
      if (!matches.length) return {error:`${input} — bulunamadı`};
      if (!broker && matches.length > 1) {
        const preferred = matches.filter(x => x.broker === current.broker);
        if (preferred.length) matches = preferred;
      }
      if (matches.length > 1 && current.ticker) {
        const exact = matches.filter(x => x.ticker === current.ticker && x.broker === current.broker);
        if (exact.length === 1) matches = exact;
      }
      if (matches.length !== 1) return {error:`${input} — birden fazla eşleşme: ${matches.slice(0,4).map(x => x.broker.toUpperCase()+':'+x.ticker).join(', ')}${matches.length > 4 ? '…' : ''}`};
      return {item:matches[0]};
    }
    return {resolve};
  }
  function merge(entries, existing, resolver, max) {
    const rows = existing.slice(), seen = new Set(rows.map(x => x.broker+'\0'+x.ticker));
    let added = 0, duplicates = 0, overflow = 0; const errors = [];
    for (const entry of entries) {
      const result = resolver.resolve(entry);
      if (!result.item) { errors.push(result.error); continue; }
      const item = result.item, id = item.broker+'\0'+item.ticker;
      if (seen.has(id)) { duplicates++; continue; }
      seen.add(id);
      if (rows.length >= max) { overflow++; continue; }
      rows.push(item); added++;
    }
    return {rows,added,duplicates,overflow,errors};
  }
  return {parse,create,merge,MAX_BYTES};
})();
