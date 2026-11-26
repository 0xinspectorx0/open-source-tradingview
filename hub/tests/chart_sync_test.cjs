// Multi-cell indicator/drawing sync, chart defaults and independent browser windows.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('../../build/node_modules/jsdom');
const dom=()=>new JSDOM('<!doctype html><body><iframe id="frame"></iframe></body>',{url:'https://test.local/hub.html',runScripts:'outside-only'});
const clone=x=>JSON.parse(JSON.stringify(x));
function chart(symbol='BTC') {
  const events={},list=[]; let serial=0,doc={version:1,drawings:[]};
  const c={symbol,on:(e,fn)=>(events[e]??=[]).push(fn),emit:(e,v)=>(events[e]||[]).forEach(fn=>fn(v)),indicators:()=>list,
    addNativeIndicator(type,opt){return add(type,'native',opt?.inputs);},addIndicator(source,opt){return add(source,'pine',opt.inputs,opt.props);},
    renderer:{applyConfig(x){c.config=clone(x);}},drawings:{toJSON:()=>clone(doc),fromJSON(x){doc=clone(x);},all:()=>doc.drawings}};
  function add(type,kind,inputs={},props={}) {
    const callbacks={}, h={id:'id'+(++serial),title:type,nativeType:kind==='native'?type:undefined,visible:true,
      inputValues:()=>clone(h.input),propValues:()=>clone(h.prop),input:clone(inputs||{}),prop:clone(props||{}),
      setInputs(v){h.input=clone(v);c.emit('indicator:inputs',{id:h.id});},setProps(v){h.prop=clone(v);c.emit('indicator:inputs',{id:h.id});},
      setVisible(v){h.visible=v;c.emit('indicator:visibility',{id:h.id,visible:v});},
      remove(){const i=list.indexOf(h);if(i>=0)list.splice(i,1);c.emit('indicator:removed',{id:h.id});},on(e,fn){callbacks[e]=fn;},fire(e,v){callbacks[e]?.(v);}};
    list.push(h);return h;
  }
  return c;
}
(async()=>{
  const d=dom(),w=d.window;
  w.eval(fs.readFileSync('hub/chart_indicator_sync.js','utf8'));
  const a=chart(),b=chart(), cells=[{id:'a',chart:a},{id:'b',chart:b}], notices=[];
  const ws={cells:()=>cells,get chart(){return cells[0].chart;}};
  const sync=w.TradeXIndicatorSync(ws,x=>notices.push(clone(x)));sync.hookCells();
  let r=sync.addNative('ema',{length:14},'ema:one');assert.equal(r.ok,true);
  assert.equal(a.indicators().length,1);assert.equal(b.indicators().length,1);
  b.indicators()[0].setInputs({length:20});assert.equal(a.indicators()[0].input.length,20);assert.equal(notices.at(-1).id,r.id);
  const beforeUpdate=notices.length;sync.update('ema:one',{length:21},{});assert.equal(a.indicators()[0].input.length,21);assert.equal(b.indicators()[0].input.length,21);assert.equal(notices.length,beforeUpdate,'remote update must not echo');
  b.indicators()[0].setVisible(false);assert.equal(a.indicators()[0].visible,false);assert.equal(notices.at(-1).evt,'ind:visibility');
  const c=chart();cells.push({id:'c',chart:c});sync.hookCells();assert.equal(c.indicators()[0].input.length,21);assert.equal(c.indicators()[0].visible,false);
  c.indicators()[0].remove();assert.equal(a.indicators().length,0);assert.equal(b.indicators().length,0);assert.equal(notices.at(-1).evt,'ind:removed');
  const pine=sync.addPine('plot(close)',{n:5},{color:'blue'},'pine:one');assert.equal(b.indicators().length,1);a.indicators()[0].fire('ready');r=await pine;assert.equal(r.ok,true);
  b.indicators()[0].setProps({color:'red'});assert.equal(a.indicators()[0].prop.color,'red');
  sync.remove('pine:one');assert.equal(a.indicators().length,0);assert.equal(c.indicators().length,0);
  // Pooled native handles are adopted, not duplicated on re-opening a cell.
  sync.addNative('ema',{length:8},'ema:two');cells.pop();sync.hookCells();const restored=chart();restored.addNativeIndicator('ema',{inputs:{length:1}});cells.push({id:'c',chart:restored});sync.hookCells();assert.equal(restored.indicators().length,1);assert.equal(restored.indicators()[0].input.length,8);
  cells.pop();sync.hookCells();sync.clear();assert.equal(a.indicators().length,0);
  const stale=chart();stale.addNativeIndicator('ema',{inputs:{length:8}});cells.push({id:'c',chart:stale});sync.hookCells();assert.equal(stale.indicators().length,0,'removed native must not return from dormant Vela slot');
  // Vela's automatic volume is not in the shell ledger, but it must follow too.
  const va=chart(),vb=chart();va.addNativeIndicator('volume',{inputs:{length:1}});vb.addNativeIndicator('volume',{inputs:{length:1}});
  const volumeNotices=[],vws={cells:()=>[{id:'a',chart:va},{id:'b',chart:vb}],get chart(){return va;}};
  const volumeSync=w.TradeXIndicatorSync(vws,x=>volumeNotices.push(clone(x)));volumeSync.hookCells();
  va.indicators()[0].setInputs({length:22});assert.equal(vb.indicators()[0].input.length,22);assert.equal(volumeNotices.at(-1).evt,'ind:baseline');
  vb.indicators()[0].remove();assert.equal(va.indicators().length,0);assert.equal(volumeSync.baseline().present,false);
  volumeSync.applyBaseline({present:true,visible:false,inputs:{length:33}});assert.equal(va.indicators()[0].input.length,33);assert.equal(vb.indicators()[0].visible,false);
  // Defaults contain presentation, not live market data, drawings or indicator code.
  w.eval(fs.readFileSync('hub/chart_defaults.js','utf8'));
  let timezone='';const cell={chart:a,setPriceStyle(x){this.style=x;},setWatermarkVisible(x){this.watermark=x;}};
  const defaultsWs={getState:()=>({timezone:'Europe/Istanbul',activeCellId:'a',charts:[{id:'a',symbol:'BTC',rendererConfig:{gridColor:'red'},priceStyle:'bars',watermark:false,drawings:{secret:1},indicators:{code:'secret'}}]}),cells:()=>[cell],setTimezone:x=>timezone=x};
  w.TradeXChartDefaults.save(defaultsWs);const raw=w.localStorage.getItem('chartHubChartDefaults');assert.ok(!raw.includes('BTC')&&!raw.includes('secret'));
  w.TradeXChartDefaults.applyInitial(defaultsWs);assert.equal(cell.style,'bars');assert.equal(cell.watermark,false);assert.equal(a.config.gridColor,'red');assert.equal(timezone,'Europe/Istanbul');
  // Exercise the real per-symbol drawing handlers from the Vela page.
  const html=fs.readFileSync('hub/vela.html','utf8');const fragment=html.slice(html.indexOf('const drawBook = {}'),html.indexOf('// ---- Alerts from the chart'));
  const x=chart('BTC'),y=chart('BTC'),z=chart('ETH'), drawCells=[{chart:x},{chart:y},{chart:z}];
  w.drawCells=drawCells;w.LabDefaultSymbol='BTC';w.LabEmbedded=false;
  w.eval('var ws={cells:()=>drawCells,getState:()=>({charts:drawCells.map(c=>({symbol:c.chart.symbol}))})};'+fragment+'; window.__draw={hookCells,syncDrawings,swapDrawings,drawBook};');
  w.__draw.hookCells();x.drawings.fromJSON({version:1,drawings:[{id:'1'}]});x.emit('drawing:created',{id:'1'});
  assert.equal(y.drawings.toJSON().drawings[0].id,'1');assert.equal(z.drawings.toJSON().drawings.length,0);
  y.drawings.fromJSON({version:1,drawings:[]});y.emit('drawing:removed',{id:'1'});assert.equal(x.drawings.toJSON().drawings.length,0);
  w.__draw.syncDrawings('ETH',{version:1,drawings:[{id:'eth'}]},null,false);assert.equal(z.drawings.toJSON().drawings[0].id,'eth');
  w.__draw.swapDrawings(x,'ETH');assert.equal(x.drawings.toJSON().drawings[0].id,'eth');
  d.window.close();
  // Receiving an input-only change updates an existing handle instead of destroying the pane.
  const shell=dom(), sh=shell.window;sh.eval('var st={engine:"vela"};var $=id=>document.getElementById(id);');
  const commands=[];sh.document.getElementById('frame').contentWindow.postMessage=x=>commands.push(clone(x));
  sh.eval(fs.readFileSync('hub/ind_core.js','utf8')+'\nINDS=[{key:"k",kind:"native",type:"ema",on:true,inputs:{n:1}}];liveIds={k:"existing"}; applySyncedIndicators([{key:"k",kind:"native",type:"ema",on:true,inputs:{n:2}}]); window.__live=()=>liveIds.k;window.__apply=applySyncedIndicators;');
  assert.deepEqual(commands.map(x=>x.cmd),['indicators:update']);assert.equal(sh.__live(),'existing');
  sh.__apply([]);assert.equal(commands.at(-1).cmd,'pine:remove');shell.window.close();
  // BroadcastChannel fake: same layout converges; a different layout is untouched.
  const channels=[];class Channel{constructor(){channels.push(this);}postMessage(data){for(const c of channels)if(c!==this)c.onmessage?.({data:clone(data)});}close(){channels.splice(channels.indexOf(this),1);}}
  function tab(layout) {
    const t=dom(),v=t.window;v.BroadcastChannel=Channel;let interval;v.setInterval=fn=>(interval=fn,1);v.clearInterval=()=>{};
    v.eval('var INDS=[]; var st={ticker:"BTC"}; var received=[]; function applySyncedIndicators(x){INDS=x;received.push(x)}');
    v.layoutsCurrentId=()=>layout;v.layoutsSyncAllowed=()=>true;v.layoutsDirty=()=>{};v.ask=async()=>({ok:true,doc:{drawBook:{}}});
    const out=[];v.document.getElementById('frame').contentWindow.postMessage=x=>out.push(clone(x));
    v.eval(fs.readFileSync('hub/window_sync.js','utf8'));return {t,v,out,join:()=>interval()};
  }
  const one=tab('L'),two=tab('L'),other=tab('other');one.join();two.join();other.join();await new Promise(r=>setTimeout(r,10));
  one.v.eval('INDS=[{key:"pine:1",on:true,source:"plot(close)"}];TradeXSync.indicatorsChanged()');
  assert.equal(two.v.eval('INDS[0].key'),'pine:1');assert.equal(other.v.eval('INDS.length'),0);
  const f=one.v.document.getElementById('frame').contentWindow;
  one.v.dispatchEvent(new one.v.MessageEvent('message',{origin:one.v.location.origin,source:f,data:{evt:'drawings:changed',symbol:'BTC',doc:{version:1,drawings:[{id:'d'}]}}}));
  assert.equal(two.out.at(-1).doc.drawings[0].id,'d');assert.ok(!other.out.some(v=>v.doc?.drawings?.[0]?.id==='d'));
  one.t.window.close();two.t.window.close();other.t.window.close();console.log('Chart defaults and synchronization tests passed');
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
