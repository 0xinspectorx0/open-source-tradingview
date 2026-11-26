// Mirror Vela's real toolbar actions into the shell. The original buttons retain their
// handlers and state; only the style menu needs a shell control because an iframe menu
// cannot extend above the chart into the parent bar.
(() => {
  const frame = document.getElementById('frame');
  const tools = document.getElementById('velaTools');
  const style = document.getElementById('priceStyle');
  let toolbarObserver, chartObserver, mirrored = [];

  function clear() {
    if (toolbarObserver) toolbarObserver.disconnect();
    if (chartObserver) chartObserver.disconnect();
    toolbarObserver = chartObserver = null;
    mirrored = [];
    tools.replaceChildren();
    style.replaceChildren(new Option('Grafik tipi', ''));
    delete style.dataset.options;
    style.disabled = true;
  }
  function syncStyle() {
    const api = frame.contentWindow.labChart;
    if (!api || !api.priceStyles) return;
    const list = api.priceStyles(), selected = api.priceStyle();
    const signature = JSON.stringify(list);
    if (style.dataset.options !== signature) {
      style.replaceChildren(...list.map(item => new Option(item.label, item.id)));
      style.dataset.options = signature;
    }
    style.value = selected;
    style.disabled = false;
  }
  style.addEventListener('change', () => {
    const api = frame.contentWindow.labChart;
    if (api && api.setPriceStyle) api.setPriceStyle(style.value);
    syncStyle();
  });
  function bind() {
    if (toolbarObserver) toolbarObserver.disconnect();
    const doc = frame.contentDocument;
    const toolbar = doc && doc.querySelector('#chart .vela-widget-topbar');
    if (!toolbar) { mirrored = []; tools.replaceChildren(); return; }
    function sync() {
      const originals = [...toolbar.querySelectorAll('button')].filter(b => !b.classList.contains('vela-widget-style'));
      if (originals.length !== mirrored.length || originals.some((b, i) => mirrored[i].original !== b)) {
        mirrored = originals.map(original => {
          const button = document.createElement('button');
          button.type = 'button';
          button.addEventListener('click', () => original.click());
          return { original, button };
        });
        tools.replaceChildren(...mirrored.map(x => x.button));
      }
      for (const {original, button} of mirrored) {
        if (button.innerHTML !== original.innerHTML) button.innerHTML = original.innerHTML;
        const label = original.getAttribute('aria-label') || original.textContent.trim();
        button.setAttribute('aria-label', label);
        button.title = label;
        button.disabled = original.disabled;
        if (original.hasAttribute('data-active')) {
          button.dataset.active = original.dataset.active;
          button.setAttribute('aria-pressed', original.dataset.active === '1' ? 'true' : 'false');
        } else {
          delete button.dataset.active;
          button.removeAttribute('aria-pressed');
        }
      }
      syncStyle();
    }
    toolbarObserver = new MutationObserver(sync);
    toolbarObserver.observe(toolbar, {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:['disabled', 'data-active', 'aria-label']});
    sync();
  }
  frame.addEventListener('load', () => {
    clear();
    try {
      const chart = frame.contentDocument.getElementById('chart');
      if (!chart) return;
      bind();
      // Standalone-style workspace rebuilds replace the toolbar root.
      chartObserver = new MutationObserver(bind);
      chartObserver.observe(chart, {childList:true});
    } catch (e) { console.warn('Grafik araçları yüklenemedi', e); }
  });
})();
