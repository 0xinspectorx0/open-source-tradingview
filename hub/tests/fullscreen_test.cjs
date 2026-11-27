// Fullscreen state, failure and mobile/desktop web banner behavior without external services.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('../../build/node_modules/jsdom');
const js=fs.readFileSync('hub/fullscreen.js','utf8'), shim=fs.readFileSync('hub/web/api_shim.js','utf8');
const tick=()=>new Promise(r=>setTimeout(r,0));
function fullscreenDom(){
  const dom=new JSDOM('<!doctype html><html><body><div id="app"></div><button id="fullscreenBtn"><svg><path></path></svg></button><div id="fullscreenStatus" hidden></div></body></html>',{url:'https://example.test/hub.html',runScripts:'outside-only'});
  return {dom,w:dom.window,d:dom.window.document};
}
function bannerDom(isMobile,legacy=false){
  const dom=new JSDOM('<!doctype html><html><head></head><body><div id="app"><span id="brand">TradeX</span></div></body></html>',{url:'https://example.test/hub.html',runScripts:'outside-only'}),w=dom.window;
  const mq={matches:isMobile, listeners:[],set(v){this.matches=v;for(const fn of this.listeners)fn({matches:v});}};
  if(legacy) mq.addListener=fn=>mq.listeners.push(fn); else mq.addEventListener=(type,fn)=>mq.listeners.push(fn);
  w.matchMedia=q=>{assert.equal(q,'(max-width:640px), (hover:none) and (pointer:coarse)');return mq;};
  w.TXWebFeeds={feeds:{},health:{},SEC:{},probeAll(){}};w.fetch=async()=>({json:async()=>({})});w.WebSocket=class{};
  w.eval(shim);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return {dom,w,d:w.document,mq};
}
(async()=>{
  let {dom,w,d}=fullscreenDom(),root=d.documentElement,active=null,called=[];
  Object.defineProperty(d,'fullscreenElement',{get:()=>active,configurable:true});
  Object.defineProperty(d,'fullscreenEnabled',{value:true,configurable:true});
  root.requestFullscreen=function(){called.push(this);active=root;d.dispatchEvent(new w.Event('fullscreenchange'));return Promise.resolve();};
  d.exitFullscreen=function(){called.push(this);active=null;d.dispatchEvent(new w.Event('fullscreenchange'));return Promise.resolve();};
  w.eval(js);const button=d.querySelector('#fullscreenBtn'),notice=d.querySelector('#fullscreenStatus');
  assert.equal(button.getAttribute('aria-label'),'Tam ekran');assert.equal(button.getAttribute('aria-pressed'),'false');
  button.click();assert.equal(called[0],root,'the entire document is fullscreened in the gesture');await tick();
  assert.equal(button.getAttribute('aria-pressed'),'true');assert.equal(button.getAttribute('aria-label'),'Tam ekrandan çık');
  button.click();await tick();assert.equal(called[1],d);assert.equal(button.getAttribute('aria-pressed'),'false');
  button.click();await tick();active=null;d.dispatchEvent(new w.Event('fullscreenchange'));assert.equal(button.getAttribute('aria-pressed'),'false','Esc/browser exit updates button');
  root.requestFullscreen=()=>Promise.reject(Error('permission denied'));button.click();await tick();assert.equal(button.disabled,false);assert.equal(notice.hidden,false);assert.match(notice.textContent,/izin/);
  root.requestFullscreen=()=>{throw Error('blocked');};button.click();assert.equal(button.disabled,false);assert.equal(notice.hidden,false);
  Object.defineProperty(d,'fullscreenEnabled',{value:false,configurable:true});button.click();assert.match(notice.textContent,/kullanılamıyor/);
  dom.window.close();
  ({dom,w,d}=fullscreenDom());w.eval(js);d.querySelector('#fullscreenBtn').click();assert.match(d.querySelector('#fullscreenStatus').textContent,/kullanılamıyor/,'unsupported mobile shows an explanation');dom.window.close();
  ({dom,w,d}=fullscreenDom());root=d.documentElement;active=null;
  Object.defineProperty(d,'webkitFullscreenElement',{get:()=>active});root.webkitRequestFullscreen=()=>{active=root;d.dispatchEvent(new w.Event('webkitfullscreenchange'));};d.webkitExitFullscreen=()=>{active=null;d.dispatchEvent(new w.Event('webkitfullscreenchange'));};
  w.eval(js);d.querySelector('#fullscreenBtn').click();await tick();assert.equal(d.querySelector('#fullscreenBtn').getAttribute('aria-pressed'),'true');
  d.querySelector('#fullscreenBtn').click();await tick();assert.equal(d.querySelector('#fullscreenBtn').getAttribute('aria-pressed'),'false');dom.window.close();
  // Mobile starts without banner or top offset; dynamic rotation/resize and dismissal work.
  let b=bannerDom(true);assert.equal(b.d.querySelector('#txweb'),null);assert.equal(b.d.documentElement.classList.contains('txweb-banner'),false);
  assert.ok(b.d.querySelector('#brand .txlogo'),'brand is retained');b.mq.set(false);
  assert.ok(b.d.querySelector('#txweb .wl'));assert.ok(b.d.documentElement.classList.contains('txweb-banner'));
  b.mq.set(true);assert.equal(b.d.querySelector('#txweb'),null);assert.equal(b.d.documentElement.classList.contains('txweb-banner'),false);
  b.mq.set(false);b.d.querySelector('#txweb .x').click();assert.equal(b.d.querySelector('#txweb'),null);assert.equal(b.w.sessionStorage.getItem('txwebBanner'),'0');
  b.mq.set(true);b.mq.set(false);assert.equal(b.d.querySelector('#txweb'),null,'dismissal survives resize');
  const css=b.d.querySelector('style').textContent;assert.match(css,/@media \(max-width:640px\), \(hover:none\) and \(pointer:coarse\)\{#txweb\{display:none\}html\.txweb-banner #app\{top:0!important\}/);
  assert.match(css,/html:fullscreen #txweb\{display:none\}html\.txweb-banner:fullscreen #app\{top:0!important\}/);b.dom.window.close();
  b=bannerDom(false,true);assert.ok(b.d.querySelector('#txweb'));b.mq.set(true);assert.equal(b.d.querySelector('#txweb'),null,'older media-query listener supported');b.dom.window.close();
  console.log('Fullscreen and mobile banner tests passed');
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
