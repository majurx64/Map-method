import { useEffect, useState } from 'react';

const dateTime = (at) => new Date(at).toLocaleString('ru-RU');
export default function DesktopBackupPanel({ owner, health, onRestore }) {
  const api = window.mapMethodDesktop?.backups;
  const [entries, setEntries] = useState([]);
  const [folder, setFolder] = useState('');
  const [id, setId] = useState('');
  const [mapId, setMapId] = useState('');
  const [restorePreferences, setRestorePreferences] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!api) return;
    let alive = true;
    Promise.allSettled([api.list(owner), api.info()]).then(([copies, info]) => {
      if (!alive) return;
      if (info.status === 'fulfilled') setFolder(info.value.path);
      if (copies.status === 'fulfilled') setEntries(copies.value);
      else setNotice('Не удалось прочитать копии на диске. Проверьте доступ к папке приложения и профиль Windows.');
    });
    return () => { alive = false; };
  }, [api, owner, health.revision]);
  if (!window.mapMethodDesktop?.isDesktop) return null;
  if (!api) return <section className="backup-archive"><h2>Копии на диске компьютера</h2><p>Для автоматического архива на диске обновите Windows-приложение до версии 1.0.4 или новее. Копии в браузере продолжают работать.</p><a href="https://github.com/majurx64/Map-method/releases/download/v1.0.4/Map-Method-Setup.exe">Скачать обновление</a></section>;
  const selected = entries.find((entry) => entry.id === id) || entries[0];
  const selectedMap = selected?.maps.some((map) => map.id === mapId) ? mapId : '';
  async function act(operation) {
    if (busy) return;
    setBusy(true); setNotice('');
    try {
      if (operation === 'folder') await api.openFolder();
      else if (!selected) throw new Error('Сначала дождитесь первой копии.');
      else if (operation === 'export') {
        const result = await api.export(owner, selected.id, selectedMap);
        if (!result.canceled) setNotice(`Сохранён файл ${result.name}. Он содержит данные в открытом виде: храните его в надёжном месте.`);
      } else {
        const snapshot = await api.read(owner, selected.id);
        const restored = snapshot.maps.filter((map) => !selectedMap || map.id === selectedMap);
        await onRestore(restored, restorePreferences ? snapshot.preferences : null);
        setNotice(`Восстановлено отдельными копиями: ${restored.length}. Их синхронизацию можно проверить по индикатору сохранения.`);
      }
    } catch (error) { setNotice(operation === 'restore' ? error.message || 'Копия не прочитана. Попробуйте другую дату.' : 'Не удалось выполнить действие. Проверьте папку копий и свободное место. Для большого архива выберите одну карту.'); }
    finally { setBusy(false); }
  }
  return <section className="backup-archive desktop-backups">
    <div><span className="account-eyebrow">КОПИИ НА КОМПЬЮТЕРЕ</span><h2>Архив на диске за 90 дней</h2><p>Автоматически сохраняем карты, историю, личные эскизы и правки, ещё не отправленные на сервер. Очистка кэша приложения не удаляет этот архив.</p></div>
    <p>{entries[0] ? `Последняя копия: ${dateTime(entries[0].at)}. Карт и эскизов: ${entries[0].maps.length}.` : 'Первая копия появится после загрузки ваших карт.'}</p>
    {folder && <p className="desktop-backup-path">Папка: {folder}</p>}
    <p className="backup-retention-note">Сохраняем начало дня, последнее состояние каждого часа и 24 последних состояния за день. Самая новая копия остаётся даже после долгого перерыва. Зашифрованный архив доступен в этом профиле Windows. Для переноса или поломки компьютера сохраните JSON-файл на другом носителе.</p>
    {selected && <div className="backup-filters"><label>Состояние<select value={selected.id} onChange={(event) => { setId(event.target.value); setMapId(''); }} disabled={busy}>{entries.map((entry) => <option key={entry.id} value={entry.id}>{dateTime(entry.at)} · {entry.maps.length} карт · не отправлено: {entry.pending}</option>)}</select></label><label>Восстановить или скачать<select value={selectedMap} onChange={(event) => setMapId(event.target.value)} disabled={busy}><option value="">Все карты и эскизы</option>{selected.maps.map((map) => <option key={map.id} value={map.id}>{map.name}</option>)}</select></label></div>}
    {selected && <label className="desktop-backup-settings"><input type="checkbox" checked={restorePreferences} onChange={(event) => setRestorePreferences(event.target.checked)} disabled={busy} />Также восстановить язык, свои цвета, категории и последнее число заполнения на этом устройстве</label>}
    <div className="backup-conflict-actions"><button type="button" disabled={busy} onClick={() => act('folder')}>Открыть папку</button><button type="button" disabled={busy || !selected} onClick={() => act('export')}>Сохранить переносимый файл</button><button type="button" className="feature-primary" disabled={busy || !selected} onClick={() => act('restore')}>{busy ? 'Подождите…' : 'Восстановить копиями'}</button></div>
    {(health.error || notice) && <p className={`feature-status${health.error ? ' error' : ''}`} role={health.error ? 'alert' : 'status'}>{health.error || notice}</p>}
  </section>;
}
