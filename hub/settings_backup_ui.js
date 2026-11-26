// Backup controls are mounted in the TradeX settings panel.
window.TradeXBackupUI = {
  mount(container) {
    const note = document.createElement('p'); note.className = 'legal';
    note.textContent = 'Tema, grafikler, çizimler, izleme listesi, favoriler, indikatörler ve Pine kodları yedeklenir. Giriş bilgileri dahil edilmez. Dosyayı güvenli saklayın.';
    const download = document.createElement('button'); download.type = 'button'; download.className = 'btn'; download.textContent = 'JSON indir';
    const upload = document.createElement('button'); upload.type = 'button'; upload.className = 'btn'; upload.textContent = 'JSON yükle';
    const file = document.createElement('input'); file.type = 'file'; file.accept = '.json,application/json'; file.hidden = true;
    const status = document.createElement('div'); status.className = 'legal'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const buttons = document.createElement('div'); buttons.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
    buttons.append(download,upload,file); container.append(note,buttons,status);
    const busy = on => { download.disabled = on; upload.disabled = on; };
    download.addEventListener('click', async () => {
      busy(true); status.textContent = 'Yedek hazırlanıyor…';
      try {
        if (typeof window.layoutsExportBackup !== 'function') throw new Error('Yedekleme hizmeti hazır değil.');
        const text = await window.layoutsExportBackup();
        const url = URL.createObjectURL(new Blob([text], {type:'application/json'}));
        const link = document.createElement('a'); link.href = url; link.download = 'tradex-yedek-' + new Date().toISOString().slice(0,10) + '.json';
        document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        status.textContent = 'Yedek indirildi.';
      } catch (e) { status.textContent = 'Yedek oluşturulamadı: ' + (e.message || e); }
      finally { busy(false); }
    });
    upload.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const chosen = file.files && file.files[0]; if (!chosen) return;
      busy(true); status.textContent = 'Yedek kontrol ediliyor…';
      try {
        if (chosen.size > TradeXSettingsBackup.MAX_BYTES) throw new Error('Yedek 25 MB sınırını aşıyor.');
        const text = await chosen.text(); TradeXSettingsBackup.parse(text);
        if (!window.confirm('Yedekteki ayarlar, izleme listesi ve kodlar bu tarayıcıdaki mevcut değerlerin yerini alacak. Kayıtlı düzenler ve şablonlar kopya olarak eklenecek. Devam edilsin mi?')) { status.textContent = 'Yükleme iptal edildi.'; return; }
        if (typeof window.layoutsImportBackup !== 'function') throw new Error('Yedekleme hizmeti hazır değil.');
        status.textContent = 'Yedek yükleniyor…'; await window.layoutsImportBackup(text);
        status.textContent = 'Yüklendi. Sayfa yenileniyor…'; window.location.reload();
      } catch (e) { status.textContent = 'Yedek yüklenemedi: ' + (e.message || e); }
      finally { file.value = ''; busy(false); }
    });
  }
};
