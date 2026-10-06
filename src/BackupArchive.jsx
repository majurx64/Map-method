import { useCallback, useEffect, useState } from 'react';
import { listBackups, listSaveConflicts, readBackup } from './lib/mapBackups';
import { createBackup } from './lib/productFeatures';
import { getMapStats } from './lib/grid';

const dateTime = (at) => new Date(at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const sourceName = (kind) => kind.endsWith('server') ? 'Сервер' : 'Устройство';

function ConflictChoice({ conflict, owner, onResolve, onChanged }) {
  const [versions, setVersions] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    Promise.all([readBackup(owner, conflict.localId), conflict.serverId ? readBackup(owner, conflict.serverId) : null])
      .then(([local, server]) => { if (alive) setVersions({ local, server }); })
      .catch(() => { if (alive) setError('Не удалось прочитать сохранённые версии. Попробуйте открыть архив ещё раз.'); });
    return () => { alive = false; };
  }, [owner, conflict]);
  const resolve = async (choice) => {
    if (!versions?.local || busy) return;
    setBusy(true); setError('');
    try { await onResolve(conflict, versions, choice); await onChanged(); }
    catch (problem) { setError(problem.message || 'Не удалось завершить выбор. Обе версии остаются в архиве.'); }
    finally { setBusy(false); }
  };
  return <article className="backup-conflict">
    <strong>Выберите версию: {conflict.name}</strong>
    <p>Автоматическое объединение остановлено, чтобы сохранить ваши правки. Обе копии остаются в архиве.</p>
    <div className="backup-comparison">{['local', 'server'].map((key) => {
      const map = versions?.[key];
      const stats = map && getMapStats(map);
      return <div key={key}><b>{key === 'local' ? 'На этом устройстве' : 'На сервере'}</b><span>{stats ? `${stats.filled} из ${stats.total} клеток` : versions && key === 'server' ? 'Карта удалена' : 'Загружаем…'}</span><small>{map?.lastPaintedAt ? dateTime(map.lastPaintedAt) : ''}</small></div>;
    })}</div>
    <div className="backup-conflict-actions">
      <button type="button" className="feature-primary" disabled={busy || !versions?.local} onClick={() => resolve('both')}>{busy ? 'Сохраняем выбор…' : 'Сохранить обе'}</button>
      <button type="button" disabled={busy || !versions} onClick={() => resolve('server')}>Использовать серверную</button>
      {versions?.server && !versions.server.collaboration && <button type="button" disabled={busy} onClick={() => resolve('local')}>Использовать локальную</button>}
    </div>
    {error && <p className="feature-status error" role="alert">{error}</p>}
  </article>;
}

export default function BackupArchive({ owner, revision, archiveError, onRestore, onResolve, onConflicts }) {
  const [entries, setEntries] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [mapId, setMapId] = useState('');
  const [day, setDay] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const reload = useCallback(async () => {
    const [backups, savedConflicts] = await Promise.all([listBackups(owner), listSaveConflicts(owner)]);
    setEntries(backups); setConflicts(savedConflicts); onConflicts(savedConflicts);
  }, [owner, onConflicts]);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([listBackups(owner), listSaveConflicts(owner)]).then(([backups, savedConflicts]) => {
      if (!alive) return;
      setEntries(backups); setConflicts(savedConflicts); onConflicts(savedConflicts); setNotice('');
    }).catch(() => { if (alive) setNotice('Архив недоступен. Проверьте свободное место и разрешение на хранение данных сайта.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [owner, revision, onConflicts]);
  const maps = [...new Map(entries.map((entry) => [entry.mapId, entry.name])).entries()];
  const selectedId = maps.some(([id]) => id === mapId) ? mapId : maps[0]?.[0] || '';
  const days = [...new Set(entries.filter((entry) => entry.mapId === selectedId).map((entry) => entry.day))].sort().reverse();
  const selectedDay = days.includes(day) ? day : days[0] || '';
  const selected = entries.filter((entry) => entry.mapId === selectedId && entry.day === selectedDay);
  async function useEntry(entry, download) {
    if (busy) return;
    setBusy(entry.id); setNotice('');
    try {
      const map = await readBackup(owner, entry.id);
      if (!map) throw new Error('Копия не найдена. Обновите список архива.');
      if (download) {
        const url = URL.createObjectURL(new Blob([createBackup([map])], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = `map-method-${entry.day}-${entry.id.slice(0, 8)}.json`; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setNotice('Файл копии подготовлен для скачивания.');
      } else {
        await onRestore(map);
        setNotice('Карта восстановлена отдельной копией. Исходная карта сохранена.');
        await reload();
      }
    } catch (error) { setNotice(error.message || 'Не удалось прочитать копию.'); }
    finally { setBusy(''); }
  }
  return <section className="backup-archive" id="backup-archive">
    <div><span className="account-eyebrow">АВТОМАТИЧЕСКИЕ КОПИИ</span><h2>Архив за 30 дней</h2><p>Копии создаются при работе с сайтом и хранятся отдельно от синхронизации, в этом браузере или приложении. Для переноса и защиты от очистки устройства скачайте файл резервной копии.</p></div>
    {archiveError && <p className="feature-status error" role="alert">{archiveError}</p>}
    {conflicts.map((conflict) => <ConflictChoice key={`${conflict.key}:${conflict.revision}`} conflict={conflict} owner={owner} onResolve={onResolve} onChanged={reload} />)}
    {loading ? <p role="status">Открываем архив…</p> : !entries.length ? <p>Копии появятся после сохранения первой карты. Старые изменения до включения архива сюда не попадают.</p> : <>
      <div className="backup-filters"><label>Карта<select value={selectedId} onChange={(event) => { setMapId(event.target.value); setDay(''); }}>{maps.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><label>Дата<select value={selectedDay} onChange={(event) => setDay(event.target.value)}>{days.map((date) => <option key={date} value={date}>{new Date(`${date}T12:00:00`).toLocaleDateString('ru-RU')}</option>)}</select></label></div>
      <p className="backup-retention-note">Сохраняем начало дня и до 23 последних версий каждого источника. Копии нерешённых конфликтов сохраняются до выбора.</p>
      <div className="backup-entry-list">{selected.map((entry) => <article key={entry.id}><div><strong>{dateTime(entry.at)}</strong><small>{sourceName(entry.kind)}{entry.kind.startsWith('conflict-') ? ' · конфликт' : ''}</small></div><div><button type="button" disabled={Boolean(busy)} onClick={() => useEntry(entry, false)}>{busy === entry.id ? 'Открываем…' : 'Восстановить копией'}</button><button type="button" disabled={Boolean(busy)} onClick={() => useEntry(entry, true)} aria-label="Скачать эту копию">↓ Скачать</button></div></article>)}</div>
    </>}
    {notice && <p className="feature-status" role="status">{notice}</p>}
  </section>;
}
