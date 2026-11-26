// Exercise the real LabFeed path with mocked daily history and WebSocket updates.
const {JSDOM}=require('../../build/node_modules/jsdom');
const assert=require('node:assert/strict'),fs=require('node:fs');
const dom=new JSDOM('<!doctype html><html><head></head><body></body></html>',{url:'http://example.test/vela.html?tf=MN1',runScripts:'outside-only'});
const w=dom.window, ts=s=>Date.parse(s+'T00:00:00Z')/1000;
const rows=[{time:ts('2024-02-01'),open:10,high:12,low:9,close:11,volume:3},{time:ts('2024-02-02'),open:11,high:13,low:10,close:12,volume:4}];
let socket, urls=[];
w.LabSymbols=[]; w.srcOf=()=> 'bybit';
w.fetch=async u=>{urls.push(u);return {ok:true,json:async()=>rows}};
w.WebSocket=class {constructor(){socket=this} send(v){this.sent=JSON.parse(v)} close(){this.closed=true}};
w.eval(fs.readFileSync('hub/periods.js','utf8')); w.eval(fs.readFileSync('hub/lab.js','utf8'));
(async()=>{
 assert.equal(w.LabDefaultTF,'MN1');assert.equal(w.LabTF.fromAny('1M'),'MN1');assert.equal(w.LabTF.fromAny('1m'),'M1');assert.equal(w.LabTF.fromAny('1W'),'W1');
 const history=await w.LabFeed.history('BTC','MN1',null,1);
 assert.equal(history[0].time,ts('2024-02-01'));assert.equal(history[0].volume,7);assert.ok(urls.every(u=>u.includes('tf=D1')));
 let live;const stop=w.LabFeed.live('BTC','MN1',b=>live=b,'bybit');
 await new Promise(r=>setTimeout(r,10));socket.onopen();assert.equal(socket.sent.tf,'D1');
 socket.onmessage({data:JSON.stringify({type:'bar',bar:{time:ts('2024-02-02'),open:11,high:20,low:10,close:19,volume:8}})});
 assert.equal(live.open,10);assert.equal(live.high,20);assert.equal(live.close,19);assert.equal(live.volume,11);assert.equal(live.time,ts('2024-02-01'));
 stop(); assert.equal(socket.closed,true);dom.window.close();console.log('Period feed live tests passed');
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1});
