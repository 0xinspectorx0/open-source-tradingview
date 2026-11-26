// Exercise the actual Vela pane-controls DOM for price/study and its active states.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('../../build/node_modules/jsdom');
const {pathToFileURL}=require('node:url');
(async()=>{
  const dom=new JSDOM('<!doctype html><html><head></head><body><div id="chart"><div id="plot"></div></div><button class="unrelated"><svg stroke-width="1.2"></svg></button></body></html>',{url:'http://test.local',runScripts:'outside-only'});
  const w=dom.window,d=w.document;
  global.window=w;global.document=d;global.Document=w.Document;global.ShadowRoot=w.ShadowRoot;global.HTMLElement=w.HTMLElement;global.Element=w.Element;global.SVGElement=w.SVGElement;global.CSS={escape:x=>x};
  const icons=await import(pathToFileURL(require.resolve('../../build/node_modules/@luxalgo/vela/dist/chunk-O6L27KRB.js')).href);
  const source=fs.readFileSync(require.resolve('../../build/node_modules/@luxalgo/vela/dist/chunk-BDVUH2Y7.js'),'utf8');
  const start=source.indexOf('// src/renderers/native/chrome/PaneControls.ts'),end=source.indexOf('// src/renderers/native/chrome/axisLayout.ts',start);
  assert.ok(start>=0&&end>start);
  const PaneControls=Function('document','icon','msg','textOf',source.slice(start,end)+'\nreturn PaneControls;')(d,icons.icon,(id,fallback)=>fallback,(_,s)=>s);
  const html=fs.readFileSync('hub/vela.html','utf8');
  const css=html.slice(html.indexOf('/* Transparent pane controls'),html.indexOf('/* The parent shell already',html.indexOf('/* Transparent pane controls')));
  const style=d.createElement('style');style.textContent=css;d.head.appendChild(style);
  const rules=[...style.sheet.cssRules];
  const parentRule=rules.find(r=>r.selectorText?.includes(':has('));
  const buttonRule=rules.find(r=>r.selectorText?.includes('.vela-pc-on'));
  const iconRule=rules.find(r=>r.selectorText?.includes('.vela-pc-btn svg'));
  assert.equal(parentRule.style.getPropertyValue('background'),'transparent');assert.equal(parentRule.style.getPropertyPriority('background'),'important');
  assert.equal(buttonRule.style.getPropertyValue('background'),'transparent');assert.equal(buttonRule.style.getPropertyPriority('background'),'important');
  assert.match(buttonRule.style.getPropertyValue('border'),/1px solid/);
  assert.equal(iconRule.style.getPropertyValue('stroke-width'),'2.2');
  let max=false,collapsed=false, calls=[];
  const panes=()=>[{id:'price',kind:'price',index:0,count:2,top:0,height:100,maximized:max,collapsed:false},{id:'study',kind:'study',index:1,count:2,top:100,height:100,maximized:false,collapsed}];
  const controls=new PaneControls(d.getElementById('plot'),{}, {panes,rightAxis:()=>0,onMove:(...x)=>calls.push(x),onToggleCollapse:id=>{calls.push(['collapse',id]);collapsed=!collapsed;controls.refresh();},onToggleMaximize:id=>{calls.push(['maximize',id]);max=!max;controls.refresh();}});
  const find=(id,role)=>controls.clusters.get(id).querySelector(`[data-role="${role}"]`);
  for(const id of ['price','study']) {
    const cluster=controls.clusters.get(id),button=find(id,'maximize');
    assert.ok(cluster.matches(parentRule.selectorText)); assert.ok(button.matches(buttonRule.selectorText));
    assert.ok(button.querySelector('svg').matches(iconRule.selectorText));
    assert.equal(button.querySelector('svg').getAttribute('stroke-width'),'1.2');
  }
  find('price','maximize').click();assert.deepEqual(calls.at(-1),['maximize','price']);
  assert.ok(find('price','maximize').classList.contains('vela-pc-on'));
  assert.ok(find('price','maximize').matches(buttonRule.selectorText));
  find('study','collapse').click();assert.deepEqual(calls.at(-1),['collapse','study']);
  assert.ok(find('study','collapse').classList.contains('vela-pc-on'));
  assert.ok(find('study','collapse').matches(buttonRule.selectorText));
  assert.equal(d.querySelector('.unrelated svg').matches(iconRule.selectorText),false);
  controls.destroy();dom.window.close();console.log('Pane control style tests passed');
})().catch(e=>{console.error(e);process.exitCode=1});
