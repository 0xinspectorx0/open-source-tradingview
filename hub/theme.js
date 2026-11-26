// TradeX theme: presets + the user's own overrides (Settings panel), shared by the wrapper and all engines.
// Saved in localStorage "chartHubTheme" (same origin, so every engine iframe reads the same settings).
window.HubPresets = {
  tradex: { label: "TradeX markası (logo)", mode: "dark",   // Saifullah's brand CORE 2026-11-25: chrome silver on black, bull green / bear red
    bg: "#0a0a0b", panel: "#131416", raised: "#1c1e21", line: "#2a2d31", grid: "#1c1e21",
    text: "#e8ecee", dim: "#b4bcbf", faint: "#797e86", accent: "#e8ecee", accentInk: "#0a0a0b",
    up: "#46a76f", down: "#d65b4b", ok: "#46a76f", bad: "#d65b4b" },
  graphite: { label: "Grafit ve kehribar", mode: "dark",   // chosen 2026-11-02 (_design/concepts/A_graphite_amber_1.jpg)
    bg: "#151412", panel: "#1b1a17", raised: "#24221e", line: "#2f2c27", grid: "#1f1d1a",
    text: "#e6dfd2", dim: "#958c7e", faint: "#5e584f", accent: "#e3a33a", accentInk: "#1a1407",
    up: "#e3a33a", down: "#b4472f", ok: "#8fb36a", bad: "#c9553c" },
  black: { label: "Tam siyah", mode: "dark",
    bg: "#000000", panel: "#0b0b0b", raised: "#181818", line: "#262626", grid: "#121212",
    text: "#ececec", dim: "#8a8a8a", faint: "#4a4a4a", accent: "#e3a33a", accentInk: "#141005",
    up: "#e3a33a", down: "#b4472f", ok: "#8fb36a", bad: "#c9553c" },
  light: { label: "Açık (beyaz)", mode: "light",
    bg: "#ffffff", panel: "#f6f4f0", raised: "#ebe7e0", line: "#dcd6cc", grid: "#f0ede8",
    text: "#1d1b18", dim: "#6f685e", faint: "#b3ab9f", accent: "#b8761a", accentInk: "#ffffff",
    up: "#1d1b18", down: "#c0442b", ok: "#4e7d2c", bad: "#c0442b" },
};
// Font choices: the default system font plus smoother, rounder faces (loaded from Google Fonts when picked).
window.HubFonts = {
  system: { label: "Segoe UI (varsayılan)", css: '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif' },
  nunito: { label: "Nunito (yuvarlak)", css: '"Nunito", "Segoe UI", sans-serif', gf: "Nunito:wght@400;600;700" },
  manrope: { label: "Manrope (yumuşak)", css: '"Manrope", "Segoe UI", sans-serif', gf: "Manrope:wght@400;600;700" },
  quicksand: { label: "Quicksand (çok yuvarlak)", css: '"Quicksand", "Segoe UI", sans-serif', gf: "Quicksand:wght@400;600;700" },
  inter: { label: "Inter (nötr)", css: '"Inter", "Segoe UI", sans-serif', gf: "Inter:wght@400;600;700" },
};
window.HubThemeKeys = ["bg", "panel", "raised", "line", "grid", "text", "dim", "faint", "accent", "accentInk", "up", "down", "ok", "bad"];

