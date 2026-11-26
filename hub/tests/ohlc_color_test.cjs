// Theme colours plus the actual Vela status-line DOM (no canvas or network needed).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {pathToFileURL} = require('node:url');
const {JSDOM} = require('../../build/node_modules/jsdom');
(async () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="chart"></div></body></html>', {url:'http://example.test/vela.html',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window, d=w.document;
  w.eval(fs.readFileSync('hub/theme.js','utf8'));
  const ink=()=>d.documentElement.style.getPropertyValue('--tx-ohlc-color');
  for (const preset of ['tradex','graphite','black','light']) {
    const s=w.HubSettingsLoad(); s.preset=preset; s.overrides={up:'#ff0000',down:'#00ff00'}; s.candleStyle.bodyUpOpacity=0;
    w.HubSettingsSave(s); w.HubThemeApply();
    assert.equal(ink(),preset==='light'?'#00332a':'#fffdd0');
  }
  const html=fs.readFileSync('hub/vela.html','utf8');
  const rule=html.match(/\.vela-statusline \.vela-sl-ohlc, \.vela-statusline \.vela-sl-ohlc b \{[^}]+\}/);
  assert.ok(rule, 'OHLC-specific override exists');
  const style=d.createElement('style'); style.textContent=rule[0]; d.head.appendChild(style);
  const css=style.sheet.cssRules[0];
  assert.equal(css.style.getPropertyValue('color'),'var(--tx-ohlc-color)');
  assert.equal(css.style.getPropertyPriority('color'),'important','must override Vela inline candle colours');
  global.window=w; global.document=d; global.Document=w.Document; global.ShadowRoot=w.ShadowRoot; global.HTMLElement=w.HTMLElement; global.Element=w.Element; global.SVGElement=w.SVGElement; global.CSS={escape: x=>x};
  const {Statusline}=await import(pathToFileURL(require.resolve('../../build/node_modules/@luxalgo/vela/dist/chunk-FAKYUVNT.js')).href);
  const sl=new Statusline(d.getElementById('chart'),'lab:BTCUSD');
  sl.setDirectionColors('#00ff00','#ff0000');
  for (const bar of [{open:10,high:12,low:9,close:11},{open:10,high:11,low:8,close:9}]) {
    sl.lastBar=bar; sl.renderValues();
    const labels=d.querySelectorAll('.vela-sl-ohlc > span'), values=d.querySelectorAll('.vela-sl-ohlc b');
    assert.equal(labels.length,4); assert.equal(values.length,4);
    for (const b of values) assert.ok(b.matches(css.selectorText),'all price values match the important override');
    assert.ok(d.querySelector('.vela-sl-ohlc').matches(css.selectorText),'labels inherit the fixed colour');
    assert.equal(d.querySelector('.vela-sl-change').matches(css.selectorText),false,'change percentage retains direction colour');
  }
  const s=w.HubSettingsLoad(); s.preset='black'; w.HubSettingsSave(s); w.HubThemeApply(); assert.equal(ink(),'#fffdd0');
  s.preset='light'; w.HubSettingsSave(s); w.HubThemeApply(); assert.equal(ink(),'#00332a');
  sl.destroy(); dom.window.close();
  console.log('OHLC colour tests passed');
})().catch(e=>{console.error(e);process.exitCode=1});
