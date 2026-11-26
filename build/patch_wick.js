// TradeX customization for Vela 0.9.3. Keep this after esbuild; fail loudly if upstream changes.
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../hub/vela.bundle.js');
const text = fs.readFileSync(file, 'utf8');
const original = 'function rw(e){let t=Math.max(.5,Math.floor(e*.7)/2);return Math.max(1,Math.min(xU,t))}';
const patched = 'function rw(e){let t=Math.max(.5,Math.floor(e*.7)/2),w=typeof window!=="undefined"?Number(window.__txWickWidth):1.5;return Math.max(1,Math.min(Number.isFinite(w)?Math.max(1,Math.min(5,w)):1.5,t))}';
if (text.split(original).length !== 2) throw new Error('Vela wick geometry changed; update patch_wick.js before rebuilding');
let out = text.replace(original, patched);
// Only the display layer changes: provider IDs and tickers still route exactly as before.
function replaceOnce(a, b) {
  if (out.split(a).length !== 2) throw new Error('Vela statusline changed; update patch_wick.js before rebuilding');
  out = out.replace(a, b);
}
replaceOnce('this.symbolEl.className="vela-sl-symbol",this.symbolEl.textContent=r,this.metaEl=',
  'this.symbolEl.className="vela-sl-symbol",this.txSymbol=r,this.symbolEl.textContent=window.TradeXMarketName?.(r)||r,this.metaEl=');
replaceOnce('setSymbol(e){let t=$t(e).ticker;this.symbolEl.textContent=t;let i=qf(this.el.ownerDocument',
  'setSymbol(e){let t=$t(e).ticker;this.txSymbol=t,this.symbolEl.textContent=window.TradeXMarketName?.(t)||t;let i=qf(this.el.ownerDocument');
replaceOnce('setMeta(e,t){this.meta={timeframe:e,provider:t},this.metaEl.textContent=',
  'setMeta(e,t){this.meta={timeframe:e,provider:t},t=window.TradeXMarketSource?.(this.txSymbol)||t,this.metaEl.textContent=');
replaceOnce('symbol:$t(e).ticker,timeframe:yr(t,i)', 'symbol:window.TradeXMarketName?.($t(e).ticker)||$t(e).ticker,timeframe:yr(t,i)');
fs.writeFileSync(file, out);
