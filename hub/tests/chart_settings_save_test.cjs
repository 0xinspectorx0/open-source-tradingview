// Test the Vela dialog button and the shell's real layout-save path offline.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('../../build/node_modules/jsdom');
const {pathToFileURL}=require('node:url');
const tick=()=>new Promise(r=>setTimeout(r,15));
(async()=>{
  const dom=new JSDOM('<!doctype html><html><body><select id="layout"><option value="">1</option></select><div id="chart"></div></body></html>',{url:'http://test.local/hub.html',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,d=w.document;
  w.localStorage.setItem('chartHubLayoutAutosave','0');
  w.eval('var st={engine:"vela",key:"BTCUSD",broker:"binance",ticker:"BINF_BTCUSDT",tf:"W1"}; var TFS=[["W1","H"]]; var INDS=[]; var pending=null; var $=id=>document.getElementById(id);');
  let doc={vela:{charts:[{settings:{lineWidth:3}}]},drawBook:{}}, answer={ok:true,doc}, writes=[], fail=false, wait=null;
  w.ask=async()=>answer;
  w.fetch=async (input,opt)=>{
    if (String(input).endsWith('/save')) {
      const sent=JSON.parse(opt.body);writes.push(sent);
      if (wait) await wait;
      if (fail) return {ok:false,json:async()=>({error:'disk full'})};
      return {ok:true,json:async()=>({ok:true,id:'saved'})};
    }
    return {ok:true,json:async()=>({layouts:[],templates:[]})};
  };
  w.eval(fs.readFileSync('hub/settings_backup.js','utf8'));
  w.eval(fs.readFileSync('hub/layouts.js','utf8'));await tick();
  w.pending='BTC'; let result=await w.layoutsSaveCurrent();assert.equal(result.ok,false);assert.equal(writes.length,0);
  w.pending=null;result=await w.layoutsSaveCurrent();assert.equal(result.ok,true);
  assert.equal(writes[0].doc.chart.vela.charts[0].settings.lineWidth,3);
  assert.equal(writes[0].doc.hub.tf,'W1');assert.equal(w.localStorage.getItem('chartHubLayoutId'),'saved');
  answer={ok:false,error:'offline'};result=await w.layoutsSaveCurrent();assert.equal(result.ok,false);assert.match(result.error,/offline/);assert.equal(writes.length,1,'failed chart read cannot overwrite saved layout');
  let releaseDoc;w.ask=()=>new Promise(r=>releaseDoc=r);
  const whileLoading=w.layoutsSaveCurrent();w.pending='new market';releaseDoc({ok:true,doc});
  result=await whileLoading;assert.equal(result.ok,false);assert.equal(writes.length,1,'market change during snapshot cannot overwrite layout');
  w.pending=null;w.ask=async()=>answer;
  answer={ok:true,doc};fail=true;result=await w.layoutsSaveCurrent();assert.equal(result.ok,false);assert.match(result.error,/disk full/);
  fail=false; let release; wait=new Promise(r=>release=r); const inFlight=w.layoutsSaveCurrent();await tick();
  result=await w.layoutsSaveCurrent();assert.equal(result.ok,false);assert.match(result.error,/kayıt sürüyor/);
  await assert.rejects(w.layoutsExportBackup(),/kayıt/);release();await inFlight;wait=null;
  w.pending='loading';await assert.rejects(w.layoutsExportBackup(),/yükleniyor/);w.pending=null;
  let releaseBackup;w.ask=()=>new Promise(r=>releaseBackup=r);
  const exporting=w.layoutsExportBackup(); result=await w.layoutsSaveCurrent();assert.equal(result.ok,false);assert.match(result.error,/yedekleme/);
  w.st.tf='MN1';releaseBackup({ok:true,doc});await assert.rejects(exporting,/değişti/);w.st.tf='W1';w.ask=async()=>answer;
  w.LabEmbedded=true;w.layoutsSaveCurrent=async()=>({ok:true});
  w.eval(fs.readFileSync('hub/chart_settings_save.js','utf8'));
  global.window=w; global.document=d;global.Node=w.Node;global.Element=w.Element;global.HTMLElement=w.HTMLElement;global.Document=w.Document;global.ShadowRoot=w.ShadowRoot;global.SVGElement=w.SVGElement;global.getComputedStyle=w.getComputedStyle.bind(w);global.CSS={escape:x=>x};
  const {Dialog}=await import(pathToFileURL(require.resolve('../../build/node_modules/@luxalgo/vela/dist/ui.js')).href);
  function dialog(className){return new Dialog({host:d.getElementById('chart'),className,footer:foot=>{const reset=d.createElement('button');reset.className='vela-sd-btn';reset.textContent='Reset';foot.appendChild(reset);}});}
  const other=dialog('other-dialog'), ui=dialog('vela-dialog--settings');await tick();
  assert.equal(other.panel.querySelector('.tx-chart-save'),null);
  let button=ui.panel.querySelector('.tx-chart-save'),status=ui.panel.querySelector('[role="status"]');
  assert.ok(button);assert.equal(button.textContent,'Kaydet');assert.ok(ui.panel.querySelector('.vela-sd-btn'));
  let resolve;w.layoutsSaveCurrent=()=>new Promise(r=>resolve=r);button.click();
  assert.equal(button.disabled,true);assert.match(status.textContent,/Kaydediliyor/);
  resolve({ok:true});await tick();assert.equal(button.disabled,false);assert.equal(status.textContent,'Kaydedildi');
  w.layoutsSaveCurrent=async()=>({ok:false,error:'disk full'});button.click();await tick();
  assert.match(status.textContent,/disk full/);assert.equal(status.dataset.error,'1');assert.equal(button.disabled,false);
  ui.destroy(); const rebuilt=dialog('vela-dialog--settings');await tick();
  assert.equal(rebuilt.panel.querySelectorAll('.tx-chart-save').length,2,'reopened settings have one save and one defaults button');
  const defaults=rebuilt.panel.querySelectorAll('.tx-chart-save')[1], defaultStatus=rebuilt.panel.querySelector('[role="status"]');
  let calls=0;w.labChart={saveDefaults:()=>{calls++;}};defaults.click();assert.equal(calls,1);assert.match(defaultStatus.textContent,/Varsayılan ayarlar kaydedildi/);
  w.labChart.saveDefaults=()=>{throw Error('disk full');};defaults.click();assert.match(defaultStatus.textContent,/disk full/);
  other.destroy();rebuilt.destroy();dom.window.close();
  console.log('Chart settings save tests passed');
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
