// Vela's settings are live edits. Add an explicit save to the embedded chart
// dialog, using the shell's normal layout store rather than a second state copy.
(() => {
  if (!window.LabEmbedded) return;
  const chart = document.getElementById('chart');
  if (!chart) return;
  function attach(dialog) {
    const footer = dialog.querySelector('.vela-dialog-footer');
    if (!footer || footer.querySelector('.tx-chart-save')) return;
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'tx-chart-save'; button.textContent = 'Kaydet';
    const status = document.createElement('span');
    status.className = 'tx-chart-save-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    button.addEventListener('click', async () => {
      if (button.disabled) return;
      button.disabled = true; status.textContent = 'Kaydediliyor…'; delete status.dataset.error;
      try {
        const save = window.parent.layoutsSaveCurrent;
        if (typeof save !== 'function') throw new Error('Kayıt hizmeti hazır değil.');
        const result = await save();
        if (!result || !result.ok) throw new Error(result && result.error || 'Kayıt başarısız.');
        status.textContent = 'Kaydedildi';
      } catch (e) {
        status.dataset.error = '1'; status.textContent = 'Kaydedilemedi: ' + (e && e.message || 'Bilinmeyen hata');
      } finally { button.disabled = false; }
    });
    footer.append(button, status);
  }
  function scan(node) {
    if (node.nodeType !== 1) return;
    if (node.matches('.vela-dialog--settings')) attach(node);
    node.querySelectorAll('.vela-dialog--settings').forEach(attach);
  }
  scan(chart);
  new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) scan(node);
  }).observe(chart, { childList:true, subtree:true });
})();
