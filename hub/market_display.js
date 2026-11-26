// Display-only names. Never alter tickers sent to providers or saved layouts.
(function () {
  const names = { binance: 'Binance', bybit: 'Bybit', deriv: 'Deriv', coinbase: 'Coinbase', kraken: 'Kraken', okx: 'OKX', bist: 'BIST / Yahoo', tradingview: 'TradingView', mt5: 'MT5', arm: 'Remote MT5' };
  const prefixes = { binance: ['BINF_'], bybit: ['BYBIT_S_', 'BYBIT_I_', 'BYBIT_'], deriv: ['frx', 'cry'], coinbase: ['CB_'], kraken: ['KRK_'], okx: ['OKX_'], bist: ['BIST_'], tradingview: ['TV_'] };
  function lookup(ticker) { return (window.LabSymbols || []).find(s => s.ticker === ticker); }
  window.TradeXMarketName = (ticker, source) => {
    const raw = String(ticker || '').replace(/^lab:/i, ''), item = lookup(raw), id = source || (item && item.source);
    const prefix = (prefixes[id] || []).find(p => raw.startsWith(p));
    return prefix ? raw.slice(prefix.length) : raw;
  };
  window.TradeXMarketSource = (ticker, source) => {
    const item = lookup(String(ticker || '').replace(/^lab:/i, '')), id = source || (item && item.source);
    return names[id] || (id ? String(id).toUpperCase() : '');
  };
})();
