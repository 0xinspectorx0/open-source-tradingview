# Third-party notices

This project is AGPL-3.0-only. It bundles or ships the following open-source components, each under its own licence.

| Component | Version | Licence | Where | Project |
|---|---|---|---|---|
| Vela (`@luxalgo/vela`) | 0.9.3 | Apache-2.0 + NOTICE (attribution) | `hub/vela.bundle.js`, `hub/vela_locale_tr.js` | https://github.com/luxalgo/vela |
| Vela-pinets (`@luxalgo/vela-pinets`) | 0.2.18 | AGPL-3.0-only | `hub/vela.bundle.js` | https://github.com/LuxAlgo/Vela-pinets |
| PineTS (`pinets`) | 0.12.1 | AGPL-3.0-only | `hub/vela.bundle.js` | https://github.com/LuxAlgo/PineTS |
| BIST symbol snapshot | 2023-10 (commit `556a793`) | MIT | `hub/feeds/_bist_list.py` | https://github.com/ahmeterenodaci/Istanbul-Stock-Exchange--BIST--including-symbols-and-logos |

Licence texts: [LICENSE](LICENSE) (AGPL-3.0), [licenses/Apache-2.0.txt](licenses/Apache-2.0.txt),
[licenses/MIT-bist-symbols.txt](licenses/MIT-bist-symbols.txt).
Notice file: [licenses/NOTICE-vela.txt](licenses/NOTICE-vela.txt).

## Attribution requirements you must keep

- **Vela:** every screen that shows a Vela chart must show a visible Vela attribution. The library draws its
  logomark on the chart by default. Do not hide it unless you show "Vela" with a link to https://velacharts.dev
  on the same screen.

## Changes to Vela

`build/patch_wick.js` modifies the bundled Vela 0.9.3 output to support a configurable wick width and display-only
market/source labels. Provider identifiers and data routing remain unchanged. The patch is reapplied by `npm run build`.

In addition, `scripts/build_web.py` (`patch_candles`) changes one line of the web copy of `hub/vela.bundle.js`: candle bodies are
drawn with a lighter left edge, a darker right edge and a soft shadow (TradeX "Matte 3D + Lift" look). The desktop
bundle in `hub/` is unchanged.

## Rebuilding the bundled files

`hub/vela.bundle.js` and the Turkish locale are built from the exact versions pinned in `build/package-lock.json`:

```bash
cd build
npm ci
npm run build     # -> ../hub/vela.bundle.js (byte-identical to the shipped file with these versions)
```
