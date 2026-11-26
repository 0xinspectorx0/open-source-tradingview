// Offline shell integration test: cd build && npm ci; node ../hub/tests/market_ui_harness.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, ResourceLoader, VirtualConsole } = require('../../build/node_modules/jsdom');
const root = path.resolve(__dirname, '..');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const data = {
  brokers: [{id:'deriv', name:'Deriv'}, {id:'bybit', name:'Bybit'}, {id:'binance', name:'Binance'}],
  cats: [{id:'crypto', name:'Crypto'}, {id:'commodity', name:'Commodities'}],
  instruments: [
    {key:'XAUUSD', name:'Gold', cat:'commodity', brokers:{deriv:[{ticker:'frxXAUUSD',label:''}], bybit:[{ticker:'BYBIT_XAUUSDT',label:''}]}},
    {key:'BTCUSD', name:'Bitcoin', cat:'crypto', brokers:{bybit:[{ticker:'BYBIT_BTCUSDT',label:'perpetual'}]}},
  ],
};
class Loader extends ResourceLoader {
  fetch(url) {
    const name = new URL(url).pathname.slice(1);
    const done = buffer => { const p = Promise.resolve(buffer); p.abort = () => {}; return p; };
    if (name.endsWith('.html')) return done(Buffer.from('<!doctype html><html></html>'));
    const file = path.resolve(root, name);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return null;
    return done(fs.readFileSync(file));
  }
}
async function mount(mobile = false, oldState = null) {
  const errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', e => errors.push(e));
  const dom = new JSDOM(fs.readFileSync(path.join(root,'hub.html'), 'utf8'), {
    url:'http://tradex.test/hub.html', runScripts:'dangerously', resources:new Loader(), pretendToBeVisual:true, virtualConsole,
    beforeParse(w) {
      w.matchMedia = () => ({matches:!mobile}); w.alert = () => {}; w.focus = () => {}; w.Element.prototype.scrollIntoView = () => {};
      if (oldState) w.localStorage.setItem('chartHub', JSON.stringify(oldState));
      w.fetch = async input => {
        const u = new URL(input, w.location.href), p = u.pathname;
        if (p === '/api/instruments') return {ok:true, json:async()=>data};
        if (p === '/api/instruments/search') {
          const q=(u.searchParams.get('q')||'').toUpperCase();
          const results=data.instruments.filter(i=>!q || i.key.includes(q) || i.name.toUpperCase().includes(q));
          return {ok:true,json:async()=>({total:results.length,results})};
        }
        if (p === '/api/status') return {ok:true,json:async()=>({})};
        if (p === '/api/logs') return {ok:true,json:async()=>({problems:{},errors_15m:0,boot:1})};
        if (p === '/api/bars') return {ok:true,json:async()=>[{close:100},{close:105}]};
        if (p.startsWith('/api/layouts')) return {ok:true,json:async()=>({layouts:[], templates:[]})};
        return {ok:true,json:async()=>({})};
      };
    },
  });
  await delay(150);
  return {dom, w:dom.window, d:dom.window.document, errors};
}
(async()=>{
  let {dom,w,d,errors} = await mount(false, {engine:'klinechart',key:'XAUUSD',broker:'deriv',ticker:'frxXAUUSD',tf:'W1'});
  assert.equal(d.querySelector('#status'), null);
  assert.equal(d.querySelector('#engines'), null);
  assert.match(d.querySelector('#frame').src, /vela\.html\?.*tf=W1/);
  assert.equal(d.querySelector('#tfs [data-id="MN1"]').textContent, 'A');
  d.querySelector('#tfs [data-id="MN1"]').click();
  assert.equal(JSON.parse(w.localStorage.getItem('chartHub')).engine, 'vela');
  assert.equal(JSON.parse(w.localStorage.getItem('chartHub')).tf, 'MN1');
  assert.equal(d.querySelector('#symKey').textContent,'XAUUSD');
  assert.equal(d.querySelector('#brokers'),null);
  assert.equal(d.querySelector('#ticker'),null);
  w.LabSymbols = [{ticker:'BYBIT_S_BTCUSDT',source:'bybit'}, {ticker:'BINF_BTCUSDT',source:'binance'}];
  assert.equal(w.TradeXMarketName('BYBIT_S_BTCUSDT'),'BTCUSDT');
  assert.equal(w.TradeXMarketSource('BYBIT_S_BTCUSDT'),'Bybit');
  assert.equal(w.TradeXMarketName('BINF_BTCUSDT'),'BTCUSDT');
  assert.equal(w.TradeXMarketSource('BINF_BTCUSDT'),'Binance');
  assert.equal(w.HubSettingsLoad().candleStyle.borderVisible,true);
  assert.equal(w.HubSettingsLoad().candleStyle.bodyUpOpacity,100);
  assert.equal(w.HubCandleColor('#123456',0),'#12345600');
  assert.equal(w.HubCandleColor('#123456',50),'#12345680');
  assert.equal(w.HubCandleColor('#123456',100),'#123456');
  // Source switching still works from symbol search after removing the top-bar broker buttons.
  d.querySelector('#symBtn').click(); await delay(30);
  d.querySelector('.sy-row[data-k="XAUUSD"] .sy-tag[data-b="bybit"]').click();
  assert.equal(JSON.parse(w.localStorage.getItem('chartHub')).broker,'bybit');
  d.querySelector('#symBtn').click(); await delay(30);
  d.querySelector('.sy-row[data-k="XAUUSD"] .sy-tag[data-b="deriv"]').click();
  assert.equal(JSON.parse(w.localStorage.getItem('chartHub')).broker,'deriv');
  assert.equal(d.querySelector('#dock').hidden,false);
  d.querySelector('[title="Açık grafiği ekle"]').click(); await delay(30);
  assert.equal(d.querySelectorAll('.watch-row').length,1);
  assert.match(d.querySelector('.watch-row').textContent,/105/);
  assert.match(d.querySelector('.watch-row').textContent,/\+5\.00%/);
  d.querySelector('[title="Sembol ara ve ekle"]').click(); await delay(30);
  const inp=d.querySelector('#symDlg input'); inp.value='BTC'; inp.dispatchEvent(new w.Event('input')); await delay(120);
  assert.equal(d.querySelectorAll('.sy-row').length,1);
  d.querySelector('.sy-row').click(); await delay(30);
  assert.equal(d.querySelectorAll('.watch-row').length,2);
  d.querySelectorAll('.watch-open')[1].click();
  assert.equal(d.querySelector('#symKey').textContent,'BTCUSDT');
  assert.equal(JSON.parse(w.localStorage.getItem('chartHub')).ticker,'BYBIT_BTCUSDT');
  d.querySelector('[data-panel="settings"]').click();
  const section = title => [...d.querySelectorAll('#dock details.set')].find(x => x.querySelector('summary').textContent === title);
  const toggle = title => section(title).querySelector('summary').click();
  assert.equal(d.querySelectorAll('#dock details.set[open]').length,0, 'settings start collapsed');
  toggle('Tema'); assert.equal(section('Tema').open,true);
  toggle('Mum gövdesi'); assert.equal(section('Tema').open,false); assert.equal(section('Mum gövdesi').open,true);
  toggle('Mum gövdesi'); assert.equal(d.querySelectorAll('#dock details.set[open]').length,0);
  toggle('Mum gövdesi');
  const labels = [...d.querySelectorAll('#dock label')];
  const wick = labels.find(x=>x.textContent.includes('Fitil kalınlığı')).querySelector('select');
  wick.value='3'; wick.dispatchEvent(new w.Event('change'));
  const color = labels.find(x=>x.textContent.includes('Yükseliş fitili')).querySelector('input');
  color.value='#123456'; color.dispatchEvent(new w.Event('input'));
  toggle('Mum renk opaklığı');
  assert.equal(section('Mum gövdesi').open,false);
  const opacity = d.querySelector('[aria-label="Yükseliş gövdesi opaklığı"]');
  assert.equal(opacity.value,'100'); opacity.value='0'; opacity.dispatchEvent(new w.Event('input'));
  assert.equal(opacity.parentElement.querySelector('output').textContent,'0%');
  const wickOpacity = d.querySelector('[aria-label="Düşüş fitili opaklığı"]');
  wickOpacity.value='45'; wickOpacity.dispatchEvent(new w.Event('input'));
  const saved=JSON.parse(w.localStorage.getItem('chartHubTheme'));
  assert.equal(saved.candleStyle.wickWidth,3); assert.equal(saved.candleStyle.wickUp,'#123456');
  assert.equal(saved.candleStyle.bodyUpOpacity,0); assert.equal(saved.candleStyle.wickDownOpacity,45);
  d.querySelector('[data-panel="watchlist"]').click();
  d.querySelector('.watch-remove').click();
  assert.equal(JSON.parse(w.localStorage.getItem('chartHubWatchlist')).length,1);
  d.querySelector('[data-panel="settings"]').click(); await delay(30);
  assert.equal(d.querySelectorAll('#dock details.set[open]').length,0);
  toggle('Mum renk opaklığı');
  assert.equal(d.querySelector('[aria-label="Yükseliş gövdesi opaklığı"]').value,'0');
  assert.equal(d.querySelector('[aria-label="Düşüş fitili opaklığı"]').value,'45');
  toggle('Mum gövdesi');
  [...d.querySelectorAll('#dock button')].find(x => x.textContent === 'Mum ayarlarını sıfırla').click();
  assert.equal(section('Mum gövdesi').open,true, 'active section remains open after rerender');
  assert.equal(d.querySelector('[aria-label="Yükseliş gövdesi opaklığı"]').value,'100');
  assert.equal(w.HubSettingsLoad().candleStyle.wickDownOpacity,100);
  toggle('Hakkında');
  assert.match(section('Hakkında').querySelector('a').href,/0xinspectorx0\/open-source-tradingview/);
  assert.equal(d.querySelector('#bar a[href*="github.com"]'),null);
  assert.equal(errors.length,0,errors.map(e=>e.message).join('\n'));
  dom.window.close();
  ({dom,w,d,errors} = await mount(true));
  assert.equal(d.querySelector('#dock').hidden,true);
  d.querySelector('[data-panel="watchlist"]').click(); assert.equal(d.querySelector('#dock').hidden,false);
  assert.equal(errors.length,0,errors.map(e=>e.message).join('\n')); dom.window.close();
  const vm = require('node:vm');
  const bundle = fs.readFileSync(path.join(root,'vela.bundle.js'),'utf8');
  const fn = bundle.match(/function rw\(e\)\{let t=Math\.max\(\.5,Math\.floor\(e\*\.7\)\/2\),w=.*?\}/);
  assert.ok(fn, 'patched Vela wick width function');
  const ctx = {window:{__txWickWidth:3},Math,Number}; vm.createContext(ctx); vm.runInContext(fn[0],ctx);
  assert.equal(ctx.rw(20),3); ctx.window.__txWickWidth=1; assert.equal(ctx.rw(20),1);
  assert.ok(bundle.includes('window.TradeXMarketSource?.(this.txSymbol)'));
  console.log('Market UI tests passed');
})().catch(e=>{console.error(e);process.exitCode=1});
