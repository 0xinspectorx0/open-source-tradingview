// Watchlist live price, daily change and transport/lifecycle, no external feeds.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('../../build/node_modules/jsdom');
const tick=()=>new Promise(r=>setTimeout(r,20));
(async()=>{
  const dom=new JSDOM('<!doctype html><body><div id="dock"></div></body>',{url:'https://app.example/hub.html',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,d=w.document;w.eval(fs.readFileSync('hub/watchlist_live.js','utf8'));const lib=w.TradeXWatchlistLive;
  const q=lib.state();assert.equal(lib.bar(q,{time:2,close:110},1000,100),true);
  assert.equal(lib.history(q,[{time:1,close:100},{time:2,close:105}],200),true);
  assert.equal(q.prev,100);assert.equal(q.last,110,'a delayed history response never overwrites a live tick');
  assert.equal(lib.bar(q,{time:2,close:99},900,210),false,'out-of-order trade ignored');
  assert.equal(lib.bar(q,{time:3,close:120},1100,220),true);assert.equal(q.prev,110);
  lib.history(q,[{time:2,close:111},{time:3,close:115}],230);assert.equal(q.prev,111);assert.equal(q.last,120);
  lib.history(q,[{time:2,close:111},{time:3,close:118}],240,200);assert.equal(q.last,120,'fallback request started before tick must not regress it');
  lib.history(q,[{time:2,close:111},{time:3,close:119}],250,230);assert.equal(q.last,119,'fallback refresh updates after disconnect');
  assert.equal(lib.bar(q,{time:2,close:5},0,300),false);assert.equal(lib.bar(q,{time:3,close:null},0,300),false);
  // One same-origin EventSource for all desktop streams, correct routing and teardown.
  const all=[],events=[];class ES{constructor(url){this.url=url;all.push(this);}close(){this.closed=true;}emit(m){this.onmessage({data:JSON.stringify(m)});}}
  const mgr=lib.create({web:false,EventSourceClass:ES,onBar:(i,b)=>events.push(['bar',i.ticker,b.close]),onHistory:(i,b)=>events.push(['history',i.ticker,b.length]),onStatus:(i,s)=>events.push(['status',i.ticker,s])});
  const items=[{broker:'binance',ticker:'BTCUSD'},{broker:'bybit',ticker:'BYBIT_ETHUSDT'},{broker:'bist',ticker:'BIST_THYAO'}];
  mgr.setTargets(items);assert.equal(all.length,1);assert.match(all[0].url,/^\/api\/watchlist\/stream\?/);
  const parsed=JSON.parse(new URL(all[0].url,w.location.href).searchParams.get('symbols'));assert.equal(parsed.length,2);assert.ok(events.some(e=>e[1]==='BIST_THYAO'&&/gecikmeli/.test(e[2])));
  all[0].emit({type:'bar',source:'binance',symbol:'BTCUSD',bar:{time:2,close:7}});assert.deepEqual(events.at(-1),['bar','BTCUSD',7]);
  all[0].emit({type:'history',source:'bybit',symbol:'BYBIT_ETHUSDT',bars:[{},{}]});assert.deepEqual(events.at(-1),['history','BYBIT_ETHUSDT',2]);
  mgr.setTargets(items);assert.equal(all.length,1,'same visible set does not reconnect');
  mgr.setTargets(items.slice(1));assert.equal(all[0].closed,true);const count=events.length;all[0].emit({type:'bar',source:'binance',symbol:'BTCUSD',bar:{time:2,close:9}});assert.equal(events.length,count,'stopped stream cannot update');
  all[1].onerror();assert.ok(events.some(e=>/yeniden/.test(e[2])));mgr.close();assert.equal(all[1].closed,true);
  const many=Array.from({length:24},(_,i)=>({broker:'binance',ticker:'COIN'+i}));mgr.setTargets(many);
  assert.equal(JSON.parse(new URL(all.at(-1).url,w.location.href).searchParams.get('symbols')).length,20);
  assert.ok(events.some(e=>e[1]==='COIN20'&&/sınırı/.test(e[2])));mgr.close();
  // Actual watchlist UI with independent in-browser live feed and late D1 response.
  const feedEvents=new Map(),stops=[];const feed={live(symbol,tf,onBar,onStatus){assert.equal(tf,'D1');feedEvents.set(symbol,{onBar,onStatus});return ()=>stops.push(symbol);}};
  w.TRADEX_WEB=true;w.TXWebFeeds={feeds:{binance:feed,bybit:feed}};w.DATA={brokers:[{id:'binance',name:'Binance'},{id:'bybit',name:'Bybit'},{id:'bist',name:'BIST'}],instruments:[]};
  w.st={broker:'binance',ticker:'BTCUSD',key:'BTC'};w.openPanel='watchlist';w.$=id=>d.getElementById(id);w.inst=()=>null;w.push=()=>{};w.alert=()=>{};
  w.TradeXMarketName=t=>t;w.TradeXMarketSource=(t,s)=>s;w.TradeXWatchlistImport={};
  w.localStorage.setItem('chartHubWatchlist',JSON.stringify([{key:'BTC',broker:'binance',ticker:'BTCUSD'},{key:'ETH',broker:'bybit',ticker:'BYBIT_ETHUSDT'},{key:'THYAO',broker:'bist',ticker:'BIST_THYAO'}]));
  const waiters=new Map();w.fetch=(url,{signal})=>new Promise((resolve,reject)=>{const sym=new URL(url,w.location.href).searchParams.get('symbol');waiters.set(sym,resolve);signal.addEventListener('abort',()=>reject(Error('aborted')));});
  w.eval(fs.readFileSync('hub/watchlist.js','utf8')+'\nwindow.__watch={renderWatchlist,refreshWatchlist,stopWatchlistLive};');
  w.__watch.renderWatchlist();assert.ok(feedEvents.has('BTCUSD'));assert.ok(feedEvents.has('BYBIT_ETHUSDT'));assert.ok(!feedEvents.has('BIST_THYAO'));
  let row=d.querySelector('[data-ticker="BTCUSD"]');feedEvents.get('BTCUSD').onBar({time:2,close:110},1000);assert.equal(row.querySelector('.watch-price b').textContent,'110');assert.equal(row.querySelector('.watch-price small').textContent,'—');
  waiters.get('BTCUSD')({ok:true,json:async()=>[{time:1,close:100},{time:2,close:105}]});await tick();
  assert.equal(row.querySelector('.watch-price b').textContent,'110');assert.equal(row.querySelector('.watch-price small').textContent,'+10.00%');
  feedEvents.get('BTCUSD').onBar({time:2,close:90},1100);assert.equal(row.querySelector('.watch-price small').textContent,'-10.00%');assert.equal(row.querySelector('.watch-price small').style.color,'var(--bad)');
  feedEvents.get('BTCUSD').onStatus('disconnected');assert.match(row.querySelector('.watch-state').textContent,/yeniden/);
  waiters.get('BIST_THYAO')({ok:true,json:async()=>[{time:1,close:20},{time:2,close:21}]});await tick();assert.match(d.querySelector('[data-ticker="BIST_THYAO"] .watch-state').textContent,/gecikmeli/);
  feedEvents.get('BTCUSD').onBar({time:2,close:0.000123456789},1200);assert.equal(row.querySelector('.watch-price b').textContent,'0.0001235','watchlist price is capped at seven decimals');
  const old=feedEvents.get('BTCUSD').onBar;w.__watch.stopWatchlistLive();assert.ok(stops.includes('BTCUSD'));old({time:2,close:999},1300);assert.equal(row.querySelector('.watch-price b').textContent,'0.0001235');
  await tick(); dom.window.close();console.log('Watchlist live tests passed');
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
