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
    "#txauth{flex:none;margin-left:auto;position:sticky;right:0;z-index:2;box-shadow:-14px 0 12px -4px var(--panel,#131416);display:flex;align-items:center;gap:7px;height:26px;padding:0 10px;border-radius:4px;cursor:pointer;",
    "background:#e8ecee;color:#0a0a0b;border:1px solid #e8ecee;font:600 12px/24px var(--font,system-ui);white-space:nowrap}",
    "#txauth:hover{background:#fff}#txauth:active{transform:translateY(1px)}",
    "#txauth.in{background:transparent;color:#e8ecee;border-color:#2a2d31;font-weight:500}#txauth.in:hover{border-color:#797e86}",
    "#txauth .av{width:18px;height:18px;border-radius:50%;background:#1c1e21;color:#e8ecee;display:grid;place-items:center;font-size:10px;font-weight:700;overflow:hidden}",
    "#txauth .av img{width:100%;height:100%;object-fit:cover}",
    "#txauthm{position:fixed;z-index:100001;width:272px;padding:14px;border-radius:4px;background:#131416;border:1px solid #2a2d31;",
    "box-shadow:0 18px 48px rgba(0,0,0,.55);color:#b4bcbf;font:12px/1.5 var(--font,system-ui)}",
    "#txauthm h4{margin:0 0 4px;color:#e8ecee;font-size:14px;font-weight:600}#txauthm p{margin:0 0 12px}",
    "#txauthm button.pv{display:flex;align-items:center;gap:10px;width:100%;height:36px;margin:0 0 8px;padding:0 12px;border-radius:4px;cursor:pointer;",
    "background:#1c1e21;color:#e8ecee;border:1px solid #2a2d31;font:500 13px var(--font,system-ui)}",
    "#txauthm button.pv:hover{border-color:#797e86}#txauthm button.pv:disabled{opacity:.55;cursor:wait}#txauthm button.pv img{width:16px;height:16px}",
    "#txauthm .em{color:#e8ecee;font-weight:600;word-break:break-all}#txauthm .err{color:#d65b4b;margin:8px 0 0}",
    "#txauthm .out{background:transparent;justify-content:center}#txauthm .fine{margin:10px 0 0;color:#797e86;font-size:11px}",
  ].join("");
  document.head.appendChild(css);

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const nameOf = (u) => (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.user_name)) || u.email || "Account";

  function paint() {
    if (!btn) return;
    const u = A.user;
    btn.className = u ? "in" : "";
    if (!u) { btn.textContent = "Sign in"; btn.title = "Sign in to keep your layouts on every device"; return; }
    const pic = u.user_metadata && u.user_metadata.avatar_url;
    btn.innerHTML = `<span class="av">${pic ? `<img src="${esc(pic)}" alt="">` : esc(nameOf(u).slice(0, 1).toUpperCase())}</span><span>${esc(nameOf(u).split(" ")[0].slice(0, 16))}</span>`;
    btn.title = u.email || "";
  }
  function closeMenu() { if (menu) { menu.remove(); menu = null; } }
  function openMenu(err) {
    closeMenu();
    menu = document.createElement("div"); menu.id = "txauthm";
    const u = A.user;
    menu.innerHTML = u
      ? `<h4>Signed in</h4><p class="em">${esc(u.email || nameOf(u))}</p><p>Your layouts and indicator templates are saved to this account.</p>
         <button class="pv out" data-a="out">Sign out</button>`
      : `<h4>Sign in to TradeX</h4><p>Keep your layouts and indicator templates on every device.</p>
         ${A.providers.map((p) => { const n = p === "google" ? "Google" : "GitHub"; return `<button class="pv" data-a="${p}" ${busy ? "disabled" : ""}><img src="https://cdn.simpleicons.org/${p}/e8ecee" alt="">${busy === p ? "Opening " + n + "..." : "Continue with " + n}</button>`; }).join("")}
         <p class="fine">TradeX stores only your account id, email and your saved layouts. No passwords.</p>`;
    if (err) menu.insertAdjacentHTML("beforeend", `<p class="err">${esc(err)}</p>`);
    menu.onclick = async (e) => {
      const b = e.target.closest("button[data-a]"); if (!b) return;
      if (b.dataset.a === "out") { await sb.auth.signOut(); closeMenu(); return; }
      busy = b.dataset.a; openMenu();
      const { error } = await sb.auth.signInWithOAuth({ provider: busy, options: { redirectTo: location.origin + "/hub.html" } });
      if (error) { busy = ""; openMenu("Sign-in could not start: " + error.message); }
    };
    document.body.appendChild(menu);
    const r = btn.getBoundingClientRect();
    menu.style.top = r.bottom + 6 + "px"; menu.style.left = Math.max(8, Math.min(r.right - 272, innerWidth - 280)) + "px";
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
    const bar = document.getElementById("bar"); if (bar) bar.appendChild(btn);
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
