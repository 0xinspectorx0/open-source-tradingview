// Round-trip, validation, rollback and controls for portable settings backups.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('../../build/node_modules/jsdom');
const tick=()=>new Promise(r=>setTimeout(r,15));
(async()=>{
  const dom=new JSDOM('<!doctype html><body><div id="panel"></div></body>',{url:'https://test.local/hub.html',runScripts:'outside-only'});
  const w=dom.window,d=w.document;
  w.eval(fs.readFileSync('hub/settings_backup.js','utf8'));
  const storage=w.localStorage;
  storage.setItem('chartHubTheme',JSON.stringify({preset:'light',candleStyle:{wickWidth:3}}));
  storage.setItem('chartHubWatchlist',JSON.stringify([{key:'BTCUSD',broker:'binance',ticker:'BINF_BTCUSDT'}]));
  storage.setItem('chartHubTimeframeFavorites',JSON.stringify(['W1','MN1']));
  storage.setItem('tradexDrawFavs',JSON.stringify(['trendline']));
  storage.setItem('tradexRecentSymbols',JSON.stringify(['BTCUSD']));
  storage.setItem('chartHubScripts',JSON.stringify([{id:'p1',name:'Mine',source:'plot(close)'}]));
  storage.setItem('chartHubLayoutAutosave','0');
  storage.setItem('sb-secret-auth-token','do-not-export');
  const active={v:1,hub:{engine:'vela',key:'BTCUSD',broker:'binance',ticker:'BINF_BTCUSDT',tf:'W1'},grid:'2h',theme:{preset:'light'},inds:[{key:'own:p1:1',on:true,source:'plot(close)'}],chart:{vela:{charts:[{id:'c1',settings:{width:3}}]},drawBook:{BTCUSD:{drawings:[{id:'line'}]}}}};
  const oldDoc={...active,grid:'',chart:{vela:{charts:[{id:'old'}]},drawBook:{}}};
  const source={layouts:{a:{name:'Güncel',summary:'btc',doc:oldDoc},b:{name:'Diğer',summary:'x',doc:oldDoc}},templates:{t:{name:'Şablon',summary:'ema',doc:{v:1,inds:[{name:'EMA'}]}}}};
  const clone=x=>JSON.parse(JSON.stringify(x));
  function apiFor(db) {
    let next=0, writes=0, failAt=0;
    const api=async(path,body)=>{
      if (!path) return Object.fromEntries(['layouts','templates'].map(k=>[k,Object.entries(db[k]).map(([id,v])=>({id,name:v.name,summary:v.summary}))]));
      if (path.startsWith('?')) { const q=new URLSearchParams(path.slice(1));return clone(db[q.get('kind')][q.get('id')]); }
      if (path==='/save') { if (++writes===failAt) throw new Error('storage failed');const id='new'+(++next);db[body.kind][id]=clone({name:body.name,summary:body.summary,doc:body.doc});return {id}; }
      if (path==='/delete') {delete db[body.kind][body.id];return {ok:true};}
      throw new Error('unexpected request');
    };
    api.failAt=n=>{writes=0;failAt=n;};api.writeCount=()=>writes;return api;
  }
  const srcApi=apiFor(source), backup=w.TradeXSettingsBackup.create({api:srcApi,snapshot:async()=>clone(active),currentId:()=> 'a',currentName:()=> 'Güncel',storage});
  const text=await backup.exportData(), data=JSON.parse(text);
  assert.equal(data.format,'tradex-settings');assert.equal(data.current.doc.grid,'2h');
  assert.equal(data.layouts.length,2);assert.equal(data.templates.length,1);
  assert.equal(data.layouts[0].doc.grid,'','saved copy remains distinct from live unsaved state');
  assert.ok(!text.includes('do-not-export')); assert.ok(!text.includes('sb-secret-auth-token'));
  assert.match(text,/plot\(close\)/); assert.match(text,/BINF_BTCUSDT/);
  const target={layouts:{existing:{name:'Keep',summary:'',doc:oldDoc}},templates:{}};
  const targetApi=apiFor(target);
  storage.setItem('chartHubTheme',JSON.stringify({preset:'black'}));storage.setItem('chartHubWatchlist','[]');
  storage.setItem('chartHubLayoutId','existing');
  const restore=w.TradeXSettingsBackup.create({api:targetApi,snapshot:async()=>{},currentId:()=>'',currentName:()=>'',storage});
  await restore.importData(text);
  assert.ok(target.layouts.existing,'existing layout is not overwritten');
  assert.equal(Object.keys(target.layouts).length,4); assert.equal(Object.keys(target.templates).length,1);
  assert.ok(Object.values(target.layouts).some(x=>x.name==='Güncel' && x.doc.grid===''), 'previous saved layout remains available');
  const id=storage.getItem('chartHubLayoutId'); assert.equal(target.layouts[id].doc.grid,'2h');
  assert.equal(target.layouts[id].doc.chart.drawBook.BTCUSD.drawings[0].id,'line');
  assert.equal(JSON.parse(storage.getItem('chartHub')).tf,'W1');
  assert.equal(JSON.parse(storage.getItem('chartHubTheme')).preset,'light');
  assert.equal(JSON.parse(storage.getItem('chartHubWatchlist'))[0].ticker,'BINF_BTCUSDT');
  assert.deepEqual(JSON.parse(storage.getItem('chartHubTimeframeFavorites')),['W1','MN1']);
  assert.equal(storage.getItem('sb-secret-auth-token'),'do-not-export');
  const bad=JSON.parse(text);bad.preferences.chartHubTimeframeFavorites='{}';
  const before=JSON.stringify(target);await assert.rejects(restore.importData(JSON.stringify(bad)),/Geçersiz ayar/);assert.equal(JSON.stringify(target),before);
  await assert.rejects(restore.importData('{broken'),/JSON/);
  await assert.rejects(restore.importData('x'.repeat(w.TradeXSettingsBackup.MAX_BYTES+1)),/25 MB/);
  const invalidTemplate=JSON.parse(text);invalidTemplate.templates[0].doc.inds={};
  await assert.rejects(restore.importData(JSON.stringify(invalidTemplate)),/şablon/);
  const poisoned=JSON.parse(text);poisoned.current.doc.hub=JSON.parse('{"__proto__":{"admin":true}}');
  await assert.rejects(restore.importData(JSON.stringify(poisoned)),/geçersiz alan/);
  const rollbackDb={layouts:{existing:{name:'Keep',summary:'',doc:oldDoc}},templates:{}};
  const rollbackApi=apiFor(rollbackDb);rollbackApi.failAt(2);
  const rollback=w.TradeXSettingsBackup.create({api:rollbackApi,snapshot:async()=>{},currentId:()=>'',currentName:()=>'',storage});
  const oldPrefs=storage.getItem('chartHubTheme'), oldId=storage.getItem('chartHubLayoutId');
  await assert.rejects(rollback.importData(text),/geri alındı/);
  assert.deepEqual(Object.keys(rollbackDb.layouts),['existing']);assert.equal(storage.getItem('chartHubTheme'),oldPrefs);assert.equal(storage.getItem('chartHubLayoutId'),oldId);
  // A local quota failure after remote writes rolls back both preference values and newly-created records.
  const quotaDb={layouts:{},templates:{}}, quotaApi=apiFor(quotaDb); let thrown=false;
  const quotaStore={getItem:k=>storage.getItem(k),removeItem:k=>storage.removeItem(k),setItem(k,v){if(k==='tradexDrawFavs'&&!thrown){thrown=true;throw Error('quota');}storage.setItem(k,v);}};
  const quota=w.TradeXSettingsBackup.create({api:quotaApi,snapshot:async()=>{},currentId:()=>'',currentName:()=>'',storage:quotaStore});
  await assert.rejects(quota.importData(text),/quota/);assert.equal(Object.keys(quotaDb.layouts).length,0);assert.equal(Object.keys(quotaDb.templates).length,0);
  assert.equal(storage.getItem('chartHubTheme'),oldPrefs);assert.equal(storage.getItem('chartHubLayoutId'),oldId);
  // Actual settings panel controls: cancel does not import, errors are visible and retries work.
  w.eval(fs.readFileSync('hub/settings_backup_ui.js','utf8'));w.TradeXBackupUI.mount(d.getElementById('panel'));
  const [download,upload]=d.querySelectorAll('#panel button'), input=d.querySelector('input[type=file]'), status=d.querySelector('[role=status]');
  let fileClicks=0,importCalls=0;input.click=()=>fileClicks++; upload.click();assert.equal(fileClicks,1);
  Object.defineProperty(input,'files',{configurable:true,value:[{size:text.length,text:async()=>text}]});
  w.confirm=()=>false;w.layoutsImportBackup=async()=>{importCalls++;};input.dispatchEvent(new w.Event('change'));await tick();
  assert.equal(importCalls,0);assert.match(status.textContent,/iptal/);
  w.confirm=()=>true;w.layoutsImportBackup=async()=>{throw Error('offline');};input.dispatchEvent(new w.Event('change'));await tick();
  assert.match(status.textContent,/offline/);assert.equal(upload.disabled,false);
  w.layoutsExportBackup=async()=>{throw Error('no chart');};download.click();await tick();assert.match(status.textContent,/no chart/);assert.equal(download.disabled,false);
  // The real web guest shim persists and can restore these documents through the same API.
  w.Response=global.Response;w.fetch=async()=>{throw Error('unexpected native fetch');};w.TXWebFeeds={probeAll(){},feeds:{},health:{}};
  w.eval(fs.readFileSync('hub/web/api_shim.js','utf8'));
  const webApi=async(path,body)=>{const response=await w.fetch('/api/layouts'+path,body?{method:'POST',body:JSON.stringify(body)}:{});const result=await response.json();if(!response.ok)throw Error(result.error);return result;};
  const webBackup=w.TradeXSettingsBackup.create({api:webApi,snapshot:async()=>clone(active),currentId:()=>'',currentName:()=> 'Aktif',storage});
  await webBackup.importData(text);const webList=await webApi('');assert.equal(webList.layouts.length,3);assert.equal(webList.templates.length,1);
  const webExport=JSON.parse(await webBackup.exportData());assert.equal(webExport.layouts.length,3);assert.equal(webExport.current.doc.chart.drawBook.BTCUSD.drawings[0].id,'line');
  // Signed-in requests route to the account implementation rather than silently modifying guest storage.
  let routed=false;w.TXAuth={whenReady:Promise.resolve(),ready:true,user:{id:'account'},layouts:async()=>{routed=true;return new Response(JSON.stringify({layouts:[],templates:[]}));}};
  await webApi('');assert.ok(routed);
  dom.window.close();console.log('Settings backup tests passed');
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
