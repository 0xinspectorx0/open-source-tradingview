// Mirror Vela's real toolbar actions into the shell. The original buttons retain their
// handlers and state; only the style menu needs a shell control because an iframe menu
// cannot extend above the chart into the parent bar.
(() => {
  const frame = document.getElementById('frame');
  const tools = document.getElementById('velaTools');
  const style = document.getElementById('priceStyle');
  const fallbackIcon = style.firstElementChild.cloneNode(true);
  const menu = document.createElement('div');
  menu.id = 'priceStyleMenu'; menu.hidden = true; menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Grafik tipi'); document.body.appendChild(menu);
  let toolbarObserver, chartObserver, toolbar, mirrored = [], styleSignature = '';

  function closeMenu(restoreFocus = false) {
    menu.hidden = true; style.setAttribute('aria-expanded', 'false');
    if (restoreFocus) style.focus();
  }
  function placeMenu() {
    const rect = style.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8)) + 'px';
    menu.style.top = Math.min(rect.bottom + 4, Math.max(8, window.innerHeight - menu.offsetHeight - 8)) + 'px';
  }
  function clear() {
    if (toolbarObserver) toolbarObserver.disconnect();
    if (chartObserver) chartObserver.disconnect();
    toolbarObserver = chartObserver = null; toolbar = null;
    mirrored = []; tools.replaceChildren();
    closeMenu(); menu.replaceChildren(); styleSignature = '';
    style.replaceChildren(fallbackIcon.cloneNode(true));
    style.setAttribute('aria-label', 'Grafik tipi'); style.title = 'Grafik tipi'; style.disabled = true;
  }
  function syncStyle() {
    const api = frame.contentWindow.labChart;
    if (!api || !api.priceStyles) return;
    const list = api.priceStyles(), selected = api.priceStyle();
    const signature = JSON.stringify(list);
    if (styleSignature !== signature) {
      menu.replaceChildren(...list.map(item => {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = item.label; b.dataset.id = item.id;
        b.setAttribute('role', 'menuitemradio');
        b.addEventListener('click', () => {
          const current = frame.contentWindow.labChart;
          if (current && current.setPriceStyle) current.setPriceStyle(item.id);
          syncStyle(); closeMenu(true);
        });
        return b;
      }));
      styleSignature = signature;
    }
    menu.querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.id === selected)));
    const label = (list.find(item => item.id === selected) || {}).label || 'Grafik tipi';
    style.setAttribute('aria-label', 'Grafik tipi: ' + label); style.title = 'Grafik tipi: ' + label;
    const icon = toolbar && toolbar.querySelector('.vela-widget-style svg');
    const markup = icon ? icon.outerHTML : fallbackIcon.outerHTML;
    if (!style.firstElementChild || style.firstElementChild.outerHTML !== markup) style.replaceChildren(icon ? icon.cloneNode(true) : fallbackIcon.cloneNode(true));
    style.disabled = false;
  }
  style.addEventListener('click', () => {
    if (!menu.hidden) { closeMenu(); return; }
    syncStyle(); menu.hidden = false; style.setAttribute('aria-expanded', 'true'); placeMenu();
    (menu.querySelector('[aria-checked="true"]') || menu.querySelector('button'))?.focus();
  });
  menu.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    const items = [...menu.querySelectorAll('button')], index = items.indexOf(document.activeElement);
    if (!items.length) return;
    e.preventDefault();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next].focus();
  });
  menu.addEventListener('focusout', e => {
    if (!menu.hidden && e.relatedTarget && !menu.contains(e.relatedTarget) && e.relatedTarget !== style) closeMenu();
  });
  document.addEventListener('pointerdown', e => { if (!menu.hidden && !menu.contains(e.target) && !style.contains(e.target)) closeMenu(); });
  window.addEventListener('blur', () => { if (!menu.hidden) closeMenu(); });
  window.addEventListener('resize', () => { if (!menu.hidden) placeMenu(); });
  document.addEventListener('scroll', () => { if (!menu.hidden) placeMenu(); }, true);
  function bind() {
    if (toolbarObserver) toolbarObserver.disconnect();
    const doc = frame.contentDocument;
    toolbar = doc && doc.querySelector('#chart .vela-widget-topbar');
    if (!toolbar) { mirrored = []; tools.replaceChildren(); closeMenu(); style.disabled = true; return; }
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
