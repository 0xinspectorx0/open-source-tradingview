// Cloudflare Pages Function: delayed Yahoo BIST reference candles for the web build.
// Public, read-only and intentionally NOT a general-purpose URL proxy. See docs/WEB_BETA.md
// before deploying: the operator must verify provider terms and provision abuse controls.
const TF = {
  M1: ["1m", 60, 7], M5: ["5m", 300, 60], M15: ["15m", 900, 60],
  M30: ["30m", 1800, 60], H1: ["60m", 3600, 730], H4: ["60m", 3600, 730],
  D1: ["1d", 86400, 365 * 5],
};
const reply = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": status === 200 ? "public, max-age=30" : "no-store", "X-Content-Type-Options": "nosniff" },
});

export async function onRequestGet({ request }) {
  const q = new URL(request.url).searchParams;
  const ticker = q.get("symbol") || "", tf = q.get("tf") || "D1", spec = TF[tf];
  const rawLimit = q.get("limit") || "1000", rawTo = q.get("to");
  if (!/^BIST_[A-Z0-9]{1,12}$/.test(ticker) || !spec || !/^\d{1,4}$/.test(rawLimit) ||
      +rawLimit < 1 || +rawLimit > 5000 || (rawTo !== null && !/^\d{10,14}$/.test(rawTo))) {
    return reply({ error: "Invalid BIST symbol, timeframe, limit or cutoff" }, 400);
  }
  const now = Math.floor(Date.now() / 1000);
  const end = rawTo === null ? now : Math.min(now, Math.floor(+rawTo / 1000));
  if (end < 1) return reply({ error: "Invalid cutoff" }, 400);
  // Yahoo limits intraday history. Wider calendar windows compensate for non-trading days.
  const [interval, seconds, maxDays] = spec;
  const oldest = now - maxDays * 86400;
  if (end <= oldest) return reply([]);
  const wanted = +rawLimit * (tf === "H4" ? 4 : 1);
  const start = Math.max(oldest, end - Math.max(7 * 86400, wanted * seconds * 3));
  const symbol = ticker.slice(5) + ".IS";
  const target = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  target.search = new URLSearchParams({ period1: String(start), period2: String(end), interval, events: "div,splits" });
  let upstream;
  try {
    upstream = await fetch(target, { headers: { "User-Agent": "TradeX/1.0" }, signal: AbortSignal.timeout(12000) });
    if (!upstream.ok) return reply({ error: `Yahoo returned HTTP ${upstream.status}` }, 502);
    const data = await upstream.json();
    const r = data?.chart?.result?.[0];
    if (!r) return reply({ error: "Yahoo has no data for this symbol or timeframe" }, 502);
    const quote = r.indicators?.quote?.[0] || {}, out = [];
    for (let i = 0; i < (r.timestamp || []).length; i++) {
      const time = r.timestamp[i], values = [quote.open?.[i], quote.high?.[i], quote.low?.[i], quote.close?.[i]];
      if (!Number.isFinite(time) || time >= end || values.some(v => !Number.isFinite(v))) continue;
      const [open, high, low, close] = values, volume = Number.isFinite(quote.volume?.[i]) ? quote.volume[i] : 0;
      out.push({ time, open, high, low, close, volume });
    }
    out.sort((a, b) => a.time - b.time);
    if (tf !== "H4") return reply(out.slice(-(+rawLimit)));
    const joined = [];
    for (const b of out) {
      const time = b.time - b.time % 14400, last = joined[joined.length - 1];
      if (!last || last.time !== time) joined.push({ ...b, time });
      else { last.high = Math.max(last.high, b.high); last.low = Math.min(last.low, b.low); last.close = b.close; last.volume += b.volume; }
    }
    return reply(joined.slice(-(+rawLimit)));
  } catch (_) {
    return reply({ error: "Yahoo BIST service is unavailable" }, 502);
  }
}
