// Exercise the real Vela workspace alert path and toast for Pine alert events.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require('../../build/node_modules/jsdom');
const {pathToFileURL} = require('node:url');
(async () => {
  const dom = new JSDOM('<!doctype html><div id="chart"></div>', {url:'http://test.local/vela.html',runScripts:'outside-only'});
  const w=dom.window, d=w.document;
  w.eval(fs.readFileSync('hub/pine_alert_toast.js','utf8'));
  const {VelaWorkspace}=await import(pathToFileURL(require.resolve('../../build/node_modules/@luxalgo/vela/dist/workspace.js')).href);
  const source=fs.readFileSync(require.resolve('../../build/node_modules/@luxalgo/vela/dist/chunk-FAKYUVNT.js'),'utf8');
  const start=source.indexOf('// src/widget/toast.ts'), end=source.indexOf('// src/widget/tool-shortcuts.ts',start);
  assert.ok(start>=0&&end>start);
  const Toast=Function('injectStyles',source.slice(start,end)+'\nreturn Toast;')(()=>{});
  const toastHost=new Toast(d.getElementById('chart'));
  const subscriptions={};
  const chart={on:(name,fn)=>{subscriptions[name]=fn;},renderer:{onCrosshairMove(){},onConfigChanged(){},onAxisLongPress(){}}};
  const cell={id:'c1',symbol:'lab:BINF_BULLAUSDT',timeframe:'1',chart};
  const workspace={toastHost,alerts:[],alertCap:20,topbar:{setAlertCount(n){this.count=n;}},
    t:(message,values)=>values ? `${values.source} — ${values.title ?? ''} — ${values.message ?? ''}` : 'Alarm'};
  VelaWorkspace.prototype.wireCell.call(workspace,cell);
  const seen=[];
  const handlers={onAlert(alert){seen.push(alert);subscriptions.alert({...alert,indicator:'BOMBACI'});}};
  const show=toastHost.show;
  for (let bar=0;bar<3;bar++) {
    const alert={id:'alertcondition_0',title:{bad:true},message:'',time:bar};
    w.TradeXForwardPineAlert(workspace,handlers,alert);
    assert.equal(toastHost.el.hasAttribute('data-open'),false,'no malformed candle popup');
    assert.equal(seen.at(-1),alert,'event is forwarded unchanged');
    assert.equal(toastHost.show,show,'toast method is restored');
  }
  assert.equal(workspace.alerts.length,3,'alert events remain available to Vela');
  assert.equal(workspace.topbar.count,3);
  w.TradeXForwardPineAlert(workspace,handlers,{title:'[object Object]',message:'',time:3});
  assert.equal(toastHost.el.hasAttribute('data-open'),false);
  w.TradeXForwardPineAlert(workspace,handlers,{title:'Cross',message:'Price crossed',time:4});
  assert.match(toastHost.el.textContent,/Price crossed/);assert.equal(toastHost.el.dataset.type,'info');
  toastHost.hide();
  w.TradeXForwardPineAlert(workspace,handlers,{title:{},message:'Useful alert',time:5});
  assert.match(toastHost.el.textContent,/Useful alert/,'do not suppress alerts with content');
  toastHost.hide(); subscriptions['indicator:error']({error:new Error('Broken script')});
  assert.equal(toastHost.el.dataset.type,'error');assert.match(toastHost.el.textContent,/Broken script/);
  w.TradeXForwardPineAlert(workspace,handlers,{title:{},message:'',time:6});
  assert.equal(toastHost.el.dataset.type,'error'); assert.match(toastHost.el.textContent,/Broken script/,'bad alert does not overwrite an error');
  assert.throws(()=>w.TradeXForwardPineAlert(workspace,{onAlert(){throw new Error('failure');}},{title:{},message:''}),/failure/);
  assert.equal(toastHost.show,show,'restore even when a handler throws');
  toastHost.destroy();dom.window.close();
  const html=fs.readFileSync('hub/vela.html','utf8');
  assert.match(html,/<script src="pine_alert_toast\.js"><\/script>/);
  assert.match(html,/h\.onAlert = \(alert\) => TradeXForwardPineAlert\(ws, handlers, alert\)/);
  console.log('Pine alert toast tests passed');
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
