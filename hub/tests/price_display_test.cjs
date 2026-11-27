// Exercise the actual Vela formatter contract, source precision, fallback and cell isolation.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const {JSDOM}=require('../../build/node_modules/jsdom');
(async()=>{
  const dom=new JSDOM('<!doctype html><body></body>',{url:'https://example.test/vela.html',runScripts:'outside-only'}),w=dom.window;
  w.eval(fs.readFileSync('hub/price_display.js','utf8'));
  const lib=w.TradeXPriceDisplay;
  assert.equal(lib.decimalsOf(1e-8),7);assert.equal(lib.decimalsOf(1.2345),4);assert.equal(lib.decimalsOf(1e3),0);assert.equal(lib.decimalsOf(0),null);
  const symbols=[{ticker:'BTC',digits:2},{ticker:'FOREX',digits:5},{ticker:'SMALL',digits:9},{ticker:'WHOLE',digits:0},{ticker:'INFER'},{ticker:'INVALID',digits:-1}];
  const display=lib.create(()=>symbols);
  const {LocaleState}=await import(pathToFileURL(require.resolve('../../build/node_modules/@luxalgo/vela/dist/chunk-O6L27KRB.js')).href);
  function chart(symbol,locale='tr') {
    const translator=new LocaleState({locale});let installs=0;
    return {market:{symbol:'lab:'+symbol},i18n:translator,setLocale(opts){installs++;translator.update(opts);},get installs(){return installs;}};
  }
  const a=chart('BTC'),b=chart('FOREX');display.install(a);display.install(a);display.install(b);assert.equal(a.installs,1);
  const fmt=(ch,value,surface='lastPrice',decimals=8,mode='price',grouping=false)=>ch.i18n.format.price(value,{surface,decimals,mode,grouping});
  assert.equal(fmt(a,1234.56789),'1234,57');assert.equal(fmt(b,1.23456789),'1,23457');
  assert.equal(fmt(a,1.23456789,'priceAxis',8),'1,2345679');assert.equal(fmt(a,1.23456789,'crosshair',12),'1,2345679');
  assert.equal(fmt(a,1.2,'priceAxis',2),'1,20','existing axis precision below cap preserved');
  assert.equal(fmt(a,1.23456789,'statusLine',8),'1,23456789','other surfaces are untouched');
  const native=new LocaleState({locale:'tr'});assert.equal(fmt(a,1.23456789,'lastPrice',8,'percent'),native.format.price(1.23456789,{surface:'lastPrice',decimals:8,mode:'percent',grouping:false}),'percent mode remains Vela default');
  assert.equal(fmt(a,1234.56789,'lastPrice',8,'price',true),'1.234,57','locale grouping preserved');
  a.market.symbol='lab:SMALL';assert.equal(fmt(a,0.123456789),'0,1234568');
  a.market.symbol='lab:WHOLE';assert.equal(fmt(a,123.4),'123','zero-decimal metadata is supported');
  a.market.symbol='lab:INFER';const source=[{open:1.2,high:1.234,low:1.1,close:1.23}];const before=JSON.stringify(source);
  display.observe('INFER',source,true);assert.equal(JSON.stringify(source),before,'observing bars never modifies feed data');assert.equal(display.precision('lab:INFER'),3);assert.equal(fmt(a,1.2),'1,200');
  display.observe('INFER',[{close:1.23456}]);assert.equal(fmt(a,1.2),'1,20000','live values can reveal additional precision');
  display.observe('INFER',[{close:10.1}],true);assert.equal(fmt(a,10.1),'10,1','new history replaces stale inference');
  a.market.symbol='lab:INVALID';display.observe('INVALID',[{close:0.123456789}]);assert.equal(fmt(a,0.123456789),'0,1234568');
  a.market.symbol='lab:UNKNOWN';assert.equal(fmt(a,1.23456789),'1,2345679','unknown precision uses capped Vela zoom precision');
  assert.equal(fmt(b,1.23456789),'1,23457','changing another cell leaves this cell untouched');
  a.i18n.update({locale:'en'});a.market.symbol='lab:BTC';assert.equal(fmt(a,1.23456),'1.23','format survives a locale-only change');
  a.i18n.update({locale:'ar',numberingSystem:'arab'});assert.equal(fmt(a,1.23456),'١٫٢٣','honors the chart numbering system');
  const html=fs.readFileSync('hub/vela.html','utf8');assert.ok(html.includes('<script src="price_display.js"></script>'));assert.match(html,/priceDisplay\.install\(c\.chart\)/);
  // Run the real page's provider paths and verify the feed bars are not rounded.
  const raw={time:100,open:0.123456789,high:0.234567891,low:0.123456788,close:0.123456789,volume:3};
  w.LabSymbols=[{ticker:'P',group:'crypto'}];w.LabTF={fromAny:()=> 'M1',sec:{M1:60}};
  w.LabFeed={history:async()=>[raw],live:(ticker,tf,cb)=>{w.liveUpdate=cb;return ()=>{};}};
  w.eval('var lastBars=[], ws=null; var priceDisplay=TradeXPriceDisplay.create(()=>LabSymbols); function compareTickers(){return new Set()} function applyTheme(){};'+html.slice(html.indexOf('const provider = {'),html.indexOf('\nlet ws, indicatorSync;'))+'\nwindow.__provider=provider;window.__prices=priceDisplay;');
  const bars=await w.__provider.getBars('P','1',{limit:1});assert.equal(bars[0].close,raw.close);assert.equal(w.__prices.precision('P'),7);
  let live;w.__provider.subscribe('P','1',bar=>live=bar);w.liveUpdate({...raw,close:0.123456781});await new Promise(r=>setTimeout(r,5));assert.equal(live.close,0.123456781);assert.equal(raw.close,0.123456789);
  dom.window.close();console.log('Price display tests passed');
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
