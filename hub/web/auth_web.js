// TradeX web beta: sign in with Google or GitHub (Supabase Auth, no TradeX server).
// Signed in: layouts and indicator templates are saved to the person's account (table tradex_docs, row-level security:
// each user reads and writes only their own rows) and follow them to any device. Signed out: this browser's storage.
// Turned on by web/auth_config.json {"url": "...supabase.co", "anonKey": "..."}; empty values = no Sign in button.
(function () {
  "use strict";
  if (window.parent !== window) return;   // top page only (the hub); chart frames never sign in
  const SDK = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js";
  const A = (window.TXAuth = { user: null, ready: false });
  let sb = null, btn = null, menu = null, busy = "";

  const css = document.createElement("style");
  css.textContent = [
    // Own corner at the right of the top bar (outside the scrolling row), so it never covers the bar's buttons.
    "#bar{margin-right:44px}",
    "#txauth{position:absolute;top:5px;right:9px;z-index:20;display:grid;place-items:center;width:28px;height:28px;padding:0;border-radius:50%;cursor:pointer;",
    "background:#1c1e21;border:0;box-shadow:0 0 0 1px #2a2d31}",
    "#txauth:hover{box-shadow:0 0 0 2px #797e86}#txauth:active{transform:translateY(1px)}",
    "#txauth .ic{width:18px;height:18px;background:#b4bcbf;-webkit-mask:url(https://cdn.jsdelivr.net/npm/@phosphor-icons/core@2.1.1/assets/regular/user.svg) center/contain no-repeat;mask:url(https://cdn.jsdelivr.net/npm/@phosphor-icons/core@2.1.1/assets/regular/user.svg) center/contain no-repeat}",
    "#txauth:hover .ic{background:#e8ecee}",
    "#txauth.in{padding:0;width:28px;background:#1c1e21;color:#e8ecee;box-shadow:0 0 0 1px #2a2d31;overflow:hidden;font-size:12px}",
    "#txauth.in:hover{box-shadow:0 0 0 2px #797e86}#txauth.in img{width:100%;height:100%;object-fit:cover}",
    "#txauthm{position:fixed;z-index:100001;width:280px;border-radius:10px;background:#131416;border:1px solid #2a2d31;box-shadow:0 18px 48px rgba(0,0,0,.55);",
    "color:#b4bcbf;font:13px/1.5 var(--font,system-ui);overflow:hidden}",
    "#txauthm .hd{display:flex;gap:12px;align-items:center;padding:16px}#txauthm .big{width:44px;height:44px;border-radius:50%;background:#1c1e21;color:#e8ecee;",
    "display:grid;place-items:center;font-weight:700;font-size:16px;overflow:hidden;flex:none}#txauthm .big img{width:100%;height:100%;object-fit:cover}",
    "#txauthm .nm{color:#e8ecee;font-weight:600;font-size:14px}#txauthm .em{color:#797e86;font-size:12px;word-break:break-all}",
    "#txauthm .row{display:block;width:100%;text-align:left;padding:10px 16px;background:none;border:0;border-top:1px solid #2a2d31;color:#e8ecee;font:13px var(--font,system-ui);cursor:pointer;text-decoration:none}",
    "#txauthm .row:hover{background:#1c1e21}#txauthm .note{padding:0 16px 14px;color:#797e86;font-size:12px}",
  ].join("");
  document.head.appendChild(css);

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const nameOf = (u) => (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.user_name)) || u.email || "Account";

  function paint() {
    if (!btn) return;
    const u = A.user;
    btn.className = u ? "in" : "";
    if (!u) { btn.innerHTML = '<span class="ic"></span>'; btn.title = "Sign in"; btn.setAttribute("aria-label", "Sign in"); return; }
    const pic = u.user_metadata && u.user_metadata.avatar_url;
    btn.innerHTML = pic ? `<img src="${esc(pic)}" alt="">` : esc(nameOf(u).slice(0, 1).toUpperCase());
    btn.title = nameOf(u);
  }
  function closeMenu() { if (menu) { menu.remove(); menu = null; } }
  function openMenu() {
    closeMenu();
    const u = A.user; if (!u) { location.href = "web/signin.html"; return; }
    const pic = u.user_metadata && u.user_metadata.avatar_url;
    menu = document.createElement("div"); menu.id = "txauthm";
    menu.innerHTML = `<div class="hd"><span class="big">${pic ? `<img src="${esc(pic)}" alt="">` : esc(nameOf(u).slice(0, 1).toUpperCase())}</span>
      <div><div class="nm">${esc(nameOf(u))}</div><div class="em">${esc(u.email || "")}</div></div></div>
      <div class="note">Your layouts and indicator templates are saved to this account.</div>
      <button class="row" data-a="settings">Settings and theme</button>
      <button class="row" data-a="out">Sign out</button>`;
    menu.onclick = async (e) => {
      const b = e.target.closest("button[data-a]"); if (!b) return;
      if (b.dataset.a === "out") { await sb.auth.signOut(); closeMenu(); location.href = "web/signin.html"; return; }
      closeMenu(); const r = document.querySelector('#rail [data-panel="settings"]'); if (r) r.click();
    };
    document.body.appendChild(menu);
    const r = btn.getBoundingClientRect();
    menu.style.top = r.bottom + 8 + "px"; menu.style.left = Math.max(8, Math.min(r.right - 280, innerWidth - 288)) + "px";
  }
  document.addEventListener("mousedown", (e) => { if (menu && !menu.contains(e.target) && e.target !== btn && !btn.contains(e.target)) closeMenu(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });

  // ---- cloud layouts: same answers as the desktop /api/layouts (hub/layouts_store.py) ----
  const T = "tradex_docs";
  A.layouts = async function (path, q, body) {
    const uid = A.user.id, json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });
    if (path === "/api/layouts" || path === "/api/layouts/") {
      if (q.get("id")) {
        const { data, error } = await sb.from(T).select("name,saved_at,summary,doc").eq("kind", q.get("kind") || "layouts").eq("id", q.get("id")).maybeSingle();
        if (error) return json({ error: error.message }, 502);
        return data ? json(data) : json({ error: "not found" }, 404);
      }
      const { data, error } = await sb.from(T).select("kind,id,name,saved_at,summary").order("saved_at", { ascending: false });
      if (error) return json({ error: error.message }, 502);
      return json({ layouts: data.filter((x) => x.kind === "layouts"), templates: data.filter((x) => x.kind === "templates") });
    }
    let req = {}; try { req = JSON.parse(body || "{}"); } catch (_) { return json({ error: "bad JSON" }, 400); }
    const kind = req.kind || "layouts";
    if (kind !== "layouts" && kind !== "templates") return json({ error: "kind must be layouts or templates" }, 400);
    if (path.endsWith("/delete")) { await sb.from(T).delete().eq("kind", kind).eq("id", String(req.id)); return json({ ok: true }); }
    if (path.endsWith("/save")) {
      if (!req.doc || typeof req.doc !== "object") return json({ error: "doc must be an object" }, 400);
      const id = String(req.id || "") || Math.random().toString(36).slice(2, 14);
      const { error } = await sb.from(T).upsert({ user_id: uid, kind, id, name: String(req.name || "").trim().slice(0, 60) || "Untitled",
        saved_at: Math.floor(Date.now() / 1000), summary: String(req.summary || "").slice(0, 120), doc: req.doc });
      return error ? json({ error: "could not save to your account: " + error.message }, 502) : json({ ok: true, id });
    }
    return json({ error: "not found" }, 404);
  };
  // First sign-in on this browser: copy its saved layouts into the account (only ids the account does not have yet).
  async function adoptLocal() {
    let local = {}; try { local = JSON.parse(localStorage.getItem("tradexWebLayouts") || "{}"); } catch (_) {}
    const rows = [];
    for (const kind of ["layouts", "templates"]) for (const [id, v] of Object.entries(local[kind] || {})) rows.push({ user_id: A.user.id, kind, id, name: v.name, saved_at: v.saved_at, summary: v.summary, doc: v.doc });
    if (rows.length) await sb.from(T).upsert(rows, { onConflict: "user_id,kind,id", ignoreDuplicates: true });
  }

  async function start() {
    let cfg = {};
    try { cfg = await (await fetch("web/auth_config.json", { cache: "no-store" })).json(); } catch (_) {}
    if (!cfg.url || !cfg.anonKey) return;   // login not configured yet: no button
    // Show only the sign-in methods switched on in Supabase (none on = no button), so turning one on needs no redeploy.
    try { const st = await (await fetch(cfg.url + "/auth/v1/settings", { headers: { apikey: cfg.anonKey } })).json(); A.providers = ["google", "github"].filter((p) => st.external && st.external[p]); }
    catch (_) { A.providers = []; }
    if (!A.providers.length) return;
    await new Promise((res, rej) => { const s = document.createElement("script"); s.src = SDK; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    sb = window.supabase.createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, detectSessionInUrl: true, flowType: "pkce" } });
    btn = document.createElement("button"); btn.id = "txauth"; btn.onclick = () => (menu ? closeMenu() : openMenu());
    const app = document.getElementById("app"); if (app) app.appendChild(btn);
    sb.auth.onAuthStateChange((ev, session) => {
      const was = A.user && A.user.id; A.user = session ? session.user : null; busy = ""; paint();
      if (A.user && A.user.id !== was) adoptLocal().catch(() => {});
      if ((A.user && A.user.id) !== was && window.layoutsRefresh) window.layoutsRefresh();
    });
    const { data } = await sb.auth.getSession(); A.user = data.session ? data.session.user : null; A.ready = true; paint();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => start().catch((e) => console.warn("sign-in off:", e)));
  else start().catch((e) => console.warn("sign-in off:", e));
})();
