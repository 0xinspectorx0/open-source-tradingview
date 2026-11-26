# TradeX web beta (tradex.pages.dev)

Hosted on Cloudflare Pages since 2026-11-25 (free, unlimited static requests). The old address
tradex-charts.vercel.app shows a "TradeX has moved" page that forwards here.

The same TradeX pages, normally served as a static site. For the standard exchange feeds each visitor's browser
fetches data itself. Optional BIST support uses a Cloudflare Pages Function (see below), not browser-to-Yahoo requests.

## How it works
| Desktop app asks the server for | Web beta answers in the browser (`hub/web/`) |
|---|---|
| `/api/bars` history | `feeds_web.js`: Binance, Bybit, Deriv, Coinbase, Kraken, OKX REST straight from the browser |
| live candles over `ws://<host>:8765` | `api_shim.js` swaps that socket for the exchange's own WebSocket (Coinbase, Kraken, OKX: polled every few seconds) |
| `/api/symbols`, `/api/instruments`, Symbol Search | `hub/web/data/*.json`, made by the build on a laptop, searched in the browser with the desktop ranking |
| `/api/status` | which feeds answered this browser |
| `/api/layouts` | this browser's `localStorage` |
| `/api/orderflow/delta`, `profile`, `footprint` | `orderflow_web.js` (port of `hub/orderflow_api.py`, results identical): real taker-buy volume from Binance futures, else Binance spot (works where futures is blocked), else estimated. Footprint uses 1-minute buy/sell totals (no trade-by-trade data on the web) |
| logs, restart, MT5, alerts | not in the web beta (desktop version) |

`api_shim.js` is injected as the first script of each page **in the build copy only**; the desktop pages are never
edited for the web. Theme: the "TradeX brand" preset in `hub/theme.js` is the web default.

Limits: Binance and Bybit refuse visitors from some countries (their light turns grey, the other feeds still work).
OKX charts stop at 1,500 candles and Coinbase at 3,000 (small pages per request); Kraken gives 720.

## Optional BIST support on mobile and desktop browsers

The web build adds the bundled desktop BIST symbol snapshot (2023, potentially stale), BIST 100 and BIST 30,
and experimental VIOP entries to symbol search. Choose **BIST (Yahoo, delayed)** and search for `THYAO`, `XU100`,
`XU030` or a VIOP code. A listed symbol is not a guarantee of Yahoo coverage; in particular the VIOP codes may
return no data. Prices are delayed reference data, not an order book. Chart updates poll once a minute. Historical
limits and actual delays are set by Yahoo; the full market and current listings are not guaranteed.

Yahoo does not allow these browser cross-origin requests, so this requires the same-origin Cloudflare Pages Function
`functions/market-data/bist.js`. Building `web_dist/` alone or serving it with a static server (including Vercel's
static-only deployment) is **not sufficient**; the BIST feed will report an unavailable endpoint. Run
`npx wrangler pages dev web_dist` from the repository root for local development, or deploy from the repository root
with `npx wrangler pages deploy web_dist --project-name <your project>` so Wrangler includes `functions/`. Other
hosts need to implement the same endpoint themselves. Never expose the desktop hub ports to the internet.

The function uses Yahoo's unofficial endpoint. The operator is responsible for checking its terms and exchange data
licences before enabling or redistributing it, and for configuring Cloudflare rate limits and monitoring quotas/costs.
Yahoo or Cloudflare may block, throttle or charge for requests. No account, credentials or proxy URL are accepted by
this endpoint; it is not a general-purpose proxy. Not verified against Yahoo from restricted build environments.

## Build and deploy
```
python scripts/build_web.py --refresh-lists   # laptop only: re-make hub/web/data/ (runs a clean public server copy)
python scripts/build_web.py                   # copy + inject + personal-data scan -> web_dist/ (fails on any hit)
npx wrangler pages deploy <copy of web_dist without .vercel/ and vercel.json> --project-name <your project>
# addresses: / = sign-in, /hub = chart (Pages drops .html); web_dist/_headers and _redirects are read by Pages
```
Lists are made on a laptop, never on Vercel: Vercel builds run in the US, where Binance.com and Bybit refuse requests.
The repo's `vercel.json` is ready for Vercel to build from GitHub (it only copies and scans, no network); that path is not tested yet.
