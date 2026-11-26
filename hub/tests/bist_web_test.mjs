// Offline Cloudflare function and browser-feed tests: node hub/tests/bist_web_test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const code = await readFile(new URL('../../functions/market-data/bist.js', import.meta.url), 'utf8');
const { onRequestGet } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const req = (query) => ({ request: new Request('https://example.com/market-data/bist?' + query) });
let calls = 0, target;
const originalFetch = globalThis.fetch;
const now = Math.floor(Date.now() / 1000), a = now - (now % 14400) - 14000;
globalThis.fetch = async (url) => {
  calls++; target = url;
  return Response.json({ chart: { result: [{ timestamp: [a, a + 3600, a + 7200], indicators: { quote: [{
    open: [1, 2, null], high: [3, 4, null], low: [0.5, 1, null], close: [2, 3, null], volume: [5, 7, null],
  }] } }] } });
};
try {
  let r = await onRequestGet(req('symbol=BIST_THYAO&tf=H4&limit=5'));
  assert.equal(r.status, 200);
  assert.equal(target.hostname, 'query1.finance.yahoo.com');
  assert.equal(target.pathname, '/v8/finance/chart/THYAO.IS');
  const bars = await r.json();
  assert.equal(bars.length, 1);
  assert.deepEqual(bars[0], { time: a - a % 14400, open: 1, high: 4, low: 0.5, close: 3, volume: 12 });
  for (const query of ['symbol=BIST_..%2Fsecret&tf=D1', 'symbol=BIST_THYAO&tf=bad', 'symbol=BIST_THYAO&tf=D1&limit=9000', 'symbol=BIST_THYAO&to=oops']) {
    r = await onRequestGet(req(query)); assert.equal(r.status, 400);
  }
  assert.equal(calls, 1, 'invalid requests must not reach upstream');
  r = await onRequestGet(req('symbol=BIST_THYAO&tf=M1&to=1000000000000'));
  assert.deepEqual(await r.json(), []);
  assert.equal(calls, 1, 'old cutoff must not reach upstream');
  globalThis.fetch = async () => new Response('blocked', { status: 429 });
  r = await onRequestGet(req('symbol=BIST_THYAO&tf=D1'));
  assert.equal(r.status, 502); assert.match((await r.json()).error, /429/);
} finally { globalThis.fetch = originalFetch; }

const browserCode = await readFile(new URL('../web/feeds_web.js', import.meta.url), 'utf8');
let url;
const context = { window: { WebSocket: class {} }, URLSearchParams, Date, Math, setTimeout,
  fetch: async (u) => { url = u; return Response.json([{ time: 123, open: 1, high: 2, low: 1, close: 2, volume: 0 }]); } };
vm.runInNewContext(browserCode, context);
const feed = context.window.TXWebFeeds.feeds.bist;
const result = await feed.history('BIST_XU100', 'D1', 3);
assert.match(url, /^\/market-data\/bist\?/); assert.equal(result[0].time, 123);
assert.match(context.window.TXWebFeeds.health.bist.msg, /Delayed/);
console.log('BIST web tests passed');
