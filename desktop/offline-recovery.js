// Plain DOM only: the bundled emergency page needs neither the site nor its scripts.
(() => {
  const api = window.mapMethodDesktop?.backups;
  if (!api) return;
  const account = document.getElementById('account'), snapshot = document.getElementById('snapshot');
  const exportButton = document.getElementById('export'), notice = document.getElementById('notice');
  document.getElementById('recovery').hidden = false;
  const option = (parent, value, label) => { const item = document.createElement('option'); item.value = value; item.textContent = label; parent.append(item); };
  async function load() {
    const owner = account.value;
    snapshot.replaceChildren(); exportButton.disabled = true;
    try {
      if (!owner) return;
      const entries = await api.list(owner);
      if (account.value !== owner) return;
      for (const entry of entries) option(snapshot, entry.id, `${new Date(entry.at).toLocaleString('ru-RU')} · ${entry.maps.length} карт`);
      exportButton.disabled = !entries.length;
      notice.textContent = entries.length ? 'Выберите дату и сохраните переносимый файл.' : 'Копий этого аккаунта пока нет.';
    } catch { notice.textContent = 'Копии не прочитаны. Для расшифровки нужен исходный профиль Windows и ключ из папки архива.'; }
  }
  account.addEventListener('change', load);
  exportButton.addEventListener('click', async () => {
    exportButton.disabled = true;
    try {
      const result = await api.export(account.value, snapshot.value);
      if (!result.canceled) notice.textContent = `Файл ${result.name} сохранён. Оригинальные копии остаются на диске.`;
    } catch { notice.textContent = 'Не удалось выгрузить эту копию. Проверьте свободное место или выберите другую дату.'; }
    finally { exportButton.disabled = !snapshot.value; }
  });
  document.getElementById('folder').addEventListener('click', () => api.openFolder().catch(() => { notice.textContent = 'Не удалось открыть папку.'; }));
  api.info().then((info) => {
    for (const entry of info.accounts) option(account, entry.owner, entry.profile?.displayName || entry.owner);
    if (!info.accounts.length) notice.textContent = 'На диске ещё нет копий. Они создаются после входа в аккаунт и загрузки карт.';
    else void load();
  }).catch(() => { notice.textContent = 'Не удалось открыть архив на диске.'; });
})();
