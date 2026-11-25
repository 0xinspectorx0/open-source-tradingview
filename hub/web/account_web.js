// TradeX web: Account settings window (2026-11-25). Opened from the avatar menu. Rounded dialog in the style of Vela's
// Chart settings. Sections: Profile, Plan, Your data, Appearance, Owner (owner only), Delete account.
// Server side = Supabase functions in web/supabase_accounts.sql (tradex_me, tradex_grant, tradex_ungrant, tradex_delete_me).
(function () {
  "use strict";
  const A = window.TXAuth;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const day = (t) => (t ? new Date(t).toISOString().slice(0, 10) : "-");
  const PLAN = { free: "Free", pro: "Pro", lifetime: "Lifetime" };
  const FREE = ["Unlimited charts and indicators", "Up to 8 charts on one screen", "Pine Script editor", "Order flow: delta, volume profile, footprint",
    "Drawings and layouts saved to your account (up to 30)", "Indicator templates", "Live data: Binance, Bybit, OKX, Coinbase, Kraken, Deriv"];
  const PRO = ["24/7 price alerts with Telegram", "Trading bots", "AI market agents", "Market scanner", "Priority support"];

  const css = document.createElement("style");
  css.textContent = `
  #txacc{position:fixed;inset:0;z-index:100002;display:grid;place-items:start center;padding-top:8vh;background:rgba(0,0,0,.45)}
  #txacc .dlg{width:min(760px,94vw);max-height:84vh;display:flex;flex-direction:column;background:#131416;color:#b4bcbf;border:1px solid #2a2d31;
    border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.6);font:13px/1.5 var(--font,"Segoe UI",system-ui,sans-serif);overflow:hidden}
  #txacc .hd{display:flex;align-items:center;padding:16px 18px 14px 20px;border-bottom:1px solid #2a2d31}
  #txacc .hd b{flex:1;color:#e8ecee;font-size:17px;font-weight:600}
  #txacc .x{width:32px;height:32px;border-radius:8px;border:0;background:none;cursor:pointer;position:relative}
  #txacc .x:hover{background:#1c1e21}#txacc .x:before,#txacc .x:after{content:"";position:absolute;left:9px;top:15px;width:14px;height:1.5px;background:#b4bcbf;transform:rotate(45deg)}
  #txacc .x:after{transform:rotate(-45deg)}
  #txacc .bd{display:flex;min-height:0;flex:1}
  #txacc nav{flex:0 0 170px;padding:10px 8px;border-right:1px solid #2a2d31;display:flex;flex-direction:column;gap:2px;overflow:auto}
  #txacc nav button{text-align:left;padding:9px 12px;border-radius:8px;border:0;background:none;color:#b4bcbf;font:inherit;cursor:pointer}
  #txacc nav button:hover{background:#1c1e21;color:#e8ecee}#txacc nav button.on{background:#1c1e21;color:#e8ecee;font-weight:600}
  #txacc nav button.red{color:#d65b4b}#txacc nav .sp{flex:1}
  #txacc .pn{flex:1;min-width:0;overflow:auto;padding:18px 22px 22px}
  #txacc h4{margin:4px 0 12px;color:#797e86;font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:600}
  #txacc .card{border:1px solid #2a2d31;border-radius:12px;padding:14px 16px;margin-bottom:14px;background:#0f1012}
  #txacc .prof{display:flex;gap:14px;align-items:center}#txacc .prof img,#txacc .prof .ph{width:56px;height:56px;border-radius:50%;object-fit:cover;background:#1c1e21}
  #txacc .nm{color:#e8ecee;font-size:16px;font-weight:600}#txacc .dim{color:#797e86}
  #txacc .badge{display:inline-block;padding:1px 9px;border-radius:20px;border:1px solid #2a2d31;color:#e8ecee;font-size:11.5px;margin-left:6px}
  #txacc .badge.gold{border-color:#e8ecee}
  #txacc dl{display:grid;grid-template-columns:130px 1fr;gap:8px 12px;margin:0}#txacc dt{color:#797e86}#txacc dd{margin:0;color:#e8ecee;word-break:break-all}
  #txacc ul{margin:6px 0 0;padding-left:18px}#txacc li{margin:3px 0}
  #txacc .plans{display:grid;grid-template-columns:1fr 1fr;gap:12px}#txacc .plans .card{margin:0}#txacc .plans .cur{border-color:#e8ecee}
  #txacc button.b{height:34px;padding:0 14px;border-radius:8px;border:1px solid #2a2d31;background:#1c1e21;color:#e8ecee;font:inherit;cursor:pointer}
  #txacc button.b:hover{border-color:#797e86}#txacc button.b.pri{background:#e8ecee;color:#0a0a0b;border-color:#e8ecee}
  #txacc button.b.red{background:#d65b4b;border-color:#d65b4b;color:#0a0a0b}#txacc button.b:disabled{opacity:.5;cursor:default}
  #txacc input,#txacc select{height:34px;padding:0 10px;border-radius:8px;border:1px solid #2a2d31;background:#0a0a0b;color:#e8ecee;font:inherit}
  #txacc .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}
  #txacc table{width:100%;border-collapse:collapse;font-size:12.5px}#txacc th{text-align:left;color:#797e86;font-weight:500;padding:6px 8px;border-bottom:1px solid #2a2d31}
  #txacc td{padding:7px 8px;border-bottom:1px solid #1c1e21;color:#e8ecee;vertical-align:middle}#txacc td select{height:28px}
  #txacc .tw{overflow:auto}#txacc .msg{margin-top:8px;min-height:18px;color:#797e86}#txacc .msg.bad{color:#d65b4b}#txacc .msg.ok{color:#46a76f}
  @media (max-width:640px){#txacc .bd{flex-direction:column}#txacc nav{flex:none;flex-direction:row;overflow-x:auto;border-right:0;border-bottom:1px solid #2a2d31}#txacc .plans{grid-template-columns:1fr}}`;
  document.head.appendChild(css);

  let root = null, me = null, sec = "profile";
  const rpc = async (fn, args) => { const { data, error } = await A.sb.rpc(fn, args || {}); if (error) throw new Error(error.message); return data; };

  async function open(start) {
    sec = start || "profile";
    if (!root) {
      root = document.createElement("div"); root.id = "txacc";
      root.addEventListener("mousedown", (e) => { if (e.target === root) close(); });
      document.addEventListener("keydown", (e) => { if (root && root.isConnected && e.key === "Escape") close(); });
    }
    document.body.appendChild(root);
    try { me = await rpc("tradex_me"); } catch (e) { me = null; }
    render();
  }
  function close() { if (root) root.remove(); }

  function render() {
    const owner = me && me.role === "owner";
    const items = [["profile", "Profile"], ["plan", "Plan"], ["data", "Your data"], ["look", "Appearance"]].concat(owner ? [["owner", "Owner"]] : []);
    root.innerHTML = `<div class="dlg" role="dialog" aria-label="Account settings"><div class="hd"><b>Account settings</b><button class="x" title="Close" aria-label="Close"></button></div>
      <div class="bd"><nav>${items.map(([k, t]) => `<button data-s="${k}" class="${sec === k ? "on" : ""}">${t}</button>`).join("")}
      <span class="sp"></span><button data-s="delete" class="red ${sec === "delete" ? "on" : ""}">Delete account</button><button data-a="out">Sign out</button></nav>
      <div class="pn" id="txaccp"></div></div></div>`;
    root.querySelector(".x").onclick = close;
    root.querySelector("nav").onclick = (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.a === "out") { A.signOut(); return; }
      sec = b.dataset.s; render();
    };
    const p = root.querySelector("#txaccp");
    ({ profile, plan, data, look, owner: ownerPanel, delete: del })[sec](p);
  }

  function profile(p) {
    const u = A.user, m = (u && u.user_metadata) || {}, pic = (me && me.avatar_url) || m.avatar_url;
    p.innerHTML = `<h4>Profile</h4><div class="card prof">${pic ? `<img src="${esc(pic)}" alt="">` : '<span class="ph"></span>'}
      <div><div class="nm">${esc((me && me.name) || m.full_name || m.user_name || "Account")}<span class="badge ${me && me.plan !== "free" ? "gold" : ""}">${esc(me && me.role === "owner" ? "Owner" : PLAN[(me && me.plan) || "free"])}</span></div>
      <div class="dim">${esc(u && u.email)}</div></div></div>
      <div class="card"><dl><dt>Signed in with</dt><dd>${esc(((u && u.app_metadata && u.app_metadata.provider) || "").replace(/^./, (c) => c.toUpperCase()))}${me && me.login ? " (" + esc(me.login) + ")" : ""}</dd>
      <dt>Member since</dt><dd>${day(me && me.created_at)}</dd><dt>Plan</dt><dd>${esc(PLAN[(me && me.plan) || "free"])}${me && me.plan_note ? " - " + esc(me.plan_note) : ""}</dd>
      <dt>Account id</dt><dd class="dim">${esc(u && u.id)}</dd></dl></div>
      <div class="dim">Name and photo come from your sign-in provider and update each time you sign in.</div>`;
  }

  function plan(p) {
    const cur = (me && me.plan) || "free", owner = me && me.role === "owner";
    p.innerHTML = `<h4>Your plan</h4><div class="card"><div class="nm">${owner ? "Owner: every feature, free" : PLAN[cur]}</div>
      <div class="dim">${owner ? "You can give any plan to anyone from the Owner section." : cur === "free" ? "TradeX is free while in beta." : "Thank you for supporting TradeX."}</div></div>
      <div class="plans"><div class="card ${cur === "free" && !owner ? "cur" : ""}"><div class="nm">Free</div><div class="dim">Now, for everyone</div><ul>${FREE.map((x) => `<li>${x}</li>`).join("")}</ul></div>
      <div class="card ${cur !== "free" || owner ? "cur" : ""}"><div class="nm">Pro</div><div class="dim">Coming soon</div><ul>${PRO.map((x) => `<li>${x}</li>`).join("")}</ul>
      <div class="dim" style="margin-top:8px">Lifetime = Pro, forever.</div></div></div>`;
  }

  async function data(p) {
    p.innerHTML = `<h4>Your data</h4><div class="card" id="txaccd">Counting ...</div>`;
    let n = { layouts: 0, templates: 0 };
    try { const { data: rows } = await A.sb.from("tradex_docs").select("kind"); (rows || []).forEach((r) => { n[r.kind] = (n[r.kind] || 0) + 1; }); } catch (_) {}
    const guest = A.localCount ? A.localCount() : 0, c = p.querySelector("#txaccd"); if (!c) return;
    c.innerHTML = `<dl><dt>Layouts</dt><dd>${n.layouts} of 30</dd><dt>Indicator templates</dt><dd>${n.templates}</dd></dl>
      ${guest ? `<div class="row"><button class="b" id="txaccimp">Copy ${guest} item${guest === 1 ? "" : "s"} saved in this browser as a guest</button></div>` : ""}
      <div class="msg" id="txaccm"></div><div class="dim" style="margin-top:6px">TradeX keeps only your account id, email, name, photo and what you save. Deleting your account removes all of it.</div>`;
    const b = c.querySelector("#txaccimp");
    if (b) b.onclick = async () => { b.disabled = true; const m = c.querySelector("#txaccm");
      try { const k = await A.importLocal(); m.className = "msg ok"; m.textContent = `Copied ${k}. Open the Layouts menu to see them.`; if (window.layoutsRefresh) window.layoutsRefresh(); }
      catch (e) { m.className = "msg bad"; m.textContent = "Could not copy: " + e.message; b.disabled = false; } };
  }

  function look(p) {
    p.innerHTML = `<h4>Appearance</h4><div class="card">Theme, font, candle colours, watermark strength and interface colours are in the Settings panel on the right.
      Candle colours can also be changed in each chart's Chart settings (Symbol), and both places stay in step.
      <div class="row"><button class="b pri" id="txacct">Open theme and colours</button></div></div>`;
    p.querySelector("#txacct").onclick = () => { close(); const r = document.querySelector('#rail [data-panel="settings"]'); if (r) r.click(); };
  }

  async function ownerPanel(p) {
    p.innerHTML = `<h4>Give a plan by email</h4><div class="card">Works for people who have not joined yet: the plan starts when they first sign in with that email.
      <div class="row"><input id="ge" type="email" placeholder="email address" style="flex:1;min-width:200px"><select id="gp"><option value="lifetime">Lifetime</option><option value="pro">Pro</option><option value="free">Free</option></select>
      <input id="gn" placeholder="note (e.g. Family)" maxlength="120" style="width:150px"><button class="b pri" id="gb">Give</button></div><div class="msg" id="gm"></div></div>
      <h4>Everyone</h4><div class="card tw" id="gu">Loading ...</div><h4>Waiting (not joined yet)</h4><div class="card tw" id="gw">Loading ...</div>`;
    const msg = (t, k) => { const m = p.querySelector("#gm"); m.className = "msg " + (k || ""); m.textContent = t; };
    p.querySelector("#gb").onclick = async () => {
      const e = p.querySelector("#ge").value.trim(); if (!e) return msg("Type an email address.", "bad");
      try { const r = await rpc("tradex_grant", { target_email: e, new_plan: p.querySelector("#gp").value, note: p.querySelector("#gn").value.trim() || null });
        msg(r === "updated" ? "Done: their plan is changed." : r === "waiting" ? "Saved: it starts when they first sign in." : "That is the owner account.", "ok"); lists(); }
      catch (err) { msg(err.message, "bad"); }
    };
    async function lists() {
      const { data: us } = await A.sb.from("tradex_profiles").select("name,login,email,plan,role,created_at,last_seen").order("created_at", { ascending: false });
      p.querySelector("#gu").innerHTML = `<table><tr><th>Name</th><th>Email</th><th>Joined</th><th>Last seen</th><th>Plan</th></tr>${(us || []).map((u) => `<tr><td>${esc(u.name || u.login)}</td><td>${esc(u.email)}</td><td>${day(u.created_at)}</td><td>${day(u.last_seen)}</td>
        <td>${u.role === "owner" ? "Owner" : `<select data-e="${esc(u.email)}">${["free", "pro", "lifetime"].map((k) => `<option value="${k}" ${u.plan === k ? "selected" : ""}>${PLAN[k]}</option>`).join("")}</select>`}</td></tr>`).join("")}</table>
        <div class="dim" style="margin-top:8px">${(us || []).length} account${(us || []).length === 1 ? "" : "s"}</div>`;
      p.querySelectorAll("#gu select").forEach((s) => { s.onchange = async () => { try { await rpc("tradex_grant", { target_email: s.dataset.e, new_plan: s.value, note: null }); msg("Plan changed for " + s.dataset.e, "ok"); } catch (err) { msg(err.message, "bad"); } }; });
      const { data: gs } = await A.sb.from("tradex_grants").select("email,plan,plan_note,created_at").order("created_at", { ascending: false });
      p.querySelector("#gw").innerHTML = (gs || []).length ? `<table><tr><th>Email</th><th>Plan</th><th>Note</th><th></th></tr>${gs.map((g) => `<tr><td>${esc(g.email)}</td><td>${PLAN[g.plan]}</td><td>${esc(g.plan_note || "")}</td><td><button class="b" data-u="${esc(g.email)}">Remove</button></td></tr>`).join("")}</table>` : '<span class="dim">Nobody waiting.</span>';
      p.querySelectorAll("#gw button[data-u]").forEach((b) => { b.onclick = async () => { try { await rpc("tradex_ungrant", { target_email: b.dataset.u }); lists(); } catch (err) { msg(err.message, "bad"); } }; });
    }
    lists().catch((e) => { p.querySelector("#gu").textContent = "Could not load: " + e.message; });
  }

  function del(p) {
    const owner = me && me.role === "owner";
    p.innerHTML = `<h4>Delete account</h4><div class="card">${owner ? "The owner account cannot be deleted from here." :
      `This deletes your TradeX account, your saved layouts and indicator templates. It cannot be undone.
      Your GitHub or Google account is not touched.<div class="row"><input id="dc" placeholder="Type DELETE" autocomplete="off" style="width:160px">
      <button class="b red" id="db" disabled>Delete my account</button></div><div class="msg" id="dm"></div>`}</div>`;
    if (owner) return;
    const inp = p.querySelector("#dc"), b = p.querySelector("#db"), m = p.querySelector("#dm");
    inp.oninput = () => { b.disabled = inp.value !== "DELETE"; };
    b.onclick = async () => {
      b.disabled = true; m.className = "msg"; m.textContent = "Deleting ...";
      try { await rpc("tradex_delete_me", { confirm: "DELETE" }); try { localStorage.removeItem("chartHubLayoutId"); } catch (_) {} await A.sb.auth.signOut().catch(() => {}); location.href = "/"; }
      catch (e) { m.className = "msg bad"; m.textContent = "Could not delete: " + e.message; b.disabled = false; }
    };
  }

  window.TXAccount = { open, close };
})();