function hexA(hex, a) { // "#rrggbb" + alpha -> rgba()
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
// Canvas and WebGL both accept #RRGGBBAA; keep opaque colours in their original form.
window.HubCandleColor = (hex, opacity) => opacity >= 100 ? hex : hex + Math.round(opacity * 255 / 100).toString(16).padStart(2, "0");
window.HubSettingsLoad = () => {
  let s = {};
  try { s = JSON.parse(localStorage.getItem("chartHubTheme") || "{}"); } catch (_) {}
  // watermark = strength of the symbol name behind the candles, 0-40 (%); Vela's own default is 5.
  const wm = Number.isFinite(+s.watermark) && s.watermark !== null && s.watermark !== "" ? Math.max(0, Math.min(40, +s.watermark)) : 5;
  const c = s.candleStyle && typeof s.candleStyle === "object" ? s.candleStyle : {};
  const color = (v) => /^#[0-9a-f]{6}$/i.test(v || "") ? v : null;
  const opacity = (v) => v !== null && v !== "" && Number.isFinite(Number(v)) ? Math.round(Math.max(0, Math.min(100, Number(v)))) : 100;
  const candleStyle = { bodyVisible: c.bodyVisible !== false, borderVisible: c.borderVisible !== false, wickVisible: c.wickVisible !== false,
    borderUp: color(c.borderUp), borderDown: color(c.borderDown), wickUp: color(c.wickUp), wickDown: color(c.wickDown),
    bodyUpOpacity: opacity(c.bodyUpOpacity), bodyDownOpacity: opacity(c.bodyDownOpacity),
    borderUpOpacity: opacity(c.borderUpOpacity), borderDownOpacity: opacity(c.borderDownOpacity),
    wickUpOpacity: opacity(c.wickUpOpacity), wickDownOpacity: opacity(c.wickDownOpacity),
    wickWidth: Number.isFinite(+c.wickWidth) && +c.wickWidth >= 1 && +c.wickWidth <= 5 ? +c.wickWidth : 1.5 };
  return { preset: HubPresets[s.preset] ? s.preset : (window.TX_DEFAULT_PRESET || "graphite"), font: HubFonts[s.font] ? s.font : "system", overrides: s.overrides || {}, indicatorBars: !!s.indicatorBars, watermark: wm, candleStyle, candleLook: ["flat", "lift", "matte", "matte_lift"].includes(s.candleLook) ? s.candleLook : "flat" };
};
window.HubSettingsSave = (s) => { try { localStorage.setItem("chartHubTheme", JSON.stringify(s)); } catch (_) {} if (window.layoutsDirty) window.layoutsDirty(); };  // layouts.js autosave

// Build window.HubTheme from the saved settings and push it into CSS variables. Returns the theme.
window.HubThemeApply = () => {
  const s = HubSettingsLoad(), base = HubPresets[s.preset], f = HubFonts[s.font];
  const t = Object.assign({}, base, s.overrides);
  t.preset = s.preset; t.fontKey = s.font; t.font = f.css;
  t.mono = '"Cascadia Mono", Consolas, "SFMono-Regular", monospace';
  t.upVol = hexA(t.up, 0.42); t.downVol = hexA(t.down, 0.42);
  t.lines = t.mode === "light" ? ["#1d1b18", t.accent, "#8a7f6e", "#c0442b"] : [t.text, t.accent, "#9c8f7a", "#c97a4a"];
  window.HubTheme = t;
  const st = document.documentElement.style;
  for (const k of HubThemeKeys) st.setProperty("--" + k, t[k]);
  st.setProperty("--font", t.font); st.setProperty("--mono", t.mono);
  // OHLC text is independent of candle direction, custom candle colours and opacity.
  st.setProperty("--tx-ohlc-color", t.mode === "light" ? "#00332a" : "#fffdd0");
  st.setProperty("--tx-wm", String(s.watermark / 100));   // vela.html: symbol watermark strength
  window.__txCandle = s.candleLook;   // web chart bundle: candle look (build_web.py patch_candles)
  window.__txWickWidth = s.candleStyle.wickWidth; // Vela bundle's candle geometry (CSS px)
  document.documentElement.style.colorScheme = t.mode;
  if (f.gf && !document.getElementById("gf-" + s.font)) {
    const l = document.createElement("link"); l.id = "gf-" + s.font; l.rel = "stylesheet";
    l.href = `https://fonts.googleapis.com/css2?family=${f.gf}&display=swap`; document.head.appendChild(l);
  }
  return t;
};
HubThemeApply();
