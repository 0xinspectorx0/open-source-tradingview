// Offline integration test of Vela's chart configuration and colour-change guard.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('../../build/node_modules/jsdom');
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {url:'http://tradex.test/vela.html', runScripts:'outside-only'});
const w = dom.window;
w.LabEmbedded = true;
w.eval(fs.readFileSync('hub/theme.js','utf8'));
const settings=w.HubSettingsLoad();
Object.assign(settings.candleStyle, {bodyUpOpacity:0, bodyDownOpacity:25, borderUpOpacity:50, borderDownOpacity:75, wickUpOpacity:90, wickDownOpacity:100, borderUp:'#123456', wickUp:'#abcdef'});
w.HubSettingsSave(settings); w.HubThemeApply();
const vela=fs.readFileSync('hub/vela.html','utf8');
const start=vela.indexOf('function velaTheme()'), end=vela.indexOf('const VELA_TF',start);
assert.ok(start>=0 && end>start);
let chartCalls=0, callback;
function makeChart() {
  const state={candles:{},bars:{}};
  return { renderer:{
    setSettingsVisibility(){}, onConfigChanged(cb){ if (!callback) callback=cb; }, getConfig(){return state;},
    applyConfig(cfg) {chartCalls++; Object.assign(state.candles,cfg.candles);Object.assign(state.bars,cfg.bars);if(callback) callback();},
  },presentNativeIndicators(){return []}, state};
}
const chart=makeChart(), chart2=makeChart();
w.ws={setTheme(){},cells(){return [{chart},{chart:chart2}]}};
w.eval(vela.slice(start,end));
w.applyTheme();
assert.equal(chartCalls,2,'synchronous config events must not cause recursion');
assert.equal(chart.state.candles.upColor,w.HubTheme.up+'00');
assert.equal(chart.state.candles.downColor,w.HubTheme.down+'40');
assert.equal(chart.state.candles.borderUpColor,'#12345680');
assert.equal(chart.state.candles.borderDownColor,w.HubTheme.down+'bf');
assert.equal(chart.state.candles.wickUpColor,'#abcdefe6');
assert.equal(chart.state.candles.wickDownColor,w.HubTheme.down);
assert.equal(chart2.state.candles.upColor,chart.state.candles.upColor);
assert.equal(w.HubSettingsLoad().candleStyle.bodyUpOpacity,0);
// Native Vela picker changes a colour and alpha; the setting and all charts follow it.
chart.state.candles.upColor='#65432180'; callback();
assert.equal(w.HubSettingsLoad().overrides.up,'#654321');
assert.equal(w.HubSettingsLoad().candleStyle.bodyUpOpacity,50);
assert.equal(chart2.state.candles.upColor,'#65432180');
assert.equal(w.HubSettingsLoad().candleStyle.wickUpOpacity,90);
// Normalization and legacy settings retain an opaque default; zero must not be discarded.
w.localStorage.setItem('chartHubTheme',JSON.stringify({candleStyle:{bodyUpOpacity:0,bodyDownOpacity:-10,borderUpOpacity:999,wickUpOpacity:'bad',wickDownOpacity:null}}));
const c=w.HubSettingsLoad().candleStyle;
assert.equal(c.bodyUpOpacity,0);assert.equal(c.bodyDownOpacity,0);assert.equal(c.borderUpOpacity,100);assert.equal(c.wickUpOpacity,100);assert.equal(c.wickDownOpacity,100);
dom.window.close();
console.log('Candle opacity tests passed');
