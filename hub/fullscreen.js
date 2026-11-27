// Fullscreen the entire shell so its chart, dialogs, watchlist and exit control remain usable.
(() => {
  const button = document.getElementById('fullscreenBtn');
  const status = document.getElementById('fullscreenStatus');
  if (!button || !status) return;
  const root = document.documentElement;
  const icon = button.querySelector('path');
  let noticeTimer, pending = false;
  const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  function notice(message) {
    clearTimeout(noticeTimer);
    status.textContent = message; status.hidden = !message;
    if (message) noticeTimer = setTimeout(() => { status.hidden = true; status.textContent = ''; }, 6000);
  }
  function sync() {
    const active = !!fullscreenElement();
    const label = active ? 'Tam ekrandan çık' : 'Tam ekran';
    button.title = label; button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(active));
    if (icon) icon.setAttribute('d', active ? 'M4 9h5V4M15 4v5h5M20 15h-5v5M9 20v-5H4' : 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5');
  }
  button.addEventListener('click', () => {
    if (pending) return;
    const active = !!fullscreenElement();
    const fn = active ? (document.exitFullscreen || document.webkitExitFullscreen) : (root.requestFullscreen || root.webkitRequestFullscreen);
    if (!fn || (!active && (document.fullscreenEnabled === false || document.webkitFullscreenEnabled === false))) {
      notice('Tam ekran bu tarayıcıda veya bu sayfada kullanılamıyor.'); return;
    }
    try {
      // Call directly in the click handler: browsers require a user gesture.
      pending = true; button.disabled = true;
      const result = fn.call(active ? document : root);
      Promise.resolve(result).then(() => { notice(''); sync(); }, () => {
        notice('Tam ekran açılamadı veya kapatılamadı. Tarayıcı izinlerini kontrol edin.'); sync();
      }).finally(() => { pending = false; button.disabled = false; });
    } catch (_) {
      pending = false; button.disabled = false;
      notice('Tam ekran açılamadı veya kapatılamadı. Tarayıcı izinlerini kontrol edin.'); sync();
    }
  });
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);
  sync();
})();
