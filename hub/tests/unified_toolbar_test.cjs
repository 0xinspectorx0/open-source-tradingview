// Exercise the shell mirror against Vela's actual Topbar DOM and handlers.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require('../../build/node_modules/jsdom');
const {pathToFileURL} = require('node:url');
const tick = () => new Promise(r => setTimeout(r, 10));
(async () => {
  const dom = new JSDOM('<!doctype html><button id="priceStyle" disabled aria-expanded="false"><svg viewBox="0 0 16 16"></svg></button><div id="velaTools"></div><iframe id="frame"></iframe>', {url:'http://test.local/hub.html', runScripts:'outside-only', pretendToBeVisual:true});
  const w=dom.window, d=w.document, frame=d.getElementById('frame'), fd=frame.contentDocument;
  const fw=frame.contentWindow;
  global.window=fw; global.document=fd; global.Document=fw.Document; global.ShadowRoot=fw.ShadowRoot; global.HTMLElement=fw.HTMLElement; global.Element=fw.Element; global.SVGElement=fw.SVGElement;
  global.ResizeObserver=class {observe(){} disconnect(){}}; global.CSS={escape:x=>x};
  fd.body.innerHTML='<div id="chart"><div id="workspace"></div></div>';
  const {Topbar}=await import(pathToFileURL(require.resolve('../../build/node_modules/@luxalgo/vela/dist/widget.js')).href);
  const {registerChartType, registerWidgetAction}=await import(pathToFileURL(require.resolve('../../build/node_modules/@luxalgo/vela/dist/plugin.js')).href);
  registerChartType({id:'test_custom',label:'Custom style'});
  const calls=[]; let current='candles';
  registerWidgetAction({id:'indicators',target:'topbar',align:'left',label:'İndikatörler',icon:'indicators',run:()=>calls.push('indicators')});
  function makeTopbar() {
    return new Topbar(fd.getElementById('workspace'),{
      symbol:'BTCUSD',timeframe:'1',timeframes:['1'],priceStyle:current,
      composition:{left:['style','indicators','undo-redo'],right:['actions','panels','screenshot']},
      onTimeframe(){},onPriceStyle(id){current=id;},onIndicatorsClick(){calls.push('indicators');},getContext:()=>({}),
      onUndoClick(){calls.push('undo');},onRedoClick(){calls.push('redo');},onScreenshotClick(){calls.push('screenshot');}
    });
  }
  let topbar=makeTopbar();
  topbar.setPanelButtons([{id:'test',title:'Panel',icon:'camera'}], id=>calls.push(id));
  frame.contentWindow.labChart={priceStyles:()=>topbar.styleItems().map(({id,label})=>({id,label})),priceStyle:()=>current,setPriceStyle:id=>{current=id;topbar.setPriceStyle(id);calls.push(id);}};
  w.eval(fs.readFileSync('hub/unified_toolbar.js','utf8'));
  frame.dispatchEvent(new w.Event('load'));
  const style=d.getElementById('priceStyle'), menu=d.getElementById('priceStyleMenu');
  assert.equal(style.disabled,false);
  assert.ok(style.querySelector('svg'), 'native candle icon is shown instead of text');
  assert.equal(style.textContent.trim(),'');
  assert.equal(style.getAttribute('aria-expanded'),'false');
  style.click(); assert.equal(menu.hidden,false); assert.equal(style.getAttribute('aria-expanded'),'true');
  assert.ok(menu.querySelector('[data-id="test_custom"]'));
  assert.equal(menu.querySelector('[data-id="candles"]').getAttribute('aria-checked'),'true');
  menu.querySelector('[data-id="test_custom"]').click();assert.equal(current,'test_custom');
  assert.equal(menu.hidden,true); assert.equal(d.activeElement,style);
  style.click();
  const active=d.activeElement;
  menu.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
  assert.notEqual(d.activeElement,active,'keyboard navigation moves between styles');
  menu.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(menu.hidden,true); assert.equal(d.activeElement,style);
  let buttons=[...d.querySelectorAll('#velaTools button')];
  const find=label=>buttons.find(b=>b.getAttribute('aria-label')===label);
  assert.equal(find('Undo').disabled,true);
  topbar.setHistoryState(true,true);await tick();
  buttons=[...d.querySelectorAll('#velaTools button')];
  find('İndikatörler').click();find('Undo').click();find('Redo').click();find('Panel').click();find('Download screenshot').click();
  assert.deepEqual(calls,['test_custom','indicators','undo','redo','test','screenshot']);
  topbar.setPanelActive('test',true);await tick();assert.equal(find('Panel').getAttribute('aria-pressed'),'true');
  current='line';topbar.setPriceStyle('line');await tick();
  assert.match(style.getAttribute('aria-label'), /Line/); assert.ok(style.querySelector('svg'));
  style.click(); assert.equal(menu.querySelector('[data-id="line"]').getAttribute('aria-checked'),'true');
  frame.dispatchEvent(new w.Event('load'));assert.equal(menu.hidden,true);
  style.click(); assert.equal(menu.querySelector('[data-id="line"]').getAttribute('aria-checked'),'true','reloading keeps the same options');
  topbar.destroy();dom.window.close();
  const html=fs.readFileSync('hub/vela.html','utf8');
  assert.match(html,/html\.embed #chart \.vela-widget-topbar \{ display:none !important; \}/);
  assert.match(html,/priceStyles: \(\) => ws\.topbar\.styleItems\(\)/);
  console.log('Unified toolbar tests passed');
})().catch(e=>{console.error(e.stack || e);process.exitCode=1});
