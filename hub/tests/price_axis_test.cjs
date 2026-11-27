// Real Vela renderer tick hook + deterministic precision-aware price/grid levels.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const {JSDOM}=require('../../build/node_modules/jsdom');
(async()=>{
  const dom=new JSDOM('<!doctype html><body></body>',{url:'https://test.local/vela.html',runScripts:'outside-only'}),w=dom.window;
  w.eval(fs.readFileSync('hub/price_display.js','utf8'));
  const display=w.TradeXPriceDisplay.create(()=>symbols);
  const symbols=[{ticker:'BTC',digits:2},{ticker:'FX',digits:5},{ticker:'SMALL',digits:9},{ticker:'WHOLE',digits:0},{ticker:'LIVE'}];
  const {LocaleState}=await import(pathToFileURL(require.resolve('../../build/node_modules/@luxalgo/vela/dist/chunk-O6L27KRB.js')).href);
  const {NativeRenderer,RendererControl}=await import(pathToFileURL(require.resolve('../../build/node_modules/@luxalgo/vela/dist/chunk-BDVUH2Y7.js')).href);
  function chart(symbol) {
    const r=new NativeRenderer(), t=new LocaleState({locale:'tr'}), handlers={};
    return {market:{symbol:'lab:'+symbol},i18n:t,renderer:new RendererControl(r),raw:r,setLocale:o=>t.update(o),on:(name,cb)=>handlers[name]=cb,emit:name=>handlers[name]?.()};
  }
  const a=chart('BTC'),b=chart('FX');display.install(a);display.install(b);
  assert.ok(a.renderer.supports('priceAxisTicks'));const hook=a.renderer.get('priceAxisTicks');assert.equal(typeof hook,'function');
  const ctx=(lo,hi,opts={})=>({pane:{id:'price',kind:'price'},min:lo,max:hi,height:400,mode:'price',log:false,fontSize:12,defaults:[],priceToY:p=>400*(hi-p)/(hi-lo),...opts});
  const assertTicks=(ticks,lo,hi,decimals)=>{
    assert.ok(ticks.length>0,'should produce visible levels');assert.ok(ticks.length<=17,'density remains bounded');const labels=new Set();
    for(let i=0;i<ticks.length;i++){
      const {price,label}=ticks[i];assert.ok(price>=lo && price<=hi);if(i)assert.ok(price>ticks[i-1].price,'levels strictly increasing');
      assert.ok(!labels.has(label),'labels are unique');labels.add(label);assert.equal((label.split(',')[1]||'').length,decimals);
      assert.equal(Number(price.toFixed(decimals)),price,'grid position equals its displayed level');
    }
  };
  let ticks=hook(ctx(100,100.2));assertTicks(ticks,100,100.2,2);assert.ok(ticks.every(t=>t.price===Number(t.price.toFixed(2))));
  ticks=b.renderer.get('priceAxisTicks')(ctx(1.2344,1.2347));assertTicks(ticks,1.2344,1.2347,5);
  a.market.symbol='lab:SMALL';a.emit('market:changed');ticks=hook(ctx(0.0000123,0.0000132));assertTicks(ticks,0.0000123,0.0000132,7);
  a.market.symbol='lab:WHOLE';a.emit('market:changed');ticks=hook(ctx(-10,10));assertTicks(ticks,-10,10,0);assert.ok(!ticks.some(x=>x.label==='-0'));
  assert.equal(hook(ctx(1,2,{pane:{id:'study',kind:'study'}})),null);assert.equal(hook(ctx(1,2,{mode:'percent'})),null);assert.equal(hook(ctx(1,2,{mode:'indexed'})),null);
  a.market.symbol='lab:UNKNOWN';ticks=hook(ctx(0.0000123,0.0000132));assertTicks(ticks,0.0000123,0.0000132,7);
  ticks=hook(ctx(100,120));assertTicks(ticks,100,120,1);
  a.market.symbol='lab:SMALL';assert.deepEqual(Array.from(hook(ctx(0.000000011,0.000000019))),[],'an unrepresentably narrow range has no false gridlines');
  ticks=hook(ctx(0.000001,0.001,{log:true,defaults:[{price:0.000001},{price:0.000002},{price:0.000005},{price:0.00001},{price:0.00002},{price:0.00005},{price:0.0001},{price:0.0002},{price:0.0005},{price:0.001}],priceToY:p=>400*(Math.log(0.001)-Math.log(p))/Math.log(1000)}));assertTicks(ticks,0.000001,0.001,7);
  // Vela memoizes the tick list. A new inferred precision must invalidate even
  // when the visible range is unchanged, without repainting unrelated cells.
  const live=chart('LIVE');display.install(live);const pane={id:'price',kind:'price',bounds:{height:400},scale:{min:1.234,max:1.24,log:false,invert:false},percentBaseline:0};
  const scene={scaleMode:'price',style:{fontSize:12},format:live.i18n.format,priceMintick:undefined};
  const coords={priceToY:(p,s,b)=>b.height*(s.max-p)/(s.max-s.min)};
  const source=live.raw.priceAxisTicks,workspace={cells:()=>[{chart:live},{chart:b}]};
  const prev=source.ticksFor(scene,pane,coords);assert.strictEqual(source.ticksFor(scene,pane,coords),prev,'Vela caches axis labels');
  assert.equal(display.observe('LIVE',[{close:1.23456}],true),true);display.refresh(workspace,'LIVE');
  const next=source.ticksFor(scene,pane,coords);assert.notStrictEqual(next,prev);assertTicks(next,1.234,1.24,5);
  assert.equal(b.renderer.get('priceAxisTicks')===hook,false,'other cell has its own hook');
  assert.equal(display.observe('LIVE',[{close:1.23456}]),false,'unchanged precision avoids unnecessary refresh');
  live.market.symbol='lab:BTC';live.emit('market:changed');assertTicks(source.ticksFor(scene,pane,coords),1.234,1.24,2);
  const html=fs.readFileSync('hub/vela.html','utf8');assert.match(html,/priceDisplay\.observe\(ticker, out, true\)\) priceDisplay\.refresh\(ws, ticker\)/);assert.match(html,/priceDisplay\.observe\(ticker, \[bar\]\)\) priceDisplay\.refresh\(ws, ticker\)/);
  dom.window.close();console.log('Price axis tests passed');
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
