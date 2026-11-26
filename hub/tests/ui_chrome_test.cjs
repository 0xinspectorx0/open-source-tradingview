// Offline checks for mobile Vela chrome, alert composition and web attribution links.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {JSDOM} = require('../../build/node_modules/jsdom');
const html = fs.readFileSync('hub/vela.html','utf8');
assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
const rule = html.match(/html\.embed \[data-layout="mobile"\] \.vela-mb-symbol,\s*html\.embed \[data-layout="mobile"\] \.vela-mb-tf \{[^}]+\}/);
assert.ok(rule, 'embedded mobile hides only duplicate symbol/timeframe controls');
const dom = new JSDOM(`<!doctype html><html><head><style>${rule[0]}</style></head><body><div data-layout="mobile"><button class="vela-mb-symbol"></button><button class="vela-mb-tf"></button><button class="vela-mb-drawings"></button><button class="vela-mb-settings"></button></div></body></html>`);
const d = dom.window.document, visible = selector => dom.window.getComputedStyle(d.querySelector(selector)).display;
assert.notEqual(visible('.vela-mb-symbol'),'none','standalone mobile keeps its symbol control');
d.documentElement.classList.add('embed');
assert.equal(visible('.vela-mb-symbol'),'none'); assert.equal(visible('.vela-mb-tf'),'none');
assert.notEqual(visible('.vela-mb-drawings'),'none'); assert.notEqual(visible('.vela-mb-settings'),'none');
d.querySelector('[data-layout]').dataset.layout='desktop';
assert.notEqual(visible('.vela-mb-symbol'),'none','rule does not affect desktop');
dom.window.close();
const match = html.match(/topbar: (\{ \.\.\.\(LabEmbedded \? \{ left: \["style", "indicators", "undo-redo"\] \} : \{\}\), right: \["actions", "panels", "screenshot"\] \})/);
assert.ok(match, 'Vela topbar and mobile drawer omit alerts');
for (const LabEmbedded of [true,false]) {
  const options=vm.runInNewContext('('+match[1]+')',{LabEmbedded});
  assert.equal(options.right.includes('alerts'),false);
  assert.ok(options.right.includes('panels'));
}
assert.doesNotMatch(html,/renderer\.set\("attribution"/,'Vela default attribution stays visible');
const shim = fs.readFileSync('hub/web/api_shim.js','utf8');
const web = new JSDOM('<!doctype html><html><head></head><body><div id="app"><div id="bar"><span id="brand">TradeX</span></div></div></body></html>', {url:'https://example.test/hub.html',runScripts:'outside-only'});
web.window.TXWebFeeds={feeds:{},health:{},SEC:{},probeAll(){}};
web.window.fetch=async()=>({json:async()=>({})}); web.window.WebSocket=class {};
web.window.eval(shim);
web.window.document.dispatchEvent(new web.window.Event('DOMContentLoaded'));
assert.equal(web.window.document.querySelector('#bar .txsrc'),null);
assert.equal(web.window.document.querySelector('#bar .txvela'),null);
assert.equal(web.window.document.querySelector('#txweb a[href*="github.com/saifullahshafin/open-source-tradingview"]:not([href*="WALKTHROUGH"])'),null);
web.window.close();
console.log('UI chrome tests passed');
