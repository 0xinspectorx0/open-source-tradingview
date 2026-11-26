// The shell owns timeframe selection; favourites are a browser preference, not a layout.
window.TradeXTimeframes = {
  create({ items, selected, onSelect }) {
    const key = 'chartHubTimeframeFavorites';
    const trigger = document.getElementById('tfs'), bar = document.getElementById('tfFavorites');
    const menu = document.createElement('div');
    menu.id = 'tfMenu'; menu.hidden = true; menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-label', 'Zaman aralıkları'); document.body.appendChild(menu);
    const names = { M1:'1 dakika', M5:'5 dakika', M15:'15 dakika', M30:'30 dakika', H1:'1 saat', H4:'4 saat', D1:'1 gün', W1:'1 hafta', MN1:'1 ay' };
    const fullName = (id, label) => names[id] || label;
    const normalize = value => {
      if (!Array.isArray(value)) return [];
      const set = new Set(value.filter(x => typeof x === 'string'));
      return items.filter(([id]) => set.has(id)).map(([id]) => id);
    };
    function read(value) {
      try { return normalize(JSON.parse(value || '[]')); } catch (_) { return []; }
    }
    let favorites = [];
    try { favorites = read(localStorage.getItem(key)); } catch (_) {}
    const rows = new Map();
    for (const [id, label] of items) {
      const row = document.createElement('div'); row.className = 'tf-row';
      const choice = document.createElement('button'); choice.type = 'button'; choice.className = 'tf-choice';
      choice.dataset.id = id; choice.textContent = fullName(id, label);
      choice.addEventListener('click', () => { close(true); if (selected() !== id) onSelect(id); });
      const star = document.createElement('button'); star.type = 'button'; star.className = 'tf-star';
      star.dataset.id = id;
      star.addEventListener('click', () => {
        favorites = normalize(favorites.includes(id) ? favorites.filter(x => x !== id) : [...favorites, id]);
        try { localStorage.setItem(key, JSON.stringify(favorites)); } catch (_) {}
        renderFavorites(); sync();
      });
      row.append(choice, star); menu.appendChild(row); rows.set(id, { choice, star });
    }
    function renderFavorites() {
      bar.replaceChildren(...items.filter(([id]) => favorites.includes(id)).map(([id, label]) => {
        const button = document.createElement('button'); button.type = 'button'; button.dataset.id = id;
        button.textContent = label; button.title = fullName(id, label); button.setAttribute('aria-label', fullName(id, label));
        button.addEventListener('click', () => { if (selected() !== id) onSelect(id); });
        return button;
      }));
    }
    function sync() {
      const current = selected(), item = items.find(([id]) => id === current);
      trigger.textContent = `${item ? item[1] : current} ▾`;
      trigger.setAttribute('aria-label', `Zaman aralığı: ${item ? fullName(item[0], item[1]) : current}`);
      for (const [id, label] of items) {
        const {choice, star} = rows.get(id), favorite = favorites.includes(id);
        choice.setAttribute('aria-pressed', String(id === current));
        star.textContent = favorite ? '★' : '☆'; star.setAttribute('aria-pressed', String(favorite));
        const action = favorite ? 'favorilerden çıkar' : 'favorilere ekle';
        star.setAttribute('aria-label', `${fullName(id, label)} ${action}`); star.title = `${fullName(id, label)} ${action}`;
      }
      bar.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === current)));
    }
    function close(focus = false) {
      menu.hidden = true; trigger.setAttribute('aria-expanded', 'false');
      if (focus) trigger.focus();
    }
    function place() {
      const rect = trigger.getBoundingClientRect();
      if (rect.right < 0 || rect.left > window.innerWidth) { close(); return; }
      menu.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8)) + 'px';
      menu.style.top = Math.min(rect.bottom + 4, Math.max(8, window.innerHeight - menu.offsetHeight - 8)) + 'px';
    }
    trigger.addEventListener('click', () => {
      if (!menu.hidden) { close(); return; }
      sync(); menu.hidden = false; trigger.setAttribute('aria-expanded', 'true'); place();
      (rows.get(selected()) || rows.values().next().value)?.choice.focus();
    });
    menu.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); close(true); return; }
      if (!e.target.classList.contains('tf-choice') || !['ArrowUp','ArrowDown','Home','End'].includes(e.key)) return;
      const choices = [...menu.querySelectorAll('.tf-choice')], i = choices.indexOf(e.target);
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? choices.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length;
      e.preventDefault(); choices[next].focus();
    });
    menu.addEventListener('focusout', e => {
      if (!menu.hidden && e.relatedTarget && !menu.contains(e.relatedTarget) && e.relatedTarget !== trigger) close();
    });
    document.addEventListener('pointerdown', e => { if (!menu.hidden && !menu.contains(e.target) && !trigger.contains(e.target)) close(); });
    window.addEventListener('blur', () => { if (!menu.hidden) close(); });
    window.addEventListener('resize', () => { if (!menu.hidden) place(); });
    document.addEventListener('scroll', () => { if (!menu.hidden) place(); }, true);
    window.addEventListener('storage', e => {
      if (e.key !== key && e.key !== null) return;
      favorites = read(e.key === null ? null : e.newValue); renderFavorites(); sync();
    });
    renderFavorites(); sync();
    return { sync };
  }
};
