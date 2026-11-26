// TradeX indicators, part 3: Pine Editor (right dock panel, like TradingView's).
// Script picker, name, New / Open file (.pine/.txt) / Save / Add to chart, line numbers, Line:Col + version footer,
// and a console with converter notes and engine errors. Own scripts live in localStorage "chartHubScripts".
let ED = { id: null, name: "Adsız kod", source: "//@version=6\nindicator(\"My script\", overlay = true)\nplot(ta.sma(close, 50), color = color.orange)\n", key: null, log: [] };
try { Object.assign(ED, JSON.parse(localStorage.getItem("chartHubDraft") || "{}"), { key: null, log: [] }); } catch (_) {}
const saveDraft = () => keep("chartHubDraft", { id: ED.id, name: ED.name, source: ED.source });

function renderPine() {
  const d = $("dock"); d.classList.add("wide");
  d.innerHTML = `<h3>Pine düzenleyici</h3>
    <div class="pe-bar"><select class="pe-pick" title="Kodlarınız"></select>
      <button class="btn" data-a="new">Yeni</button><button class="btn" data-a="open">Dosya aç</button>
      <button class="btn" data-a="save">Kaydet</button><button class="btn primary" data-a="add">Grafiğe ekle</button>
      <input type="file" accept=".pine,.txt,.pinescript,text/plain" hidden></div>
    <input class="pe-name" spellcheck="false" placeholder="Kod adı">
    <div class="pe-ed"><pre class="pe-gut"></pre><textarea spellcheck="false" wrap="off"></textarea></div>
    <div class="pe-foot"><span class="pe-pos"></span><span class="pe-ver"></span></div>
    <div class="pe-log"></div>`;
  const pick = d.querySelector(".pe-pick"), name = d.querySelector(".pe-name"), ta = d.querySelector("textarea"), gut = d.querySelector(".pe-gut"), file = d.querySelector("input[type=file]");
  pick.add(new Option("Adsız kod", "")); MINE.forEach((m) => pick.add(new Option(m.name, m.id))); pick.value = ED.id || "";
  name.value = ED.name; ta.value = ED.source;
  const lines = () => { const n = ta.value.split("\n").length; gut.textContent = Array.from({ length: n }, (_, i) => i + 1).join("\n"); gut.scrollTop = ta.scrollTop; };
  const pos = () => { const b = ta.value.slice(0, ta.selectionStart).split("\n"); d.querySelector(".pe-pos").textContent = `Satır ${b.length}, Sütun ${b[b.length - 1].length + 1}`;
    const v = (ta.value.match(/\/\/\s*@version\s*=\s*(\d+)/) || [])[1]; d.querySelector(".pe-ver").textContent = v ? `Pine Script v${v}${+v < 5 ? " (eklendiğinde v5 sürümüne dönüştürülür)" : ""}` : "Pine Script v1 (@version yok; eklendiğinde dönüştürülür)"; };
  ta.oninput = () => { ED.source = ta.value; saveDraft(); lines(); pos(); };
  ta.onscroll = () => { gut.scrollTop = ta.scrollTop; };
  ta.onkeyup = ta.onclick = pos;
  ta.onkeydown = (e) => { if (e.key === "Tab") { e.preventDefault(); const s = ta.selectionStart; ta.setRangeText("    ", s, ta.selectionEnd, "end"); ta.oninput(); }
    if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); edSave(); } if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); edAdd(); } };
  name.oninput = () => { ED.name = name.value; saveDraft(); };
  pick.onchange = () => { const m = MINE.find((x) => x.id === pick.value); if (m) Object.assign(ED, { id: m.id, name: m.name, source: m.source }); else Object.assign(ED, { id: null, name: "Adsız kod" }); saveDraft(); renderPine(); };
  d.querySelector('[data-a="new"]').onclick = () => { Object.assign(ED, { id: null, name: "Adsız kod", source: "//@version=6\nindicator(\"My script\")\nplot(close)\n", log: [] }); saveDraft(); renderPine(); };
  d.querySelector('[data-a="open"]').onclick = () => file.click();
  file.onchange = async () => { const f = file.files[0]; if (!f) return; if (f.size > 1e6) return edLog("Dosya 1 MB sınırını aşıyor.", true);
    editorOpenSource(f.name.replace(/\.(pine|txt|pinescript)$/i, ""), await f.text()); edLog(`${f.name} açıldı. Kodu saklamak için Kaydet veya grafiğe eklemek için Grafiğe ekle düğmesine basın.`); };
  d.querySelector('[data-a="save"]').onclick = edSave;
  d.querySelector('[data-a="add"]').onclick = edAdd;
  lines(); pos(); edPaintLog();
}
function editorOpenSource(name, source) { Object.assign(ED, { id: null, name, source, log: [] }); saveDraft(); openPanelByName("pine"); renderPine(); }
function edSave() {
  const name = (ED.name || "").trim() || "Adsız kod", v = +((ED.source.match(/@version\s*=\s*(\d+)/) || [])[1] || 1);
  let m = ED.id && MINE.find((x) => x.id === ED.id);
  if (!m) { m = { id: Date.now().toString(36) }; MINE.push(m); ED.id = m.id; }
  Object.assign(m, { name, source: ED.source, pine: v, updated: Date.now() }); keep("chartHubScripts", MINE); saveDraft();
  edLog(`"${name}" kodlarım listesine kaydedildi.`); if (openPanel === "pine") renderPine();
}
function edAdd() {
  edSave(); const m = MINE.find((x) => x.id === ED.id);
  if (st.engine !== "vela") return edLog("Pine draws on the Vela engine for now. Switch the engine to Vela, then Add to chart.", true);
  // the editor's script replaces its previous instance on the chart (like TradingView's "Update on chart")
  INDS.filter((x) => x.mineId === m.id).forEach((x) => removeInd(x));
  const ind = { key: `own:${m.id}:${Date.now().toString(36)}`, mineId: m.id, name: m.name, origin: "own", source: m.source, on: true };
  INDS.push(ind); saveInds(); ED.key = ind.key; edLog("Grafiğe ekleniyor..."); pineAdd(ind);
}
function onEditorResult(ind, m) {
  if (ind.key !== ED.key) return;
  if (ind.notes && ind.notes.length) edLog("Converter: " + ind.notes.join("; "));
  edLog(m.ok && m.pending ? "Grafiğe eklendi ancak grafik verisi bekleniyor." : m.ok ? `Grafikte${ind.convFrom ? ` (Pine v${ind.convFrom} sürümünden v5 sürümüne dönüştürüldü)` : ""}.` : "Hata: " + (m.error || "failed"), !m.ok);
}
function editorStatus() {}
function edLog(text, bad) { ED.log.push({ t: new Date().toISOString().slice(11, 19), text, bad }); ED.log = ED.log.slice(-30); edPaintLog(); }
function edPaintLog() { const L = document.querySelector("#dock .pe-log"); if (!L) return; L.innerHTML = ED.log.map((x) => `<div class="${x.bad ? "bad" : ""}"><span>${x.t}</span> ${esc(x.text)}</div>`).join("") || '<div><span>console</span> Ctrl+S kaydet, Ctrl+Enter grafiğe ekle.</div>'; L.scrollTop = L.scrollHeight; }
