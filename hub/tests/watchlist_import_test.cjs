// Watchlist bulk import: parser/resolver, persistence and real DOM controls.
const assert=require('node:assert/strict'), fs=require('node:fs');
const {JSDOM}=require('../../build/node_modules/jsdom');
const delay=()=>new Promise(r=>setTimeout(r,25));
(async()=>{
  const dom=new JSDOM('<!doctype html><body><div id="dock"></div></body>',{url:'https://test.local/hub.html',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document;
  w.eval(fs.readFileSync('hub/market_display.js','utf8'));
  w.eval(fs.readFileSync('hub/watchlist_import.js','utf8'));
  w.eval(fs.readFileSync('hub/watchlist_live.js','utf8'));
  const lib=w.TradeXWatchlistImport;
  const data={brokers:[{id:'bist',short:'BIS',name:'BIST'},{id:'binance',name:'Binance'},{id:'bybit',name:'Bybit'}],instruments:[
    {key:'THYAO',brokers:{bist:[{ticker:'BIST_THYAO',label:''}]}},
    {key:'GARAN',brokers:{bist:[{ticker:'BIST_GARAN',label:''}]}},
    {key:'BTCUSD',brokers:{binance:[{ticker:'BINF_BTCUSDT',label:'perpetual'},{ticker:'BTCUSD',label:'spot'}],bybit:[{ticker:'BYBIT_BTCUSDT',label:'perpetual'},{ticker:'BYBIT_S_BTCUSDT',label:'spot'}]}},
  ]};
  const obj=x=>JSON.parse(JSON.stringify(x));
  assert.deepEqual(obj(lib.parse('\uFEFFsymbol\r\n"BIST:THYAO", "BIST:GARAN";BIST_THYAO','file.csv')),['BIST:THYAO','BIST:GARAN','BIST_THYAO']);
  assert.deepEqual(obj(lib.parse('["BIST:THYAO",{"key":"GARAN","broker":"bist","ticker":"BIST_GARAN"}]','x.json')),['BIST:THYAO',{key:'GARAN',broker:'bist',ticker:'BIST_GARAN'}]);
  assert.throws(()=>lib.parse('"unterminated','x.csv'),/tırnak/);assert.throws(()=>lib.parse('{bad','x.json'),/JSON/);
  assert.throws(()=>lib.parse('{}','x.json'),/JSON/);assert.throws(()=>lib.parse('x'.repeat(lib.MAX_BYTES+1),'x.txt'),/1 MB/);
  assert.throws(()=>lib.parse(Array(5002).fill('X').join(','),'x.csv'),/5000/);
  const resolver=lib.create(data,{broker:'bist',ticker:'BIST_THYAO'},w.TradeXMarketName);
  assert.equal(resolver.resolve('bist:thyao').item.ticker,'BIST_THYAO');
  assert.equal(resolver.resolve('BIS:GARAN').item.ticker,'BIST_GARAN');
  assert.equal(resolver.resolve('BINANCE:BTCUSD').item.ticker,'BTCUSD','qualified raw spot must not map to futures');
  assert.equal(resolver.resolve('BINANCE:BINF_BTCUSDT').item.ticker,'BINF_BTCUSDT');
  assert.match(resolver.resolve('BINANCE:BTCUSDT').error,/birden fazla/);
  assert.match(resolver.resolve('BTCUSD').error,/birden fazla/);
  assert.match(resolver.resolve('FOO:THYAO').error,/geçersiz/);
  assert.match(resolver.resolve('UNKNOWN').error,/bulunamadı/);
  assert.match(resolver.resolve({key:'THYAO',broker:'binance',ticker:'BIST_THYAO'}).error,/bulunamadı/);
  let result=lib.merge(['THYAO','BIST:THYAO','BIST:GARAN','UNKNOWN'],[],resolver,1);
  assert.equal(result.added,1);assert.equal(result.duplicates,1);assert.equal(result.overflow,1);assert.equal(result.errors.length,1);
  // The full 500-symbol limit is retained by watchItems and persisted to localStorage.
  w.DATA=data;w.st={broker:'bist',ticker:'BIST_THYAO',key:'THYAO'};w.openPanel='watchlist';w.$=id=>d.getElementById(id);
  w.inst=k=>data.instruments.find(x=>x.key===k);w.push=()=>{};w.alert=()=>{};w.fetch=async()=>({ok:true,json:async()=>[{time:1,close:10},{time:2,close:11}]});
  w.eval(fs.readFileSync('hub/watchlist.js','utf8')+'\nwindow.__watch={renderWatchlist,watchItems,importWatchSymbols,refreshWatchlist,stopWatchlistLive};');
  w.__watch.renderWatchlist();
  let section=d.querySelector('.watch-import');section.open=true;
  let textarea=section.querySelector('textarea');textarea.value='BIST:THYAO, BIST:GARAN, unknown, BIST:THYAO';textarea.dispatchEvent(new w.Event('input'));
  [...section.querySelectorAll('button')].find(b=>b.textContent==='Listeye ekle').click();
  assert.equal(w.__watch.watchItems().length,2);assert.match(d.querySelector('.watch-result').textContent,/2 sembol eklendi/);
  assert.match(d.querySelector('.watch-result').textContent,/unknown — bulunamadı/i);assert.match(d.querySelector('.watch-result').textContent,/1 tekrar/);
  assert.match(d.querySelector('textarea').value,/unknown/,'failed input remains for correction');
  section=d.querySelector('.watch-import');let input=section.querySelector('input[type=file]');
  let release;const read=new Promise(r=>release=r);Object.defineProperty(input,'files',{configurable:true,value:[{name:'list.json',size:80,text:()=>read}]});
  input.dispatchEvent(new w.Event('change'));assert.ok([...section.querySelectorAll('button')].every(x=>x.disabled));
  release('["BINANCE:BINF_BTCUSDT", "BIST:GARAN"]');await delay();
  assert.equal(w.__watch.watchItems().length,3);assert.match(d.querySelector('.watch-result').textContent,/1 sembol eklendi/);
  input=d.querySelector('.watch-import input[type=file]');Object.defineProperty(input,'files',{configurable:true,value:[{name:'broken.json',size:9,text:async()=>'{bad'}]});input.dispatchEvent(new w.Event('change'));await delay();
  assert.match(d.querySelector('.watch-result').textContent,/JSON dosyası okunamadı/);assert.equal(w.__watch.watchItems().length,3);
  input=d.querySelector('.watch-import input[type=file]');Object.defineProperty(input,'files',{configurable:true,value:[{name:'huge.txt',size:lib.MAX_BYTES+1,text:async()=>{throw Error('must not read');}}]});input.dispatchEvent(new w.Event('change'));await delay();assert.match(d.querySelector('.watch-result').textContent,/1 MB/);
  const save=w.Storage.prototype.setItem;w.Storage.prototype.setItem=function(k,v){if(k==='chartHubWatchlist')throw Error('quota');return save.call(this,k,v);};
  section=d.querySelector('.watch-import');textarea=section.querySelector('textarea');textarea.value='BYBIT:BYBIT_S_BTCUSDT';textarea.dispatchEvent(new w.Event('input'));section.querySelector('button').click();
  assert.match(d.querySelector('.watch-result').textContent,/kaydedilemedi/);assert.equal(w.__watch.watchItems().length,3);w.Storage.prototype.setItem=save;
  const many=Array.from({length:500},(_,i)=>({key:'k'+i,broker:'bist',ticker:'BIST_'+i}));w.localStorage.setItem('chartHubWatchlist',JSON.stringify(many));assert.equal(w.__watch.watchItems().length,500);
  w.__watch.renderWatchlist();assert.equal(d.querySelectorAll('.watch-row').length,500); w.openPanel='settings'; w.__watch.stopWatchlistLive(); await delay(); w.openPanel='watchlist';
  let requests=[];w.fetch=async url=>{requests.push(new URL(url,w.location.href).searchParams.get('symbol'));return {ok:true,json:async()=>[{time:1,close:10}]};};
  d.getElementById('dock').getBoundingClientRect=()=>({top:0,bottom:200,height:200});
  [...d.querySelectorAll('.watch-row')].forEach((row,i)=>row.getBoundingClientRect=()=>i===100||i===101?{top:20,bottom:40}:{top:1000,bottom:1020});
  await w.__watch.refreshWatchlist();assert.deepEqual(requests,['BIST_100','BIST_101'],'quotes are requested only for visible rows');
  w.openPanel='settings'; w.__watch.stopWatchlistLive(); await delay(); dom.window.close();console.log('Watchlist import tests passed');
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
